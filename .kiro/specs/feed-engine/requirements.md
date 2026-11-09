# Requirements — feed-engine spec

## Introduction
The feed engine is the core of Revenant Reader: it fetches RSS 2.0 / Atom feeds
over HTTP, parses them into a normalized shape, and persists feeds + items in a
local JSON store. Everything else (reader UI, MCP server) reads from this store,
so the engine must be correct, idempotent, and honest about failures.

## Glossary
- **Feed**: one subscribed RSS/Atom source (URL + metadata + items).
- **Item**: one entry/article inside a feed (title, link, description, pubDate).
- **Store**: `data/feeds.json`, the single source of truth on disk.
- **Refresh**: re-fetching every subscribed feed and merging only new items.

## Requirements

### Requirement 1: Parse RSS 2.0 and Atom
**User Story:** As a reader, I want to add any standard RSS 2.0 or Atom feed,
so that I can follow sites that still publish feeds.

#### Acceptance Criteria
1. WHEN the engine receives valid RSS 2.0 XML, THE system SHALL return the feed
   title, link, description, and all items with id, title, link, description,
   and pubDate as an ISO string.
2. WHEN the engine receives valid Atom XML, THE system SHALL return the same
   normalized shape, using `updated`/`published` for pubDate and `link rel="alternate"` for links.
3. WHEN the engine receives XML that is neither RSS nor Atom, THE system SHALL
   throw an error naming the problem instead of returning partial data.
4. WHEN an item lacks a title, THE system SHALL use "(no title)" rather than failing.
5. WHEN a pubDate is missing or unparseable, THE system SHALL store `null` and
   sort the item after dated items.

### Requirement 2: Fetch feeds over HTTP
**User Story:** As a reader, I want the app to fetch a feed by URL, so that I
don't have to paste XML myself.

#### Acceptance Criteria
1. WHEN fetching a feed URL, THE system SHALL send a descriptive User-Agent and
   accept RSS/Atom/XML content types.
2. WHEN the fetch takes longer than 15 seconds, THE system SHALL abort and
   report a timeout error.
3. WHEN the server returns a non-2xx status, THE system SHALL report the HTTP
   status instead of treating the body as a feed.
4. WHEN the URL is not http(s), THE system SHALL reject it before fetching.

### Requirement 3: Dedupe and persist
**User Story:** As a reader, I want refreshes to add only genuinely new items,
so that my unread list never fills with duplicates.

#### Acceptance Criteria
1. WHEN merging parsed items, THE system SHALL skip items whose id+link already
   exists in the feed.
2. WHEN merging, THE system SHALL sort items newest-first by pubDate and keep
   at most 200 items per feed.
3. WHEN the store file is missing or corrupt, THE system SHALL start from the
   seed feeds (`data/seed.json`) and persist a fresh store file.
4. WHEN saving, THE system SHALL write atomically (temp file + rename) so a
   crash never leaves a half-written store.

### Requirement 4: Mark items read
**User Story:** As a reader, I want to mark items read, so that my unread count
reflects what I have actually seen.

#### Acceptance Criteria
1. WHEN an item is marked read, THE system SHALL persist the change immediately.
2. WHEN the unread count is requested, THE system SHALL count only items with
   `read === false`.
