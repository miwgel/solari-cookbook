import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Store, id, privateWrite } from "../src/persistence/store.js";
import { Workbench } from "../src/core/workbench.js";
import { SolariProvider } from "../src/provider/solari.js";
import { stateDir } from "../src/server/server.js";
import { git } from "../src/workspace/source.js";
import {
  type ToolName,
  publicError,
  WorkbenchError,
} from "../src/shared/contracts.js";
import assert from "node:assert/strict";
if (process.env.WORKBENCH_LIVE !== "1") {
  console.log("SKIPPED: live provider verification not run");
  process.exit(0);
}
if (!process.env.SOLARI_API_KEY) {
  console.error(
    "SOLARI_API_KEY is required for the explicitly enabled live probe.",
  );
  process.exit(1);
}
const parentDir = join(stateDir(), "live-probes");
await mkdir(parentDir, { recursive: true, mode: 0o700 });
const dir = await mkdtemp(join(parentDir, "probe-"));
const root = join(dir, "project");
await mkdir(root);
await writeFile(
  join(root, "probe.py"),
  String.raw`import http.server,json,os,uuid
base=os.environ['WORKBENCH_RUNTIME'];disk=base+'/marker';boot=uuid.uuid4().hex;memory='prepared'
if not os.path.exists(disk):open(disk,'w').write('prepared')
class Handler(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  data=json.dumps({'boot':boot,'memory':memory,'disk':open(disk).read()})
  page='<html><title>Workbench contract probe</title><body><h1>Workbench contract probe</h1><label>Unsaved browser draft <input autofocus></label><pre>'+data+'</pre></body></html>'
  self.send_response(200);self.end_headers();self.wfile.write((page if self.path=='/' else data).encode())
 def do_POST(self):
  global memory
  memory='changed';open(disk,'w').write('changed');self.send_response(200);self.end_headers()
http.server.HTTPServer(('127.0.0.1',3000),Handler).serve_forever()
`,
);
await git(root, ["init", "-q"]);
await git(root, ["add", "."]);
const config = {
  schemaVersion: 1,
  name: "Contract probe",
  include: ["probe.py"],
  setup: [],
  start: { program: "python3", args: ["probe.py"] },
  ready: { url: "http://127.0.0.1:3000/health", timeoutMs: 30000 },
  openUrl: "http://127.0.0.1:3000",
  limits: { maxActiveMinutes: 10, maxActiveDesktops: 1 },
};
// HTTP response traces stay in private state. Never retain request headers or keys.
const httpTrace: {
  method: string;
  path: string;
  status: number;
  body: unknown;
}[] = [];
const tracedFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.pathname.includes("snapshots") || url.pathname.endsWith("/revert")) {
    const body: unknown = await response
      .clone()
      .json()
      .catch(() => null);
    httpTrace.push({
      method: init?.method ?? "GET",
      path: url.pathname,
      status: response.status,
      body,
    });
    privateWrite(
      join(dir, "provider-http.json"),
      JSON.stringify(httpTrace, null, 2),
    );
  }
  return response;
};
const w = new Workbench(
  new Store(join(dir, "state")),
  new Proxy(new SolariProvider(process.env.SOLARI_API_KEY, tracedFetch), {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;
      return async (...args: unknown[]) => {
        try {
          return await Reflect.apply(value, target, args);
        } catch (error) {
          // Provider diagnostics may contain capabilities: retain privately only.
          privateWrite(
            join(dir, "provider-error.json"),
            JSON.stringify({
              method: String(property),
              name: error instanceof Error ? error.name : "Unknown",
              message: error instanceof Error ? error.message : "Unknown",
              stack: error instanceof Error ? error.stack : undefined,
            }),
          );
          throw error;
        }
      };
    },
  }),
);
let rootRun: string | undefined;
const checks: Record<string, unknown>[] = [];
const deadline = Date.now() + 8 * 60000;
async function op(name: ToolName, args: Record<string, unknown>) {
  if (Date.now() > deadline) throw new Error("Probe deadline reached");
  const response = (await w.call(
    name,
    { requestId: id("probe"), ...args },
    "evaluator",
  )) as { id: string };
  await w.settle();
  const o = w.store.get("operations", response.id);
  if (name === "start") rootRun = o.runId;
  if (o.state !== "succeeded")
    throw new WorkbenchError(
      o.error?.code ?? "PROBE_FAILED",
      o.error?.message ?? "Live operation did not succeed.",
      o.error?.nextAction,
      o.state === "uncertain",
    );
  checks.push({ contract: `operation ${name}`, result: "passed" });
  return o;
}
const probeCommand = {
  program: "python3",
  args: [
    "-c",
    "import urllib.request;print(urllib.request.urlopen('http://127.0.0.1:3000/probes').read().decode())",
  ],
};
try {
  const projectId = await w.register(root, config);
  const started = await op("start", { projectId });
  rootRun = started.runId!;
  // App HTTP readiness precedes browser rendering. Leave a bounded render interval.
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const observation = await w.observe(rootRun);
  await op("act", {
    runId: rootRun,
    generation: 1,
    observationId: observation.id,
    action: { type: "type", text: "checkpoint browser draft" },
  });
  const before = await op("exec", {
    runId: rootRun,
    generation: 1,
    command: probeCommand,
  });
  const expected = JSON.parse((before.result as { stdout: string }).stdout);
  const capture = await op("capture", {
    runId: rootRun,
    generation: 1,
    title: "Contract probe",
    expected: "Disk, process memory and browser draft persist",
    observed: "Prepared probe state",
  });
  const { checkpointId, caseId } = capture.result as {
    checkpointId: string;
    caseId: string;
  };
  await op("exec", {
    runId: rootRun,
    generation: 1,
    command: {
      program: "python3",
      args: [
        "-c",
        "import urllib.request;urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:3000/mutate',data=b'',method='POST')).read()",
      ],
    },
  });
  for (let attempt = 0; ; attempt++) {
    const current = w.store.get("runs", rootRun);
    try {
      await op("restore", {
        runId: rootRun,
        generation: current.generation,
        checkpointId,
      });
      break;
    } catch (error) {
      // A received HTTP 404 is a rejected request, not an unknown transport outcome.
      // Record a new intent only after explicit reconciliation; never replay ambiguity.
      if (
        !(error instanceof WorkbenchError) ||
        error.code !== "RESTORE_NOT_FOUND" ||
        attempt >= 2
      )
        throw error;
      checks.push({
        contract: "restore recovery",
        result: "provider rejected request; reconciling before a fresh intent",
        attempt: attempt + 1,
      });
      await new Promise((resolve) => setTimeout(resolve, 5000));
      await w.reconcile();
    }
  }
  let r = w.store.get("runs", rootRun);
  const restored = await op("exec", {
    runId: rootRun,
    generation: r.generation,
    command: probeCommand,
  });
  assert.deepEqual(
    JSON.parse((restored.result as { stdout: string }).stdout),
    expected,
  );
  checks.push({
    contract: "disk and server process-memory restoration",
    result: "passed",
  });
  await w.observe(rootRun);
  checks.push({
    contract: "exact visible browser draft restoration",
    result: "manual inspection required",
    note: "Compare private before/after screenshots. This probe does not claim automatic browser-memory verification.",
  });
  await op("lifecycle", {
    runId: rootRun,
    generation: r.generation,
    action: "pause",
  });
  const child = await op("fork", { caseId });
  const childProbe = await op("exec", {
    runId: child.runId,
    generation: 1,
    command: probeCommand,
  });
  assert.deepEqual(
    JSON.parse((childProbe.result as { stdout: string }).stdout),
    expected,
  );
  checks.push({
    contract: "desktop fork process and disk probes",
    result: "passed",
  });
  await op("files", {
    runId: child.runId,
    generation: 1,
    mode: "write",
    path: "probe.py",
    content:
      (await readFile(join(root, "probe.py"), "utf8")) +
      "\n# child-only edit\n",
  });
  await op("lifecycle", { runId: child.runId, generation: 1, action: "pause" });
  r = w.store.get("runs", rootRun);
  await op("lifecycle", {
    runId: rootRun,
    generation: r.generation,
    action: "resume",
  });
  r = w.store.get("runs", rootRun);
  const original = await op("files", {
    runId: rootRun,
    generation: r.generation,
    mode: "read",
    path: "probe.py",
  });
  assert(
    !(original.result as { content: string }).content.includes(
      "child-only edit",
    ),
  );
  checks.push({ contract: "fork source independence", result: "passed" });
} catch (e) {
  checks.push({
    contract: "live probe",
    result: "failed",
    error: publicError(e),
  });
  process.exitCode = 1;
} finally {
  try {
    await w.reconcile();
    if (rootRun) {
      const r = w.store.get("runs", rootRun);
      const response = (await w.call(
        "lifecycle",
        {
          requestId: id("cleanup"),
          runId: rootRun,
          generation: r.generation,
          action: "destroy",
          apply: true,
        },
        "human",
      )) as { id: string };
      await w.settle();
      if (w.store.get("operations", response.id).state !== "succeeded") {
        checks.push({
          contract: "cleanup",
          result: "unconfirmed; inspect retained private operation",
        });
        process.exitCode = 1;
      }
    }
    const remaining = (await w.provider.list(w.store.installationId)).filter(
      (r) => r.state !== "deleted",
    );
    checks.push({ contract: "cleanup", remainingDesktops: remaining.length });
    if (remaining.length) process.exitCode = 1;
  } catch {
    checks.push({
      contract: "cleanup",
      result: "unconfirmed; recover from retained private state",
    });
    process.exitCode = 1;
  }
  privateWrite(
    join(dir, "results.json"),
    JSON.stringify(
      {
        checks,
        completedAt: new Date().toISOString(),
        actualAgentAcceptance: "not run",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks, privateStateRetained: true }, null, 2));
  await w.close();
}
