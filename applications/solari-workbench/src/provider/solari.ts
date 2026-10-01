import { SandboxClient, GatewayError } from "@solarisdk/sandbox";
import { DesktopClient, type Desktop } from "@solarisdk/desktop";
import { mkdir, readFile } from "node:fs/promises";
import { join, posix } from "node:path";
import type {
  Provider,
  Remote,
  Snapshot,
  ExecResult,
  PreparationLog,
} from "./provider.js";
import type { Environment, Manifest, Entry } from "../shared/model.js";
import {
  type Command,
  type GuiAction,
  type ProjectConfig,
  fail,
  WorkbenchError,
} from "../shared/contracts.js";
import {
  manifest,
  eligible,
  safePath,
  writeTreeFile,
} from "../workspace/source.js";
import { hash } from "../persistence/store.js";
import { FILES, COMMAND, START } from "./guest.js";
export class SolariProvider implements Provider {
  readonly kind = "solari";
  client: SandboxClient;
  desktops: DesktopClient;
  handles = new Map<string, Desktop>();
  constructor(key: string, fetchImplementation?: typeof fetch) {
    if (!key)
      fail(
        "MISSING_CREDENTIALS",
        "SOLARI_API_KEY is not configured.",
        "Set it privately in the service environment.",
      );
    const options = {
      apiKey: key,
      baseUrl: "https://api.getsolari.com",
      callTimeoutMs: 130000,
      ...(fetchImplementation ? { fetch: fetchImplementation } : {}),
    };
    this.client = new SandboxClient(options);
    this.desktops = new DesktopClient(options);
  }
  async create(
    metadata: Record<string, string>,
    snapshot?: string,
    memoryMb = 4096,
  ): Promise<Remote> {
    const d = await this.client.createDesktop({
      template: "workstation",
      fromSnapshot: snapshot,
      metadata,
      memMb: memoryMb,
      resolution: "1280x720",
      idleTimeoutMs: 300000,
      lifecycle: { onTimeout: "pause", autoResume: false },
    });
    this.handles.set(d.id, d);
    return { id: d.id, state: "running", metadata };
  }
  async list(installation: string) {
    const out: Remote[] = [];
    for await (const r of this.client.listAll({
      metadata: { installation },
      kind: "desktop",
      limit: 100,
    }))
      out.push({
        id: r.sandboxId,
        state: this.state(r.state),
        metadata: r.metadata,
      });
    return out;
  }
  private state(s: string): Environment {
    return (
      (
        {
          starting: "creating",
          archived: "unknown",
          releasing: "deleting",
          gone: "deleted",
          ready: "running",
          running: "running",
          paused: "paused",
          stopped: "deleted",
          terminated: "deleted",
          deleted: "deleted",
          creating: "creating",
          pausing: "pausing",
          resuming: "resuming",
        } as Record<string, Environment>
      )[s] ?? "unknown"
    );
  }
  async status(key: string): Promise<Environment> {
    try {
      return this.state((await this.client.get(key)).state);
    } catch (e) {
      if (e instanceof GatewayError && e.status === 404) return "deleted";
      throw e;
    }
  }
  private async desktop(key: string) {
    if ((await this.status(key)) !== "running")
      fail(
        "NOT_RUNNING",
        "Desktop must be running.",
        "Explicitly resume the desktop first.",
      );
    let d = this.handles.get(key);
    if (!d) {
      d = await this.desktops.connect(key);
      this.handles.set(key, d);
    }
    if (!d.connected) await d.connect();
    return d;
  }
  private async python(
    key: string,
    script: string,
    args: string[],
    timeoutMs = 120000,
  ) {
    const d = await this.desktop(key);
    const r = await d.commands.run("python3", {
      args: ["-c", script, ...args],
      timeoutMs,
    });
    if (r.exitCode !== 0)
      fail(
        "GUEST_FAILED",
        "Guest operation failed; output withheld to protect private paths and content.",
        "Run a bounded diagnostic command and inspect its private log.",
      );
    return r.stdout;
  }
  async prepare(
    key: string,
    base: string,
    baseline: string,
    m: Manifest,
    c: ProjectConfig,
    onLog?: PreparationLog,
  ) {
    const d = await this.desktop(key);
    await this.python(
      key,
      'import os,sys\nfor n in ["source","runtime","artifacts","scratch"]:os.makedirs(sys.argv[1]+"/"+n,exist_ok=True)',
      [base],
    );
    for (const e of m.entries) {
      safePath(e.path);
      await d.files.mkdir(posix.dirname(`${base}/source/${e.path}`));
      await d.files.write(
        `${base}/source/${e.path}`,
        await readFile(join(baseline, e.path)),
        e.mode,
      );
    }
    const remote = await this.remoteManifest(key, base, c);
    if (remote.digest !== m.digest)
      fail("IMPORT_MISMATCH", "Remote bytes differ from the immutable import.");
    for (const cmd of c.setup) {
      const r = await this.exec(key, base, cmd, "source");
      await onLog?.("setup", r);
      if (r.exitCode !== 0)
        fail("SETUP_FAILED", `Setup failed with exit code ${r.exitCode}.`);
    }
    const startup = JSON.parse(
      await this.python(
        key,
        START,
        [base, JSON.stringify(c)],
        c.ready.timeoutMs + 5000,
      ),
    ) as ExecResult & {
      ready: boolean;
      pid: number | null;
      supervisorPid: number;
    };
    await onLog?.("startup", {
      ...startup,
      exitCode: startup.ready ? 0 : startup.exitCode,
    });
    if (!startup.ready)
      fail(
        "STARTUP_FAILED",
        `App startup failed with exit code ${startup.exitCode}.`,
        "Inspect the retained startup-log artifact before changing the app.",
      );
    if (!(await d.health()).ready)
      fail("DISPLAY_NOT_READY", "Desktop display is not ready.");
    await this.openBrowser(key, base, c.openUrl);
  }
  private async openBrowser(key: string, base: string, url: string) {
    const d = await this.desktop(key);
    const browser = JSON.parse(
      await this.python(
        key,
        'import json,os,shutil\nnames=["firefox","chromium","chromium-browser","google-chrome","google-chrome-stable"]\nprogram=next((shutil.which(n) for n in names if shutil.which(n)),None)\nprint(json.dumps({"program":program,"root":os.geteuid()==0}))',
        [],
      ),
    ) as { program: string | null; root: boolean };
    if (!browser.program)
      fail(
        "BROWSER_UNAVAILABLE",
        "No supported browser is installed in the desktop template.",
        "Use a template with Firefox or Chromium installed.",
      );
    const profile = `${base}/runtime/browser-profile`;
    await this.python(
      key,
      "import os,sys;os.makedirs(sys.argv[1],exist_ok=True)",
      [profile],
    );
    const firefox = browser.program.endsWith("firefox");
    const args = firefox
      ? ["--no-remote", "--profile", profile, url]
      : [
          "--no-first-run",
          "--no-default-browser-check",
          "--disable-sync",
          "--disable-background-networking",
          `--user-data-dir=${profile}`,
          "--new-window",
          url,
        ];
    if (browser.root && !firefox) args.unshift("--no-sandbox");
    await d.open(browser.program, args);
  }
  private async remoteFile(
    key: string,
    base: string,
    p: string,
    area = "source",
  ) {
    safePath(p);
    const r = JSON.parse(
      await this.python(key, FILES, [`${base}/${area}`, "read", p]),
    ) as { data: string; mode: number; sha256: string };
    const bytes = Buffer.from(r.data, "base64");
    if (bytes.length > 10 * 1024 * 1024 || hash(bytes) !== r.sha256)
      fail(
        "TRANSFER_FAILED",
        "Remote file exceeded bounds or failed its digest.",
      );
    return {
      bytes,
      entry: { path: p, bytes: bytes.length, mode: r.mode, sha256: r.sha256 },
    };
  }
  private async remoteManifest(
    key: string,
    base: string,
    c: ProjectConfig,
    dest?: string,
    artifacts = false,
  ) {
    const paths = JSON.parse(
      await this.python(key, FILES, [
        `${base}/${artifacts ? "artifacts" : "source"}`,
        "list",
        "",
      ]),
    ) as string[];
    if (!Array.isArray(paths) || paths.length > 20000)
      fail("SIZE_LIMIT", "Remote file list exceeds limits.");
    const entries: Entry[] = [];
    const excluded: string[] = [];
    for (const p of paths.sort()) {
      safePath(p);
      if (!eligible(p, c, artifacts)) {
        excluded.push(p);
        continue;
      }
      const r = await this.remoteFile(
        key,
        base,
        p,
        artifacts ? "artifacts" : "source",
      );
      entries.push(r.entry);
      manifest(entries);
      if (dest) await writeTreeFile(dest, p, r.bytes, r.entry.mode);
    }
    return manifest(entries, { excluded });
  }
  async collect(key: string, base: string, dest: string, c: ProjectConfig) {
    await mkdir(dest, { recursive: true, mode: 0o700 });
    const first = await this.remoteManifest(key, base, c, dest);
    const second = await this.remoteManifest(key, base, c);
    if (first.digest !== second.digest)
      fail(
        "SOURCE_CHANGED",
        "Remote source changed during export; retry after it settles.",
      );
    return first;
  }
  async collectArtifacts(
    key: string,
    base: string,
    dest: string,
    c: ProjectConfig,
  ) {
    await mkdir(dest, { recursive: true, mode: 0o700 });
    const selection = { ...c, include: c.artifacts, exclude: [] };
    const first = await this.remoteManifest(key, base, selection, dest, true);
    const second = await this.remoteManifest(
      key,
      base,
      selection,
      undefined,
      true,
    );
    if (first.digest !== second.digest)
      fail("SOURCE_CHANGED", "Remote artifacts changed during collection.");
    return first;
  }
  async observe(key: string) {
    const d = await this.desktop(key);
    const size = await d.display.size();
    const bytes = await d.screenshot({ format: "png" });
    if (bytes.length > 10 * 1024 * 1024)
      fail("SIZE_LIMIT", "Screenshot exceeds 10 MiB.");
    return { bytes, width: size.w, height: size.h };
  }
  async act(key: string, a: GuiAction, url: string, base: string) {
    const d = await this.desktop(key);
    switch (a.type) {
      case "click":
        await d.mouse.click(a.x, a.y);
        break;
      case "type":
        await d.keyboard.type(a.text);
        break;
      case "key":
        await d.keyboard.press(a.keys);
        break;
      case "scroll":
        await d.mouse.move(a.x, a.y);
        if (
          (
            await d.commands.run("xdotool", {
              args: ["click", a.direction === "up" ? "4" : "5"],
              timeoutMs: 5000,
            })
          ).exitCode !== 0
        )
          fail("INPUT_FAILED", "Guest scroll failed.");
        break;
      case "open":
        await this.openBrowser(key, base, url);
    }
  }
  async exec(
    key: string,
    base: string,
    c: Command,
    cwd: string,
  ): Promise<ExecResult> {
    return JSON.parse(
      await this.python(
        key,
        COMMAND,
        [JSON.stringify(c), base, cwd],
        c.timeoutMs + 5000,
      ),
    ) as ExecResult;
  }
  async files(
    key: string,
    base: string,
    mode: "read" | "write" | "list" | "delete",
    p: string,
    content?: string,
  ) {
    if (mode === "list")
      return JSON.parse(
        await this.python(key, FILES, [`${base}/source`, mode, ""]),
      );
    safePath(p);
    if (mode === "read")
      return {
        content: (await this.remoteFile(key, base, p)).bytes.toString("utf8"),
      };
    if (Buffer.byteLength(content ?? "") > 64000)
      fail("SIZE_LIMIT", "File writes are limited to 64 KiB per call.");
    return JSON.parse(
      await this.python(key, FILES, [
        `${base}/source`,
        mode,
        p,
        Buffer.from(content ?? "").toString("base64"),
      ]),
    );
  }
  async snapshot(
    key: string,
    name: string,
    onReceipt?: (snapshot: Snapshot) => Promise<void>,
  ): Promise<Snapshot> {
    const id = await (await this.desktop(key)).snapshot(name);
    await onReceipt?.({ id, name });
    try {
      const receipt = await this.client.getSnapshot(id);
      if (receipt.id !== id || Reflect.get(receipt, "restorable") === false)
        throw new Error("Snapshot receipt is not confirmed restorable");
    } catch {
      throw new WorkbenchError(
        "UNCONFIRMED_SNAPSHOT",
        "The created checkpoint could not be confirmed in provider inventory.",
        "Reconcile the existing capture; do not repeat it blindly.",
        true,
      );
    }
    return { id, name };
  }
  async snapshots() {
    return (
      await this.client.listSnapshots({ kind: "desktop", limit: 1000 })
    ).snapshots.map((s) => {
      const restorable: unknown = Reflect.get(s, "restorable");
      return {
        id: s.id,
        name: s.name ?? "",
        sizeBytes: s.sizeBytes,
        restorable: typeof restorable === "boolean" ? restorable : undefined,
      };
    });
  }
  async restore(key: string, snapshot: string) {
    const d = await this.desktop(key);
    try {
      await d.revert(snapshot);
    } catch (error) {
      if (error instanceof GatewayError && error.status === 404)
        throw new WorkbenchError(
          "RESTORE_NOT_FOUND",
          "The provider rejected restore because the session or snapshot was not found.",
          "Reconcile both records before submitting another restore; it was not replayed.",
        );
      throw error;
    }
    this.closeDesktop(d);
    this.handles.delete(key);
  }
  async pause(key: string) {
    const d = this.handles.get(key);
    if (d) {
      this.closeDesktop(d);
      this.handles.delete(key);
    }
    await this.desktops.pause(key);
  }
  async resume(key: string) {
    const d = await this.desktops.resume(key);
    this.handles.set(key, d);
  }
  async destroy(key: string) {
    const handle = this.handles.get(key);
    if (handle) this.closeDesktop(handle);
    this.handles.delete(key);
    try {
      await this.client.kill(key);
    } catch (error) {
      if (!(error instanceof GatewayError && error.status === 404)) throw error;
      if ((await this.status(key)) === "deleted") return;
      throw new WorkbenchError(
        "UNCONFIRMED_DELETE",
        "Desktop deletion was rejected but its inventory record still exists.",
        "Reconcile cleanup; the delete was not replayed.",
        true,
      );
    }
    const deadline = Date.now() + 30000;
    while ((await this.status(key)) !== "deleted") {
      if (Date.now() >= deadline)
        throw new WorkbenchError(
          "UNCONFIRMED_DELETE",
          "Provider deletion is still pending.",
          "Reconcile cleanup before retrying.",
          true,
        );
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  async deleteSnapshot(key: string) {
    try {
      await this.client.deleteSnapshot(key);
    } catch (error) {
      if (!(error instanceof GatewayError && error.status === 404)) throw error;
      throw new WorkbenchError(
        "UNCONFIRMED_DELETE",
        "The provider did not acknowledge snapshot deletion.",
        "Retain ownership and reconcile cleanup; a lookup 404 cannot confirm deletion.",
        true,
      );
    }
    // The live catalog returned alternating 200/404 responses for the same ID.
    // Absence alone is insufficient: require the successful DELETE above as well.
    try {
      await this.client.getSnapshot(key);
    } catch (lookup) {
      if (lookup instanceof GatewayError && lookup.status === 404) return;
      throw lookup;
    }
    throw new WorkbenchError(
      "UNCONFIRMED_DELETE",
      "Snapshot deletion was acknowledged but its inventory record still exists.",
      "Retain ownership and reconcile cleanup before retrying.",
      true,
    );
  }
  async viewer(key: string) {
    return (await this.desktop(key)).streamUrl;
  }
  private closeDesktop(desktop: Desktop) {
    // The pinned SDK logs its capability-bearing session ID from synchronous close().
    // Redact that ID while preserving the warning and restoring the logger immediately.
    const warn = console.warn;
    console.warn = (...args: unknown[]) =>
      warn(
        ...args.map((arg) =>
          typeof arg === "string"
            ? arg.replaceAll(desktop.id, "[private session]")
            : arg,
        ),
      );
    try {
      desktop.close();
    } finally {
      console.warn = warn;
    }
  }
  close() {
    for (const d of this.handles.values()) this.closeDesktop(d);
    this.handles.clear();
  }
}
