import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export async function createServer(directory: string): Promise<McpServer> {
  const root = await realpath(directory);
  if (!(await stat(root)).isDirectory()) {
    throw new Error(`Not a practices directory: ${directory}`);
  }

  async function practicePath(name: string): Promise<string> {
    if (isAbsolute(name) || name.split(/[\\/]/).includes("..") || extname(name) !== ".md") {
      throw new Error("Use a relative Markdown name from get_practices_index.");
    }
    const path = await realpath(resolve(root, name));
    const fromRoot = relative(root, path);
    if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
      throw new Error("Practice must be inside the practices directory.");
    }
    if (!(await stat(path)).isFile()) {
      throw new Error(`Not a practice file: ${name}`);
    }
    return path;
  }

  async function readPractice(name: string): Promise<string> {
    return readFile(await practicePath(name), "utf8");
  }

  async function namesUnder(directoryName = ""): Promise<string[]> {
    const names: string[] = [];
    for (const entry of await readdir(resolve(root, directoryName), { withFileTypes: true })) {
      const name = directoryName ? `${directoryName}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        names.push(...(await namesUnder(name)));
      } else if (extname(name) === ".md") {
        try {
          await practicePath(name);
          names.push(name);
        } catch {
          // Do not advertise broken links or files outside the served directory.
        }
      }
    }
    return names.sort();
  }

  const server = new McpServer(
    { name: "practices", version: "0.1.0" },
    {
      instructions:
        "At coding-task startup call get_practices_index and follow its routing map throughout the task. " +
        "Use load_practice for unconditional practices and before entering each relevant area. " +
        "Catalog paths refer to files on this server, not the project being edited.",
    },
  );

  server.registerTool(
    "get_practices_index",
    {
      description:
        "Get the practices routing map and available names. Call at task startup; the map specifies unconditional and on-demand loading rules.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const result = { map: await readPractice("practices-index.md"), names: await namesUnder() };
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );

  server.registerTool(
    "load_practice",
    {
      description:
        "Load a complete practice by relative name from get_practices_index, e.g. jvm/java.md. Reads the local file afresh on every call.",
      inputSchema: { name: z.string().min(1) },
      annotations: { readOnlyHint: true },
    },
    async ({ name }) => ({ content: [{ type: "text", text: await readPractice(name) }] }),
  );

  return server;
}
