import { z } from "zod";
export const commandSchema = z
  .object({
    program: z.string().min(1).max(512),
    args: z.array(z.string().max(8192)).max(128).default([]),
    timeoutMs: z.number().int().min(100).max(120000).default(60000),
  })
  .strict();
const localUrl = z
  .string()
  .url()
  .refine((s) => {
    const u = new URL(s);
    return (
      u.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname) &&
      !u.username &&
      !u.password
    );
  }, "Use a guest loopback HTTP URL");
export const configSchema = z
  .object({
    schemaVersion: z.literal(1),
    name: z.string().min(1).max(80),
    include: z.array(z.string()).min(1).max(100),
    includeUntracked: z.array(z.string()).max(100).default([]),
    exclude: z.array(z.string()).max(100).default([]),
    setup: z.array(commandSchema).max(10).default([]),
    start: commandSchema,
    ready: z.object({
      url: localUrl,
      timeoutMs: z.number().int().min(100).max(120000).default(60000),
    }),
    openUrl: localUrl,
    artifacts: z.array(z.string()).default([]),
    limits: z
      .object({
        maxActiveMinutes: z.number().min(1).max(60).default(30),
        maxActiveDesktops: z.literal(1).default(1),
      })
      .default({ maxActiveMinutes: 30, maxActiveDesktops: 1 }),
  })
  .strict();
export type ProjectConfig = z.infer<typeof configSchema>;
export type Command = z.infer<typeof commandSchema>;
export const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("click"),
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
  }),
  z.object({ type: z.literal("type"), text: z.string().max(8192) }),
  z.object({
    type: z.literal("key"),
    keys: z.array(z.string().min(1).max(40)).min(1).max(5),
  }),
  z.object({
    type: z.literal("scroll"),
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    direction: z.enum(["up", "down"]),
  }),
  z.object({ type: z.literal("open") }),
]);
export type GuiAction = z.infer<typeof actionSchema>;
export type Actor = "human" | "agent" | "evaluator";
const ident = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const base = {
  requestId: ident,
  runId: ident,
  generation: z.number().int().positive(),
};
export const toolSchemas = {
  start: z.object({
    requestId: ident,
    projectId: ident,
    label: z.string().max(100).default("Investigation"),
  }),
  status: z.object({ id: ident.optional() }),
  observe: z.object({ runId: ident }),
  act: z.object({ ...base, observationId: ident, action: actionSchema }),
  exec: z.object({
    ...base,
    command: commandSchema,
    cwd: z
      .enum(["source", "runtime", "artifacts", "scratch"])
      .default("source"),
  }),
  files: z.object({
    ...base,
    mode: z.enum(["read", "write", "list", "delete"]),
    path: z.string().max(512).default(""),
    content: z
      .string()
      .max(1024 * 1024)
      .optional(),
  }),
  capture: z.object({
    ...base,
    mode: z.enum(["checkpoint", "case"]).default("case"),
    title: z.string().min(1).max(160),
    expected: z.string().max(4000).default(""),
    observed: z.string().max(4000).default(""),
    steps: z.array(z.string().max(1000)).max(30).default([]),
    context: z.string().max(4000).default(""),
  }),
  restore: z.object({ ...base, checkpointId: ident }),
  fork: z.object({ requestId: ident, caseId: ident }),
  export: z.object(base),
  complete: z.object({
    ...base,
    outcome: z.enum(["succeeded", "failed", "canceled"]),
    evidence: z.array(ident).min(1).max(30),
  }),
  lifecycle: z.object({
    ...base,
    action: z.enum(["pause", "resume", "destroy"]),
    apply: z.boolean().default(false),
  }),
  hold: z.object({ requestId: ident, runId: ident, held: z.boolean() }),
  retain: z.object({
    requestId: ident,
    checkpointId: ident,
    pinned: z.boolean(),
  }),
};
export type ToolName = keyof typeof toolSchemas;
export class WorkbenchError extends Error {
  constructor(
    public code: string,
    message: string,
    public nextAction = "Inspect status and retry only after reconciliation.",
    public uncertain = false,
  ) {
    super(message);
  }
}
export function fail(
  code: string,
  message: string,
  nextAction?: string,
): never {
  throw new WorkbenchError(code, message, nextAction);
}
export function publicError(e: unknown) {
  return e instanceof WorkbenchError
    ? {
        code: e.code,
        message: e.message,
        nextAction: e.nextAction,
        uncertain: e.uncertain,
      }
    : {
        code: "UNEXPECTED",
        message:
          "Operation interrupted; private provider details were withheld.",
        nextAction:
          "Inspect operation status; do not repeat uncertain mutations.",
      };
}
