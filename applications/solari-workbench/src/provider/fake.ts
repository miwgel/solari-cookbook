import { mkdirSync, readFileSync } from "node:fs";
import { cp, mkdir, rm, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { Provider, Remote, Snapshot } from "./provider.js";
import { id, privateWrite } from "../persistence/store.js";
import {
  scan,
  copyTree,
  writeTreeFile,
  readRegular,
  checkedPath,
  safePath,
} from "../workspace/source.js";
import type { Command, GuiAction, ProjectConfig } from "../shared/contracts.js";
import { fail, WorkbenchError } from "../shared/contracts.js";
import type { Manifest } from "../shared/model.js";
interface FakeRemote extends Remote {
  source: string;
  probe: { draft: string; selection: string[]; boot: string; disk: string };
  from?: string;
}
interface FakeSnapshot extends Snapshot {
  source: string;
  probe: FakeRemote["probe"];
}
interface State {
  remotes: FakeRemote[];
  snapshots: FakeSnapshot[];
}
export class FakeProvider implements Provider {
  readonly kind = "fake";
  state: State;
  loseNext?: "create" | "snapshot" | "destroy";
  delayMs = 0;
  execCount = 0;
  constructor(public dir: string) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    try {
      this.state = JSON.parse(
        readFileSync(join(dir, "remote.json"), "utf8"),
      ) as State;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.state = { remotes: [], snapshots: [] };
      this.save();
    }
  }
  save() {
    privateWrite(join(this.dir, "remote.json"), JSON.stringify(this.state));
  }
  private remote(key: string) {
    const r = this.state.remotes.find((x) => x.id === key);
    if (!r) fail("MISSING", "Fake desktop is missing.");
    return r;
  }
  private running(key: string) {
    const r = this.remote(key);
    if (r.state !== "running") fail("NOT_RUNNING", "Desktop must be running.");
    return r;
  }
  private lose(action: typeof this.loseNext) {
    if (this.loseNext === action) {
      this.loseNext = undefined;
      throw new WorkbenchError(
        "LOST_RESPONSE",
        "Fake provider deliberately lost the response.",
        "Reconcile the saved operation.",
        true,
      );
    }
  }
  async create(metadata: Record<string, string>, snapshot?: string) {
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    const key = id("fake");
    const source = join(this.dir, key, "source");
    await mkdir(source, { recursive: true });
    const snap = snapshot
      ? this.state.snapshots.find((s) => s.id === snapshot)
      : undefined;
    if (snapshot && !snap) fail("MISSING", "Snapshot is missing.");
    if (snap) await cp(snap.source, source, { recursive: true });
    const r: FakeRemote = {
      id: key,
      metadata,
      state: "running",
      source,
      from: snapshot,
      probe: snap
        ? structuredClone(snap.probe)
        : { draft: "", selection: [], boot: id("boot"), disk: "initial" },
    };
    this.state.remotes.push(r);
    this.save();
    this.lose("create");
    return r;
  }
  async list(installation: string) {
    return this.state.remotes.filter(
      (r) => r.metadata.installation === installation,
    );
  }
  async status(key: string) {
    return this.state.remotes.find((r) => r.id === key)?.state ?? "deleted";
  }
  async prepare(
    key: string,
    _base: string,
    baseline: string,
    m: Manifest,
    _c: ProjectConfig,
  ) {
    await copyTree(baseline, this.running(key).source, m);
  }
  async collect(key: string, _base: string, dest: string, c: ProjectConfig) {
    const r = this.running(key);
    const before = await scan(r.source, c);
    await copyTree(r.source, dest, before);
    const after = await scan(r.source, c);
    if (before.digest !== after.digest)
      fail("SOURCE_CHANGED", "Fake source changed during collection.");
    return before;
  }
  async collectArtifacts(
    key: string,
    _base: string,
    dest: string,
    c: ProjectConfig,
  ) {
    const root = join(dirname(this.running(key).source), "artifacts");
    await mkdir(root, { recursive: true });
    const selection = { ...c, include: c.artifacts, exclude: [] };
    const first = await scan(root, selection, false, true);
    await copyTree(root, dest, first);
    const second = await scan(root, selection, false, true);
    if (first.digest !== second.digest)
      fail("SOURCE_CHANGED", "Artifact files changed during collection.");
    return first;
  }
  async observe(key: string) {
    this.running(key); // A real PNG, intentionally a tiny fake frame, never a desktop claim.
    return {
      bytes: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
      width: 1,
      height: 1,
    };
  }
  async act(key: string, action: GuiAction, _url: string) {
    const r = this.running(key);
    if (action.type === "type") r.probe.draft += action.text;
    this.save();
  }
  async exec(key: string, _base: string, command: Command, _cwd: string) {
    const r = this.running(key);
    this.execCount++;
    if (command.program === "fake-probes")
      return {
        exitCode: 0,
        stdout: JSON.stringify(r.probe),
        stderr: "",
        truncated: false,
      };
    if (command.program === "false")
      return {
        exitCode: 1,
        stdout: "",
        stderr: "Deterministic failure",
        truncated: false,
      };
    return {
      exitCode: 0,
      stdout: "FAKE: command recorded; no host project code executed.",
      stderr: "",
      truncated: false,
    };
  }
  async files(
    key: string,
    _base: string,
    mode: "read" | "write" | "list" | "delete",
    p: string,
    content?: string,
  ) {
    const r = this.running(key);
    if (mode === "list") return readdir(r.source);
    safePath(p);
    if (mode === "read")
      return {
        content: (await readRegular(r.source, p)).data.toString("utf8"),
      };
    if (mode === "delete") {
      await rm(await checkedPath(r.source, p));
      return { deleted: true };
    }
    await writeTreeFile(r.source, p, Buffer.from(content ?? ""));
    return { written: true };
  }
  async snapshot(key: string, name: string) {
    const r = this.running(key);
    const key2 = id("fake_snap");
    const source = join(this.dir, key2);
    await cp(r.source, source, { recursive: true });
    const snap: FakeSnapshot = {
      id: key2,
      name,
      source,
      probe: structuredClone(r.probe),
    };
    this.state.snapshots.push(snap);
    this.save();
    this.lose("snapshot");
    return snap;
  }
  async snapshots() {
    return this.state.snapshots;
  }
  async restore(key: string, snapshot: string) {
    const r = this.running(key);
    const snap = this.state.snapshots.find((s) => s.id === snapshot);
    if (!snap) fail("MISSING", "Snapshot is missing.");
    await rm(r.source, { recursive: true, force: true });
    await cp(snap.source, r.source, { recursive: true });
    r.probe = structuredClone(snap.probe);
    this.save();
  }
  async pause(key: string) {
    this.remote(key).state = "paused";
    this.save();
  }
  async resume(key: string) {
    this.remote(key).state = "running";
    this.save();
  }
  async destroy(key: string) {
    const r = this.state.remotes.find((x) => x.id === key);
    if (r) {
      r.state = "deleted";
      await rm(r.source, { recursive: true, force: true });
      this.save();
    }
    this.lose("destroy");
  }
  async deleteSnapshot(key: string) {
    if (this.state.remotes.some((r) => r.from === key && r.state !== "deleted"))
      fail("DEPENDENCY", "Delete dependent desktops first.");
    const s = this.state.snapshots.find((x) => x.id === key);
    if (s) await rm(s.source, { recursive: true, force: true });
    this.state.snapshots = this.state.snapshots.filter((s) => s.id !== key);
    this.save();
  }
  async viewer(_key: string): Promise<string> {
    return fail("FAKE_VIEWER", "The fake provider has no desktop stream.");
  }
  close() {}
}
