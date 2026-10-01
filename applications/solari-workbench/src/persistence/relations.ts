import type { Tables } from "../shared/model.js";
export interface Relation {
  role: string;
  kind: keyof Tables;
  id: string;
}
export function relations<K extends keyof Tables>(
  kind: K,
  value: Tables[K],
): Relation[] {
  const result: Relation[] = [];
  const add = (role: string, target: keyof Tables, id: string | undefined) => {
    if (id) result.push({ role, kind: target, id });
  };
  switch (kind) {
    case "imports": {
      const v = value as Tables["imports"];
      add("project", "projects", v.projectId);
      break;
    }
    case "runs": {
      const v = value as Tables["runs"];
      add("project", "projects", v.projectId);
      add("import", "imports", v.importId);
      add("parentCase", "cases", v.parentCaseId);
      break;
    }
    case "operations": {
      const v = value as Tables["operations"];
      add("run", "runs", v.runId);
      break;
    }
    case "checkpoints": {
      const v = value as Tables["checkpoints"];
      add("run", "runs", v.runId);
      add("operation", "operations", v.operationId);
      break;
    }
    case "cases": {
      const v = value as Tables["cases"];
      add("run", "runs", v.runId);
      add("checkpoint", "checkpoints", v.checkpointId);
      for (const id of v.artifacts) add("artifact", "artifacts", id);
      break;
    }
    case "artifacts": {
      const v = value as Tables["artifacts"];
      add("run", "runs", v.runId);
      add("operation", "operations", v.operationId);
      break;
    }
    case "observations": {
      const v = value as Tables["observations"];
      add("run", "runs", v.runId);
      add("artifact", "artifacts", v.artifactId);
      break;
    }
    case "resources": {
      const v = value as Tables["resources"];
      add("run", "runs", v.runId);
      add("operation", "operations", v.operationId);
      break;
    }
  }
  return result;
}
