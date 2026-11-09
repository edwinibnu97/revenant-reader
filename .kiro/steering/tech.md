---
inclusion: always
---

# Tech stack — Revenant Reader

- **Runtime:** Node.js >= 20 (uses global `fetch`, `AbortSignal.timeout`, `node:test`).
- **HTTP server:** plain `node:http` in `server.js` — no framework.
- **Feed parsing:** `fast-xml-parser` (the project's only dependency).
- **Storage:** one JSON file, `data/feeds.json`, via `lib/store.js` (atomic save: temp file + rename).
- **Front end:** `public/` — plain HTML + CSS + vanilla JS, no bundler, no third-party scripts or fonts.
- **MCP server:** `mcp-server/index.js` — hand-rolled JSON-RPC 2.0 over stdio, protocol version `2024-11-05`, no SDK.
- **Tests:** `node --test tests/` (built-in runner, no test framework).
- **Scripts:** `npm start` (server on 127.0.0.1:3000), `npm run mcp` (MCP server),
  `npm test`, `npm run check` (`node --check` on every JS file).

## Conventions
- CommonJS (`require`), `'use strict'` at the top of every JS file.
- No new dependencies without a note in the relevant spec's design doc.
- Secrets never belong in the repo: there are no API keys in this project by design.
- All feed-supplied text is escaped before it reaches the DOM (`esc()` in `public/app.js`).
