import Fastify from "fastify";
import websocket from "@fastify/websocket";
import WebSocket from "ws";
import cookie from "@fastify/cookie";
import staticPlugin from "@fastify/static";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import lockfile from "proper-lockfile";
import { z } from "zod";
import { Store, privateWrite } from "../persistence/store.js";
import { Workbench } from "../core/workbench.js";
import { FakeProvider } from "../provider/fake.js";
import { SolariProvider } from "../provider/solari.js";
import {
  toolSchemas,
  type ToolName,
  publicError,
  WorkbenchError,
} from "../shared/contracts.js";
export const stateDir = () =>
  resolve(
    process.env.WORKBENCH_STATE_DIR ??
      join(
        process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"),
        "solari-workbench",
      ),
  );
const same = (a: string, b: string) =>
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
export async function createServer(w: Workbench, token: string, port = 4317) {
  const app = Fastify({ logger: false, bodyLimit: 2 * 1024 * 1024 });
  await app.register(cookie);
  await app.register(websocket, { options: { maxPayload: 2 * 1024 * 1024 } });
  const viewers = new Map<string, Set<() => void>>();
  w.disconnectViewers = (runId) => {
    for (const close of viewers.get(runId) ?? []) close();
  };
  const origin = `http://127.0.0.1:${port}`;
  const sessions = new Map<string, number>();
  const streams = new Set<import("node:http").ServerResponse>();
  app.addHook("preClose", async () => {
    for (const stream of streams) stream.end();
    for (const group of viewers.values()) for (const close of group) close();
  });
  let pair: { code: string; expires: number } | undefined;
  let attempts = 0;
  app.addHook("onRequest", async (req, reply) => {
    reply
      .header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer")
      .header(
        "Content-Security-Policy",
        "default-src 'self'; img-src 'self' data:; style-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      );
    if (req.headers.host !== `127.0.0.1:${port}`)
      return reply.code(403).send({ error: "Host rejected" });
    if (req.headers.origin && req.headers.origin !== origin)
      return reply.code(403).send({ error: "Origin rejected" });
    if (req.method !== "GET" && req.headers["sec-fetch-site"] === "cross-site")
      return reply.code(403).send({ error: "Cross-site request rejected" });
    const protectedPath = req.url.startsWith("/api/");
    if (!protectedPath) return;
    const bearer = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : "";
    const session = req.cookies.workbench;
    const authenticated =
      (bearer && same(bearer, token)) ||
      (session && (sessions.get(session) ?? 0) > Date.now());
    if (!authenticated && req.url !== "/api/pair")
      return reply
        .code(401)
        .send({ error: "Pair this browser or use the local service token." });
    if (req.url === "/api/pair" && req.headers.origin !== origin)
      return reply
        .code(403)
        .send({ error: "Pairing requires the same origin" });
    if (!bearer && req.method !== "GET" && req.headers.origin !== origin)
      return reply
        .code(403)
        .send({ error: "Browser mutations require an Origin header" });
  });
  app.setErrorHandler((e, req, reply) => {
    if (e instanceof z.ZodError)
      return reply.code(400).send({
        code: "INVALID_INPUT",
        message: "Request failed schema validation.",
      });
    reply.code(e instanceof WorkbenchError ? 409 : 500).send(publicError(e));
  });
  app.get("/api/view/:id", { websocket: true }, (socket, req) => {
    const runId = (req.params as { id: string }).id;
    let upstream: WebSocket | undefined;
    let closed = false;
    const finish = () => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      upstream?.terminate();
      socket.close(1000, "Viewing lease ended");
      viewers.get(runId)?.delete(finish);
    };
    const timer = setTimeout(finish, 60000);
    const owned = viewers.get(runId) ?? new Set<() => void>();
    if (owned.size >= 2) {
      finish();
      return;
    }
    owned.add(finish);
    viewers.set(runId, owned);
    socket.on("error", finish);
    socket.on("close", finish);
    socket.on("message", (data, isBinary) => {
      if (upstream?.readyState === WebSocket.OPEN) {
        if (upstream.bufferedAmount > 2 * 1024 * 1024) finish();
        else upstream.send(data, { binary: isBinary });
      }
    });
    void w
      .viewingLease(runId)
      .then(({ url, generation }) => {
        if (closed) return;
        if (!url.startsWith("wss://")) {
          finish();
          return;
        }
        upstream = new WebSocket(url, {
          maxPayload: 10 * 1024 * 1024,
          handshakeTimeout: 10000,
        });
        upstream.on("message", (data, isBinary) => {
          const r = w.store.get("runs", runId);
          if (
            r.environment !== "running" ||
            r.generation !== generation ||
            socket.bufferedAmount > 10 * 1024 * 1024
          ) {
            finish();
            return;
          }
          socket.send(data, { binary: isBinary });
        });
        upstream.on("error", finish);
        upstream.on("close", finish);
      })
      .catch(finish);
  });
  app.addHook("onClose", async () => {
    for (const group of viewers.values()) for (const close of group) close();
  });
  app.get("/api/status", async () => w.status());
  app.post("/api/tools/:name", async (req) => {
    const name = (req.params as { name: string }).name;
    if (!Object.hasOwn(toolSchemas, name))
      throw new WorkbenchError("UNKNOWN_TOOL", "Tool does not exist.");
    const input = z
      .object({
        args: z.unknown(),
        actor: z.enum(["agent", "human", "evaluator"]).default("agent"),
      })
      .parse(req.body);
    return w.call(name as ToolName, input.args, input.actor);
  });
  app.post("/api/projects", async (req) => {
    const b = z
      .object({ root: z.string(), config: z.unknown() })
      .parse(req.body);
    return { projectId: await w.register(b.root, b.config) };
  });
  app.get("/api/projects/:id/manifest", async (req) =>
    w.inspect((req.params as { id: string }).id),
  );
  app.post("/api/reconcile", async () => {
    await w.settle();
    await w.reconcile();
    return w.status();
  });
  app.post("/api/pair-code", async (req) => {
    if (!same(req.headers.authorization?.replace(/^Bearer /, "") ?? "", token))
      throw new WorkbenchError(
        "UNAUTHORIZED",
        "Use the local CLI to request a pairing code.",
      );
    pair = {
      code: randomBytes(16).toString("hex"),
      expires: Date.now() + 120000,
    };
    attempts = 0;
    return { code: pair.code, expiresAt: pair.expires };
  });
  app.post("/api/pair", async (req, reply) => {
    const { code } = z.object({ code: z.string().max(100) }).parse(req.body);
    if (
      ++attempts > 10 ||
      !pair ||
      pair.expires < Date.now() ||
      !same(code, pair.code)
    )
      return reply.code(401).send({
        error:
          "Invalid or expired pairing code. Generate another using workbench pair.",
      });
    pair = undefined;
    const session = randomBytes(32).toString("hex");
    sessions.set(session, Date.now() + 8 * 3600000);
    return reply
      .setCookie("workbench", session, {
        httpOnly: true,
        sameSite: "strict",
        path: "/",
        maxAge: 8 * 3600,
      })
      .send({ paired: true });
  });
  app.get("/api/artifacts/:id", async (req, reply) => {
    const { artifact, bytes } = await w.readArtifact(
      (req.params as { id: string }).id,
    );
    const type =
      artifact.kind === "screenshot" ? "image/png" : "application/octet-stream";
    return reply
      .type(type)
      .header(
        "Content-Disposition",
        `${artifact.kind === "screenshot" ? "inline" : "attachment"}; filename="${artifact.id}.${artifact.kind === "screenshot" ? "png" : "txt"}"`,
      )
      .send(bytes);
  });
  app.get("/api/events", async (req, reply) => {
    reply.hijack();
    streams.add(reply.raw);
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Content-Type-Options": "nosniff",
    });
    let seq = Number(req.headers["last-event-id"] ?? 0);
    if (!Number.isSafeInteger(seq) || seq < 0) seq = 0;
    const send = () => {
      for (const event of w.store.events(seq)) {
        reply.raw.write(
          `id: ${event.seq}\nevent: update\ndata: ${JSON.stringify(event)}\n\n`,
        );
        seq = event.seq;
      }
      reply.raw.write(": keepalive\n\n");
    };
    send();
    const timer = setInterval(send, 2000);
    req.raw.on("close", () => {
      clearInterval(timer);
      streams.delete(reply.raw);
    });
  });
  const compiledUi = resolve(dirname(fileURLToPath(import.meta.url)), "../ui");
  const ui = existsSync(compiledUi)
    ? compiledUi
    : resolve(dirname(fileURLToPath(import.meta.url)), "../../dist/ui");
  if (existsSync(ui)) await app.register(staticPlugin, { root: ui });
  else
    app.get("/", async (_req, reply) =>
      reply.type("text/plain").send("Build the dashboard with npm run build."),
    );
  return app;
}
export async function serve(options: {
  provider: "fake" | "solari";
  port: number;
  state?: string;
}) {
  const dir = options.state ?? stateDir();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const release = await lockfile.lock(dir, {
    realpath: true,
    stale: 15000,
    retries: 0,
  });
  let w: Workbench | undefined;
  let store: Store | undefined;
  let app: Awaited<ReturnType<typeof createServer>> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    if (timer) clearInterval(timer);
    if (w) await w.close();
    else store?.close();
    await release();
  };
  try {
    store = new Store(dir);
    const marker = join(dir, "provider");
    if (
      existsSync(marker) &&
      (await readFile(marker, "utf8")) !== options.provider
    )
      throw new WorkbenchError(
        "PROVIDER_MISMATCH",
        "Use separate state directories for fake and Solari providers.",
      );
    const provider =
      options.provider === "fake"
        ? new FakeProvider(join(dir, "fake-remote"))
        : new SolariProvider(process.env.SOLARI_API_KEY ?? "");
    privateWrite(marker, options.provider);
    w = new Workbench(store, provider);
    await w.reconcile();
    const token = randomBytes(32).toString("hex");
    app = await createServer(w, token, options.port);
    app.addHook("onClose", cleanup);
    await app.listen({ host: "127.0.0.1", port: options.port });
    privateWrite(
      join(dir, "service.json"),
      JSON.stringify({
        url: `http://127.0.0.1:${options.port}`,
        token,
        pid: process.pid,
        provider: provider.kind,
      }),
    );
    timer = setInterval(() => {
      void w!
        .sweep()
        .catch(() => store!.event("Lifecycle sweep needs attention."));
    }, 10000);
    return app;
  } catch (e) {
    if (app) await app.close();
    await cleanup();
    throw e;
  }
}
