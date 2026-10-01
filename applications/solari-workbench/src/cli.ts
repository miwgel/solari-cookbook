#!/usr/bin/env node
import { Command } from "commander";
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { serve, stateDir } from "./server/server.js";
import { request } from "./server/client.js";
import { mcp } from "./mcp/server.js";
const cli = new Command()
  .name("workbench")
  .description("Inspectable remote projects and recoverable debugging cases")
  .option("--json", "Machine-readable output (default)");
const print = (v: unknown) => console.log(JSON.stringify(v, null, 2));
async function mutation(name: string, args: Record<string, unknown>) {
  if (args.runId && !args.generation) {
    const run = (await request("/api/tools/status", {
      args: { id: args.runId },
      actor: "human",
    })) as { generation: number };
    args.generation = run.generation;
  }
  return request(`/api/tools/${name}`, {
    args: { requestId: randomUUID(), ...args },
    actor: "human",
  });
}
cli
  .command("serve")
  .option("--provider <provider>", "fake or solari", "solari")
  .option("--port <port>", "loopback port", "4317")
  .action(async (opts) => {
    if (!["fake", "solari"].includes(opts.provider))
      throw new Error("Provider must be fake or solari");
    const port = Number(opts.port);
    if (!Number.isInteger(port) || port < 1024 || port > 65535)
      throw new Error("Invalid port");
    const app = await serve({ provider: opts.provider, port });
    console.error(
      `Workbench (${opts.provider}) listening on http://127.0.0.1:${port}`,
    );
    for (const signal of ["SIGINT", "SIGTERM"])
      process.once(signal, () => {
        void app.close().then(() => process.exit(0));
      });
  });
cli.command("doctor").action(async () => {
  let service = false;
  try {
    await request("/api/status");
    service = true;
  } catch {
    /* Read-only diagnostic. */
  }
  print({
    node: process.version,
    supportedNode: process.versions.node.startsWith("24."),
    solariCredentialPresent: Boolean(process.env.SOLARI_API_KEY),
    serviceReachable: service,
    liveContracts: "unverified",
    createsResources: false,
  });
});
const project = cli.command("project");
project
  .command("add <path>")
  .option("--config <file>", "configuration file", "workbench.json")
  .action(async (path, opts) => {
    const root = resolve(path);
    print(
      await request("/api/projects", {
        root,
        config: JSON.parse(await readFile(join(root, opts.config), "utf8")),
      }),
    );
  });
project
  .command("inspect <id>")
  .action(async (id) =>
    print(await request(`/api/projects/${encodeURIComponent(id)}/manifest`)),
  );
cli
  .command("start <project-id>")
  .action(async (projectId) => print(await mutation("start", { projectId })));
cli
  .command("status [id]")
  .action(async (id) =>
    print(await request("/api/tools/status", { args: { id }, actor: "human" })),
  );
cli.command("observe <run-id>").action(async (runId) => {
  const data = (await request("/api/tools/observe", {
    args: { runId },
    actor: "human",
  })) as Record<string, unknown>;
  delete data.image;
  print(data);
});
cli
  .command("capture <run-id>")
  .option("--title <title>", "case title", "Investigation")
  .option("--checkpoint-only")
  .option("--name <name>")
  .option("--expected <text>", "", "")
  .option("--observed <text>", "", "")
  .action(async (runId, opts) =>
    print(
      await mutation("capture", {
        runId,
        mode: opts.checkpointOnly ? "checkpoint" : "case",
        title: opts.name ?? opts.title,
        expected: opts.expected,
        observed: opts.observed,
      }),
    ),
  );
cli
  .command("restore <run-id>")
  .requiredOption("--checkpoint <id>")
  .action(async (runId, opts) =>
    print(await mutation("restore", { runId, checkpointId: opts.checkpoint })),
  );
cli
  .command("fork <case-id>")
  .action(async (caseId) => print(await mutation("fork", { caseId })));
for (const action of ["pause", "resume"])
  cli
    .command(`${action} <run-id>`)
    .action(async (runId) =>
      print(await mutation("lifecycle", { runId, action })),
    );
cli
  .command("export <run-id>")
  .action(async (runId) => print(await mutation("export", { runId })));
cli
  .command("complete <run-id>")
  .requiredOption("--outcome <outcome>")
  .requiredOption("--evidence <id...>")
  .action(async (runId, opts) =>
    print(
      await mutation("complete", {
        runId,
        outcome: opts.outcome,
        evidence: opts.evidence,
      }),
    ),
  );
cli
  .command("cleanup")
  .requiredOption("--run <id>")
  .option("--dry-run")
  .option("--apply")
  .action(async (opts) =>
    print(
      await mutation("lifecycle", {
        runId: opts.run,
        action: "destroy",
        apply: Boolean(opts.apply && !opts.dryRun),
      }),
    ),
  );
cli
  .command("hold <run-id>")
  .option("--release")
  .action(async (runId, opts) =>
    print(await mutation("hold", { runId, held: !opts.release })),
  );
cli
  .command("retain <checkpoint-id>")
  .option("--unpin")
  .action(async (checkpointId, opts) =>
    print(await mutation("retain", { checkpointId, pinned: !opts.unpin })),
  );
cli
  .command("resources")
  .action(async () => print(await request("/api/status")));
cli
  .command("reconcile")
  .action(async () => print(await request("/api/reconcile", {})));
cli
  .command("pair")
  .action(async () => print(await request("/api/pair-code", {})));
cli.command("mcp").action(mcp);
cli
  .command("mcp-config")
  .action(() =>
    console.log(
      `[mcp_servers.solari_workbench]\ncommand = ${JSON.stringify(process.execPath)}\nargs = [${JSON.stringify(fileURLToPath(import.meta.url))}, "mcp"]\nstartup_timeout_sec = 15\ntool_timeout_sec = 60\n[mcp_servers.solari_workbench.env]\nWORKBENCH_STATE_DIR = ${JSON.stringify(stateDir())}`,
    ),
  );
await cli.parseAsync().catch(() => {
  console.error(
    "Workbench command failed. Check arguments, service availability, and private configuration; inspect operation status before retrying.",
  );
  process.exitCode = 1;
});
