import { test, expect } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { git } from "../../src/workspace/source.js";
const exec = promisify(execFile);
test("publication scan checks historical content and never prints the matched value", async () => {
  const root = await mkdtemp(join(tmpdir(), "workbench-privacy-"));
  const script = resolve("scripts/privacy-check.mjs");
  const synthetic = ["ghp", "x".repeat(40)].join("_");
  try {
    await git(root, ["init", "-q"]);
    await writeFile(join(root, "notes.txt"), synthetic);
    await git(root, ["add", "."]);
    await git(root, [
      "-c",
      "user.name=Workbench",
      "-c",
      "user.email=workbench@example.invalid",
      "commit",
      "-qm",
      "Synthetic fixture",
    ]);
    await writeFile(join(root, "notes.txt"), "Reviewed current content");
    await git(root, ["add", "."]);
    const clean = await exec(process.execPath, [script], { cwd: root });
    expect(clean.stdout).toContain("no matching");
    try {
      await exec(process.execPath, [script, "--history"], { cwd: root });
      throw new Error("Historical secret was accepted");
    } catch (e) {
      const failure = e as Error & { code: number; stderr: string };
      expect(failure.code).toBe(1);
      expect(failure.stderr).toContain("GitHub token");
      expect(failure.stderr).not.toContain(synthetic);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
