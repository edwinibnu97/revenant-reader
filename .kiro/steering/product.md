---
inclusion: always
---

# Product — Revenant Reader

## What it is
Revenant Reader is a local-first RSS/Atom reader that brings a dead technology
(RSS, killed for most people when Google Reader shut down in 2013) back to life
for the agent era. It runs on your own machine, stores everything in one JSON
file, and ships a built-in MCP server so AI agents can read and manage your
feeds with the same state the web UI shows.

## Who it is for
- People who miss RSS and want their feeds back without an account, a cloud,
  or tracking.
- Developers and agent users who want their AI assistant to triage, search,
  and summarize their reading — via MCP, not screen-scraping.

## Key features
- Add any RSS 2.0 / Atom feed by URL; refresh all feeds with one click.
- Unread counts, newest-first reading, full-text search across feeds.
- Mark items read; state persists immediately to `data/feeds.json`.
- MCP server (`mcp-server/index.js`) with five tools: `list_feeds`,
  `search_items`, `mark_read`, `add_feed`, `unread_count`.
- Zero frameworks, one dependency (`fast-xml-parser`), no build step.

## Non-goals (for this hackathon build)
- No user accounts, no sync, no cloud.
- No full-text article extraction (we show the feed's own description).
- No social features, no recommendations engine.
