'use strict';

/**
 * Revenant Reader — HTTP server.
 * Serves the reader UI (public/) and a small JSON API over feeds.
 * Zero frameworks: plain node:http. Storage: data/feeds.json (lib/store.js).
 *
 * API:
 *   GET    /api/feeds              -> [{ id, url, title, link, unread, total, lastFetched, lastError }]
 *   POST   /api/feeds { url }      -> fetch + parse + add feed
 *   DELETE /api/feeds/:id          -> remove a feed; { ok: true, removed: id } or 404
 *   POST   /api/feeds/:id/read-all -> mark all items of a feed read
 *   POST   /api/refresh            -> re-fetch every feed, merge new items
 *   GET    /api/feeds/:id/items    -> items of one feed (newest first)
 *   POST   /api/read { feedId, itemId } -> mark one item read
 *   GET    /api/search?q=...       -> items matching q in title/description
 *   GET    /api/opml               -> download subscriptions as OPML 2.0
 *   POST   /api/opml { opml }      -> import feeds from an OPML document
 *
 * Run:  node server.js        (http://0.0.0.0:3000 by default, or $PORT / $HOST)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const { parseFeed } = require('./lib/rss');
const { buildOpml, parseOpml } = require('./lib/opml');
const store = require('./lib/store');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error('Body too large'));
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Fetch + parse a feed. `conditional` may carry { etag, lastModified } from a
 * previous fetch; when the server answers 304 the feed is unchanged and this
 * returns null instead of a parsed feed.
 * Returns { parsed, etag, lastModified } on success.
 */
async function fetchFeed(url, conditional) {
  const headers = { 'User-Agent': 'RevenantReader/0.2 (+https://github.com/)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' };
  if (conditional) {
    if (conditional.etag) headers['If-None-Match'] = conditional.etag;
    if (conditional.lastModified) headers['If-Modified-Since'] = conditional.lastModified;
  }
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 304) return null;
  if (!res.ok) throw new Error(`Feed fetch failed: HTTP ${res.status}`);
  const xml = await res.text();
  return {
    parsed: parseFeed(xml),
    etag: res.headers.get('etag'),
    lastModified: res.headers.get('last-modified'),
  };
}

function publicFeed(feed) {
  return {
    id: feed.id,
    url: feed.url,
    title: feed.title,
    link: feed.link,
    unread: store.unreadCount(feed),
    total: feed.items.length,
    lastFetched: feed.lastFetched,
    lastError: feed.lastError || null,
  };
}

async function handleApi(req, res, pathname) {
  const state = store.load();

  // GET /api/feeds
  if (req.method === 'GET' && pathname === '/api/feeds') {
    return sendJson(res, 200, { feeds: state.feeds.map(publicFeed) });
  }

  // POST /api/feeds { url }
  if (req.method === 'POST' && pathname === '/api/feeds') {
    const body = await readBody(req);
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    if (!/^https?:\/\/.+/.test(url)) {
      return sendJson(res, 400, { error: 'Provide a valid http(s) feed URL' });
    }
    if (state.feeds.some((f) => f.url === url)) {
      return sendJson(res, 409, { error: 'Feed already added' });
    }
    try {
      const fetched = await fetchFeed(url);
      const parsed = fetched.parsed;
      const feed = {
        id: store.nextId(state),
        url,
        title: parsed.title,
        link: parsed.link,
        description: parsed.description,
        lastFetched: new Date().toISOString(),
        lastError: null,
        etag: fetched.etag,
        lastModified: fetched.lastModified,
        items: [],
      };
      store.mergeItems(feed, parsed.items);
      state.feeds.push(feed);
      store.save(state);
      return sendJson(res, 201, { feed: publicFeed(feed), added: feed.items.length });
    } catch (err) {
      return sendJson(res, 502, { error: `Could not fetch that feed: ${err.message}` });
    }
  }

  // DELETE /api/feeds/:id
  const deleteFeedMatch = pathname.match(/^\/api\/feeds\/([^/]+)$/);
  if (req.method === 'DELETE' && deleteFeedMatch) {
    const id = decodeURIComponent(deleteFeedMatch[1]);
    const idx = state.feeds.findIndex((f) => f.id === id);
    if (idx === -1) return sendJson(res, 404, { error: 'Feed not found' });
    state.feeds.splice(idx, 1);
    store.save(state);
    return sendJson(res, 200, { ok: true, removed: id });
  }

  // POST /api/refresh
  if (req.method === 'POST' && pathname === '/api/refresh') {
    const results = [];
    for (const feed of state.feeds) {
      try {
        const fetched = await fetchFeed(feed.url, feed);
        feed.lastFetched = new Date().toISOString();
        if (!fetched) {
          // 304 Not Modified: nothing new, but the feed is alive.
          feed.lastError = null;
          results.push({ id: feed.id, ok: true, added: 0, notModified: true });
          continue;
        }
        feed.title = fetched.parsed.title || feed.title;
        feed.link = fetched.parsed.link || feed.link;
        const added = store.mergeItems(feed, fetched.parsed.items);
        feed.etag = fetched.etag;
        feed.lastModified = fetched.lastModified;
        feed.lastError = null;
        results.push({ id: feed.id, ok: true, added });
      } catch (err) {
        feed.lastError = err.message;
        results.push({ id: feed.id, ok: false, error: err.message });
      }
    }
    store.save(state);
    return sendJson(res, 200, { results });
  }

  // POST /api/feeds/:id/read-all
  const readAllMatch = pathname.match(/^\/api\/feeds\/([^/]+)\/read-all$/);
  if (req.method === 'POST' && readAllMatch) {
    const feed = state.feeds.find((f) => f.id === decodeURIComponent(readAllMatch[1]));
    if (!feed) return sendJson(res, 404, { error: 'Feed not found' });
    for (const item of feed.items) item.read = true;
    store.save(state);
    return sendJson(res, 200, { ok: true, unread: 0, total: feed.items.length });
  }

  // GET /api/opml — download subscriptions as an OPML 2.0 file
  if (req.method === 'GET' && pathname === '/api/opml') {
    const opml = buildOpml(state);
    res.writeHead(200, {
      'Content-Type': 'text/x-opml; charset=utf-8',
      'Content-Disposition': 'attachment; filename="revenant-reader.opml"',
    });
    res.end(opml);
    return;
  }

  // POST /api/opml { opml } — import feeds from an OPML document
  if (req.method === 'POST' && pathname === '/api/opml') {
    const body = await readBody(req);
    const xml = typeof body.opml === 'string' ? body.opml : '';
    let outlines;
    try {
      outlines = parseOpml(xml);
    } catch (err) {
      return sendJson(res, 400, { error: `Could not parse OPML: ${err.message}` });
    }
    const added = [];
    const skipped = [];
    const failed = [];
    for (const outline of outlines) {
      if (state.feeds.some((f) => f.url === outline.url)) {
        skipped.push({ url: outline.url, reason: 'already added' });
        continue;
      }
      try {
        const fetched = await fetchFeed(outline.url);
        const feed = {
          id: store.nextId(state),
          url: outline.url,
          title: fetched.parsed.title || outline.title,
          link: fetched.parsed.link,
          description: fetched.parsed.description,
          lastFetched: new Date().toISOString(),
          lastError: null,
          etag: fetched.etag,
          lastModified: fetched.lastModified,
          items: [],
        };
        store.mergeItems(feed, fetched.parsed.items);
        state.feeds.push(feed);
        added.push({ id: feed.id, url: feed.url, title: feed.title, items: feed.items.length });
      } catch (err) {
        failed.push({ url: outline.url, error: err.message });
      }
    }
    store.save(state);
    return sendJson(res, 200, { added, skipped, failed });
  }

  // GET /api/feeds/:id/items
  const itemsMatch = pathname.match(/^\/api\/feeds\/([^/]+)\/items$/);
  if (req.method === 'GET' && itemsMatch) {
    const feed = state.feeds.find((f) => f.id === decodeURIComponent(itemsMatch[1]));
    if (!feed) return sendJson(res, 404, { error: 'Feed not found' });
    return sendJson(res, 200, { feed: publicFeed(feed), items: feed.items });
  }

  // POST /api/read { feedId, itemId }
  if (req.method === 'POST' && pathname === '/api/read') {
    const body = await readBody(req);
    const feed = state.feeds.find((f) => f.id === body.feedId);
    if (!feed) return sendJson(res, 404, { error: 'Feed not found' });
    const item = feed.items.find((i) => i.id === body.itemId);
    if (!item) return sendJson(res, 404, { error: 'Item not found' });
    item.read = true;
    store.save(state);
    return sendJson(res, 200, { ok: true, unread: store.unreadCount(feed) });
  }

  // GET /api/search?q=
  if (req.method === 'GET' && pathname === '/api/search') {
    const q = new URL(req.url, `http://${req.headers.host}`).searchParams.get('q') || '';
    const needle = q.trim().toLowerCase();
    if (!needle) return sendJson(res, 200, { items: [] });
    const hits = [];
    for (const feed of state.feeds) {
      for (const item of feed.items) {
        if ((item.title + ' ' + item.description).toLowerCase().includes(needle)) {
          hits.push({ ...item, feedId: feed.id, feedTitle: feed.title });
        }
      }
    }
    hits.sort((a, b) => (b.pubDate ? Date.parse(b.pubDate) : 0) - (a.pubDate ? Date.parse(a.pubDate) : 0));
    return sendJson(res, 200, { items: hits.slice(0, 100) });
  }

  return sendJson(res, 404, { error: 'Unknown API route' });
}

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
  try {
    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, pathname);
      return;
    }
    const file = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const filePath = path.join(PUBLIC_DIR, file);
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    sendFile(res, filePath);
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`Revenant Reader listening on http://${HOST}:${PORT}`);
});
