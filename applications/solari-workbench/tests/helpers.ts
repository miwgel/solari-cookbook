import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/persistence/store.js";
import { Workbench } from "../src/core/workbench.js";
import { FakeProvider } from "../src/provider/fake.js";
import {
  configSchema,
  type ToolName,
  type Actor,
} from "../src/shared/contracts.js";
import { git } from "../src/workspace/source.js";
import type { Operation } from "../src/shared/model.js";
export const config = configSchema.parse({
  schemaVersion: 1,
  name: "Synthetic project",
  include: ["src/**", "public/**", "package.json", ".env*"],
  includeUntracked: ["src/**"],
  exclude: [],
  setup: [],
  start: { program: "node", args: ["src/main.js"] },
  ready: { url: "http://127.0.0.1:3000/health" },
  openUrl: "http://127.0.0.1:3000",
});
export async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "workbench-test-"));
  const root = join(dir, "project");
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src/main.js"), "export const answer = 1;\n");
  await writeFile(join(root, ".env"), "PRIVATE_SENTINEL_DO_NOT_UPLOAD");
  await git(root, ["init", "-q"]);
  await git(root, ["add", "."]);
  const store = new Store(join(dir, "state"));
  const provider = new FakeProvider(join(dir, "remote"));
  const w = new Workbench(store, provider);
  const projectId = await w.register(root, config);
  const close = async () => {
    await w.close();
    await rm(dir, { recursive: true, force: true });
  };
  return { dir, root, store, provider, w, projectId, close };
}
let n = 0;
export async function run(
  w: Workbench,
  name: ToolName,
  args: Record<string, unknown>,
  actor: Actor = "agent",
) {
  const result = (await w.call(
    name,
    { requestId: `test_${++n}`, ...args },
    actor,
  )) as { id: string };
  await w.settle();
  return w.store.get("operations", result.id);
}
export async function started(h: Awaited<ReturnType<typeof setup>>) {
  const op = await run(h.w, "start", { projectId: h.projectId });
  if (op.state !== "succeeded") throw new Error(JSON.stringify(op.error));
  return h.store.get("runs", op.runId!);
}
export function result<T>(o: Operation) {
  return o.result as T;
}
