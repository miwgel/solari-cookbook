const maxTextBytes = 8192;
function trim(
  value: unknown,
  stringBytes: number,
  arrayItems: number,
): unknown {
  if (typeof value === "string") {
    if (Buffer.byteLength(value) <= stringBytes) return value;
    return Buffer.from(value).subarray(0, stringBytes).toString("utf8") + "…";
  }
  if (Array.isArray(value))
    return value
      .slice(0, arrayItems)
      .map((item) => trim(item, stringBytes, arrayItems));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        trim(item, stringBytes, arrayItems),
      ]),
    );
  return value;
}
export function toolText(result: Record<string, unknown>) {
  let data = result;
  let text = JSON.stringify(data);
  if (Buffer.byteLength(text) <= maxTextBytes) return { text, data };
  for (const [stringBytes, arrayItems] of [
    [1024, 12],
    [256, 5],
    [64, 2],
  ]) {
    data = {
      ...(trim(result, stringBytes, arrayItems) as Record<string, unknown>),
      truncated: true,
      nextAction:
        "Use the retained artifact references for full bounded output; narrow status with a run or operation ID.",
    };
    text = JSON.stringify(data);
    if (Buffer.byteLength(text) <= maxTextBytes) return { text, data };
  }
  const artifacts = new Set<string>();
  const collect = (value: unknown) => {
    if (
      typeof value === "string" &&
      /^artifact_[a-zA-Z0-9_-]+$/.test(value) &&
      artifacts.size < 30
    )
      artifacts.add(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object")
      Object.values(value).forEach(collect);
  };
  collect(result);
  data = {
    id: result.id,
    runId: result.runId,
    state: result.state,
    truncated: true,
    artifactIds: [...artifacts],
    nextAction:
      "Narrow status with a run or operation ID. Full bounded logs remain in the referenced artifacts.",
  };
  return { text: JSON.stringify(data), data };
}
