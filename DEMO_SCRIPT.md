# Demo Video Script — Revenant Reader (Kiroween 2026)

- **Target:** 2:30 (hard limit 3:00, public YouTube)
- **Live URL:** https://revenant-reader-production.up.railway.app
- **Repo:** https://github.com/edwinibnu97/revenant-reader
- **Category:** Resurrection
- **Narration:** simple English (short sentences, slow pace). Indonesian stage
  directions in *italics*.

## Shot list

| Time | Show on screen | Say (English narration) |
|---|---|---|
| 0:00–0:12 | Live app homepage, address bar visible once | "Google Reader died in 2013. RSS never really died — it just needed a comeback. This is Revenant Reader: Google Reader, resurrected for the agent era." |
| 0:12–0:35 | Sidebar: feed list (Hacker News, NASA), unread counts | "It's a local-first RSS reader. Your feeds, your data — no account, no tracking. It ships with Hacker News and NASA, and you can add any feed in seconds." |
| 0:35–1:05 | Open Hacker News feed; scroll items; press `x` to mark read; press `j` / `k` to move; type a search; toggle unread-only filter | "Read, mark as read, filter to unread only. Search across everything. And it's keyboard-first — J and K to move, X to mark read, Enter to open." |
| 1:05–1:25 | Add a feed via the UI (paste any RSS URL, e.g. a tech blog); hit Refresh; show OPML export button | "Adding a feed takes one URL. Refresh pulls only what's new. And your subscriptions export as OPML — your data leaves with you." |
| 1:25–1:55 | GitHub repo: `mcp-server/index.js` and the `.kiro/` folder | "Here's the twist: Revenant Reader is also an MCP server. Any AI agent can list feeds, search, mark things read — nine tools, plus a morning-briefing prompt. Your reader, readable by your agent." |
| 1:55–2:20 | GitHub repo: `.kiro/` specs (feed-engine, reader-ui, mcp-server), steering files, hooks | "It was built with Kiro: specs drove the feed engine, the UI, and the MCP server. Steering files and hooks kept every change consistent." |
| 2:20–2:30 | Live app again; repo + live URL on screen | "Revenant Reader — RSS, back from the dead. Links below. Thanks for watching." |

## Recording checklist

- [ ] Landscape orientation (phone screen-record, or laptop browser window).
- [ ] Show the address bar once at the start — proves the app is live.
- [ ] Quiet room, speak slowly; one take is fine, small pauses are OK.
- [ ] Before recording: open the live URL and hit Refresh once so Hacker
      News shows ~30 items. (NASA sometimes shows a 429 fetch error — that's
      the feed's rate limit, not a bug; just don't linger on it, demo with
      Hacker News.)
- [ ] Never show passwords, API keys, or terminals with secrets.
- [ ] Keep it under 3:00 — target 2:30 leaves buffer.
- [ ] Upload to YouTube as **Public** (not Unlisted) — Devpost requires a
      public video.

## YouTube details

- **Title:** Revenant Reader — Google Reader, resurrected for the agent era | Kiroween 2026
- **Description:**

```text
Revenant Reader — a local-first RSS reader, resurrected for the agent era.
Built with Kiro for Kiroween 2026 (Resurrection category).

Live app: https://revenant-reader-production.up.railway.app
Source code: https://github.com/edwinibnu97/revenant-reader

Features: feeds with unread counts, search, keyboard shortcuts (j/k/x/Enter),
unread-only filter, OPML export/import, and a built-in MCP server (9 tools +
morning-briefing prompt) so AI agents can read your feeds too.
```
