import { test, expect } from "vitest";
import Database from "better-sqlite3";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../src/persistence/store.js";
import { config, setup, started } from "../helpers.js";
test("state migrations preserve existing records and add actual foreign-key relationships", async () => {
  const dir = await mkdtemp(join(tmpdir(), "workbench-migration-"));
  const legacy = new Database(join(dir, "workbench.sqlite"));
  legacy.exec(
    "CREATE TABLE documents(kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(kind,id));CREATE TABLE events(seq INTEGER PRIMARY KEY AUTOINCREMENT,at INTEGER NOT NULL,summary TEXT NOT NULL);PRAGMA user_version=1;",
  );
  legacy.prepare("INSERT INTO documents VALUES(?,?,?)").run(
    "projects",
    "project_legacy",
    JSON.stringify({
      id: "project_legacy",
      root: "/example/project",
      config,
    }),
  );
  legacy.close();
  const store = new Store(dir);
  try {
    expect(store.db.pragma("user_version", { simple: true })).toBe(2);
    expect(store.get("projects", "project_legacy").config.name).toBe(
      config.name,
    );
    expect(store.db.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(store.db.pragma("foreign_key_list(document_links)")).toHaveLength(4);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("referential integrity rejects orphan updates atomically and protects referenced records", async () => {
  const h = await setup();
  try {
    const r = await started(h);
    const original = h.store.get("runs", r.id);
    expect(() =>
      h.store.put("runs", { ...original, projectId: "project_missing" }),
    ).toThrow(/FOREIGN KEY/);
    expect(h.store.get("runs", r.id).projectId).toBe(original.projectId);
    expect(() =>
      h.store.db
        .prepare("DELETE FROM documents WHERE kind=? AND id=?")
        .run("projects", h.projectId),
    ).toThrow(/FOREIGN KEY/);
    expect(h.store.db.pragma("foreign_key_check")).toEqual([]);
  } finally {
    await h.close();
  }
});
