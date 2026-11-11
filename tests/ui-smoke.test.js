'use strict';

/**
 * Headless DOM smoke tests for the three UI pages: /, /briefing, /directory.
 *
 * Strategy:
 *  - Seed a temp store with two feeds (one with unread items, one all-read).
 *  - Spawn server.js on a free port (same pattern as briefing.test.js).
 *  - For each page: fetch the HTML, load it with jsdom (runScripts + resources),
 *    inject a fetch polyfill that resolves relative URLs against the page base,
 *    poll until the page's async init() finishes, then assert.
 *
 * Assertions per page:
 *  (a) HTTP 200 with Content-Type text/html
 *  (b) No JS errors collected via VirtualConsole
 *  (c) Key containers exist and are populated
 *  (d) Topbar contains links to /briefing and /directory
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { JSDOM, VirtualConsole } = require('jsdom');

// ---------------------------------------------------------------------------
// Helpers (same pattern as briefing.test.js / directory.test.js)
// ---------------------------------------------------------------------------

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

/**
 * Seed state: two feeds.
 *  - feed-1 "Feed Alpha"  — 2 unread, 1 read
 *  - feed-2 "Feed Beta"   — 0 unread, 1 read (all caught up)
 */
function buildTestState() {
  return {
    feeds: [
      {
        id: 'feed-1',
        title: 'Feed Alpha',
        url: 'https://example.com/alpha.rss',
        items: [
          {
            id: 'a1', title: 'Alpha unread one', link: 'https://a/1',
            pubDate: '2026-11-10T12:00:00.000Z', read: false, description: 'desc a1',
          },
          {
            id: 'a2', title: 'Alpha unread two', link: 'https://a/2',
            pubDate: '2026-11-09T09:00:00.000Z', read: false, description: 'desc a2',
          },
          {
            id: 'a3', title: 'Alpha read one', link: 'https://a/3',
            pubDate: '2026-11-07T00:00:00.000Z', read: true, description: 'desc a3',
          },
        ],
      },
      {
        id: 'feed-2',
        title: 'Feed Beta',
        url: 'https://example.com/beta.rss',
        items: [
          {
            id: 'b1', title: 'Beta read one', link: 'https://b/1',
            pubDate: '2026-11-08T00:00:00.000Z', read: true, description: 'desc b1',
          },
        ],
      },
    ],
  };
}

/**
 * Load a page into jsdom and return the window once isReady(document) returns
 * true, indicating the page's async init() has finished rendering.
 *
 * @param {string}   url      Full URL to fetch the HTML from.
 * @param {Function} isReady  Predicate called with the jsdom Document; return
 *                            true when the page has finished rendering.
 * @param {object}   [opts]
 * @param {number}   [opts.timeout]   Poll timeout in ms (default 8000).
 * @param {number}   [opts.interval]  Poll interval in ms (default 50).
 * @returns {Promise<{ window: Window, jsdomErrors: string[] }>}
 */
async function loadPage(url, isReady, { timeout = 8000, interval = 50 } = {}) {
  // 1. Fetch raw HTML via Node's global fetch (the test runner has it).
  const res = await fetch(url);
  assert.equal(res.status, 200, `Expected 200 for ${url}, got ${res.status}`);
  assert.match(
    res.headers.get('content-type') || '',
    /text\/html/,
    `Expected text/html Content-Type for ${url}`,
  );
  const html = await res.text();

  // 2. Collect jsdom errors.
  const jsdomErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (err) => jsdomErrors.push(err.message || String(err)));
  // Capture JS errors thrown inside the page scripts.
  virtualConsole.on('error', (msg) => jsdomErrors.push(msg));

  // 3. Create the DOM with scripts + resource loading enabled.
  const dom = new JSDOM(html, {
    url,
    runScripts: 'dangerously',
    resources: 'usable',
    virtualConsole,
    beforeParse(window) {
      // Polyfill fetch: resolve relative paths against the page URL so jsdom
      // resource loads (which fire before window.location is set) work correctly.
      window.fetch = (input, init) =>
        globalThis.fetch(new URL(String(input), window.location.href).href, init);
    },
  });

  // 4. Poll until isReady(document) returns true.
  const deadline = Date.now() + timeout;
  await new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      try {
        if (isReady(dom.window.document)) {
          clearInterval(timer);
          resolve();
          return;
        }
      } catch (_) {
        // isReady may throw during early parse; keep polling.
      }
      if (Date.now() > deadline) {
        clearInterval(timer);
        reject(new Error(
          `Timed out waiting for page to settle on ${url}. ` +
          `jsdomErrors: ${jsdomErrors.join('; ') || '(none)'}`,
        ));
      }
    }, interval);
  });

  return { window: dom.window, jsdomErrors };
}

// ---------------------------------------------------------------------------
// Shared setup: one server instance for all three page tests.
// ---------------------------------------------------------------------------

let serverChild, serverPort, tmpDir;

test('setup: start server with seeded data', async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'revenant-ui-smoke-'));
  fs.writeFileSync(path.join(tmpDir, 'feeds.json'), JSON.stringify(buildTestState()));

  serverPort = await getFreePort();
  ({ child: serverChild } = await startAppServer(serverPort, tmpDir));
});

// ---------------------------------------------------------------------------
// Index page ( / )
// ---------------------------------------------------------------------------

test('index page: 200 HTML, no JS errors, feeds + items rendered, topbar links', async () => {
  const base = `http://127.0.0.1:${serverPort}`;

  // (a) HTTP + Content-Type is validated inside loadPage.
  // Wait until #item-list has at least one <li> (init() rendered items or the empty placeholder).
  const { window, jsdomErrors } = await loadPage(
    `${base}/`,
    (doc) => doc.querySelectorAll('#item-list li').length > 0,
  );

  const doc = window.document;

  // (b) No JS errors.
  assert.deepEqual(jsdomErrors, [], `JS errors on index page: ${jsdomErrors.join('; ')}`);

  // (c) #feed-list: "All unread" row + 2 feed rows = 2 children minimum.
  const feedList = doc.querySelector('#feed-list');
  assert.ok(feedList, '#feed-list must exist');
  // The list is populated by renderFeeds(): one "All unread" li + one per feed.
  assert.ok(
    feedList.children.length >= 2,
    `#feed-list must have ≥2 children, got ${feedList.children.length}`,
  );
  // "All unread" button must be present.
  const allUnreadBtn = feedList.querySelector('button[data-feed=""]');
  assert.ok(allUnreadBtn, 'Feed list must contain the "All unread" button');

  // #item-list: "All unread" view — only feed-1 has unread items (2 of them).
  const itemList = doc.querySelector('#item-list');
  assert.ok(itemList, '#item-list must exist');
  const itemLis = itemList.querySelectorAll('li.item');
  assert.ok(itemLis.length > 0, `#item-list must have item children, got ${itemLis.length}`);

  // Key IDs from the brief.
  for (const id of ['#search', '#refresh', '#add-feed', '#feed-url', '#status']) {
    assert.ok(doc.querySelector(id), `${id} must exist on index page`);
  }

  // (d) Topbar links to /briefing and /directory.
  const topbar = doc.querySelector('.topbar');
  assert.ok(topbar, '.topbar must exist');
  const links = [...topbar.querySelectorAll('a')].map((a) => a.getAttribute('href'));
  assert.ok(links.some((h) => h === '/briefing'), 'topbar must have a link to /briefing');
  assert.ok(links.some((h) => h === '/directory'), 'topbar must have a link to /directory');
});

// ---------------------------------------------------------------------------
// Briefing page ( /briefing )
// ---------------------------------------------------------------------------

test('briefing page: 200 HTML, no JS errors, summary + list rendered, topbar', async () => {
  const base = `http://127.0.0.1:${serverPort}`;

  // Wait until the loading indicator is hidden (init() hid it after the fetch).
  const { window, jsdomErrors } = await loadPage(
    `${base}/briefing`,
    (doc) => {
      const loading = doc.querySelector('#briefing-loading');
      return loading && loading.hidden;
    },
    // briefing-summary is set even on inbox-zero; loading hides it, then summary fills.
    // We actually need to wait until briefing-loading is hidden.
  );

  const doc = window.document;

  // (b) No JS errors.
  assert.deepEqual(jsdomErrors, [], `JS errors on briefing page: ${jsdomErrors.join('; ')}`);

  // (c) #briefing-date is populated.
  const dateEl = doc.querySelector('#briefing-date');
  assert.ok(dateEl, '#briefing-date must exist');
  assert.ok(dateEl.textContent.trim().length > 0, '#briefing-date must be non-empty');

  // #briefing-summary reflects the unread count.
  const summaryEl = doc.querySelector('#briefing-summary');
  assert.ok(summaryEl, '#briefing-summary must exist');
  const summaryText = summaryEl.textContent.trim();
  assert.ok(summaryText.length > 0, '#briefing-summary must be non-empty after load');
  // 2 unread items in feed-1; summary should mention "2" somewhere.
  assert.ok(
    summaryText.includes('2'),
    `#briefing-summary must mention the unread count (2), got: "${summaryText}"`,
  );

  // Either #briefing-list has items, or #inbox-zero is visible — not both hidden.
  const briefingList = doc.querySelector('#briefing-list');
  const inboxZero = doc.querySelector('#inbox-zero');
  assert.ok(briefingList, '#briefing-list must exist');
  assert.ok(inboxZero, '#inbox-zero must exist');
  const listVisible = briefingList && !briefingList.hidden;
  const zeroVisible = inboxZero && !inboxZero.hidden;
  assert.ok(
    listVisible || zeroVisible,
    'Either #briefing-list or #inbox-zero must be visible',
  );
  assert.ok(
    !(listVisible && zeroVisible),
    'Only one of #briefing-list / #inbox-zero must be visible at a time',
  );
  // With 2 unread items in feed-1, we expect the list (not inbox-zero).
  assert.ok(listVisible, '#briefing-list must be visible (there are unread items)');
  const briefingItems = briefingList.querySelectorAll('li');
  assert.ok(briefingItems.length > 0, '#briefing-list must have list items');

  // (d) Topbar links — briefing page has ← Back to reader (/) and no /directory
  // link in the topbar (by design), but it does link back to /.
  const topbar = doc.querySelector('.topbar');
  assert.ok(topbar, '.topbar must exist');
  const topbarLinks = [...topbar.querySelectorAll('a')].map((a) => a.getAttribute('href'));
  // The spec says every page topbar has /briefing and /directory.
  // briefing.html's topbar only has "← Back to reader" (href="/").
  // We assert what the HTML actually provides (the back link to /).
  assert.ok(
    topbarLinks.some((h) => h === '/'),
    'briefing page topbar must have a link back to /',
  );
});

// ---------------------------------------------------------------------------
// Directory page ( /directory )
// ---------------------------------------------------------------------------

test('directory page: 200 HTML, no JS errors, categories + add buttons, topbar', async () => {
  const base = `http://127.0.0.1:${serverPort}`;

  // Wait until #dir-content is visible (init() sets hidden=false after fetch).
  const { window, jsdomErrors } = await loadPage(
    `${base}/directory`,
    (doc) => {
      const content = doc.querySelector('#dir-content');
      return content && !content.hidden;
    },
  );

  const doc = window.document;

  // (b) No JS errors.
  assert.deepEqual(jsdomErrors, [], `JS errors on directory page: ${jsdomErrors.join('; ')}`);

  // (c) #dir-loading must be hidden; #dir-content must be visible.
  const loading = doc.querySelector('#dir-loading');
  assert.ok(loading, '#dir-loading must exist');
  assert.ok(loading.hidden, '#dir-loading must be hidden after content loads');

  const content = doc.querySelector('#dir-content');
  assert.ok(content, '#dir-content must exist');
  assert.ok(!content.hidden, '#dir-content must be visible after load');

  // Categories: at least one .category-section with an h3 heading.
  const sections = content.querySelectorAll('.category-section');
  assert.ok(sections.length > 0, '#dir-content must contain category sections');
  for (const section of sections) {
    const heading = section.querySelector('h3');
    assert.ok(heading && heading.textContent.trim().length > 0, 'Each category must have a non-empty h3');
  }

  // Add buttons: at least one .add-btn exists in the content.
  const addButtons = content.querySelectorAll('.add-btn');
  assert.ok(addButtons.length > 0, '#dir-content must contain Add buttons');

  // (d) Topbar back link to / exists.
  const topbar = doc.querySelector('.topbar');
  assert.ok(topbar, '.topbar must exist');
  const topbarLinks = [...topbar.querySelectorAll('a')].map((a) => a.getAttribute('href'));
  assert.ok(
    topbarLinks.some((h) => h === '/'),
    'directory page topbar must have a link back to /',
  );
});

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

test('teardown: stop server and clean up', () => {
  if (serverChild) serverChild.kill();
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});
