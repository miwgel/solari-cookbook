import { test, expect, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { COMMAND, START } from "../../src/provider/guest.js";
const execute = promisify(execFile);
const roots: string[] = [];
const supervisors: number[] = [];
afterEach(async () => {
  for (const pid of supervisors.splice(0)) {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      /* Already exited. */
    }
  }
  for (const path of roots.splice(0))
    await rm(path, { recursive: true, force: true });
});
async function guest() {
  const root = await mkdtemp(join(tmpdir(), "workbench-guest-helper-"));
  roots.push(root);
  for (const area of ["source", "runtime", "artifacts", "scratch"])
    await mkdir(join(root, area));
  return root;
}
async function python(script: string, args: string[]) {
  return JSON.parse(
    (
      await execute("python3", ["-c", script, ...args], {
        timeout: 10000,
        maxBuffer: 32 * 1024 * 1024,
      })
    ).stdout,
  );
}
async function port() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) =>
    server.close((e) => (e ? reject(e) : resolve())),
  );
  return port;
}
// These are trusted synthetic programs exercising the exact guest helper. The service
// still never executes an imported user's project on the host.
test("guest commands preserve arguments, exit status and bounded stdout/stderr", async () => {
  const base = await guest();
  const literal = 'space and $dollar; quote " and newline\n';
  const value = await python(COMMAND, [
    JSON.stringify({
      program: "python3",
      args: [
        "-c",
        'import sys,json;print(json.dumps(sys.argv[1:]));print("diagnostic",file=sys.stderr);sys.exit(7)',
        literal,
      ],
      timeoutMs: 2000,
    }),
    base,
    "source",
  ]);
  expect(value.exitCode).toBe(7);
  expect(JSON.parse(value.stdout)).toEqual([literal]);
  expect(value.stderr.trim()).toBe("diagnostic");
  expect(value.truncated).toBe(false);
});
test("guest command deadline still applies after the process closes both output streams", async () => {
  const base = await guest();
  const start = performance.now();
  const result = await python(COMMAND, [
    JSON.stringify({
      program: "python3",
      args: ["-c", "import os,time;os.close(1);os.close(2);time.sleep(5)"],
      timeoutMs: 150,
    }),
    base,
    "source",
  ]);
  expect(result.exitCode).toBe(124);
  expect(performance.now() - start).toBeLessThan(2000);
});
test("guest command log retention is capped while output is drained", async () => {
  const base = await guest();
  const result = await python(COMMAND, [
    JSON.stringify({
      program: "python3",
      args: ["-c", 'import sys;sys.stdout.write("x"*(6*1024*1024))'],
      timeoutMs: 5000,
    }),
    base,
    "source",
  ]);
  expect(result.exitCode).toBe(0);
  expect(result.truncated).toBe(true);
  expect(
    Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr),
  ).toBe(5 * 1024 * 1024);
});
test("startup exit failures and readiness timeouts retain logs and terminate the failed launch", async () => {
  const base = await guest();
  const ready = {
    url: `http://127.0.0.1:${await port()}/health`,
    timeoutMs: 2000,
  };
  const failed = await python(START, [
    base,
    JSON.stringify({
      start: {
        program: "python3",
        args: ["-c", 'import sys;print("setup detail",flush=True);sys.exit(7)'],
      },
      ready,
    }),
  ]);
  expect(failed.ready).toBe(false);
  expect(failed.exitCode).toBe(7);
  expect(failed.stdout).toContain("setup detail");
  const other = await guest();
  const timed = await python(START, [
    other,
    JSON.stringify({
      start: {
        program: "python3",
        args: ["-c", 'import time;print("waiting",flush=True);time.sleep(20)'],
      },
      ready: { ...ready, timeoutMs: 150 },
    }),
  ]);
  expect(timed.ready).toBe(false);
  expect(timed.exitCode).toBe(124);
  expect(timed.stdout).toContain("waiting");
  expect(() => process.kill(timed.supervisorPid, 0)).toThrow();
});
test("ready application survives readiness-client exit and keeps bounded logs", async () => {
  const base = await guest();
  const listen = await port();
  const server = `import http.server,sys\nclass Handler(http.server.BaseHTTPRequestHandler):\n def log_message(self,*args):pass\n def do_GET(self):\n  print('after-ready' if self.path=='/after' else 'ready',flush=True)\n  self.send_response(200);self.end_headers();self.wfile.write(b'ok')\nhttp.server.HTTPServer(('127.0.0.1',${listen}),Handler).serve_forever()`;
  const result = await python(START, [
    base,
    JSON.stringify({
      start: { program: "python3", args: ["-c", server] },
      ready: { url: `http://127.0.0.1:${listen}/health`, timeoutMs: 3000 },
    }),
  ]);
  if (result.supervisorPid) supervisors.push(result.supervisorPid);
  expect(result.ready).toBe(true);
  expect((await fetch(`http://127.0.0.1:${listen}/after`)).status).toBe(200);
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(
    await readFile(join(base, "runtime/.workbench-app/stdout.log"), "utf8"),
  ).toContain("after-ready");
  await expect(
    python(START, [
      base,
      JSON.stringify({
        start: { program: "python3", args: ["-c", server] },
        ready: { url: `http://127.0.0.1:${listen}/health`, timeoutMs: 100 },
      }),
    ]),
  ).rejects.toThrow();
});
