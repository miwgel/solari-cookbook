import { mkdtemp, cp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { Store, id, privateWrite } from "../src/persistence/store.js";
import { Workbench } from "../src/core/workbench.js";
import { FakeProvider } from "../src/provider/fake.js";
import { git } from "../src/workspace/source.js";
import type { ToolName } from "../src/shared/contracts.js";
// Trusted, bundled fixture only. Imported user code is never executed locally by the service.
const dir = await mkdtemp(join(tmpdir(), "workbench-demo-"));
const root = join(dir, "fixture");
await cp(resolve("examples/task-board"), root, { recursive: true });
await git(root, ["init", "-q"]);
await git(root, ["add", "."]);
const w = new Workbench(
  new Store(join(dir, "state")),
  new FakeProvider(join(dir, "remote")),
);
const steps: Record<string, unknown>[] = [];
async function operation(name: ToolName, args: Record<string, unknown>) {
  const o = (await w.call(
    name,
    { requestId: id("demo"), ...args },
    "evaluator",
  )) as { id: string };
  await w.settle();
  const saved = w.store.get("operations", o.id);
  assert.equal(saved.state, "succeeded", JSON.stringify(saved.error));
  steps.push({ action: name, state: saved.state });
  return saved;
}
try {
  const projectId = await w.register(
    root,
    JSON.parse(await readFile(join(root, "workbench.json"), "utf8")),
  );
  const initial = spawnSync(
    process.execPath,
    ["--test", "tests/regression.test.js"],
    { cwd: root, encoding: "utf8" },
  );
  assert.notEqual(initial.status, 0);
  steps.push({
    check: "independent fixture regression before repair",
    passed: false,
    expectedFailure: true,
  });
  const start = await operation("start", { projectId });
  const parent = start.runId!;
  const observation = await w.observe(parent);
  await operation("act", {
    runId: parent,
    generation: 1,
    observationId: observation.id,
    action: { type: "type", text: "Preserved fake browser draft" },
  });
  const cap = await operation("capture", {
    runId: parent,
    generation: 1,
    title: "Bulk edit affects unselected task",
    expected: "Only A and B change",
    observed: "C also changes",
    steps: ["Select A and B", "Set high priority", "Observe C"],
  });
  await operation("lifecycle", {
    runId: parent,
    generation: 1,
    action: "pause",
  });
  const fork = await operation("fork", {
    caseId: (cap.result as { caseId: string }).caseId,
  });
  const child = fork.runId!;
  const broken = await readFile(join(root, "src/bulk.js"), "utf8");
  const repaired = broken.replace(
    "visibleIds.includes(task.id)",
    "selectedIds.includes(task.id)",
  );
  await operation("files", {
    runId: child,
    generation: 1,
    mode: "write",
    path: "src/bulk.js",
    content: repaired,
  });
  const regression = join(dir, "trusted-regression");
  await cp(root, regression, { recursive: true });
  await writeFile(join(regression, "src/bulk.js"), repaired);
  const after = spawnSync(
    process.execPath,
    ["--test", "tests/regression.test.js"],
    { cwd: regression, encoding: "utf8" },
  );
  assert.equal(after.status, 0);
  steps.push({
    check: "independent fixture regression after scripted repair",
    passed: true,
    location: "trusted bundled fixture in temporary test harness",
  });
  const exported = await operation("export", { runId: child, generation: 1 });
  const out = join(
    resolve(
      process.env.WORKBENCH_DEMO_OUTPUT ??
        join(tmpdir(), "workbench-demo-evidence"),
    ),
    id("demo"),
  );
  await mkdir(out, { recursive: true, mode: 0o700 });
  for (const [name, key] of Object.entries(
    exported.result as Record<string, unknown>,
  )) {
    if (typeof key === "string" && key.startsWith("artifact_")) {
      const a = await w.readArtifact(key);
      privateWrite(
        join(
          out,
          name === "patchId"
            ? "changes.patch"
            : name === "manifestId"
              ? "manifest.json"
              : "report.md",
        ),
        a.bytes,
      );
    }
  }
  await operation("lifecycle", {
    runId: parent,
    generation: 1,
    action: "destroy",
    apply: true,
  });
  assert(w.store.all("runs").every((r) => r.cleanup === "complete"));
  privateWrite(
    join(out, "verification.json"),
    JSON.stringify(
      {
        provider: "fake",
        realAgentAcceptance: false,
        steps,
        ownedResourcesRemaining: 0,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      {
        provider: "fake",
        scripted: true,
        realDesktopVerified: false,
        steps,
        ownedResourcesRemaining: 0,
        evidenceDirectory: out,
      },
      null,
      2,
    ),
  );
} finally {
  await w.close();
  await rm(dir, { recursive: true, force: true });
}
