import { test, expect, afterEach } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setup, started, run, result } from "../helpers.js";
import { Store } from "../../src/persistence/store.js";
import { Workbench } from "../../src/core/workbench.js";
import { FakeProvider } from "../../src/provider/fake.js";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const f of cleanups.splice(0)) await f();
});
async function fixture() {
  const h = await setup();
  cleanups.push(h.close);
  return h;
}
test("local idempotency and global capacity survive concurrent start requests", async () => {
  const h = await fixture();
  h.provider.delayMs = 20;
  const a = await h.w.call("start", {
    requestId: "same",
    projectId: h.projectId,
  });
  expect(
    await h.w.call("start", { requestId: "same", projectId: h.projectId }),
  ).toEqual(a);
  await expect(
    h.w.call("start", {
      requestId: "same",
      projectId: h.projectId,
      label: "different",
    }),
  ).rejects.toThrow(/reused/);
  await expect(
    h.w.call("start", { requestId: "other", projectId: h.projectId }),
  ).rejects.toThrow(/slot/);
  await h.w.settle();
  expect(h.provider.state.remotes).toHaveLength(1);
});
test("stale generations, wrong-run images, expired images and out-of-bounds actions are rejected", async () => {
  const h = await fixture();
  const r = await started(h);
  const o = await h.w.observe(r.id);
  const bad = await run(h.w, "act", {
    runId: r.id,
    generation: 1,
    observationId: o.id,
    action: { type: "click", x: 1, y: 0 },
  });
  expect(bad.error?.code).toBe("COORDINATES");
  await expect(
    h.w.call("act", {
      requestId: "stale",
      runId: r.id,
      generation: 2,
      observationId: o.id,
      action: { type: "type", text: "x" },
    }),
  ).rejects.toThrow(/generation/);
  const obs = h.store.get("observations", o.id);
  h.store.put("runs", {
    ...r,
    id: "wrong",
    providerId: undefined,
    slot: false,
    environment: "absent",
  });
  obs.runId = "wrong";
  h.store.put("observations", obs);
  expect(
    (
      await run(h.w, "act", {
        runId: r.id,
        generation: 1,
        observationId: o.id,
        action: { type: "click", x: 0, y: 0 },
      })
    ).error?.code,
  ).toBe("STALE_OBSERVATION");
  obs.runId = r.id;
  obs.createdAt -= 60000;
  h.store.put("observations", obs);
  expect(
    (
      await run(h.w, "act", {
        runId: r.id,
        generation: 1,
        observationId: o.id,
        action: { type: "click", x: 0, y: 0 },
      })
    ).state,
  ).toBe("failed");
});
test("exec and file writes invalidate observations; holds cancel queued agent work but allow human recovery", async () => {
  const h = await fixture();
  const r = await started(h);
  const obs = await h.w.observe(r.id);
  await run(h.w, "files", {
    runId: r.id,
    generation: 1,
    mode: "write",
    path: "src/new.js",
    content: "new",
  });
  expect(
    (
      await run(h.w, "act", {
        runId: r.id,
        generation: 1,
        observationId: obs.id,
        action: { type: "type", text: "x" },
      })
    ).error?.code,
  ).toBe("STALE_OBSERVATION");
  const o2 = await h.w.observe(r.id);
  await run(h.w, "exec", {
    runId: r.id,
    generation: 1,
    command: { program: "true" },
  });
  expect(
    (
      await run(h.w, "act", {
        runId: r.id,
        generation: 1,
        observationId: o2.id,
        action: { type: "type", text: "x" },
      })
    ).state,
  ).toBe("failed");
  const queued = (await h.w.call("exec", {
    requestId: "queued",
    runId: r.id,
    generation: 1,
    command: { program: "true" },
  })) as { id: string };
  await h.w.call(
    "hold",
    { requestId: "hold", runId: r.id, held: true },
    "human",
  );
  await h.w.settle();
  expect(h.store.get("operations", queued.id).state).toBe("canceled");
  await expect(
    h.w.call("exec", {
      requestId: "blocked",
      runId: r.id,
      generation: 1,
      command: { program: "true" },
    }),
  ).rejects.toThrow(/held/);
  expect((await h.w.observe(r.id)).image.mimeType).toBe("image/png");
  expect(
    (
      await run(
        h.w,
        "lifecycle",
        { runId: r.id, generation: 1, action: "pause" },
        "human",
      )
    ).state,
  ).toBe("succeeded");
});
test("lost create response reconciles exact owned desktop after service restart without duplicating creation", async () => {
  const h = await setup();
  h.provider.loseNext = "create";
  const op = await run(h.w, "start", { projectId: h.projectId });
  expect(op.state).toBe("uncertain");
  await h.w.close();
  const provider = new FakeProvider(join(h.dir, "remote"));
  const w = new Workbench(new Store(join(h.dir, "state")), provider);
  cleanups.push(async () => {
    await w.close();
    await import("node:fs/promises").then((fs) =>
      fs.rm(h.dir, { recursive: true, force: true }),
    );
  });
  await w.reconcile();
  expect(provider.state.remotes).toHaveLength(1);
  expect(w.store.get("runs", op.runId!).providerId).toBe(
    provider.state.remotes[0].id,
  );
  expect(w.store.get("operations", op.id).error?.code).toBe(
    "RECOVERED_DESKTOP",
  );
});
test("checkpoint response loss preserves case evidence and reconciles by exact operation name", async () => {
  const h = await fixture();
  const r = await started(h);
  h.provider.loseNext = "snapshot";
  const op = await run(h.w, "capture", {
    runId: r.id,
    generation: 1,
    title: "Failure",
    expected: "selected only",
    observed: "all visible",
  });
  expect(op.state).toBe("uncertain");
  expect(h.store.all("cases")).toHaveLength(1);
  await h.w.reconcile();
  expect(h.store.get("operations", op.id).state).toBe("succeeded");
  expect(h.store.all("checkpoints")[0].availability).toBe("available");
});
test("ambiguous checkpoint name remains uncertain", async () => {
  const h = await fixture();
  const r = await started(h);
  h.provider.loseNext = "snapshot";
  const op = await run(h.w, "capture", {
    runId: r.id,
    generation: 1,
    title: "Failure",
  });
  h.provider.state.snapshots.push({
    ...h.provider.state.snapshots[0],
    id: "duplicate",
  });
  h.provider.save();
  await h.w.reconcile();
  expect(h.store.get("operations", op.id).state).toBe("uncertain");
  expect(h.store.all("checkpoints")[0].availability).toBe("unverified");
});
test("fork preserves baseline, isolates repair, exports verified patch, and leaves original workspace untouched", async () => {
  const h = await fixture();
  const r = await started(h);
  const baselineBytes = await readFile(join(h.root, "src/main.js"));
  const originalIndex = await readFile(join(h.root, ".git/index"));
  await run(h.w, "act", {
    runId: r.id,
    generation: 1,
    observationId: (await h.w.observe(r.id)).id,
    action: { type: "type", text: "unsaved draft" },
  });
  const cap = await run(h.w, "capture", {
    runId: r.id,
    generation: 1,
    title: "Repro",
  });
  const { caseId, checkpointId } = result<{
    caseId: string;
    checkpointId: string;
  }>(cap);
  await run(h.w, "lifecycle", { runId: r.id, generation: 1, action: "pause" });
  const fork = await run(h.w, "fork", { caseId });
  const child = h.store.get("runs", fork.runId!);
  expect(child.guestBase).toBe(r.guestBase);
  const probes = await run(h.w, "exec", {
    runId: child.id,
    generation: 1,
    command: { program: "fake-probes" },
  });
  expect(result<{ stdout: string }>(probes).stdout).toContain("unsaved draft");
  await run(h.w, "files", {
    runId: child.id,
    generation: 1,
    mode: "write",
    path: "src/main.js",
    content: "export const answer = 2;\n",
  });
  await writeFile(join(h.root, "src/main.js"), "independent local edit");
  const exp = await run(h.w, "export", { runId: child.id, generation: 1 });
  expect(exp.state).toBe("succeeded");
  expect(result<{ localSourceChanged: boolean }>(exp).localSourceChanged).toBe(
    true,
  );
  expect(await readFile(join(h.root, ".git/index"))).toEqual(originalIndex);
  expect(await readFile(join(h.root, "src/main.js"), "utf8")).toBe(
    "independent local edit",
  );
  const imp = h.store.get("imports", r.importId);
  expect(await readFile(join(imp.baseline, "src/main.js"))).toEqual(
    baselineBytes,
  );
  await run(h.w, "lifecycle", {
    runId: child.id,
    generation: 1,
    action: "pause",
  });
  await run(h.w, "lifecycle", { runId: r.id, generation: 1, action: "resume" });
  const resumed = h.store.get("runs", r.id);
  await run(h.w, "restore", {
    runId: r.id,
    generation: resumed.generation,
    checkpointId,
  });
  const restored = h.store.get("runs", r.id);
  const unchanged = await run(h.w, "files", {
    runId: r.id,
    generation: restored.generation,
    mode: "read",
    path: "src/main.js",
  });
  expect(result<{ content: string }>(unchanged).content).toBe(
    baselineBytes.toString(),
  );
});
test("cleanup handles paused descendants, retains evidence and leaves unrelated resources alone", async () => {
  const h = await fixture();
  const r = await started(h);
  const cap = await run(h.w, "capture", {
    runId: r.id,
    generation: 1,
    title: "Case",
  });
  await run(h.w, "lifecycle", { runId: r.id, generation: 1, action: "pause" });
  const fork = await run(h.w, "fork", {
    caseId: result<{ caseId: string }>(cap).caseId,
  });
  await run(h.w, "lifecycle", {
    runId: fork.runId,
    generation: 1,
    action: "pause",
  });
  const unrelated = await h.provider.create({ installation: "unrelated" });
  const cleanup = await run(
    h.w,
    "lifecycle",
    { runId: r.id, generation: 1, action: "destroy", apply: true },
    "human",
  );
  expect(cleanup.state).toBe("succeeded");
  expect(await h.provider.status(unrelated.id)).toBe("running");
  expect(h.store.all("checkpoints")[0].availability).toBe("deleted");
  expect(h.store.all("runs").every((r) => r.cleanup === "complete")).toBe(true);
  expect(h.store.all("cases")).toHaveLength(1);
  expect(
    (await h.w.readArtifact(h.store.all("cases")[0].artifacts[0])).bytes.length,
  ).toBeGreaterThan(0);
  expect(
    (
      await run(
        h.w,
        "lifecycle",
        { runId: r.id, generation: 1, action: "destroy", apply: true },
        "human",
      )
    ).state,
  ).toBe("succeeded");
});
test("unknown deletion is never complete and is recoverable", async () => {
  const h = await fixture();
  const r = await started(h);
  h.provider.loseNext = "destroy";
  const cleanup = await run(
    h.w,
    "lifecycle",
    { runId: r.id, generation: 1, action: "destroy", apply: true },
    "human",
  );
  expect(cleanup.state).toBe("uncertain");
  expect(h.store.get("runs", r.id).cleanup).toBe("blocked");
  await h.w.reconcile();
  const current = h.store.get("runs", r.id);
  expect(
    (
      await run(
        h.w,
        "lifecycle",
        {
          runId: r.id,
          generation: current.generation,
          action: "destroy",
          apply: true,
        },
        "human",
      )
    ).state,
  ).toBe("succeeded");
});
test("status reads do not resume; idle sweep pauses; explicit completion needs owned evidence", async () => {
  const h = await fixture();
  const r = await started(h);
  h.w.status();
  expect(h.store.get("runs", r.id).environment).toBe("running");
  const obs = await h.w.observe(r.id);
  expect(
    (
      await run(
        h.w,
        "complete",
        {
          runId: r.id,
          generation: 1,
          outcome: "succeeded",
          evidence: [obs.artifactId],
        },
        "evaluator",
      )
    ).state,
  ).toBe("succeeded");
  await h.w.sweep(Date.now() + 300001);
  await h.w.settle();
  h.w.status();
  expect(h.store.get("runs", r.id).environment).toBe("paused");
  expect(h.store.get("runs", r.id).outcome).toBe("succeeded");
});

test("export includes declared guest evidence while keeping runtime data out of the patch", async () => {
  const h = await fixture();
  const project = h.store.get("projects", h.projectId);
  project.config.artifacts = ["test-results/**"];
  h.store.put("projects", project);
  const r = await started(h);
  const fs = await import("node:fs/promises");
  const remote = h.provider.state.remotes.find((x) => x.id === r.providerId)!;
  const { dirname } = await import("node:path");
  const artifacts = join(dirname(remote.source), "artifacts");
  await fs.mkdir(join(artifacts, "test-results"), { recursive: true });
  await fs.writeFile(
    join(artifacts, "test-results/assertions.json"),
    JSON.stringify({ passed: true }),
  );
  await fs.writeFile(join(artifacts, ".env"), "private evidence sentinel");
  const op = await run(h.w, "export", { runId: r.id, generation: 1 });
  expect(op.state).toBe("succeeded");
  const ids = result<{ manifestId: string; patchId: string }>(op);
  const report = JSON.parse(
    (await h.w.readArtifact(ids.manifestId)).bytes.toString(),
  );
  expect(report.collectedEvidence[0].path).toBe("test-results/assertions.json");
  expect(
    (
      await h.w.readArtifact(report.collectedEvidence[0].artifactId)
    ).bytes.toString(),
  ).toContain("passed");
  expect((await h.w.readArtifact(ids.patchId)).bytes.toString()).toBe("");
});

test("ambiguous desktop creation exposes every owned resource without leaking provider identities", async () => {
  const h = await fixture();
  h.provider.loseNext = "create";
  const op = await run(h.w, "start", { projectId: h.projectId });
  const original = h.provider.state.remotes[0];
  await h.provider.create({ ...original.metadata });
  await h.w.reconcile();
  expect(h.store.get("operations", op.id).state).toBe("uncertain");
  const inventory = h.store.all("resources");
  expect(
    inventory.filter(
      (r) => r.kind === "desktop" && r.assignment === "unresolved",
    ),
  ).toHaveLength(2);
  const publicStatus = JSON.stringify(h.w.status());
  expect(publicStatus).toContain(inventory[0].id);
  for (const r of h.provider.state.remotes)
    expect(publicStatus).not.toContain(r.id);
  await expect(
    h.w.call("start", {
      requestId: "blocked-inventory",
      projectId: h.projectId,
    }),
  ).rejects.toThrow(/unresolved/);
});

test("automatic retention honors a newer child and preserves failed evidence collection", async () => {
  const h = await fixture();
  const parent = await started(h);
  const cap = await run(h.w, "capture", {
    runId: parent.id,
    generation: 1,
    title: "Retained case",
  });
  await run(h.w, "lifecycle", {
    runId: parent.id,
    generation: 1,
    action: "pause",
  });
  const childOp = await run(h.w, "fork", {
    caseId: result<{ caseId: string }>(cap).caseId,
  });
  await run(h.w, "lifecycle", {
    runId: childOp.runId,
    generation: 1,
    action: "pause",
  });
  const now = Date.now();
  const old = h.store.get("runs", parent.id);
  old.expiresAt = now - 1;
  h.store.put("runs", old);
  const cp = h.store.all("checkpoints")[0];
  cp.expiresAt = now - 1;
  h.store.put("checkpoints", cp);
  await h.w.sweep(now);
  await h.w.settle();
  expect(h.store.get("runs", parent.id).environment).toBe("paused");
  expect(h.store.get("runs", childOp.runId!).environment).toBe("paused");
  const child = h.store.get("runs", childOp.runId!);
  child.expiresAt = now - 1;
  h.store.put("runs", child);
  h.store.put("operations", {
    id: "op_failed_evidence",
    requestId: "failed_evidence",
    fingerprint: "synthetic",
    runId: child.id,
    action: "export",
    actor: "human",
    args: {},
    state: "failed",
    createdAt: now,
  });
  await h.w.sweep(now);
  await h.w.settle();
  expect(h.store.get("runs", parent.id).environment).toBe("paused");
  expect(h.store.get("runs", child.id).environment).toBe("paused");
});

test("a confirmed checkpoint recovers after temporary inventory omission but honors non-restorable state", async () => {
  const h = await fixture();
  const r = await started(h);
  const capture = await run(h.w, "capture", {
    runId: r.id,
    generation: 1,
    title: "Inventory lag",
  });
  expect(capture.state).toBe("succeeded");
  const cp = h.store.all("checkpoints")[0];
  const snapshot = h.provider.state.snapshots[0];
  h.provider.state.snapshots = [];
  h.provider.save();
  await h.w.reconcile();
  expect(h.store.get("checkpoints", cp.id).availability).toBe("unverified");
  h.provider.state.snapshots = [{ ...snapshot, restorable: false }];
  h.provider.save();
  await h.w.reconcile();
  expect(h.store.get("checkpoints", cp.id).availability).toBe("unverified");
  h.provider.state.snapshots = [{ ...snapshot, restorable: true }];
  h.provider.save();
  await h.w.reconcile();
  expect(h.store.get("checkpoints", cp.id).availability).toBe("available");
  expect(h.store.get("operations", capture.id).state).toBe("succeeded");
});

test("a checkpoint that reappears after deletion remains owned and reopens cleanup", async () => {
  const h = await fixture();
  const r = await started(h);
  await run(h.w, "capture", {
    runId: r.id,
    generation: 1,
    title: "Late inventory",
  });
  const cp = h.store.all("checkpoints")[0];
  const snapshot = h.provider.state.snapshots[0];
  const cleanup = await run(
    h.w,
    "lifecycle",
    { runId: r.id, generation: 1, action: "destroy", apply: true },
    "human",
  );
  expect(cleanup.state).toBe("succeeded");
  h.provider.state.snapshots.push(snapshot);
  h.provider.save();
  await h.w.reconcile();
  expect(h.store.get("runs", r.id).cleanup).toBe("blocked");
  expect(h.store.get("checkpoints", cp.id).availability).toBe("available");
  expect(h.w.cleanupPreview(r.id).checkpoints).toContain(cp.id);
  expect(
    h.store.all("resources").find((resource) => resource.kind === "checkpoint")
      ?.state,
  ).toBe("available");
});
