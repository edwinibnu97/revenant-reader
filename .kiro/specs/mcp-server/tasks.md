# Tasks — mcp-server spec

- [x] 1. Implement the stdio JSON-RPC transport (`mcp-server/index.js`)
  - [x] 1.1 Newline-delimited stdin parsing; one JSON reply per line on stdout
  - [x] 1.2 `initialize` → protocolVersion 2024-11-05, tools capability, serverInfo
  - [x] 1.3 `ping` → empty result; notifications → no reply
  - [x] 1.4 Unknown methods → JSON-RPC -32601; malformed lines ignored
- [x] 2. Implement the five tools
  - [x] 2.1 `list_feeds` (id, url, title, unread, total, lastFetched)
  - [x] 2.2 `search_items` (up to 20 hits, newest-first; empty query errors)
  - [x] 2.3 `mark_read` (persist + report remaining unread; unknown ids error)
  - [x] 2.4 `add_feed` (fetch + parse + persist via the same path as the HTTP API)
  - [x] 2.5 `unread_count` (total unread + feed count)
- [x] 3. Wire into Kiro
  - [x] 3.1 `.kiro/settings/mcp.json` declares the `revenant` server
  - [x] 3.2 `.kiro/agents/revenant-librarian.json` custom agent with the server + steering resources
- [x] 4. Tests
  - [x] 4.1 `tests/mcp.test.js` — spawn server, initialize, tools/list exact names, unread_count/list_feeds shapes
  - [x] 4.2 Manual: connect the server in Kiro (needs user login) and call `search_items` from a Kiro chat
    (verified 10 Nov 2026: `kiro-cli chat` with the revenant-librarian agent
    called `list_feeds` / `add_feed` through this MCP server successfully)
- [x] 5. Follow-up (not blocking the scaffold)
  - [x] 5.1 `resources/list` + `resources/read` so clients can read a feed as an MCP resource
  - [x] 5.2 `prompts/list` with a "morning briefing" prompt template (top unread items as a digest)
- [x] 6. Reader v0.2.0 tools (10 Nov 2026)
  - [x] 6.1 `remove_feed` tool (removes by id, reports remaining count)
  - [x] 6.2 `mark_all_read` tool
  - [x] 6.3 `export_opml` + `import_opml` tools
  - [x] 6.4 Tests for all of the above in `tests/mcp.test.js`
