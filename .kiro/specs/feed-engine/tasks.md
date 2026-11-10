# Tasks — feed-engine spec

- [x] 1. Set up the project skeleton
  - [x] 1.1 Create `package.json` (Node >= 20, `fast-xml-parser` dependency, `start`/`test`/`check`/`mcp` scripts)
  - [x] 1.2 Create `data/seed.json` with two stable public feeds (Hacker News, NASA)
- [x] 2. Implement the feed parser (`lib/rss.js`)
  - [x] 2.1 Parse RSS 2.0 channel/items into the normalized shape
  - [x] 2.2 Parse Atom feed/entries (alternate links, updated/published dates)
  - [x] 2.3 Best-effort RSS 1.0 (RDF) support
  - [x] 2.4 Strip HTML/CDATA from descriptions; ISO-normalize pubDate; throw on non-XML/unknown formats
- [x] 3. Implement the JSON store (`lib/store.js`)
  - [x] 3.1 `load()` with seed fallback on missing/corrupt file
  - [x] 3.2 Atomic `save()` via temp file + rename
  - [x] 3.3 `mergeItems()` dedupe by id+link, newest-first sort, 200-item cap
  - [x] 3.4 `unreadCount()` helper
- [x] 4. Wire the parser + store into the HTTP API (`server.js`)
  - [x] 4.1 `POST /api/feeds` (validate URL, fetch, parse, persist)
  - [x] 4.2 `POST /api/refresh` (per-feed results, one bad feed never blocks others)
  - [x] 4.3 `POST /api/read` (persist read state immediately)
- [x] 5. Tests
  - [x] 5.1 `tests/rss.test.js` — RSS + Atom fixtures, rejection cases
  - [x] 5.2 `tests/mcp.test.js` — merge dedupe + ordering
  - [x] 5.3 Live smoke test: add a real feed and refresh against the dev server
    (done 9 Nov 2026: HN 30 items + NASA 10 items fetched live; also fixed hex
    entity decoding `&#x27;` → `'` found during the smoke test)
- [x] 6. Hardening (follow-up, not blocking the scaffold)
  - [x] 6.1 Per-feed `lastError` persisted and shown in the UI when a refresh fails
  - [x] 6.2 Respect `etag` / `Last-Modified` to avoid re-downloading unchanged feeds
  - [x] 6.3 Sanitize description length (cap at ~2,000 chars) to bound store size
  (all done in v0.2.0, 10 Nov 2026: `lastError`/`etag`/`lastModified` stored
  per feed; 304 responses skip re-download; `mergeItems()` caps descriptions)
- [x] 7. Remove a feed (v0.2.0)
  - [x] 7.1 `DELETE /api/feeds/:id` (404 for unknown ids; covered by tests)
  - [x] 7.2 `DATA_DIR` env override in `lib/store.js` so tests use isolated data
- [x] 8. OPML import/export (v0.2.0)
  - [x] 8.1 `lib/opml.js` — `buildOpml()` / `parseOpml()` (nested outlines flattened)
  - [x] 8.2 `GET /api/opml` (download) + `POST /api/opml` (import; per-feed
    results, duplicates skipped, one bad feed never blocks the rest)
  - [x] 8.3 Tests: `tests/opml.test.js` (round-trip, rejection, HTTP flow)
