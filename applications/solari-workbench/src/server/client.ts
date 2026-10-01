import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { WorkbenchError } from "../shared/contracts.js";
import { stateDir } from "./server.js";
export async function request(path: string, body?: unknown) {
  const discovery = JSON.parse(
    await readFile(join(stateDir(), "service.json"), "utf8"),
  ) as { url: string; token: string };
  const url = new URL(discovery.url);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1")
    throw new Error("Invalid service discovery address.");
  const r = await fetch(`${discovery.url}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${discovery.token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) {
    const error = (await r.json()) as {
      message?: string;
      error?: string;
      code?: string;
      nextAction?: string;
    };
    throw new WorkbenchError(
      error.code ?? String(r.status),
      error.message ?? error.error ?? "Service request failed",
      error.nextAction,
    );
  }
  return r.json();
}
