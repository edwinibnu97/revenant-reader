'use strict';

/**
 * Revenant Reader — HTTP server.
 * Serves the reader UI (public/) and a small JSON API over feeds.
 * Zero frameworks: plain node:http. Storage: data/feeds.json (lib/store.js).
 *
 * API:
 *   GET  /api/feeds              -> [{ id, url, title, link, unread, total, lastFetched }]
 *   POST /api/feeds { url }      -> fetch + parse + add feed
 *   POST /api/refresh            -> re-fetch every feed, merge new items
 *   GET  /api/feeds/:id/items    -> items of one feed (newest first)
 *   POST /api/read { feedId, itemId } -> mark one item read
 *   GET  /api/search?q=...       -> items matching q in title/description
 *
 * Run:  node server.js        (http://127.0.0.1:3000, or $PORT)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const { parseFeed } = require('./lib/rss');
const store = require('./lib/store');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
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

async function fetchFeed(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'RevenantReader/0.1 (+https://github.com/)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Feed fetch failed: HTTP ${res.status}`);
  const xml = await res.text();
  return parseFeed(xml);
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
      const parsed = await fetchFeed(url);
      const feed = {
        id: store.nextId(state),
        url,
        title: parsed.title,
        link: parsed.link,
        description: parsed.description,
        lastFetched: new Date().toISOString(),
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

  // POST /api/refresh
  if (req.method === 'POST' && pathname === '/api/refresh') {
    const results = [];
    for (const feed of state.feeds) {
      try {
        const parsed = await fetchFeed(feed.url);
        feed.title = parsed.title || feed.title;
        feed.link = parsed.link || feed.link;
        const added = store.mergeItems(feed, parsed.items);
        feed.lastFetched = new Date().toISOString();
        results.push({ id: feed.id, ok: true, added });
      } catch (err) {
        results.push({ id: feed.id, ok: false, error: err.message });
      }
    }
    store.save(state);
    return sendJson(res, 200, { results });
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
