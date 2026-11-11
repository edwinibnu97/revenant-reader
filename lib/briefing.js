'use strict';

/**
 * buildBriefing — shared logic for the morning-briefing feature.
 *
 * Collects all unread items across every feed in the given store state,
 * sorts them newest-first (undated items sink to the bottom), caps at
 * `limit`, and returns a stable briefing shape used by both the HTTP API
 * (/api/briefing) and the MCP prompts/get 'morning-briefing' handler.
 *
 * @param {object} state  - Store state from store.load(): { feeds: [...] }
 * @param {number} [limit=10] - Maximum number of items to return.
 * @returns {{ totalUnread: number, feedCount: number, items: Array }}
 *   items shape: { title, link, feedTitle, pubDate, description }
 */
function buildBriefing(state, limit = 10) {
  const unread = [];
  for (const feed of state.feeds) {
    for (const item of feed.items) {
      if (!item.read) {
        unread.push({
          title: item.title,
          link: item.link,
          feedTitle: feed.title,
          pubDate: item.pubDate || null,
          description: item.description || '',
        });
      }
    }
  }

  // Newest-first; undated items get epoch 0 so they sink to the bottom.
  unread.sort(
    (a, b) => (b.pubDate ? Date.parse(b.pubDate) : 0) - (a.pubDate ? Date.parse(a.pubDate) : 0),
  );

  return {
    totalUnread: unread.length,
    feedCount: state.feeds.length,
    items: unread.slice(0, limit),
  };
}

module.exports = { buildBriefing };
