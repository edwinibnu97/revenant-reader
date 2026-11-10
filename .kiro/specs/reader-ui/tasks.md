# Tasks — reader-ui spec

- [x] 1. Page structure (`public/index.html`)
  - [x] 1.1 Top bar: brand, tagline, search input, refresh button
  - [x] 1.2 Sidebar: feed list, add-feed form, local-first hint
  - [x] 1.3 Reader pane: title, meta, status line, item list
  - [x] 1.4 Footer with version + no-tracking statement
- [x] 2. Behavior (`public/app.js`)
  - [x] 2.1 Load feeds + render sidebar with unread counts
  - [x] 2.2 Render items (feed view + all-unread view, newest-first)
  - [x] 2.3 Mark-read flow (POST /api/read, then refresh counts)
  - [x] 2.4 Debounced search via /api/search, restore on clear
  - [x] 2.5 Add-feed form with inline error handling
  - [x] 2.6 Refresh-all with new-item/failed-feed summary
  - [x] 2.7 HTML-escape all feed-supplied text (`esc()`)
- [x] 3. Styling (`public/styles.css`)
  - [x] 3.1 Graveyard theme (dark, bone-white, spectral green accent)
  - [x] 3.2 Serif display headings, system sans body
  - [x] 3.3 Read items dimmed; responsive single-column under 720px
- [x] 4. Manual verification (dev server)
  - [x] 4.1 Load page, confirm seed feeds render with counts
  - [x] 4.2 Add a feed, mark items read, search, refresh — verify each
  - [x] 4.3 Confirm an invalid feed URL shows an inline error
  (verified 10 Nov 2026 via live smoke test on port 3100: page + assets 200,
  HN 30 + NASA 10 items fetched live, search works, read-all works, OPML
  export/import works, duplicate add → 409, unknown delete → 404, bad feed
  URL → error JSON surfaced in `#add-error`. No headless browser in the VM,
  so the checks are API-level + code-path, not click-tested.)
- [x] 5. Follow-up (not blocking the scaffold)
  - [x] 5.1 Keyboard shortcuts (j/k to move, x to mark read)
  - [x] 5.2 Per-feed "last refreshed" time in the sidebar
  - [ ] 5.3 Headless DOM smoke test for the UI
- [x] 6. Reader v0.2.0 features (10 Nov 2026)
  - [x] 6.1 Remove-feed (×) button per feed in the sidebar (with confirm)
  - [x] 6.2 Unread-only / all-items filter per feed + mark-all-read button
  - [x] 6.3 OPML export link + import file picker in the sidebar
  - [x] 6.4 Refresh errors (`lastError`) shown under the feed in the sidebar
