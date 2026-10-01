import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { copyTree, git, scan } from "./source.js";
import type { Manifest } from "../shared/model.js";
import type { ProjectConfig } from "../shared/contracts.js";
import { fail } from "../shared/contracts.js";
export async function makePatch(
  baseline: string,
  before: Manifest,
  updated: string,
  after: Manifest,
  config: ProjectConfig,
) {
  const tmp = await mkdtemp(join(tmpdir(), "workbench-patch-"));
  try {
    await copyTree(baseline, tmp, before);
    await git(tmp, ["init", "-q"]);
    await git(tmp, ["config", "core.hooksPath", "/dev/null"]);
    await git(tmp, ["config", "core.autocrlf", "false"]);
    await git(tmp, ["config", "core.fileMode", "true"]);
    await writeFile(
      join(tmp, ".git/info/attributes"),
      "* -text -filter -ident -working-tree-encoding -eol\n",
    );
    await git(tmp, ["add", "--force", "--all"]);
    await git(tmp, [
      "-c",
      "user.name=Workbench",
      "-c",
      "user.email=workbench@example.invalid",
      "commit",
      "--allow-empty",
      "-qm",
      "Import baseline",
    ]);
    for (const e of before.entries) await rm(join(tmp, e.path));
    await copyTree(updated, tmp, after);
    await git(tmp, ["add", "--force", "-N", "--all"]);
    const patch = await git(tmp, [
      "diff",
      "--binary",
      "--no-ext-diff",
      "--no-textconv",
      "--full-index",
      "HEAD",
      "--",
    ]);
    await git(tmp, ["reset", "--hard", "-q"]);
    await git(tmp, ["clean", "-fdq"]); // Reconstruct from the exact imported baseline.
    for (const e of after.entries) await rm(join(tmp, e.path), { force: true });
    await copyTree(baseline, tmp, before);
    if (patch) {
      const path = join(tmp, ".git", "repair.patch");
      await writeFile(path, patch);
      await git(tmp, ["apply", "--binary", "--check", path]);
      await git(tmp, ["apply", "--binary", path]);
    }
    const reconstructed = await scan(tmp, config);
    if (reconstructed.digest !== after.digest)
      fail(
        "PATCH_MISMATCH",
        "Patch does not reconstruct the collected source.",
      );
    const changes = after.entries
      .filter(
        (e) =>
          before.entries.find((x) => x.path === e.path)?.sha256 !== e.sha256 ||
          before.entries.find((x) => x.path === e.path)?.mode !== e.mode,
      )
      .map((e) => ({
        path: e.path,
        type: before.entries.some((x) => x.path === e.path)
          ? "modified"
          : "added",
        binary: false,
      }));
    for (const change of changes) {
      const bytes = await readFile(join(updated, change.path));
      change.binary = bytes.includes(0);
    }
    return {
      patch,
      changes,
      deleted: before.entries
        .filter((e) => !after.entries.some((x) => x.path === e.path))
        .map((e) => e.path),
      verifiedDigest: reconstructed.digest,
    };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
