# Requirements — reader-ui spec

## Introduction
The reader UI is the human face of Revenant Reader: a single-page web app
that lists feeds, shows items, and lets the user search and mark items read.
It must work with zero build step (plain HTML/CSS/JS served by `server.js`)
and be usable the moment the server starts.

## Glossary
- **Sidebar**: feed list with unread counts + add-feed form.
- **Reader pane**: the item list for the selected feed (or all unread).
- **Search**: full-text search across item titles and descriptions.

## Requirements

### Requirement 1: Show feeds and unread counts
**User Story:** As a reader, I want to see my feeds with unread counts, so that
I know where the new items are.

#### Acceptance Criteria
1. WHEN the page loads, THE system SHALL fetch `/api/feeds` and render every
   feed with its title and unread count.
2. WHEN a feed has zero unread items, THE system SHALL still list it, with a
   count of 0.
3. WHEN there are no feeds, THE system SHALL show an empty state that explains
   how to add one.

### Requirement 2: Read items
**User Story:** As a reader, I want to scan items newest-first and open the ones
I care about, so that I can catch up quickly.

#### Acceptance Criteria
1. WHEN a feed is selected, THE system SHALL show its items newest-first with
   title, description snippet, and date.
2. WHEN "All unread" is selected, THE system SHALL show unread items from all
   feeds, newest-first, capped at 100.
3. WHEN an item title is clicked, THE system SHALL open the original article in
   a new tab (`target="_blank"`, `rel="noopener noreferrer"`).
4. WHEN "Mark read" is clicked, THE system SHALL persist the change via
   `POST /api/read` and refresh the counts without a full page reload.
5. WHEN an item is read, THE system SHALL render it dimmed.

### Requirement 3: Search across feeds
**User Story:** As a reader, I want to search titles and descriptions across all
feeds, so that I can find an article I half-remember.

#### Acceptance Criteria
1. WHEN the user types in the search box, THE system SHALL query
   `/api/search?q=…` (debounced ~300 ms) and render matches newest-first.
2. WHEN the search box is cleared, THE system SHALL return to the previous
   feed view.
3. WHEN a search returns no matches, THE system SHALL show an empty state.

### Requirement 4: Add and refresh feeds
**User Story:** As a reader, I want to add a feed by URL and refresh all feeds,
so that the reader grows with my interests.

#### Acceptance Criteria
1. WHEN a valid feed URL is submitted, THE system SHALL add the feed and switch
   the reader pane to it.
2. WHEN the URL is invalid or the feed cannot be fetched, THE system SHALL show
   the server's error message inline without losing the typed URL.
3. WHEN "Refresh all" is clicked, THE system SHALL re-fetch every feed and
   report how many new items arrived and how many feeds failed.

### Requirement 5: No build step, no tracking
**User Story:** As a user, I want the UI to run from plain files with no
tracking, so that the app stays local-first and trivially auditable.

#### Acceptance Criteria
1. THE UI SHALL be plain HTML + CSS + vanilla JS, with no bundler and no
   third-party scripts or fonts.
2. THE UI SHALL escape all feed-supplied text before inserting it into the DOM
   (no `innerHTML` with untrusted strings).
