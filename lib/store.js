'use strict';

/**
 * Tiny JSON-file store for feeds + items. No database, no dependencies.
 * Data file: data/feeds.json (gitignored; data/seed.json ships the defaults).
 *
 * Shape:
 *   { feeds: [ { id, url, title, link, description, lastFetched,
 *                items: [ { id, title, link, description, pubDate, read } ] } ] }
 */

const fs = require('fs');
const path = require('path');

// Allow tests to redirect storage to an isolated temp directory.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'feeds.json');
const SEED_FILE = path.join(__dirname, '..', 'data', 'seed.json'); // seed always from repo

function defaultState() {
  return { feeds: [] };
}

function loadSeed() {
  try {
    const raw = fs.readFileSync(SEED_FILE, 'utf8');
    const seed = JSON.parse(raw);
    return {
      feeds: (seed.feeds || []).map((f) => ({
        id: f.id,
        url: f.url,
        title: f.title || f.url,
        link: '',
        description: '',
        lastFetched: null,
        lastError: null,
        etag: null,
        lastModified: null,
        items: [],
      })),
    };
  } catch {
    return defaultState();
  }
}

function load() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const state = JSON.parse(raw);
    if (!state || !Array.isArray(state.feeds)) return defaultState();
    return state;
  } catch {
    // First run (or corrupt file): start from seed, then persist.
    const state = loadSeed();
    save(state);
    return state;
  }
}

function save(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function nextId(state) {
  return `feed-${state.feeds.length + 1}-${Date.now().toString(36)}`;
}

/** Cap stored descriptions so one verbose feed cannot bloat the file. */
const MAX_DESCRIPTION_LENGTH = 2000;

/** Merge freshly parsed items into a feed, deduping by id/link. Returns count of new items. */
function mergeItems(feed, parsedItems) {
  const seen = new Set(feed.items.map((i) => `${i.id}|${i.link}`));
  let added = 0;
  for (const item of parsedItems) {
    const key = `${item.id}|${item.link}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const description = typeof item.description === 'string'
      ? item.description.slice(0, MAX_DESCRIPTION_LENGTH)
      : item.description;
    feed.items.push({ ...item, description, read: false });
    added += 1;
  }
  // Newest first; undated items sink to the bottom.
  feed.items.sort((a, b) => {
    const da = a.pubDate ? Date.parse(a.pubDate) : 0;
    const db = b.pubDate ? Date.parse(b.pubDate) : 0;
    return db - da;
  });
  // Cap stored items per feed so the file stays small.
  if (feed.items.length > 200) feed.items.length = 200;
  return added;
}

function unreadCount(feed) {
  return feed.items.reduce((n, i) => n + (i.read ? 0 : 1), 0);
}

module.exports = { load, save, nextId, mergeItems, unreadCount, DATA_FILE };
