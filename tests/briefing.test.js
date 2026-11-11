'use strict';

/**
 * Tests for lib/briefing.js (unit) and GET /api/briefing + GET /briefing.html (HTTP).
 *
 * Follows the same style as tests/health.test.js:
 *  - node:test + node:assert/strict
 *  - Isolated DATA_DIR via tmp directory
 *  - Spawns server.js for HTTP tests; no live network access
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { buildBriefing } = require('../lib/briefing');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Find a free TCP port on 127.0.0.1. */
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

/** Spawn server.js and wait until it logs "listening". */
function startAppServer(port, dataDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      out += chunk;
      if (out.includes('listening')) resolve({ child, port });
    });
    child.on('error', reject);
    setTimeout(() => reject(new Error('server start timeout')), 8000);
  });
}

/** Build a minimal state object with two feeds and mixed read/unread items. */
function buildTestState() {
  return {
    feeds: [
      {
        id: 'feed-1',
        title: 'Feed Alpha',
        items: [
          { id: 'a1', title: 'Alpha newest', link: 'https://a/1', pubDate: '2026-11-10T12:00:00.000Z', read: false, description: 'desc a1' },
          { id: 'a2', title: 'Alpha middle', link: 'https://a/2', pubDate: '2026-11-08T09:00:00.000Z', read: false, description: 'desc a2' },
          { id: 'a3', title: 'Alpha read',   link: 'https://a/3', pubDate: '2026-11-07T00:00:00.000Z', read: true,  description: 'desc a3' },
        ],
      },
      {
        id: 'feed-2',
        title: 'Feed Beta',
        items: [
          { id: 'b1', title: 'Beta newest',  link: 'https://b/1', pubDate: '2026-11-09T18:00:00.000Z', read: false, description: 'desc b1' },
          { id: 'b2', title: 'Beta old',     link: 'https://b/2', pubDate: '2026-11-01T00:00:00.000Z', read: false, description: 'desc b2' },
          { id: 'b3', title: 'Beta undated', link: 'https://b/3', pubDate: null,                        read: false, description: 'desc b3' },
          { id: 'b4', title: 'Beta read',    link: 'https://b/4', pubDate: '2026-11-05T00:00:00.000Z', read: true,  description: 'desc b4' },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Unit tests for buildBriefing
// ---------------------------------------------------------------------------

test('buildBriefing: excludes read items', () => {
  const state = buildTestState();
  const result = buildBriefing(state);
  const titles = result.items.map((i) => i.title);
  assert.ok(!titles.includes('Alpha read'), 'read item from feed-1 must be excluded');
  assert.ok(!titles.includes('Beta read'),  'read item from feed-2 must be excluded');
});

test('buildBriefing: orders items newest-first, undated last', () => {
  const state = buildTestState();
  const result = buildBriefing(state);
  // Expected order by pubDate desc: Alpha newest (Nov 10), Beta newest (Nov 9),
  // Alpha middle (Nov 8), Beta old (Nov 1), Beta undated (null → epoch 0)
  assert.equal(result.items[0].title, 'Alpha newest');
  assert.equal(result.items[1].title, 'Beta newest');
  assert.equal(result.items[2].title, 'Alpha middle');
  assert.equal(result.items[3].title, 'Beta old');
  assert.equal(result.items[4].title, 'Beta undated');
});

test('buildBriefing: totalUnread reflects all unread before capping', () => {
  const state = buildTestState();
  const result = buildBriefing(state);
  // 2 unread in feed-1, 3 unread in feed-2 = 5 total (2 items are read)
  assert.equal(result.totalUnread, 5);
  assert.equal(result.feedCount, 2);
});

test('buildBriefing: caps items at limit', () => {
  const state = buildTestState();
  // Set limit to 3; there are 5 unread items.
  const result = buildBriefing(state, 3);
  assert.equal(result.items.length, 3);
  // totalUnread still reflects the full unread count, not the cap.
  assert.equal(result.totalUnread, 5);
});

test('buildBriefing: default limit is 10', () => {
  // Build a state with 15 unread items.
  const items = Array.from({ length: 15 }, (_, i) => ({
    id: `x${i}`,
    title: `Item ${i}`,
    link: `https://x/${i}`,
    pubDate: new Date(Date.now() - i * 60000).toISOString(),
    read: false,
    description: '',
  }));
  const state = { feeds: [{ id: 'f1', title: 'Big Feed', items }] };
  const result = buildBriefing(state);
  assert.equal(result.items.length, 10);
  assert.equal(result.totalUnread, 15);
});

test('buildBriefing: returns inbox-zero shape when nothing is unread', () => {
  const state = {
    feeds: [
      {
        id: 'feed-1',
        title: 'Feed Alpha',
        items: [
          { id: 'a1', title: 'Read item', link: 'https://a/1', pubDate: '2026-11-10T00:00:00.000Z', read: true, description: '' },
        ],
      },
    ],
  };
  const result = buildBriefing(state);
  assert.equal(result.items.length, 0);
  assert.equal(result.totalUnread, 0);
  assert.equal(result.feedCount, 1);
});

test('buildBriefing: returns inbox-zero shape when there are no feeds', () => {
  const result = buildBriefing({ feeds: [] });
  assert.equal(result.items.length, 0);
  assert.equal(result.totalUnread, 0);
  assert.equal(result.feedCount, 0);
});

test('buildBriefing: item shape has required fields', () => {
  const state = buildTestState();
  const result = buildBriefing(state);
  for (const item of result.items) {
    assert.ok('title' in item,       'item must have title');
    assert.ok('link' in item,        'item must have link');
    assert.ok('feedTitle' in item,   'item must have feedTitle');
    assert.ok('pubDate' in item,     'item must have pubDate');
    assert.ok('description' in item, 'item must have description');
  }
});

// ---------------------------------------------------------------------------
// HTTP integration tests
// ---------------------------------------------------------------------------

test('GET /api/briefing returns 200 JSON with correct briefing shape', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'revenant-briefing-test-'));

  // Seed two feeds: one with unread items, one all-read.
  const state = buildTestState();
  fs.writeFileSync(path.join(tmpDir, 'feeds.json'), JSON.stringify(state));

  const port = await getFreePort();
  const { child } = await startAppServer(port, tmpDir);

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/briefing`);
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.match(
      res.headers.get('content-type') || '',
      /application\/json/,
      'Expected Content-Type application/json',
    );

    const briefing = await res.json();

    // Shape check.
    assert.equal(typeof briefing.totalUnread, 'number', 'totalUnread must be a number');
    assert.equal(typeof briefing.feedCount,   'number', 'feedCount must be a number');
    assert.ok(Array.isArray(briefing.items),            'items must be an array');

    // Value checks.
    assert.equal(briefing.totalUnread, 5);
    assert.equal(briefing.feedCount,   2);
    assert.equal(briefing.items.length, 5); // fewer than default limit of 10

    // Items are newest-first.
    assert.equal(briefing.items[0].title, 'Alpha newest');
    assert.equal(briefing.items[1].title, 'Beta newest');

    // No read items.
    for (const item of briefing.items) {
      assert.ok(!item.title.includes('read'), `read item leaked into briefing: ${item.title}`);
    }
  } finally {
    child.kill();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('GET /api/briefing returns inbox-zero shape when nothing is unread', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'revenant-briefing-zero-test-'));
  const state = {
    feeds: [
      {
        id: 'feed-1', title: 'All Read',
        items: [
          { id: 'r1', title: 'Read item', link: 'https://x/1', pubDate: '2026-11-10T00:00:00.000Z', read: true, description: '' },
        ],
      },
    ],
  };
  fs.writeFileSync(path.join(tmpDir, 'feeds.json'), JSON.stringify(state));

  const port = await getFreePort();
  const { child } = await startAppServer(port, tmpDir);

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/briefing`);
    assert.equal(res.status, 200);
    const briefing = await res.json();
    assert.equal(briefing.items.length, 0);
    assert.equal(briefing.totalUnread, 0);
    assert.equal(briefing.feedCount, 1);
  } finally {
    child.kill();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('GET /briefing.html serves 200 HTML', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'revenant-briefing-html-test-'));
  fs.writeFileSync(path.join(tmpDir, 'feeds.json'), JSON.stringify({ feeds: [] }));

  const port = await getFreePort();
  const { child } = await startAppServer(port, tmpDir);

  try {
    const res = await fetch(`http://127.0.0.1:${port}/briefing.html`);
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.match(
      res.headers.get('content-type') || '',
      /text\/html/,
      'Expected Content-Type text/html',
    );
    const html = await res.text();
    assert.ok(html.includes('Morning Briefing'), 'page must include the title text');
    assert.ok(html.includes('/api/briefing'),    'page must reference the API endpoint');

    // Clean URL /briefing serves the same page.
    const resClean = await fetch(`http://127.0.0.1:${port}/briefing`);
    assert.equal(resClean.status, 200, `Expected 200 for /briefing, got ${resClean.status}`);
    assert.match(
      resClean.headers.get('content-type') || '',
      /text\/html/,
      'Expected Content-Type text/html for /briefing',
    );
    assert.ok((await resClean.text()).includes('Morning Briefing'));
  } finally {
    child.kill();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
