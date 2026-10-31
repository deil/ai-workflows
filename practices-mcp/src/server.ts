import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./practices.js";

const { values } = parseArgs({
  options: { "practices-dir": { type: "string" } },
});
const directory =
  values["practices-dir"] ?? fileURLToPath(new URL("../../practices/", import.meta.url));
const server = await createServer(directory);
await server.connect(new StdioServerTransport());
