# Requirements — mcp-server spec

## Introduction
The MCP server makes Revenant Reader agent-native: any MCP client (Kiro,
Claude, other agents) can list feeds, search items, mark items read, and add
feeds — using the same store the web UI uses. This is the feature that turns a
resurrected RSS reader into a reader *for the agent era*.

## Glossary
- **MCP**: Model Context Protocol; the server speaks JSON-RPC 2.0 over stdio
  (newline-delimited), protocol version `2024-11-05`.
- **Tool**: one callable capability exposed via `tools/list` / `tools/call`.
- **Shared store**: `data/feeds.json` — the MCP server and the web app read
  and write the same file.

## Requirements

### Requirement 1: Speak MCP over stdio
**User Story:** As an agent developer, I want to connect Kiro to the reader via
MCP, so that the agent can work with my feeds.

#### Acceptance Criteria
1. WHEN a client sends `initialize`, THE system SHALL reply with
   `protocolVersion: "2024-11-05"`, `capabilities: { tools: {} }`, and
   `serverInfo: { name: "revenant-reader", version: "0.1.0" }`.
2. WHEN a client sends `ping`, THE system SHALL reply with an empty result.
3. WHEN a client sends a notification (no `id`), THE system SHALL send no reply.
4. WHEN a client sends an unknown method, THE system SHALL reply with JSON-RPC
   error `-32601` (Method not found).
5. WHEN a line on stdin is malformed JSON, THE system SHALL ignore it and keep
   serving.

### Requirement 2: Expose the five reader tools
**User Story:** As an agent, I want tools to list, search, read, and add feeds,
so that I can manage the reader on the user's behalf.

#### Acceptance Criteria
1. WHEN a client calls `tools/list`, THE system SHALL return exactly five tools:
   `list_feeds`, `search_items`, `mark_read`, `add_feed`, `unread_count`,
   each with a description and an `inputSchema`.
2. WHEN `list_feeds` is called, THE system SHALL return every feed with id,
   url, title, unread count, total, and lastFetched.
3. WHEN `search_items` is called with a query, THE system SHALL return up to
   20 matches newest-first; an empty query SHALL return an error result.
4. WHEN `mark_read` is called with a valid feedId+itemId, THE system SHALL
   persist the change and report the remaining unread count; unknown ids SHALL
   return an error result.
5. WHEN `add_feed` is called with a valid http(s) URL, THE system SHALL fetch,
   parse, persist, and report the added item count; invalid or duplicate URLs
   SHALL return an error result (never throw the server down).
6. WHEN `unread_count` is called, THE system SHALL return the total unread
   count and the number of feeds.

### Requirement 3: Share state with the web app
**User Story:** As a user, I want what the agent does in my feeds to show up
immediately in the web UI (and vice versa).

#### Acceptance Criteria
1. THE MCP server SHALL read and write `data/feeds.json` through the same
   `lib/store.js` module as the HTTP server.
2. WHEN the MCP server marks an item read, THE web UI SHALL show the updated
   unread count on its next load/refresh.
3. THE MCP server SHALL require no network access of its own beyond fetching a
   feed URL when `add_feed` is called.

### Requirement 4: Zero-dependency, Kiro-wired
**User Story:** As a maintainer, I want the MCP server to run with plain Node
and be one config line away in Kiro.

#### Acceptance Criteria
1. THE server SHALL run with `node mcp-server/index.js` and no `npm install`
   beyond the project's single dependency (`fast-xml-parser`).
2. `.kiro/settings/mcp.json` SHALL declare the server as `revenant` with
   `command: "node"` and `args: ["mcp-server/index.js"]`.
3. `.kiro/agents/revenant-librarian.json` SHALL define a custom agent with
   access to the `revenant` server and the project's steering files.
