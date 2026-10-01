import { afterEach, expect, test, vi } from "vitest";
import type { Desktop } from "@solarisdk/desktop";
import { GatewayError } from "@solarisdk/sandbox";
import { SolariProvider } from "../../src/provider/solari.js";

afterEach(() => vi.useRealTimers());

test("open uses an available browser and a retained profile without first-run prompts", async () => {
  const provider = new SolariProvider("test");
  const open = vi.fn().mockResolvedValue(1);
  const internals = provider as unknown as {
    desktop(key: string): Promise<{ open: typeof open }>;
    python(key: string, script: string, args: string[]): Promise<string>;
  };
  vi.spyOn(internals, "desktop").mockResolvedValue({ open });
  vi.spyOn(internals, "python")
    .mockResolvedValueOnce(
      JSON.stringify({ program: "/usr/bin/google-chrome", root: true }),
    )
    .mockResolvedValue("");
  await provider.act(
    "remote",
    { type: "open" },
    "http://127.0.0.1:3000",
    "/workbench/run",
  );
  expect(open).toHaveBeenCalledWith(
    "/usr/bin/google-chrome",
    expect.arrayContaining([
      "--no-first-run",
      "--no-default-browser-check",
      "--no-sandbox",
      "--user-data-dir=/workbench/run/runtime/browser-profile",
      "http://127.0.0.1:3000",
    ]),
  );
});

test("destroy waits for asynchronous deletion without replaying the mutation", async () => {
  vi.useFakeTimers();
  const provider = new SolariProvider("test");
  const kill = vi.spyOn(provider.client, "kill").mockResolvedValue();
  vi.spyOn(provider, "status")
    .mockResolvedValueOnce("deleting")
    .mockResolvedValue("deleted");
  const result = provider.destroy("remote");
  await vi.advanceTimersByTimeAsync(500);
  await result;
  expect(kill).toHaveBeenCalledTimes(1);
});

test("an unconfirmed snapshot receipt stays uncertain instead of becoming restorable", async () => {
  const provider = new SolariProvider("test");
  const snapshot = vi.fn().mockResolvedValue("snapshot");
  const internals = provider as unknown as {
    desktop(key: string): Promise<{ snapshot: typeof snapshot }>;
  };
  vi.spyOn(internals, "desktop").mockResolvedValue({ snapshot });
  vi.spyOn(provider.client, "getSnapshot").mockRejectedValue(
    new Error("missing receipt"),
  );
  const receipt = vi.fn().mockResolvedValue(undefined);
  await expect(
    provider.snapshot("remote", "capture", receipt),
  ).rejects.toMatchObject({
    code: "UNCONFIRMED_SNAPSHOT",
    uncertain: true,
  });
  expect(snapshot).toHaveBeenCalledTimes(1);
  expect(receipt).toHaveBeenCalledWith({ id: "snapshot", name: "capture" });
});

test("SDK close warnings do not expose the private session identifier", () => {
  const provider = new SolariProvider("test");
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const session = "private-session-sentinel";
  provider.handles.set("remote", {
    id: session,
    close: () =>
      console.warn(`close() on session ${session}: remote still running`),
  } as unknown as Desktop);
  try {
    provider.close();
    expect(warn).toHaveBeenCalledWith(
      "close() on session [private session]: remote still running",
    );
    expect(console.warn).toBe(warn);
  } finally {
    warn.mockRestore();
  }
});

test("the pinned SDK preserves a returned snapshot ID when the inventory API returns 404", async () => {
  const requests: { method: string; path: string; body: unknown }[] = [];
  const transport: typeof fetch = async (input, init) => {
    const path = new URL(input instanceof Request ? input.url : String(input))
      .pathname;
    const method = init?.method ?? "GET";
    requests.push({
      method,
      path,
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    if (method === "POST" && path === "/sandboxes")
      return Response.json({
        sandboxId: "desktop-test",
        controlUrl: "wss://example.invalid/control",
        streamUrl: "wss://example.invalid/stream",
        expiresAt: "",
      });
    if (method === "GET" && path === "/sandboxes/desktop-test")
      return Response.json({ sandboxId: "desktop-test", state: "running" });
    if (method === "POST" && path === "/sandboxes/desktop-test/snapshots")
      return Response.json(
        {
          snapshotId: "snapshot-test",
          sizeBytes: 1024,
          createdAt: "2026-09-30T00:00:00Z",
        },
        { status: 201 },
      );
    return Response.json(
      { error: "NotFound", message: "Snapshot not found" },
      { status: 404 },
    );
  };
  const provider = new SolariProvider("test", transport);
  const remote = await provider.create({ installation: "test-installation" });
  vi.spyOn(provider.handles.get(remote.id)!, "connect").mockResolvedValue();
  const receipt = vi.fn().mockResolvedValue(undefined);
  await expect(
    provider.snapshot(remote.id, "test-capture", receipt),
  ).rejects.toMatchObject({ code: "UNCONFIRMED_SNAPSHOT", uncertain: true });
  expect(receipt).toHaveBeenCalledWith({
    id: "snapshot-test",
    name: "test-capture",
  });
  expect(requests.filter((r) => r.path.endsWith("/snapshots"))).toEqual([
    {
      method: "POST",
      path: "/sandboxes/desktop-test/snapshots",
      body: { name: "test-capture" },
    },
  ]);
  expect(requests.at(-1)).toEqual({
    method: "GET",
    path: "/snapshots/snapshot-test",
    body: null,
  });
});

test.each([
  { acknowledged: false, visible: false },
  { acknowledged: false, visible: true },
  { acknowledged: true, visible: false },
  { acknowledged: true, visible: true },
])(
  "snapshot cleanup requires an acknowledgement and no conflicting lookup: %j",
  async ({ acknowledged, visible }) => {
    const methods: string[] = [];
    const transport: typeof fetch = async (_input, init) => {
      const method = init?.method ?? "GET";
      methods.push(method);
      if (method === "DELETE" && acknowledged)
        return Response.json({ ok: true });
      if (method === "GET" && visible)
        return Response.json({ id: "snapshot-test" });
      return Response.json({ error: "Snapshot not found" }, { status: 404 });
    };
    const provider = new SolariProvider("test", transport);
    if (!acknowledged || visible)
      await expect(
        provider.deleteSnapshot("snapshot-test"),
      ).rejects.toMatchObject({ code: "UNCONFIRMED_DELETE", uncertain: true });
    else
      await expect(
        provider.deleteSnapshot("snapshot-test"),
      ).resolves.toBeUndefined();
    expect(methods).toEqual(acknowledged ? ["DELETE", "GET"] : ["DELETE"]);
  },
);

test("cleanup of an already missing desktop confirms absence without replay", async () => {
  const methods: string[] = [];
  const transport: typeof fetch = async (_input, init) => {
    methods.push(init?.method ?? "GET");
    return Response.json({ error: "Sandbox not found" }, { status: 404 });
  };
  const provider = new SolariProvider("test", transport);
  await expect(provider.destroy("desktop-test")).resolves.toBeUndefined();
  expect(methods).toEqual(["DELETE", "GET"]);
});

test.each([false, true])(
  "restore distinguishes rejection from transport ambiguity without replay (rejected=%s)",
  async (rejected) => {
    const provider = new SolariProvider("test");
    const error = rejected
      ? new GatewayError(404, "Snapshot not found")
      : new Error("Lost transport");
    const revert = vi.fn().mockRejectedValue(error);
    const internals = provider as unknown as {
      desktop(key: string): Promise<{ revert: typeof revert }>;
    };
    vi.spyOn(internals, "desktop").mockResolvedValue({ revert });
    if (rejected)
      await expect(
        provider.restore("desktop-test", "snapshot-test"),
      ).rejects.toMatchObject({ code: "RESTORE_NOT_FOUND", uncertain: false });
    else
      await expect(
        provider.restore("desktop-test", "snapshot-test"),
      ).rejects.toBe(error);
    expect(revert).toHaveBeenCalledTimes(1);
  },
);
