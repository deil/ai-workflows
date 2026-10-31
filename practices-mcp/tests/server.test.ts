import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function fixture(t: TestContext) {
  const temporary = await mkdtemp(join(tmpdir(), "practices-mcp-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const root = join(temporary, "practices");
  await mkdir(join(root, "jvm"), { recursive: true });
  await writeFile(join(root, "practices-index.md"), "# Map\nRead general.md first.\n");
  await writeFile(join(root, "general.md"), "# General\nKeep it simple.\n");
  await writeFile(join(root, "jvm/java.md"), "# Java\nUse var.\n");
  await writeFile(join(root, "ignored.txt"), "not a practice");
  const client = new Client({ name: "test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../dist/server.js", import.meta.url)), "--practices-dir", root],
    cwd: temporary,
  });
  await client.connect(transport);
  t.after(() => client.close());
  return { client, root, temporary };
}

test("exposes exactly the two read-only tools", async (t) => {
  const { client } = await fixture(t);
  const result = await client.listTools();
  assert.deepEqual(result.tools.map((tool) => tool.name).sort(), [
    "get_practices_index",
    "load_practice",
  ]);
  assert.ok(result.tools.every((tool) => tool.annotations?.readOnlyHint));
});

test("serves the filesystem catalog and nested Markdown names", async (t) => {
  const { client } = await fixture(t);
  const result = await client.callTool({ name: "get_practices_index", arguments: {} });
  assert.ok(!result.isError);
  assert.deepEqual(result.structuredContent, {
    map: "# Map\nRead general.md first.\n",
    names: ["general.md", "jvm/java.md", "practices-index.md"],
  });
});

test("loads complete nested practice contents", async (t) => {
  const { client } = await fixture(t);
  const result = await client.callTool({
    name: "load_practice",
    arguments: { name: "jvm/java.md" },
  });
  assert.ok(!result.isError);
  assert.deepEqual(result.content, [{ type: "text", text: "# Java\nUse var.\n" }]);
});

test("loads updated contents without restarting", async (t) => {
  const { client, root } = await fixture(t);
  await client.callTool({ name: "load_practice", arguments: { name: "general.md" } });
  await writeFile(join(root, "general.md"), "# Updated\n");
  const result = await client.callTool({
    name: "load_practice",
    arguments: { name: "general.md" },
  });
  assert.ok(!result.isError);
  assert.deepEqual(result.content, [{ type: "text", text: "# Updated\n" }]);
});

test("refreshes the map and file inventory without restarting", async (t) => {
  const { client, root } = await fixture(t);
  await client.callTool({ name: "get_practices_index", arguments: {} });
  await writeFile(join(root, "database.md"), "# Database\n");
  await writeFile(join(root, "practices-index.md"), "# Updated map\n");
  const result = await client.callTool({ name: "get_practices_index", arguments: {} });
  assert.ok(!result.isError);
  assert.deepEqual(result.structuredContent, {
    map: "# Updated map\n",
    names: ["database.md", "general.md", "jvm/java.md", "practices-index.md"],
  });
});

for (const name of ["missing.md", "ignored.txt", "../outside.md", "/etc/passwd"]) {
  test(`returns an MCP error for ${name}`, async (t) => {
    const { client } = await fixture(t);
    const result = await client.callTool({ name: "load_practice", arguments: { name } });
    assert.equal(result.isError, true);
  });
}

test("neither advertises nor reads external symlinks", async (t) => {
  const { client, root, temporary } = await fixture(t);
  const outside = join(temporary, "outside.md");
  await writeFile(outside, "private");
  await symlink(outside, join(root, "external.md"));
  const listing = await client.callTool({ name: "get_practices_index", arguments: {} });
  assert.deepEqual(listing.structuredContent, {
    map: "# Map\nRead general.md first.\n",
    names: ["general.md", "jvm/java.md", "practices-index.md"],
  });
  const result = await client.callTool({
    name: "load_practice",
    arguments: { name: "external.md" },
  });
  assert.equal(result.isError, true);
});
