import type { Command, GuiAction, ProjectConfig } from "../shared/contracts.js";
import type { Environment, Manifest } from "../shared/model.js";
export interface Remote {
  id: string;
  state: Environment;
  metadata: Record<string, string>;
}
export interface Snapshot {
  id: string;
  name: string;
  sizeBytes?: number;
  restorable?: boolean;
}
export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  truncated: boolean;
}
export type PreparationLog = (
  phase: "setup" | "startup",
  result: ExecResult,
) => Promise<void>;
export interface Provider {
  readonly kind: "fake" | "solari";
  create(
    metadata: Record<string, string>,
    snapshot?: string,
    memoryMb?: number,
  ): Promise<Remote>;
  list(installation: string): Promise<Remote[]>;
  status(id: string): Promise<Environment>;
  prepare(
    id: string,
    base: string,
    baseline: string,
    m: Manifest,
    c: ProjectConfig,
    onLog?: PreparationLog,
  ): Promise<void>;
  collect(
    id: string,
    base: string,
    dest: string,
    c: ProjectConfig,
  ): Promise<Manifest>;
  collectArtifacts(
    id: string,
    base: string,
    dest: string,
    c: ProjectConfig,
  ): Promise<Manifest>;
  observe(
    id: string,
  ): Promise<{ bytes: Uint8Array; width: number; height: number }>;
  act(id: string, action: GuiAction, url: string, base: string): Promise<void>;
  exec(
    id: string,
    base: string,
    command: Command,
    cwd: string,
  ): Promise<ExecResult>;
  files(
    id: string,
    base: string,
    mode: "read" | "write" | "list" | "delete",
    path: string,
    content?: string,
  ): Promise<unknown>;
  snapshot(
    id: string,
    name: string,
    onReceipt?: (snapshot: Snapshot) => Promise<void>,
  ): Promise<Snapshot>;
  snapshots(): Promise<Snapshot[]>;
  restore(id: string, snapshot: string): Promise<void>;
  pause(id: string): Promise<void>;
  resume(id: string): Promise<void>;
  destroy(id: string): Promise<void>;
  deleteSnapshot(id: string): Promise<void>;
  viewer(id: string): Promise<string>;
  close(): void;
}
