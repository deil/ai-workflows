# Practices MCP server

Local, read-only stdio MCP server, built with TypeScript and the official MCP SDK.
Serves this repository's `practices/` directly; no files are copied into consuming
projects. Requires Node.js 22+ and pnpm.

## Tools

- **`get_practices_index()`** returns `{ map, names }`: the contents of `practices-index.md`
  and the available relative Markdown paths.
- **`load_practice(name)`** returns a complete file, e.g. `jvm/kotlin-jpa.md`.

Every call reads the filesystem afresh. File and catalog edits and new files are
visible without restarting. Files outside the configured directory are never
served, including symlinks pointing outside it.

## Setup

From this directory:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

The default practices directory is resolved relative to the server, not the
client's working directory. Override it with
`node dist/server.js --practices-dir /absolute/path/to/practices`.

## MCP client configuration

Use these command fields in your client's local/stdio MCP configuration:

```json
{
  "command": "node",
  "args": ["/absolute/path/to/ai-workflows/practices-mcp/dist/server.js"]
}
```

The server advertises instructions to call the catalog and load practices on
demand. If your client does not apply server instructions, add this to your
shared agent instructions:

> At coding-task startup, call the practices MCP server's `get_practices_index` tool.
> Follow its routing map and use `load_practice` for unconditional practices and
> before entering each relevant layer, technology, or concern.

Existing agent context does not automatically refresh when a practice changes;
the next tool call returns the latest content.

## Development

```sh
pnpm dev           # Run TypeScript directly
pnpm lint          # oxlint
pnpm format        # oxfmt
pnpm format:check  # Check formatting
pnpm test          # Build and run real MCP stdio integration tests
pnpm check         # Lint, formatting, build, and tests
```
