import { test, expect, afterEach } from "vitest";
import {
  writeFile,
  mkdir,
  symlink,
  link,
  readFile,
  chmod,
} from "node:fs/promises";
import { join } from "node:path";
import { setup, config } from "../helpers.js";
import {
  capture,
  scan,
  safePath,
  git,
  copyTree,
} from "../../src/workspace/source.js";
import { makePatch } from "../../src/workspace/patch.js";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const f of cleanups.splice(0)) await f();
});
async function fixture() {
  const h = await setup();
  cleanups.push(h.close);
  return h;
}
test("captures dirty tracked and selected untracked bytes while excluding credentials", async () => {
  const h = await fixture();
  await writeFile(join(h.root, "src/main.js"), "dirty saved contents");
  await writeFile(join(h.root, "src/new.js"), "untracked");
  await writeFile(join(h.root, ".env.example"), "API_KEY=placeholder");
  await git(h.root, ["add", ".env.example"]);
  const m = await capture(h.root, config, join(h.dir, "baseline"));
  expect(m.entries.map((e) => e.path)).toEqual([
    ".env.example",
    "src/main.js",
    "src/new.js",
  ]);
  expect(m.untracked).toContain("src/new.js");
  expect(m.excluded).toContain(".env");
  expect(await readFile(join(h.dir, "baseline/src/main.js"), "utf8")).toBe(
    "dirty saved contents",
  );
});
test("rejects traversal, links and multiply linked regular files", async () => {
  for (const p of ["../x", "/etc/passwd", "a/../b", "a\\b", "a//b"])
    expect(() => safePath(p)).toThrow();
  const h = await fixture();
  await symlink("main.js", join(h.root, "src/link.js"));
  await expect(scan(h.root, config, true)).rejects.toThrow(/Links/);
  await import("node:fs/promises").then((fs) =>
    fs.unlink(join(h.root, "src/link.js")),
  );
  await link(join(h.root, "src/main.js"), join(h.root, "src/hard.js"));
  await expect(scan(h.root, config, true)).rejects.toThrow(/Links/);
});
test("rejects a source larger than the per-file bound", async () => {
  const h = await fixture();
  await writeFile(
    join(h.root, "src/big.bin"),
    Buffer.alloc(10 * 1024 * 1024 + 1),
  );
  await expect(scan(h.root, config, true)).rejects.toThrow(/10 MiB/);
});
test("patch reconstructs text, binary, additions, deletions, and executable modes without touching source or index", async () => {
  const h = await fixture();
  await writeFile(join(h.root, "src/deleted.js"), "remove");
  await writeFile(join(h.root, "src/binary.bin"), Buffer.from([0, 1, 2]));
  await git(h.root, ["add", "src"]);
  const originalIndex = await readFile(join(h.root, ".git/index"));
  const baseline = join(h.dir, "baseline");
  const before = await capture(h.root, config, baseline);
  const modified = join(h.dir, "modified");
  await copyTree(baseline, modified, before);
  await writeFile(join(modified, "src/main.js"), "repaired\n");
  await chmod(join(modified, "src/main.js"), 0o755);
  await writeFile(join(modified, "src/new.js"), "new\n");
  await writeFile(join(modified, "src/binary.bin"), Buffer.from([0, 9, 8]));
  await import("node:fs/promises").then((fs) =>
    fs.unlink(join(modified, "src/deleted.js")),
  );
  const after = await scan(modified, config);
  const patch = await makePatch(baseline, before, modified, after, config);
  expect(patch.patch).toContain("GIT binary patch");
  expect(patch.patch).toContain("100755");
  expect(patch.deleted).toEqual(["src/deleted.js"]);
  expect(patch.verifiedDigest).toBe(after.digest);
  expect(await readFile(join(h.root, ".git/index"))).toEqual(originalIndex);
  expect((await scan(h.root, config, true)).digest).toBe(before.digest);
});
test("empty repository and all-deleted sources are supported", async () => {
  const h = await fixture();
  await git(h.root, ["rm", "--cached", "-r", "."]);
  const c = { ...config, includeUntracked: [] };
  const before = await capture(h.root, c, join(h.dir, "empty"));
  expect(before.entries).toEqual([]);
  await mkdir(join(h.dir, "empty-next"));
  const after = await scan(join(h.dir, "empty-next"), c);
  const patch = await makePatch(
    join(h.dir, "empty"),
    before,
    join(h.dir, "empty-next"),
    after,
    c,
  );
  expect(patch.patch).toBe("");
});

test("a concurrently edited selection is rejected instead of accepting mixed bytes", async () => {
  const h = await fixture();
  for (let n = 0; n < 20; n++)
    await writeFile(
      join(h.root, `src/bulk-${n}.bin`),
      Buffer.alloc(512 * 1024, n),
    );
  const { Worker } = await import("node:worker_threads");
  const worker = new Worker(
    `const {parentPort,workerData}=require('node:worker_threads');const fs=require('node:fs');let n=0;const timer=setInterval(()=>fs.writeFileSync(workerData,Buffer.alloc(512*1024,(n++)%256)),1);parentPort.postMessage('ready');parentPort.on('message',()=>{clearInterval(timer);parentPort.close();});`,
    { eval: true, workerData: join(h.root, "src/bulk-0.bin") },
  );
  await new Promise((resolve) => worker.once("message", resolve));
  try {
    await expect(
      capture(h.root, config, join(h.dir, "unstable")),
    ).rejects.toThrow(/changed/);
  } finally {
    await worker.terminate();
  }
});
