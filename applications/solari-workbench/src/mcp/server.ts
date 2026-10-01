import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { toolSchemas, publicError } from "../shared/contracts.js";
import { toolText } from "./results.js";
import { request } from "../server/client.js";
export async function mcp() {
  const server = new McpServer(
    { name: "solari-workbench", version: "0.1.0" },
    {
      instructions:
        "Workbench operates a remote copy of a registered project. Observe before GUI actions. Preserve a failure as a case, pause it, fork a repair, and export a patch with evidence. Status never resumes desktops. Mutations return durable operation IDs; poll status. Hold and retention controls belong to the human.",
    },
  );
  for (const [name, schema] of Object.entries(toolSchemas)) {
    if (name === "hold" || name === "retain") continue;
    server.registerTool(
      `workbench_${name}`,
      {
        description: `${name} the registered Workbench project or owned run. Read status for operation completion.`,
        inputSchema: schema.shape,
      },
      async (args: Record<string, unknown>) => {
        try {
          const result = (await request(`/api/tools/${name}`, {
            args,
            actor: "agent",
          })) as Record<string, unknown>;
          const image = result.image as
            { mimeType: string; data: string } | undefined;
          if (image) {
            const { image: _image, ...metadata } = result;
            return {
              structuredContent: metadata,
              content: [
                {
                  type: "image" as const,
                  data: image.data,
                  mimeType: image.mimeType,
                },
                { type: "text" as const, text: JSON.stringify(metadata) },
              ],
            };
          }
          const bounded = toolText(result);
          return {
            structuredContent: bounded.data,
            content: [{ type: "text" as const, text: bounded.text }],
          };
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(publicError(error)),
              },
            ],
          };
        }
      },
    );
  }
  await server.connect(new StdioServerTransport());
}
