---
inclusion: always
---

# Project structure — Revenant Reader

```
revenant-reader/
├── server.js                 # HTTP server + JSON API + static files
├── lib/
│   ├── rss.js                # RSS 2.0 / Atom parser (fast-xml-parser)
│   └── store.js              # JSON-file store: load/save/merge/unreadCount
├── public/
│   ├── index.html            # Reader UI structure
│   ├── app.js                # UI behavior (vanilla JS)
│   └── styles.css            # Graveyard theme
├── mcp-server/
│   └── index.js              # MCP server (stdio JSON-RPC, 5 tools)
├── data/
│   ├── seed.json             # Default feeds on first run (HN, NASA)
│   └── feeds.json            # Runtime state (gitignored)
├── tests/
│   ├── rss.test.js           # Parser tests (RSS + Atom fixtures)
│   ├── mcp.test.js           # MCP stdio session tests + store tests
│   └── fixtures/             # sample-rss.xml, sample-atom.xml
├── .kiro/
│   ├── specs/                # feed-engine, reader-ui, mcp-server (requirements/design/tasks)
│   ├── steering/             # product.md, tech.md, structure.md, api-standards.md, testing-standards.md
│   ├── hooks/                # lint-on-save, test-on-stop, spec-sync (+ scripts/)
│   ├── settings/mcp.json     # Workspace MCP config (revenant server)
│   └── agents/               # revenant-librarian custom agent
├── README.md
├── LICENSE (MIT)
└── package.json
```

## Rules
- The `.kiro/` directory is **never** gitignored (Kiroween rules: it must be in the repo).
- `node_modules/` and `data/feeds.json` are gitignored; `data/seed.json` is committed.
- Keep modules small and single-purpose; `server.js` and `mcp-server/index.js`
  are thin callers over `lib/` — shared logic lives in `lib/`, never duplicated.
- Every new feature starts as a spec under `.kiro/specs/` (requirements → design → tasks)
  before code is written.
