# Design — reader-ui spec

## Overview
One page, three files, no framework: `public/index.html` (structure),
`public/styles.css` (graveyard theme), `public/app.js` (behavior). The server
serves them statically; all data flows through the JSON API in `server.js`.

## Layout
- **Top bar**: brand ("Revenant Reader", skull mark, tagline) + search box +
  "Refresh all" button.
- **Sidebar**: "All unread" + per-feed buttons with unread count pills;
  add-feed form; a note that data lives in `data/feeds.json`.
- **Reader pane**: feed title + meta line, status line, item cards.
- **Footer**: version + "no tracking, no account, no cloud" statement.
- Mobile (`<=720px`): single column, sidebar stacks above the reader.

## Visual theme
"Graveyard, but tasteful": near-black background (`#0d0f0e`), bone-white text
(`#e8e4d8`), one spectral accent green (`#7ee787`) for links/counts, serif
display type for headings (system Georgia), system sans for body. Read items
render at 55% opacity. No images, no web fonts — the page works offline.

## Behavior
- State lives in `app.js`: `feeds[]`, `currentFeedId` (null = all unread),
  `searchMode`.
- Rendering builds DOM nodes with `textContent`/escaped strings; feed content
  is never inserted via raw `innerHTML` except for static markup with escaped
  values (see `esc()`).
- Search is debounced (~300 ms); clearing the box restores the feed view.
- "Mark read" posts to `/api/read`, then reloads feeds + items (two requests;
  cheap at this scale, no client-side cache to go stale).
- Errors from the API surface in the status line or inline under the form;
  the typed URL is preserved on failure.

## Testing strategy
- Manual: start the server, add the seed feeds, click through every control,
  verify counts update, search returns matches, invalid URL shows an error.
- Automated: API-level coverage lives in the feed-engine spec's tests; the UI
  has no test harness by design (zero-dependency constraint). A later task may
  add a headless DOM smoke test if the UI grows.
