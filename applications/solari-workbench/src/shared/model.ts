import type { ProjectConfig, Actor } from "./contracts.js";
export type Environment =
  | "absent"
  | "creating"
  | "running"
  | "pausing"
  | "paused"
  | "resuming"
  | "restoring"
  | "deleting"
  | "deleted"
  | "unknown";
export interface Entry {
  path: string;
  bytes: number;
  mode: number;
  sha256: string;
}
export interface Manifest {
  schemaVersion: 1;
  entries: Entry[];
  digest: string;
  bytes: number;
  excluded: string[];
  untracked: string[];
  head: string | null;
  dirty: boolean;
}
export interface Project {
  id: string;
  root: string;
  config: ProjectConfig;
}
export interface Import {
  id: string;
  projectId: string;
  baseline: string;
  manifest: Manifest;
  createdAt: number;
}
export interface Run {
  id: string;
  projectId: string;
  importId: string;
  label: string;
  providerId?: string;
  parentCaseId?: string;
  guestBase: string;
  generation: number;
  revision: number;
  environment: Environment;
  outcome: "pending" | "running" | "succeeded" | "failed" | "canceled";
  admission: "enabled" | "held";
  cleanup: "not_requested" | "pending" | "complete" | "blocked";
  slot: boolean;
  createdAt: number;
  lastWork: number;
  activeSince: number;
  activeMs: number;
  expiresAt: number;
  memoryMb: number;
}
export interface Operation {
  id: string;
  requestId: string;
  fingerprint: string;
  runId?: string;
  action: string;
  actor: Actor;
  args: Record<string, unknown>;
  state:
    "queued" | "executing" | "succeeded" | "failed" | "uncertain" | "canceled";
  createdAt: number;
  finishedAt?: number;
  result?: unknown;
  error?: { code: string; message: string; nextAction: string };
}
export interface Checkpoint {
  id: string;
  runId: string;
  providerId?: string;
  name: string;
  label: string;
  digest: string;
  availability: "available" | "unverified" | "deleted" | "missing";
  memoryMb: number;
  createdAt: number;
  expiresAt: number;
  pinned: boolean;
  operationId: string;
}
export interface Case {
  id: string;
  runId: string;
  checkpointId: string;
  title: string;
  expected: string;
  observed: string;
  steps: string[];
  context: string;
  artifacts: string[];
  createdAt: number;
  importDigest: string;
  sourceDigest: string;
}
export interface Artifact {
  id: string;
  runId: string;
  kind: string;
  path: string;
  bytes: number;
  sha256: string;
  createdAt: number;
  operationId?: string;
  publicExport: false;
}
export interface Observation {
  id: string;
  runId: string;
  generation: number;
  revision: number;
  width: number;
  height: number;
  createdAt: number;
  artifactId: string;
}
export interface RecoveryResource {
  id: string;
  kind: "desktop" | "checkpoint";
  providerId: string;
  runId?: string;
  operationId?: string;
  state: string;
  assignment: "assigned" | "unresolved";
  lastSeenAt: number;
}
export interface Tables {
  resources: RecoveryResource;
  projects: Project;
  imports: Import;
  runs: Run;
  operations: Operation;
  checkpoints: Checkpoint;
  cases: Case;
  artifacts: Artifact;
  observations: Observation;
}
