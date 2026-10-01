import Database from "better-sqlite3";
import {
  mkdirSync,
  chmodSync,
  writeFileSync,
  renameSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import type { Tables } from "../shared/model.js";
import { relations } from "./relations.js";
import { fail } from "../shared/contracts.js";
export const id = (prefix: string) =>
  `${prefix}_${randomUUID().replaceAll("-", "")}`;
export const hash = (v: string | Uint8Array) =>
  createHash("sha256").update(v).digest("hex");
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (v && typeof v === "object")
    return (
      "{" +
      Object.entries(v)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, x]) => JSON.stringify(k) + ":" + canonical(x))
        .join(",") +
      "}"
    );
  return JSON.stringify(v);
}
export function privateWrite(path: string, data: string | Uint8Array) {
  const temp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temp, data, { mode: 0o600 });
  renameSync(temp, path);
}
export class Store {
  db: Database.Database;
  installationId: string;
  constructor(public dir: string) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
    this.db = new Database(join(dir, "workbench.sqlite"));
    chmodSync(join(dir, "workbench.sqlite"), 0o600);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    try {
      const version = this.db.pragma("user_version", {
        simple: true,
      }) as number;
      if (version > 2)
        fail(
          "SCHEMA_VERSION",
          "State was written by a newer Workbench version.",
          "Use the matching application version; do not downgrade its database.",
        );
      this.db
        .transaction(() => {
          this.db.exec(
            `CREATE TABLE IF NOT EXISTS documents(kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(kind,id));CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,at INTEGER NOT NULL,summary TEXT NOT NULL);CREATE UNIQUE INDEX IF NOT EXISTS request_ids ON documents(json_extract(data,'$.requestId')) WHERE kind='operations';`,
          );
          if (version < 2) {
            this.db.exec(
              `CREATE TABLE document_links(owner_kind TEXT NOT NULL,owner_id TEXT NOT NULL,role TEXT NOT NULL,target_kind TEXT NOT NULL,target_id TEXT NOT NULL,PRIMARY KEY(owner_kind,owner_id,role,target_kind,target_id),FOREIGN KEY(owner_kind,owner_id) REFERENCES documents(kind,id) ON DELETE CASCADE,FOREIGN KEY(target_kind,target_id) REFERENCES documents(kind,id) ON DELETE RESTRICT);`,
            );
            const docs = this.db
              .prepare("SELECT kind,id,data FROM documents")
              .all() as { kind: keyof Tables; id: string; data: string }[];
            for (const doc of docs)
              this.writeRelations(
                doc.kind,
                JSON.parse(doc.data) as Tables[keyof Tables],
              );
            this.db.pragma("user_version=2");
          }
        })
        .immediate();
    } catch (error) {
      this.db.close();
      throw error;
    }
    const p = join(dir, "installation");
    try {
      this.installationId = readFileSync(p, "utf8");
    } catch {
      this.installationId = id("install");
      privateWrite(p, this.installationId);
    }
  }
  get<K extends keyof Tables>(kind: K, key: string): Tables[K] {
    const row = this.db
      .prepare("SELECT data FROM documents WHERE kind=? AND id=?")
      .get(kind, key) as { data: string } | undefined;
    if (!row) fail("NOT_FOUND", `${kind} record not found.`);
    return JSON.parse(row.data) as Tables[K];
  }
  all<K extends keyof Tables>(kind: K): Tables[K][] {
    return (
      this.db
        .prepare("SELECT data FROM documents WHERE kind=? ORDER BY rowid")
        .all(kind) as { data: string }[]
    ).map((r) => JSON.parse(r.data) as Tables[K]);
  }
  private writeRelations<K extends keyof Tables>(kind: K, value: Tables[K]) {
    this.db
      .prepare("DELETE FROM document_links WHERE owner_kind=? AND owner_id=?")
      .run(kind, value.id);
    const insert = this.db.prepare(
      "INSERT INTO document_links(owner_kind,owner_id,role,target_kind,target_id) VALUES(?,?,?,?,?)",
    );
    for (const link of relations(kind, value))
      insert.run(kind, value.id, link.role, link.kind, link.id);
  }
  put<K extends keyof Tables>(kind: K, value: Tables[K]) {
    this.db.transaction(() => {
      this.db
        .prepare(
          "INSERT INTO documents(kind,id,data) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data",
        )
        .run(kind, value.id, JSON.stringify(value));
      this.writeRelations(kind, value);
    })();
    return value;
  }
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn).immediate();
  }
  event(summary: string) {
    this.db
      .prepare("INSERT INTO events(at,summary) VALUES(?,?)")
      .run(Date.now(), summary);
  }
  events(after = 0) {
    return this.db
      .prepare(
        "SELECT seq,at,summary FROM events WHERE seq>? ORDER BY seq LIMIT 200",
      )
      .all(after) as { seq: number; at: number; summary: string }[];
  }
  close() {
    this.db.close();
  }
}
