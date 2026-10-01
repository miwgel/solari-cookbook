import { test, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { join, resolve } from "node:path";
import { setup, started, run } from "../helpers.js";
import { createServer } from "../../src/server/server.js";
import { privateWrite } from "../../src/persistence/store.js";
test("actual stdio transport delivers a decodable PNG image block and structured status", async () => {
  const h = await setup();
  const r = await started(h);
  const app = await createServer(h.w, "synthetic-mcp-token", 44318);
  await app.listen({ host: "127.0.0.1", port: 44318 });
  privateWrite(
    join(h.store.dir, "service.json"),
    JSON.stringify({
      url: "http://127.0.0.1:44318",
      token: "synthetic-mcp-token",
    }),
  );
  const client = new Client({
    name: "workbench-test-client",
    version: "1.0.0",
  });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", resolve("src/cli.ts"), "mcp"],
    env: { PATH: process.env.PATH ?? "", WORKBENCH_STATE_DIR: h.store.dir },
    stderr: "pipe",
  });
  try {
    await client.connect(transport);
    const list = await client.listTools();
    expect(list.tools).toHaveLength(12);
    const observation = await client.callTool({
      name: "workbench_observe",
      arguments: { runId: r.id },
    });
    const content = observation.content as {
      type: string;
      mimeType?: string;
      data?: string;
      text?: string;
    }[];
    expect(content[0].type).toBe("image");
    expect(content[0].mimeType).toBe("image/png");
    const bytes = Buffer.from(content[0].data!, "base64");
    expect([...bytes.subarray(0, 8)]).toEqual([
      137, 80, 78, 71, 13, 10, 26, 10,
    ]);
    expect(bytes.readUInt32BE(16)).toBe(1);
    const status = await client.callTool({
      name: "workbench_status",
      arguments: { id: r.id },
    });
    expect(JSON.stringify(status)).toContain("running");
    h.provider.exec = async () => ({
      exitCode: 0,
      stdout: "界".repeat(16000),
      stderr: "diagnostic".repeat(3000),
      truncated: false,
    });
    const command = await run(h.w, "exec", {
      runId: r.id,
      generation: 1,
      command: { program: "synthetic-log" },
    });
    const fullStatus = await client.callTool({
      name: "workbench_status",
      arguments: { id: command.id },
    });
    const textBlock = (
      fullStatus.content as { type: string; text: string }[]
    ).find((x) => x.type === "text")!;
    expect(Buffer.byteLength(textBlock.text)).toBeLessThanOrEqual(8192);
    const bounded = JSON.parse(textBlock.text);
    expect(bounded.id).toBe(command.id);
    expect(bounded.truncated).toBe(true);
    expect(bounded.result.artifactId).toBe(
      (command.result as { artifactId: string }).artifactId,
    );
    expect(
      (await h.w.readArtifact(bounded.result.artifactId)).bytes.toString(),
    ).toContain("界".repeat(16000));
  } finally {
    await client.close();
    await app.close();
    await h.close();
  }
});
