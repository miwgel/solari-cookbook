import {
  lstat,
  realpath,
  readdir,
  open,
  mkdir,
  writeFile,
  chmod,
  rm,
  readFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import picomatch from "picomatch";
import type { ProjectConfig } from "../shared/contracts.js";
import { fail } from "../shared/contracts.js";
import type { Entry, Manifest } from "../shared/model.js";
import { hash, canonical } from "../persistence/store.js";
const exec = promisify(execFile);
export const limits = {
  file: 10 * 1024 * 1024,
  total: 50 * 1024 * 1024,
  count: 5000,
};
export function safePath(p: string) {
  if (
    !p ||
    p.startsWith("/") ||
    p.includes("\\") ||
    [...p].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) ||
    p.split("/").some((x) => x === ".." || x === "." || x === "")
  )
    fail("PATH_REJECTED", "Only normalized relative file paths are supported.");
  return p;
}
const forbidden = new Set([
  ".git",
  ".ssh",
  ".codex",
  ".aws",
  ".azure",
  ".config",
  ".local",
  ".workbench",
  ".private",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "exports",
  "test-results",
  "playwright-report",
]);
export function excluded(p: string, artifacts = false) {
  return p
    .split("/")
    .some(
      (x) =>
        (forbidden.has(x) && !(artifacts && x === "test-results")) ||
        x === ".env" ||
        (x.startsWith(".env.") && x !== ".env.example") ||
        /\.(pem|key|p12|pfx|sqlite|log)$/i.test(x) ||
        /^id_(rsa|ed25519|ecdsa)/.test(x) ||
        [".npmrc", ".netrc", "credentials", "credentials.json"].includes(x),
    );
}
export const eligible = (p: string, c: ProjectConfig, artifacts = false) =>
  !excluded(p, artifacts) &&
  picomatch(c.include, { dot: true })(p) &&
  !picomatch(c.exclude, { dot: true })(p);
export async function checkedPath(
  root: string,
  p: string,
  allowMissing = false,
) {
  safePath(p);
  let current = root;
  for (const part of p.split("/")) {
    current = join(current, part);
    try {
      const s = await lstat(current);
      if (
        s.isSymbolicLink() ||
        (!s.isDirectory() && (!s.isFile() || s.nlink !== 1))
      )
        fail("FILE_TYPE", "Links and special files are not supported.");
    } catch (e) {
      if (allowMissing && (e as NodeJS.ErrnoException).code === "ENOENT")
        continue;
      throw e;
    }
  }
  return current;
}
export async function readRegular(root: string, p: string) {
  const full = await checkedPath(root, p);
  const f = await open(full, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await f.stat();
    if (!before.isFile() || before.nlink !== 1)
      fail("FILE_TYPE", "Expected a regular file with one link.");
    if (before.size > limits.file) fail("SIZE_LIMIT", "File exceeds 10 MiB.");
    const data = await f.readFile();
    const after = await f.stat();
    if (
      data.length > limits.file ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs
    )
      fail("SOURCE_CHANGED", "Source changed during capture.");
    return { data, mode: after.mode & 0o111 ? 0o755 : 0o644 };
  } finally {
    await f.close();
  }
}
export async function git(root: string, args: string[]) {
  return (
    await exec(
      "git",
      [
        "-c",
        "core.fsmonitor=false",
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "core.untrackedCache=false",
        "-C",
        root,
        ...args,
      ],
      {
        maxBuffer: 10 * 1024 * 1024,
        env: {
          PATH: process.env.PATH,
          HOME: "/nonexistent",
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_CONFIG_GLOBAL: "/dev/null",
          GIT_TERMINAL_PROMPT: "0",
          GIT_OPTIONAL_LOCKS: "0",
        },
      },
    )
  ).stdout;
}
async function selection(root: string, c: ProjectConfig) {
  const tracked = (await git(root, ["ls-files", "-z", "--cached"]))
    .split("\0")
    .filter(Boolean);
  const untracked = (
    await git(root, ["ls-files", "-z", "--others", "--exclude-standard"])
  )
    .split("\0")
    .filter(Boolean)
    .filter((p) => picomatch(c.includeUntracked, { dot: true })(p));
  const paths = [...new Set([...tracked, ...untracked])].sort();
  if (paths.length > 20000)
    fail("SIZE_LIMIT", "Selection has too many candidate files.");
  return { paths, untracked };
}
export function manifest(
  entries: Entry[],
  extra: Partial<Manifest> = {},
): Manifest {
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const bytes = entries.reduce((s, e) => s + e.bytes, 0);
  if (bytes > limits.total || entries.length > limits.count)
    fail("SIZE_LIMIT", "Source exceeds 50 MiB or 5,000 files.");
  return {
    schemaVersion: 1,
    entries,
    digest: hash(canonical(entries)),
    bytes,
    excluded: [],
    untracked: [],
    head: null,
    dirty: false,
    ...extra,
  };
}
export async function scan(
  root: string,
  c: ProjectConfig,
  useGit = false,
  artifacts = false,
): Promise<Manifest> {
  let paths: string[];
  let untracked: string[] = [];
  if (useGit) {
    const s = await selection(root, c);
    paths = s.paths;
    untracked = s.untracked;
  } else {
    paths = [];
    const walk = async (dir: string) => {
      for (const e of await readdir(join(root, dir), { withFileTypes: true })) {
        const p = dir ? `${dir}/${e.name}` : e.name;
        safePath(p);
        if (excluded(p, artifacts)) continue;
        if (paths.length > 20000) fail("SIZE_LIMIT", "Too many source files.");
        if (e.isDirectory()) await walk(p);
        else paths.push(p);
      }
    };
    await walk("");
  }
  const entries: Entry[] = [];
  const omitted: string[] = [];
  for (const p of paths) {
    safePath(p);
    if (!eligible(p, c, artifacts)) {
      omitted.push(p);
      continue;
    }
    try {
      const { data, mode } = await readRegular(root, p);
      entries.push({ path: p, bytes: data.length, mode, sha256: hash(data) });
      manifest(entries);
    } catch (e) {
      if (useGit && (e as NodeJS.ErrnoException).code === "ENOENT") {
        omitted.push(p);
        continue;
      }
      throw e;
    }
  }
  return manifest(entries, { excluded: omitted, untracked });
}
async function sourceStamp(root: string, c: ProjectConfig) {
  const selected = await selection(root, c);
  const stamps: unknown[] = [];
  for (const p of selected.paths) {
    safePath(p);
    if (!eligible(p, c)) continue;
    try {
      const path = await checkedPath(root, p);
      const s = await lstat(path, { bigint: true });
      stamps.push([
        p,
        String(s.dev),
        String(s.ino),
        String(s.size),
        String(s.mtimeNs),
        String(s.ctimeNs),
        String(s.mode),
      ]);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT")
        stamps.push([p, "deleted"]);
      else throw e;
    }
  }
  return hash(canonical(stamps));
}
export async function capture(root: string, c: ProjectConfig, dest: string) {
  root = await realpath(root);
  if (
    resolve(root) === resolve(dest) ||
    !(relative(root, dest) === ".." || relative(root, dest).startsWith("../"))
  )
    fail("STATE_LOCATION", "Staging must be outside the project.");
  const initialStamp = await sourceStamp(root, c);
  const before = await scan(root, c, true);
  await mkdir(dest, { recursive: true, mode: 0o700 });
  try {
    for (const e of before.entries) {
      const { data, mode } = await readRegular(root, e.path);
      if (hash(data) !== e.sha256 || mode !== e.mode)
        fail("SOURCE_CHANGED", "Source changed during staging.");
      await mkdir(dirname(join(dest, e.path)), { recursive: true });
      await writeFile(join(dest, e.path), data, { mode });
      await chmod(join(dest, e.path), mode);
    }
    const after = await scan(root, c, true);
    if (
      before.digest !== after.digest ||
      initialStamp !== (await sourceStamp(root, c))
    )
      fail(
        "SOURCE_CHANGED",
        "Source changed during staging; retry after edits settle.",
      );
    try {
      before.head = (await git(root, ["rev-parse", "HEAD"])).trim();
    } catch {
      /* Empty repositories are valid. */
    }
    before.dirty = Boolean((await git(root, ["status", "--porcelain"])).trim());
    return before;
  } catch (e) {
    await rm(dest, { recursive: true, force: true });
    throw e;
  }
}
export async function writeTreeFile(
  root: string,
  p: string,
  data: Uint8Array,
  mode = 0o644,
) {
  const full = await checkedPath(root, p, true);
  await mkdir(dirname(full), { recursive: true });
  const f = await open(
    full,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_TRUNC |
      constants.O_NOFOLLOW,
    mode,
  );
  try {
    await f.writeFile(data);
    await f.chmod(mode);
  } finally {
    await f.close();
  }
}
export async function copyTree(from: string, to: string, m: Manifest) {
  await mkdir(to, { recursive: true });
  for (const e of m.entries)
    await writeTreeFile(to, e.path, await readFile(join(from, e.path)), e.mode);
}
