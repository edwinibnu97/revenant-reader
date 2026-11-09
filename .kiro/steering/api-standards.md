---
inclusion: fileMatch
fileMatchPattern: ["server.js", "lib/**/*.js", "mcp-server/**/*.js"]
---

# API standards — Revenant Reader

- All API responses are JSON. Success: `200`/`201` with the payload. Errors:
  `400` bad input, `404` unknown feed/item/route, `409` duplicate feed,
  `502` feed fetch failed, `500` unexpected.
- Error bodies are always `{ "error": "<human-readable message>" }`.
- The HTTP server and the MCP server share logic through `lib/` — never
  re-implement fetching, parsing, or merging in a second place.
- Feed fetches always use a descriptive `User-Agent` and a 15-second timeout
  (`AbortSignal.timeout(15000)`).
- Never log feed contents or full item bodies; log only counts and ids.
- Validate URLs with `/^https?:\/\/.+/` before fetching; never fetch
  user-supplied `file://` or other schemes.
- Keep the public API surface small: if a new endpoint is needed, add it to
  the relevant spec's requirements first.
