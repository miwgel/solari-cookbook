import { test, expect } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "../../src/server/server.js";
test("foreground service publishes working discovery, holds a process lock and can restart", async () => {
  const dir = await mkdtemp(join(tmpdir(), "workbench-service-"));
  let app = await serve({ provider: "fake", port: 44321, state: dir });
  try {
    const config = JSON.parse(
      await readFile(join(dir, "service.json"), "utf8"),
    ) as { url: string; token: string };
    const r = await fetch(config.url + "/api/status", {
      headers: { Authorization: `Bearer ${config.token}` },
    });
    expect(r.status).toBe(200);
    expect(((await r.json()) as { provider: string }).provider).toBe("fake");
    await expect(
      serve({ provider: "fake", port: 44322, state: dir }),
    ).rejects.toThrow();
    await app.close();
    app = await serve({ provider: "fake", port: 44321, state: dir });
    const newConfig = JSON.parse(
      await readFile(join(dir, "service.json"), "utf8"),
    ) as { token: string };
    expect(newConfig.token).not.toBe(config.token);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
