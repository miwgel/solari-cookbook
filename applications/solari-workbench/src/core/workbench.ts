import { realpath, mkdir, readFile, rm } from "node:fs/promises";
import { join, relative } from "node:path";
import {
  Store,
  id,
  hash,
  canonical,
  privateWrite,
} from "../persistence/store.js";
import {
  type Actor,
  type ToolName,
  toolSchemas,
  configSchema,
  fail,
  WorkbenchError,
  publicError,
} from "../shared/contracts.js";
import type {
  Run,
  Operation,
  Checkpoint,
  Artifact,
  Case,
} from "../shared/model.js";
import type { Provider } from "../provider/provider.js";
import { capture, scan, eligible, safePath } from "../workspace/source.js";
import { makePatch } from "../workspace/patch.js";
export class Workbench {
  disconnectViewers: (runId: string) => void = () => {};
  async viewingLease(runId: string) {
    const queued = this.queues.get(runId);
    if (queued) await queued;
    const r = this.store.get("runs", runId);
    const remoteId = this.requireRunning(r);
    const url = await this.provider.viewer(remoteId);
    const current = this.store.get("runs", runId);
    if (
      current.environment !== "running" ||
      current.generation !== r.generation
    )
      fail("STALE_GENERATION", "Run changed while connecting the viewer.");
    return { url, generation: r.generation };
  }
  private queues = new Map<string, Promise<void>>();
  private jobs = new Set<Promise<void>>();
  constructor(
    public store: Store,
    public provider: Provider,
  ) {}
  async register(root: string, config: unknown) {
    root = await realpath(root);
    const c = configSchema.parse(config);
    if (!(
      relative(root, this.store.dir) === ".." ||
      relative(root, this.store.dir).startsWith("../")
    ))
      fail(
        "STATE_LOCATION",
        "Private state must be outside the registered project.",
      );
    const existing = this.store.all("projects").find((p) => p.root === root);
    if (existing) return existing.id;
    const key = id("project");
    this.store.put("projects", { id: key, root, config: c });
    this.store.event(
      "Project registered; selected files may be copied to the configured provider.",
    );
    return key;
  }
  async inspect(key: string) {
    const p = this.store.get("projects", key);
    return scan(p.root, p.config, true);
  }
  status(key?: string) {
    const runs = this.store
      .all("runs")
      .map(({ providerId: _providerId, ...r }) => ({
        ...r,
        guestBase: undefined,
      }));
    const operations = this.store
      .all("operations")
      .map(({ args: _args, fingerprint: _fp, ...o }) => o);
    const checkpoints = this.store
      .all("checkpoints")
      .map(({ providerId: _providerId, name: _name, ...c }) => c);
    const artifacts = this.store
      .all("artifacts")
      .map(({ path: _path, ...a }) => a);
    const projects = this.store
      .all("projects")
      .map((p) => ({ id: p.id, name: p.config.name }));
    const result = {
      provider: this.provider.kind,
      projects,
      runs,
      operations,
      checkpoints,
      cases: this.store.all("cases"),
      artifacts,
      events: this.store.events(),
      unverifiedLive: this.provider.kind === "solari",
      resources: this.store
        .all("resources")
        .map(({ providerId: _providerId, ...resource }) => resource),
    };
    if (!key) return result;
    return (
      runs.find((r) => r.id === key) ??
      operations.find((o) => o.id === key) ??
      result.cases.find((c) => c.id === key) ??
      fail("NOT_FOUND", "Local record not found.")
    );
  }
  private saveRun(r: Run) {
    const current = this.store.all("runs").find((x) => x.id === r.id);
    if (current) r.admission = current.admission;
    this.store.put("runs", r);
  }
  private requireRunning(r: Run) {
    if (r.environment !== "running" || !r.providerId)
      fail(
        "NOT_RUNNING",
        "Run is not available for guest work.",
        "Resume or reconcile the run explicitly.",
      );
    return r.providerId;
  }
  private reserve(r: Run) {
    if (
      this.store
        .all("resources")
        .some(
          (resource) =>
            resource.kind === "desktop" &&
            resource.assignment === "unresolved" &&
            !["paused", "deleted"].includes(resource.state),
        )
    )
      fail(
        "CAPACITY",
        "An unresolved owned desktop may occupy capacity.",
        "Reconcile the resource inventory before creating more desktops.",
      );
    if (this.store.all("runs").some((x) => x.id !== r.id && x.slot))
      fail(
        "CAPACITY",
        "The one-desktop active slot is occupied.",
        "Pause the active run or reconcile its uncertain operation.",
      );
    r.slot = true;
    this.saveRun(r);
  }
  private operationView(o: Operation) {
    return {
      id: o.id,
      runId: o.runId,
      action: o.action,
      state: o.state,
      result: o.result,
      error: o.error,
    };
  }
  async call(
    name: ToolName,
    input: unknown,
    actor: Actor = "agent",
  ): Promise<unknown> {
    const args = toolSchemas[name].parse(input);
    if (name === "status")
      return this.status(toolSchemas.status.parse(args).id);
    if (name === "observe")
      return this.observe(toolSchemas.observe.parse(args).runId);
    const a = args as Record<string, unknown>;
    const requestId = String(a.requestId);
    const fingerprint = hash(canonical({ name, args, actor }));
    const prior = this.store
      .all("operations")
      .find((o) => o.requestId === requestId);
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        fail(
          "REQUEST_CONFLICT",
          "Request ID was reused with different arguments.",
        );
      return this.operationView(prior);
    }
    const op: Operation = {
      id: id("op"),
      requestId,
      fingerprint,
      action: name,
      actor,
      args: a,
      state: "queued",
      createdAt: Date.now(),
    };
    this.store.transaction(() => {
      if (name === "start" || name === "fork") {
        let projectId: string,
          importId = "",
          parentCaseId: string | undefined,
          guestBase: string | undefined;
        if (name === "fork") {
          const c = this.store.get("cases", String(a.caseId));
          const cp = this.store.get("checkpoints", c.checkpointId);
          if (cp.availability !== "available" || !cp.providerId)
            fail("CHECKPOINT_UNAVAILABLE", "Case has no confirmed checkpoint.");
          const parent = this.store.get("runs", c.runId);
          projectId = parent.projectId;
          importId = parent.importId;
          parentCaseId = c.id;
          guestBase = parent.guestBase;
        } else {
          projectId = String(a.projectId);
          this.store.get("projects", projectId);
        }
        if (
          this.store
            .all("runs")
            .filter(
              (r) => r.projectId === projectId && r.environment !== "deleted",
            ).length >= 4
        )
          fail(
            "RETENTION_LIMIT",
            "Four desktops are already retained.",
            "Clean up a retained run.",
          );
        const key = id("run");
        const r: Run = {
          id: key,
          projectId,
          importId,
          parentCaseId,
          guestBase: guestBase ?? `/tmp/workbench/${key}`,
          label: String(a.label ?? "Repair fork"),
          generation: 1,
          revision: 0,
          environment: "creating",
          outcome: "pending",
          admission: "enabled",
          cleanup: "not_requested",
          slot: false,
          createdAt: Date.now(),
          lastWork: Date.now(),
          activeSince: Date.now(),
          activeMs: 0,
          expiresAt: Date.now() + 7 * 86400000,
          memoryMb: 4096,
        };
        this.reserve(r);
        op.runId = key;
      } else if (name === "retain") {
        if (actor === "agent")
          fail("HUMAN_REQUIRED", "Retention changes require a human.");
        this.store.get("checkpoints", String(a.checkpointId));
      } else {
        const r = this.store.get("runs", String(a.runId));
        op.runId = r.id;
        if (name === "hold" && actor === "agent")
          fail("HUMAN_REQUIRED", "Agent hold is controlled by the human.");
        if (actor === "agent" && r.admission === "held")
          fail(
            "AGENT_HELD",
            "Agent actions are held.",
            "Ask the human to release the hold.",
          );
        if ("generation" in a && a.generation !== r.generation)
          fail(
            "STALE_GENERATION",
            "Run generation changed.",
            "Read status and observe again.",
          );
        if (
          name === "lifecycle" &&
          a.action === "resume" &&
          r.environment === "paused"
        )
          this.reserve(r);
      }
      this.store.put("operations", op);
      if (name === "hold") {
        const r = this.store.get("runs", op.runId!);
        r.admission = a.held ? "held" : "enabled";
        this.store.put("runs", r);
        if (a.held)
          for (const pending of this.store.all("operations"))
            if (
              pending.runId === r.id &&
              pending.actor === "agent" &&
              pending.state === "queued"
            ) {
              pending.state = "canceled";
              this.store.put("operations", pending);
            }
      }
    });
    const queue = op.runId ?? "global";
    const previous = this.queues.get(queue) ?? Promise.resolve();
    const job = previous.catch(() => {}).then(() => this.execute(op.id));
    this.queues.set(queue, job);
    this.jobs.add(job);
    void job.finally(() => {
      this.jobs.delete(job);
      if (this.queues.get(queue) === job) this.queues.delete(queue);
    });
    return this.operationView(op);
  }
  private async execute(key: string) {
    let op = this.store.get("operations", key);
    if (op.state === "canceled") {
      if (
        op.runId &&
        op.action === "lifecycle" &&
        op.args.action === "resume"
      ) {
        const r = this.store.get("runs", op.runId);
        if (r.environment === "paused") {
          r.slot = false;
          this.saveRun(r);
        }
      }
      return;
    }
    try {
      if (op.runId) {
        const r = this.store.get("runs", op.runId);
        if (op.actor === "agent" && r.admission === "held")
          fail("AGENT_HELD", "Queued action canceled by agent hold.");
        if (
          op.args.generation !== undefined &&
          op.args.generation !== r.generation
        )
          fail(
            "STALE_GENERATION",
            "Run generation changed while operation was queued.",
          );
      }
      op.state = "executing";
      this.store.put("operations", op);
      const result = await this.perform(op);
      op = this.store.get("operations", key);
      op.state = "succeeded";
      op.result = result;
      op.finishedAt = Date.now();
      this.store.put("operations", op);
      this.store.event(`${op.action} completed (${op.runId ?? op.id}).`);
    } catch (e) {
      op = this.store.get("operations", key);
      op.state =
        e instanceof WorkbenchError && !e.uncertain ? "failed" : "uncertain";
      op.error = publicError(e);
      op.finishedAt = Date.now();
      this.store.put("operations", op);
      if (op.runId) {
        const r = this.store.get("runs", op.runId);
        if (op.action === "start" || op.action === "fork") {
          r.outcome = "failed";
          if (!r.providerId) {
            r.environment = op.state === "uncertain" ? "unknown" : "absent";
            r.slot = op.state === "uncertain";
          }
        }
        if (op.action === "lifecycle" && op.args.action === "destroy")
          r.cleanup = "blocked";
        if (
          op.action === "lifecycle" &&
          op.args.action === "resume" &&
          r.environment === "paused"
        )
          r.slot = false;
        this.saveRun(r);
      }
      this.store.event(`${op.action} ${op.state}; inspect operation ${op.id}.`);
    }
  }
  private async artifact(
    r: Run,
    kind: string,
    bytes: Uint8Array | string,
    op?: Operation,
  ) {
    const a: Artifact = {
      id: id("artifact"),
      runId: r.id,
      kind,
      path: "",
      bytes: Buffer.byteLength(bytes),
      sha256: hash(bytes),
      createdAt: Date.now(),
      operationId: op?.id,
      publicExport: false,
    };
    if (a.bytes > 100 * 1024 * 1024)
      fail("SIZE_LIMIT", "Artifact exceeds 100 MiB.");
    const dir = join(this.store.dir, "artifacts");
    await mkdir(dir, { recursive: true, mode: 0o700 });
    a.path = join(dir, a.id);
    privateWrite(a.path, bytes);
    this.store.put("artifacts", a);
    return a.id;
  }
  async observe(runId: string) {
    const previous = this.queues.get(runId);
    if (previous) await previous;
    const r = this.store.get("runs", runId);
    const shot = await this.provider.observe(this.requireRunning(r));
    const artifactId = await this.artifact(r, "screenshot", shot.bytes);
    const observation = this.store.put("observations", {
      id: id("observation"),
      runId,
      generation: r.generation,
      revision: r.revision,
      width: shot.width,
      height: shot.height,
      createdAt: Date.now(),
      artifactId,
    });
    return {
      ...observation,
      provider: this.provider.kind,
      image: {
        mimeType: "image/png",
        data: Buffer.from(shot.bytes).toString("base64"),
      },
    };
  }
  private invalidate(r: Run) {
    r.revision++;
    r.lastWork = Date.now();
    this.saveRun(r);
  }
  private async collect(r: Run, tag: string) {
    const p = this.store.get("projects", r.projectId);
    const dest = join(this.store.dir, "collections", id(tag));
    const m = await this.provider.collect(
      this.requireRunning(r),
      r.guestBase,
      dest,
      p.config,
    );
    return { dest, manifest: m };
  }
  private async perform(op: Operation): Promise<unknown> {
    const a = op.args;
    const name = op.action;
    const r = op.runId ? this.store.get("runs", op.runId) : undefined;
    if (name === "hold") return { admission: r!.admission };
    if (name === "retain") {
      const cp = this.store.get("checkpoints", String(a.checkpointId));
      cp.pinned = Boolean(a.pinned);
      this.store.put("checkpoints", cp);
      return { checkpointId: cp.id, pinned: cp.pinned };
    }
    if (!r) fail("NOT_FOUND", "Run missing.");
    const project = this.store.get("projects", r.projectId);
    if (name === "start" || name === "fork") {
      let snapshot: string | undefined;
      if (name === "start") {
        const importId = id("import");
        const baseline = join(this.store.dir, "imports", importId);
        const m = await capture(project.root, project.config, baseline);
        this.store.put("imports", {
          id: importId,
          projectId: project.id,
          baseline,
          manifest: m,
          createdAt: Date.now(),
        });
        r.importId = importId;
        this.saveRun(r);
      } else {
        const c = this.store.get("cases", r.parentCaseId!);
        snapshot = this.store.get("checkpoints", c.checkpointId).providerId;
      }
      const remote = await this.provider.create(
        {
          installation: this.store.installationId,
          run: r.id,
          operation: op.id,
        },
        snapshot,
        r.memoryMb,
      );
      r.providerId = remote.id;
      r.environment = remote.state;
      this.saveRun(r);
      if (name === "start") {
        const imp = this.store.get("imports", r.importId);
        await this.provider.prepare(
          remote.id,
          r.guestBase,
          imp.baseline,
          imp.manifest,
          project.config,
          async (phase, log) => {
            await this.artifact(r, `${phase}-log`, JSON.stringify(log), op);
          },
        );
      }
      r.outcome = "running";
      r.lastWork = Date.now();
      this.saveRun(r);
      return {
        runId: r.id,
        generation: r.generation,
        provider: this.provider.kind,
      };
    }
    if (name === "lifecycle") {
      const action = String(a.action);
      if (action === "destroy" && !a.apply) return this.cleanupPreview(r.id);
      if (action === "destroy") {
        await this.cleanup(r.id);
        return { runId: r.id, cleanup: this.store.get("runs", r.id).cleanup };
      }
      if (action === "pause") {
        if (r.environment === "paused") return { environment: "paused" };
        this.requireRunning(r);
        this.disconnectViewers(r.id);
        r.environment = "pausing";
        this.saveRun(r);
        await this.provider.pause(r.providerId!);
        if ((await this.provider.status(r.providerId!)) !== "paused")
          throw new WorkbenchError(
            "UNCONFIRMED",
            "Pause has not been confirmed.",
            "Reconcile run status.",
            true,
          );
        r.environment = "paused";
        r.activeMs += Date.now() - r.activeSince;
        r.slot = false;
        this.invalidate(r);
        return { environment: r.environment };
      }
      if (action === "resume") {
        if (r.environment === "running") return { environment: "running" };
        if (r.environment !== "paused" || !r.providerId)
          fail("NOT_PAUSED", "Only a confirmed paused run can resume.");
        r.environment = "resuming";
        this.saveRun(r);
        await this.provider.resume(r.providerId);
        if ((await this.provider.status(r.providerId)) !== "running")
          throw new WorkbenchError(
            "UNCONFIRMED",
            "Resume has not been confirmed.",
            "Reconcile run status.",
            true,
          );
        r.environment = "running";
        r.generation++;
        r.activeSince = Date.now();
        this.invalidate(r);
        return { environment: r.environment, generation: r.generation };
      }
    }
    if (name === "complete") {
      const parsed = toolSchemas.complete.parse(a);
      for (const key of parsed.evidence)
        if (this.store.get("artifacts", key).runId !== r.id)
          fail("WRONG_RUN", "Verification evidence belongs to another run.");
      r.outcome = parsed.outcome;
      this.saveRun(r);
      return {
        outcome: r.outcome,
        declaredBy: op.actor,
        evidence: parsed.evidence,
      };
    }
    if (name === "export") return this.export(r, op);
    const remoteId = this.requireRunning(r);
    if (name === "act") {
      const input = toolSchemas.act.parse(a);
      const obs = this.store.get("observations", input.observationId);
      if (
        obs.runId !== r.id ||
        obs.generation !== r.generation ||
        obs.revision !== r.revision ||
        Date.now() - obs.createdAt > 30000
      )
        fail(
          "STALE_OBSERVATION",
          "Observation is stale or belongs to another run.",
          "Observe this run again.",
        );
      if (
        "x" in input.action &&
        (input.action.x >= obs.width || input.action.y >= obs.height)
      )
        fail("COORDINATES", "Coordinates are outside the observation.");
      this.invalidate(r);
      await this.provider.act(
        remoteId,
        input.action,
        project.config.openUrl,
        r.guestBase,
      );
      return { acted: true };
    }
    if (name === "exec") {
      const input = toolSchemas.exec.parse(a);
      this.invalidate(r);
      const result = await this.provider.exec(
        remoteId,
        r.guestBase,
        input.command,
        input.cwd,
      );
      const artifactId = await this.artifact(
        r,
        "command-log",
        JSON.stringify({
          ...result,
          location: "remote guest",
          actor: op.actor,
        }),
        op,
      );
      return {
        ...result,
        stdout: result.stdout.slice(0, 8192),
        stderr: result.stderr.slice(0, 8192),
        truncated:
          result.truncated ||
          result.stdout.length + result.stderr.length > 8192,
        artifactId,
      };
    }
    if (name === "files") {
      const input = toolSchemas.files.parse(a);
      if (input.mode !== "list") {
        safePath(input.path);
        if (!eligible(input.path, project.config))
          fail(
            "PATH_EXCLUDED",
            "File is outside the configured source selection.",
          );
      }
      if (input.mode === "write" || input.mode === "delete") this.invalidate(r);
      const result = await this.provider.files(
        remoteId,
        r.guestBase,
        input.mode,
        input.path,
        input.content,
      );
      const serialized = JSON.stringify(result);
      if (serialized.length > 8192) {
        const artifactId = await this.artifact(
          r,
          "file-result",
          serialized,
          op,
        );
        return { text: serialized.slice(0, 8192), truncated: true, artifactId };
      }
      return result;
    }
    if (name === "capture") {
      const input = toolSchemas.capture.parse(a);
      if (
        this.store
          .all("checkpoints")
          .filter(
            (cp) =>
              this.store.get("runs", cp.runId).projectId === r!.projectId &&
              cp.availability !== "deleted",
          ).length >= 6
      )
        fail("RETENTION_LIMIT", "Six checkpoints are retained.");
      if (
        input.mode === "case" &&
        this.store
          .all("cases")
          .filter(
            (c) =>
              this.store.get("runs", c.runId).projectId === r!.projectId &&
              this.store.get("checkpoints", c.checkpointId).availability !==
                "deleted",
          ).length >= 3
      )
        fail("RETENTION_LIMIT", "Three cases are retained.");
      const source = await this.collect(r, "capture");
      try {
        const shot = await this.provider.observe(remoteId);
        const artifactId = await this.artifact(r, "screenshot", shot.bytes, op);
        const cp: Checkpoint = {
          id: id("checkpoint"),
          runId: r.id,
          name: `${this.store.installationId}-${op.id}`,
          label: input.title,
          digest: source.manifest.digest,
          availability: "unverified",
          memoryMb: r.memoryMb,
          createdAt: Date.now(),
          expiresAt: Date.now() + 7 * 86400000,
          pinned: false,
          operationId: op.id,
        };
        this.store.put("checkpoints", cp);
        let caseId: string | undefined;
        if (input.mode === "case") {
          caseId = id("case");
          const c: Case = {
            id: caseId,
            runId: r.id,
            checkpointId: cp.id,
            title: input.title,
            expected: input.expected,
            observed: input.observed,
            steps: input.steps,
            context: input.context,
            artifacts: [artifactId],
            createdAt: Date.now(),
            importDigest: this.store.get("imports", r.importId).manifest.digest,
            sourceDigest: cp.digest,
          };
          this.store.put("cases", c);
        }
        op.result = { checkpointId: cp.id, caseId, artifactId };
        this.store.put("operations", op);
        const snap = await this.provider.snapshot(
          remoteId,
          cp.name,
          async (receipt) => {
            cp.providerId = receipt.id;
            this.store.put("checkpoints", cp);
          },
        );
        cp.providerId = snap.id;
        cp.availability = "available";
        this.store.put("checkpoints", cp);
        return op.result;
      } finally {
        await rm(source.dest, { recursive: true, force: true });
      }
    }
    if (name === "restore") {
      const input = toolSchemas.restore.parse(a);
      const cp = this.store.get("checkpoints", input.checkpointId);
      if (
        cp.runId !== r.id ||
        cp.availability !== "available" ||
        !cp.providerId
      )
        fail(
          "CHECKPOINT_UNAVAILABLE",
          "Restore requires a confirmed checkpoint of this run.",
        );
      this.disconnectViewers(r.id);
      r.environment = "restoring";
      r.generation++;
      this.invalidate(r);
      await this.provider.restore(remoteId, cp.providerId);
      r.environment = await this.provider.status(remoteId);
      if (r.environment !== "running")
        throw new WorkbenchError(
          "UNCONFIRMED",
          "Restore outcome is not confirmed.",
          "Reconcile and observe again.",
          true,
        );
      this.saveRun(r);
      return { runId: r.id, generation: r.generation };
    }
    fail("UNSUPPORTED", "Unknown operation.");
  }
  private async export(r: Run, op: Operation) {
    const imp = this.store.get("imports", r.importId);
    const p = this.store.get("projects", r.projectId);
    const source = await this.collect(r, "export");
    const evidenceDir = join(this.store.dir, "collections", id("evidence"));
    try {
      const diff = await makePatch(
        imp.baseline,
        imp.manifest,
        source.dest,
        source.manifest,
        p.config,
      );
      const patchId = await this.artifact(r, "patch", diff.patch, op);
      let divergence = true;
      try {
        divergence =
          (await scan(p.root, p.config, true)).digest !== imp.manifest.digest;
      } catch {
        /* Treat unreadable local source as diverged. */
      }
      const collectedEvidence: { path: string; artifactId: string }[] = [];
      if (p.config.artifacts.length) {
        const files = await this.provider.collectArtifacts(
          this.requireRunning(r),
          r.guestBase,
          evidenceDir,
          p.config,
        );
        for (const entry of files.entries) {
          const artifactId = await this.artifact(
            r,
            "test-evidence",
            await readFile(join(evidenceDir, entry.path)),
            op,
          );
          collectedEvidence.push({ path: entry.path, artifactId });
        }
      }
      const shot = await this.provider.observe(this.requireRunning(r));
      await this.artifact(r, "screenshot", shot.bytes, op);
      const bundleBytes = this.store
        .all("artifacts")
        .filter((a) => a.runId === r.id)
        .reduce((sum, a) => sum + a.bytes, 0);
      if (bundleBytes > 100 * 1024 * 1024)
        fail(
          "SIZE_LIMIT",
          "Evidence bundle exceeds 100 MiB.",
          "Review retained artifacts before exporting.",
        );
      const metadata = {
        schemaVersion: 1,
        collectedEvidence,
        runId: r.id,
        provider: this.provider.kind,
        importDigest: imp.manifest.digest,
        sourceDigest: source.manifest.digest,
        verifiedDigest: diff.verifiedDigest,
        localSourceChanged: divergence,
        changes: diff.changes,
        deleted: diff.deleted,
        excluded: source.manifest.excluded,
        artifacts: this.store
          .all("artifacts")
          .filter((x) => x.runId === r.id)
          .map(({ path: _path, ...x }) => x),
        publicExport: false,
      };
      const manifestId = await this.artifact(
        r,
        "manifest",
        JSON.stringify(metadata, null, 2),
        op,
      );
      const reportId = await this.artifact(
        r,
        "report",
        `# Investigation export\n\nProvider: ${this.provider.kind}. Task outcome: ${r.outcome}.\n\nPatch reconstruction verified against the immutable import. Local source changed: ${divergence}.\n\nEvidence and screenshots remain private and require content review before sharing.\n\nPatch: ${patchId}\nManifest: ${manifestId}\n\n${this.store
          .all("cases")
          .filter((c) => c.runId === r.id || c.id === r.parentCaseId)
          .map(
            (c) =>
              `## ${c.title}\nExpected: ${c.expected}\nObserved: ${c.observed}\n\n${c.context}`,
          )
          .join("\n")}`,
        op,
      );
      return {
        patchId,
        manifestId,
        reportId,
        localSourceChanged: divergence,
        verified: true,
      };
    } finally {
      await rm(source.dest, { recursive: true, force: true });
      await rm(evidenceDir, { recursive: true, force: true });
    }
  }
  cleanupPreview(runId: string) {
    const scope = new Set([runId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const r of this.store.all("runs"))
        if (
          r.parentCaseId &&
          scope.has(this.store.get("cases", r.parentCaseId).runId) &&
          !scope.has(r.id)
        ) {
          scope.add(r.id);
          changed = true;
        }
    }
    const checkpoints = this.store
      .all("checkpoints")
      .filter((c) => scope.has(c.runId) && c.availability !== "deleted");
    return {
      runs: [...scope],
      checkpoints: checkpoints.filter((c) => !c.pinned).map((c) => c.id),
      retainedPinned: checkpoints.filter((c) => c.pinned).map((c) => c.id),
      localEvidenceRetained: true,
    };
  }
  private async cleanup(runId: string) {
    const preview = this.cleanupPreview(runId);
    for (const key of [...preview.runs].reverse()) {
      const r = this.store.get("runs", key);
      if (
        this.store
          .all("operations")
          .some(
            (o) =>
              o.runId === key &&
              o.state === "executing" &&
              o.action !== "lifecycle",
          )
      )
        fail(
          "BUSY",
          "A child has an active operation.",
          "Wait for it to finish before cleanup.",
        );
      r.cleanup = "pending";
      this.saveRun(r);
      if (r.providerId) {
        this.disconnectViewers(r.id);
        r.environment = "deleting";
        this.saveRun(r);
        await this.provider.destroy(r.providerId);
        if ((await this.provider.status(r.providerId)) !== "deleted")
          throw new WorkbenchError(
            "UNCONFIRMED_DELETE",
            "Deletion has not been confirmed.",
            "Reconcile cleanup before retrying.",
            true,
          );
      } else if (r.environment === "unknown" || r.environment === "creating")
        fail(
          "UNKNOWN_RESOURCE",
          "Cannot clean an unresolved create.",
          "Reconcile resource ownership first.",
        );
      r.environment = "deleted";
      r.slot = false;
      this.saveRun(r);
    }
    for (const key of preview.checkpoints) {
      const cp = this.store.get("checkpoints", key);
      if (!cp.providerId && cp.availability === "unverified")
        fail(
          "UNKNOWN_CHECKPOINT",
          "Checkpoint creation is unresolved.",
          "Reconcile snapshots before cleanup.",
        );
      if (cp.providerId) {
        await this.provider.deleteSnapshot(cp.providerId);
        if (
          (await this.provider.snapshots()).some((s) => s.id === cp.providerId)
        )
          throw new WorkbenchError(
            "UNCONFIRMED_DELETE",
            "Checkpoint deletion is unconfirmed.",
            "Reconcile cleanup.",
            true,
          );
      }
      cp.availability = "deleted";
      this.store.put("checkpoints", cp);
    }
    for (const key of preview.runs) {
      const r = this.store.get("runs", key);
      r.cleanup = "complete";
      this.saveRun(r);
    }
  }
  async reconcile() {
    let remotes;
    let snapshots;
    try {
      remotes = await this.provider.list(this.store.installationId);
      snapshots = await this.provider.snapshots();
    } catch {
      this.store.event(
        "Provider reconciliation unavailable; existing ownership retained.",
      );
      return;
    }
    // Preserve an inventory of every discovered owned resource, including ambiguous
    // responses. Private provider IDs never appear in the public projection.
    for (const remote of remotes) {
      const linked = this.store
        .all("runs")
        .find((r) => r.providerId === remote.id);
      const knownRun = this.store
        .all("runs")
        .find((r) => r.id === remote.metadata.run);
      const operation = this.store
        .all("operations")
        .find(
          (op) =>
            op.id === remote.metadata.operation && op.runId === knownRun?.id,
        );
      this.store.put("resources", {
        id: "resource_" + hash(remote.id).slice(0, 24),
        kind: "desktop",
        providerId: remote.id,
        runId: knownRun?.id,
        operationId: operation?.id,
        state: remote.state,
        assignment: linked ? "assigned" : "unresolved",
        lastSeenAt: Date.now(),
      });
    }
    for (const cp of this.store.all("checkpoints"))
      for (const snapshot of snapshots.filter(
        (s) => s.id === cp.providerId || s.name === cp.name,
      )) {
        this.store.put("resources", {
          id: "resource_" + hash(snapshot.id).slice(0, 24),
          kind: "checkpoint",
          providerId: snapshot.id,
          runId: cp.runId,
          operationId: cp.operationId,
          state: "available",
          assignment: snapshot.id === cp.providerId ? "assigned" : "unresolved",
          lastSeenAt: Date.now(),
        });
      }
    for (const op of this.store
      .all("operations")
      .filter((o) => ["executing", "uncertain", "queued"].includes(o.state))) {
      if (op.state === "queued") {
        op.state = "canceled";
        op.error = {
          code: "INTERRUPTED",
          message: "Queued work canceled after restart.",
          nextAction: "Submit a fresh request after inspecting state.",
        };
        if (op.runId && (op.action === "start" || op.action === "fork")) {
          const r = this.store.get("runs", op.runId);
          r.slot = false;
          r.environment = "absent";
          this.saveRun(r);
        }
      } else if (["start", "fork"].includes(op.action) && op.runId) {
        const r = this.store.get("runs", op.runId);
        const matches = remotes.filter(
          (x) => x.metadata.operation === op.id && x.metadata.run === r.id,
        );
        if (matches.length === 1) {
          r.providerId = matches[0].id;
          r.environment = matches[0].state;
          r.slot = !["paused", "deleted"].includes(r.environment);
          r.generation++;
          this.saveRun(r);
          op.state = "failed";
          op.error = {
            code: "RECOVERED_DESKTOP",
            message:
              "Owned desktop recovered; interrupted setup was not repeated.",
            nextAction:
              "Inspect the desktop or clean up before starting again.",
          };
        } else op.state = "uncertain";
      } else if (op.action === "capture") {
        const cp = this.store
          .all("checkpoints")
          .find((c) => c.operationId === op.id);
        const matches = cp ? snapshots.filter((s) => s.name === cp.name) : [];
        if (cp && matches.length === 1 && matches[0].restorable !== false) {
          cp.providerId = matches[0].id;
          cp.availability = "available";
          this.store.put("checkpoints", cp);
          op.state = "succeeded";
        } else op.state = "uncertain";
      } else {
        op.state = "uncertain";
        op.error = {
          code: "INTERRUPTED",
          message: "Interrupted action was not repeated.",
          nextAction: "Inspect guest and evidence before deciding next steps.",
        };
      }
      this.store.put("operations", op);
    }
    for (const r of this.store.all("runs"))
      if (r.providerId) {
        try {
          r.environment = await this.provider.status(r.providerId);
          if (r.cleanup === "complete" && r.environment !== "deleted") {
            r.cleanup = "blocked";
            this.store.event(
              "A previously deleted desktop reappeared; reconcile cleanup.",
            );
          }
          r.slot = !["paused", "deleted", "absent"].includes(r.environment);
          r.generation++;
          this.saveRun(r);
        } catch {
          r.environment = "unknown";
          r.slot = true;
          this.saveRun(r);
        }
      }
    for (const cp of this.store.all("checkpoints")) {
      const matches = snapshots.filter(
        (s) => s.id === cp.providerId || s.name === cp.name,
      );
      const owner = this.store.get("runs", cp.runId);
      if (matches.length && !cp.pinned && owner.cleanup === "complete") {
        owner.cleanup = "blocked";
        this.saveRun(owner);
        this.store.event(
          "A checkpoint is present after cleanup; reconcile its deletion.",
        );
      }
      if (matches.length === 1 && matches[0].restorable !== false) {
        cp.providerId = matches[0].id;
        cp.availability = "available";
      } else if (cp.availability === "available" || matches.length) {
        cp.availability = "unverified";
      }
      this.store.put("checkpoints", cp);
    }
    for (const resource of this.store.all("resources")) {
      const run = this.store
        .all("runs")
        .find((r) => r.providerId === resource.providerId);
      const checkpoint = this.store
        .all("checkpoints")
        .find((cp) => cp.providerId === resource.providerId);
      if (resource.kind === "desktop" && run) {
        resource.assignment = "assigned";
        resource.state = run.environment;
      }
      if (
        resource.kind === "desktop" &&
        !run &&
        !remotes.some((remote) => remote.id === resource.providerId)
      ) {
        try {
          resource.state = await this.provider.status(resource.providerId);
        } catch {
          resource.state = "unknown";
        }
      }
      if (resource.kind === "checkpoint" && checkpoint) {
        resource.assignment = "assigned";
        resource.state = checkpoint.availability;
      }
      this.store.put("resources", resource);
    }
  }
  private expirationSafe(runId: string, now: number) {
    const scope = new Set(this.cleanupPreview(runId).runs);
    if (
      this.store
        .all("runs")
        .some(
          (run) =>
            scope.has(run.id) &&
            run.environment !== "deleted" &&
            run.expiresAt > now,
        )
    )
      return false;
    if (
      this.store
        .all("checkpoints")
        .some(
          (cp) =>
            scope.has(cp.runId) &&
            cp.availability !== "deleted" &&
            (cp.pinned || cp.expiresAt > now),
        )
    )
      return false;
    if (
      this.store
        .all("operations")
        .some(
          (op) =>
            op.runId &&
            scope.has(op.runId) &&
            ["capture", "export"].includes(op.action) &&
            ["failed", "uncertain", "executing", "queued"].includes(op.state),
        )
    )
      return false;
    return true;
  }
  async sweep(now = Date.now()) {
    for (const r of this.store.all("runs")) {
      if (this.queues.has(r.id)) continue;
      const c = this.store.get("projects", r.projectId).config;
      if (
        r.environment === "running" &&
        (now - r.lastWork > 300000 ||
          r.activeMs + now - r.activeSince > c.limits.maxActiveMinutes * 60000)
      ) {
        await this.call(
          "lifecycle",
          {
            requestId: id("idle"),
            runId: r.id,
            generation: r.generation,
            action: "pause",
          },
          "human",
        );
      }
      if (
        r.expiresAt < now &&
        r.environment === "paused" &&
        this.expirationSafe(r.id, now)
      )
        await this.call(
          "lifecycle",
          {
            requestId: id("expire"),
            runId: r.id,
            generation: r.generation,
            action: "destroy",
            apply: true,
          },
          "human",
        );
    }
  }
  async settle() {
    await Promise.all([...this.jobs]);
  }
  async readArtifact(key: string) {
    const a = this.store.get("artifacts", key);
    const bytes = await readFile(a.path);
    if (hash(bytes) !== a.sha256)
      fail("ARTIFACT_CORRUPT", "Artifact failed its integrity check.");
    return { artifact: a, bytes };
  }
  async close() {
    await this.settle();
    this.provider.close();
    this.store.close();
  }
}
