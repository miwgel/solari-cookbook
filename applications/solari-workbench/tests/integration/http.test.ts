import { test, expect } from "vitest";
import { setup, started } from "../helpers.js";
import { createServer } from "../../src/server/server.js";
test("loopback boundary requires authentication and checks Host/Origin; pairing is one-use; active artifacts download", async () => {
  const h = await setup();
  const r = await started(h);
  const token = "synthetic-test-token";
  const app = await createServer(h.w, token, 44317);
  const headers = { host: "127.0.0.1:44317", authorization: `Bearer ${token}` };
  try {
    expect(
      (
        await app.inject({
          url: "/api/status",
          headers: { host: headers.host },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          url: "/api/status",
          headers: { ...headers, host: "untrusted.invalid" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          url: "/api/status",
          headers: { ...headers, origin: "https://untrusted.invalid" },
        })
      ).statusCode,
    ).toBe(403);
    expect((await app.inject({ url: "/api/status", headers })).statusCode).toBe(
      200,
    );
    const pairing = await app.inject({
      method: "POST",
      url: "/api/pair-code",
      headers,
      payload: {},
    });
    const { code } = pairing.json() as { code: string };
    const paired = await app.inject({
      method: "POST",
      url: "/api/pair",
      headers: { host: headers.host, origin: "http://127.0.0.1:44317" },
      payload: { code },
    });
    expect(paired.statusCode).toBe(200);
    expect(paired.headers["set-cookie"]).toContain("HttpOnly");
    expect(paired.headers["set-cookie"]).toContain("SameSite=Strict");
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/pair",
          headers: { host: headers.host, origin: "http://127.0.0.1:44317" },
          payload: { code },
        })
      ).statusCode,
    ).toBe(401);
    const status = await app.inject({ url: "/api/status", headers });
    expect(status.body).not.toContain(h.provider.state.remotes[0].id);
    expect(status.body).not.toContain(h.root);
    const o = await h.w.observe(r.id);
    const screenshot = await app.inject({
      url: `/api/artifacts/${o.artifactId}`,
      headers,
    });
    expect(screenshot.headers["content-type"]).toBe("image/png");
    expect(screenshot.headers["x-content-type-options"]).toBe("nosniff");
  } finally {
    await app.close();
    await h.close();
  }
});
