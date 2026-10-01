// Read-only reproduction of catalog inconsistency, without SDK transport or raw output.
import Database from "better-sqlite3";
import https from "node:https";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { Socket } from "node:net";

async function main() {
  const { values } = parseArgs({
    options: {
      state: { type: "string" },
      checkpoint: { type: "string" },
    },
  });
  if (!values.state || !process.env.SOLARI_API_KEY)
    throw new Error("Missing input");
  // No state migration, creation or resource mutation. Provider IDs stay in memory.
  const db = new Database(join(values.state, "workbench.sqlite"), {
    readonly: true,
    fileMustExist: true,
  });
  let snapshot: string;
  try {
    const rows = db
      .prepare("SELECT id,data FROM documents WHERE kind='checkpoints'")
      .all() as { id: string; data: string }[];
    const matches = rows
      .filter((r) => !values.checkpoint || r.id === values.checkpoint)
      .map((r) => JSON.parse(r.data) as { providerId?: string })
      .filter((r) => typeof r.providerId === "string" && r.providerId);
    if (matches.length !== 1) throw new Error("Ambiguous checkpoint");
    snapshot = matches[0].providerId!;
  } finally {
    db.close();
  }
  const sockets = new WeakMap<Socket, number>();
  let nextSocket = 0;
  const agent = new https.Agent({ keepAlive: true, maxSockets: 1 });
  async function sample(route: "filtered-list" | "unfiltered-list" | "lookup") {
    const path =
      route === "lookup"
        ? `/snapshots/${encodeURIComponent(snapshot)}`
        : route === "filtered-list"
          ? "/snapshots?kind=desktop&limit=1000"
          : "/snapshots?limit=1000";
    const at = new Date().toISOString();
    return new Promise<void>((resolve, reject) => {
      let connection: number | undefined;
      const request = https.request(
        {
          hostname: "api.getsolari.com",
          port: 443,
          path,
          method: "GET",
          agent,
          headers: {
            Authorization: `Bearer ${process.env.SOLARI_API_KEY}`,
            Accept: "application/json",
            "Cache-Control": "no-cache, no-store",
            "Accept-Encoding": "identity",
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          let size = 0;
          response.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > 1024 * 1024) request.destroy(new Error("Body limit"));
            else chunks.push(chunk);
          });
          response.on("error", reject);
          response.on("end", () => {
            try {
              const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
              const found =
                route === "lookup"
                  ? body.id === snapshot
                  : Array.isArray(body.snapshots) &&
                    body.snapshots.some(
                      (s: { id?: string }) => s?.id === snapshot,
                    );
              // Allowlist output: no bodies, response headers, paths or resource IDs.
              console.log(
                JSON.stringify({
                  at,
                  route,
                  status: response.statusCode,
                  connection,
                  ownedPresent: Boolean(found),
                  restorable:
                    found && typeof body.restorable === "boolean"
                      ? body.restorable
                      : undefined,
                }),
              );
              resolve();
            } catch {
              reject(new Error("Invalid response"));
            }
          });
        },
      );
      request.on("socket", (socket) => {
        if (!sockets.has(socket)) sockets.set(socket, ++nextSocket);
        connection = sockets.get(socket);
      });
      const timer = setTimeout(
        () => request.destroy(new Error("Deadline")),
        15000,
      );
      request.on("close", () => clearTimeout(timer));
      request.on("error", reject);
      request.end();
    });
  }
  try {
    // Fixed budget: twelve GETs, no redirects, retries, creates or mutations.
    for (let i = 0; i < 4; i++) {
      await sample("filtered-list");
      await sample("unfiltered-list");
      await sample("lookup");
    }
  } finally {
    agent.destroy();
  }
}

main().catch(() => {
  // Errors may include paths or capabilities. Never print the original exception.
  console.error(
    "Diagnostic stopped. Supply SOLARI_API_KEY and --state with one owned checkpoint, or select its local ID using --checkpoint. Check connectivity and local state privately.",
  );
  process.exitCode = 1;
});
