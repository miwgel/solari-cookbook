import { test, expect } from "@playwright/test";
import { setup, started, run } from "../helpers.js";
import { createServer } from "../../src/server/server.js";
let h: Awaited<ReturnType<typeof setup>>;
let app: Awaited<ReturnType<typeof createServer>>;
test.beforeAll(async () => {
  h = await setup();
  const r = await started(h);
  await run(h.w, "capture", {
    runId: r.id,
    generation: 1,
    title: "Bulk edit changes unselected task",
    expected: "C stays normal",
    observed: "C becomes high",
  });
  app = await createServer(h.w, "synthetic-ui-token", 44319);
  await app.listen({ host: "127.0.0.1", port: 44319 });
});
test.afterAll(async () => {
  await app.close();
  await h.close();
});
for (const [width, height] of [
  [1440, 900],
  [1024, 768],
  [390, 844],
])
  test(`pair, inspect and recover dashboard at ${width}x${height}`, async ({
    page,
    request,
  }, testInfo) => {
    await page.setViewportSize({ width, height });
    const response = await request.post("/api/pair-code", {
      headers: { Authorization: "Bearer synthetic-ui-token" },
      data: {},
    });
    const { code } = await response.json();
    await page.goto("/");
    await page.getByLabel("Pairing code").fill(code);
    await page.getByRole("button", { name: "Connect browser" }).click();
    await expect(page.getByText("Offline workflow simulation")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Bulk edit changes unselected task" }),
    ).toBeVisible();
    await expect(page.getByText("C stays normal")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Hold agent actions" }).click();
    await expect(
      page.getByRole("button", { name: "Release hold" }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Release hold" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Release hold" }).click();
    await expect(
      page.getByRole("button", { name: "Hold agent actions" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Cleanup", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Confirm cleanup" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.screenshot({
      path: testInfo.outputPath(`dashboard-${width}.png`),
      fullPage: true,
    });
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe(
      "BODY",
    );
  });

test("uncertain owned resources remain visible without exposing provider identifiers", async ({
  page,
  request,
}, testInfo) => {
  const current = h.store.all("runs")[0];
  const remote = await h.provider.create({
    installation: h.store.installationId,
    run: current.id,
    operation: "unresolved-operation",
  });
  await h.w.reconcile();
  const response = await request.post("/api/pair-code", {
    headers: { Authorization: "Bearer synthetic-ui-token" },
    data: {},
  });
  const { code } = await response.json();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Pairing code").fill(code);
  await page.getByRole("button", { name: "Connect browser" }).click();
  await expect(
    page.getByRole("heading", { name: "Resources need reconciliation" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reconcile resources" }),
  ).toBeVisible();
  expect(await page.locator("body").innerText()).not.toContain(remote.id);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("recovery-resources-mobile.png"),
    fullPage: true,
  });
});
