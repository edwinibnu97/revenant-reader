# Revenant Reader ☠

**RSS, back from the dead.** A local-first feed reader with a built-in MCP server,
so AI agents can read your feeds too.

Built for **Kiroween 2026** (Devpost, category: **Resurrection**) — resurrecting
RSS, the technology Google Reader took to the grave in 2013, for the agent era.

## What it does

- Add any RSS 2.0 / Atom feed by URL; refresh all feeds with one click.
  Remove feeds from the sidebar (×) or via the API / MCP.
- Unread counts, newest-first reading, full-text search across feeds.
- Unread-only / all-items filter per feed, mark-all-read, and keyboard
  shortcuts (j/k to move, x to mark read, Enter to open).
- **OPML import/export** — move subscriptions in and out with any reader.
- Mark items read — state persists immediately to `data/feeds.json`.
- Per-feed "last refreshed" time and refresh errors shown in the sidebar;
  conditional fetches (`etag` / `Last-Modified`) skip unchanged feeds, and
  stored descriptions are capped so one verbose feed can't bloat the file.
- **MCP server** (`mcp-server/index.js`) with nine tools — `list_feeds`,
  `search_items`, `mark_read`, `mark_all_read`, `add_feed`, `remove_feed`,
  `unread_count`, `export_opml`, `import_opml` — plus feed resources
  (`revenant://feed/<id>`) and a `morning-briefing` prompt, all sharing the
  exact same store as the web UI. What the agent does shows up in the
  browser, and vice versa.
- Zero frameworks, one dependency (`fast-xml-parser`), no build step, no
  tracking, no account, no cloud.

## Run it

```bash
npm install
npm start          # http://127.0.0.1:3000
npm test           # node --test tests/
npm run check      # node --check on every JS file
npm run mcp        # start the MCP server on stdio
```

First run seeds two feeds (Hacker News, NASA). Add your own from the sidebar.

## How Kiro was used

This project was built **spec-first**, the way Kiro is designed to be used:

- **Specs** — three specs under `.kiro/specs/` (`feed-engine`, `reader-ui`,
  `mcp-server`), each with `requirements.md` (user stories + acceptance
  criteria), `design.md` (architecture + sequence diagrams), and `tasks.md`
  (trackable checkboxes, marked done only when verified).
- **Steering** — `.kiro/steering/` holds `product.md`, `tech.md`,
  `structure.md` (always-on) plus `api-standards.md` and
  `testing-standards.md` (fileMatch), so every Kiro session follows the same
  conventions without being told twice.
- **Agent Hooks** — `.kiro/hooks/` automates the workflow: `lint-on-save`
  runs `node --check` on every saved JS file, `test-on-stop` runs the full
  test suite when a session ends, and `spec-sync` prompts the agent to keep
  spec task checklists honest after source changes.
- **MCP** — `.kiro/settings/mcp.json` wires the project's own MCP server
  (`revenant`) into Kiro, and `.kiro/agents/revenant-librarian.json` defines
  a custom librarian agent with that server + the steering files.
- **Kiro CLI 3.1.0** is installed on the build VM (`~/.local/bin/kiro-cli`);
  sign-in (Google / GitHub / AWS Builder ID) is a human step — see below.

The specs, steering, hooks, and MCP config are all in `.kiro/` at the repo
root, as the Kiroween rules require. The directory is intentionally **not**
in `.gitignore`.

## What still needs a human

- **Kiro account**: sign in to Kiro CLI (`kiro-cli login`) with Google, GitHub,
  or AWS Builder ID (free). Then request the **4,000 free Kiroween credits**
  on the Devpost Resources tab **by Dec 1, 12:00 PM PT**.
- **GitHub repo**: push this project to a **public** GitHub repo (open-source
  license included — MIT). The repo URL is what Devpost judges.
- **Demo video**: under 3 minutes, public on YouTube, showing the app working.
- **Devpost submission**: by **Fri Dec 4, 2026, 2:00 PM Pacific** — category
  Resurrection, plus the write-up on how Kiro was used.

## Roadmap (from the specs)

- [x] Per-feed `lastError` shown in the UI when a refresh fails.
- [x] `etag` / `Last-Modified` support to skip unchanged feeds.
- [x] MCP `resources/list` + `resources/read`, and a "morning briefing" prompt.
- [x] Keyboard shortcuts (j/k to move, x to mark read).
- [ ] Headless DOM smoke test for the UI.
- [ ] Live deployment URL for the Devpost submission.

## License

MIT — see `LICENSE`.
