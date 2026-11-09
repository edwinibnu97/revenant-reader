---
inclusion: fileMatch
fileMatchPattern: ["tests/**/*.js"]
---

# Testing standards — Revenant Reader

- Tests use the built-in runner: `node --test tests/` — no test framework.
- Every parser change gets a fixture case in `tests/fixtures/` first.
- MCP tests spawn the real server over stdio and drive it with JSON-RPC —
  never mock the transport.
- Tests must pass with `npm test` before a spec's tasks are marked done.
- Do not commit tests that need network access; live-feed checks are manual
  smoke tests (see the feed-engine spec, task 5.3).
