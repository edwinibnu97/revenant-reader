'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');

const { buildOpml, parseOpml } = require('../lib/opml');
const store = require('../lib/store');

test('OPML: build + parse round-trips feed urls and titles', () => {
  const state = {
    feeds: [
      { id: 'f1', url: 'https://example.com/rss.xml', title: 'Example & Friends', link: 'https://example.com' },
      { id: 'f2', url: 'https://other.dev/atom.xml', title: 'Other', link: '' },
    ],
  };
  const opml = buildOpml(state);
  assert.ok(opml.includes('<opml version="2.0">'));
  const back = parseOpml(opml);
  assert.deepEqual(back.map((f) => f.url), ['https://example.com/rss.xml', 'https://other.dev/atom.xml']);
  assert.equal(back[0].title, 'Example & Friends');
});

test('OPML: parse flattens nested outlines, rejects non-OPML', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0"><head><title>t</title></head><body>
<outline text="Group"><outline type="rss" text="A" xmlUrl="https://a.dev/rss" /><outline type="rss" text="B" xmlUrl="https://b.dev/rss" /></outline>
<outline text="No url here" />
</body></opml>`;
  const feeds = parseOpml(xml);
  assert.deepEqual(feeds.map((f) => f.url), ['https://a.dev/rss', 'https://b.dev/rss']);
  assert.throws(() => parseOpml('<rss><channel></channel></rss>'), /Not an OPML document/);
  assert.throws(() => parseOpml('not xml'), /not XML/);
});

test('store: mergeItems caps descriptions at 2000 chars', () => {
  const feed = { items: [] };
  const added = store.mergeItems(feed, [
    { id: 'x', link: 'https://x/1', description: 'y'.repeat(5000), pubDate: null },
  ]);
  assert.equal(added, 1);
  assert.equal(feed.items[0].description.length, 2000);
});

// --- HTTP tests against a live app server with an isolated data dir ---

function startFixtureServer(xml) {
  return new Promise((resolve) => {
    const srv = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/rss+xml' });
      res.end(xml);
    });
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      resolve({ srv, url: `http://127.0.0.1:${port}/feed.xml` });
    });
  });
}

function startAppServer(dataDir) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close(() => {
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
        setTimeout(() => reject(new Error('app server start timeout')), 8000);
      });
    });
  });
}

const FIXTURE_XML = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-rss.xml'), 'utf8');

test('HTTP: OPML export/import round-trip + read-all', async () => {
  const { srv: fixSrv, url: feedUrl } = await startFixtureServer(FIXTURE_XML);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'revenant-opml-test-'));
  fs.writeFileSync(path.join(tmpDir, 'feeds.json'), JSON.stringify({ feeds: [] }));
  const { child: appChild, port } = await startAppServer(tmpDir);
  const base = `http://127.0.0.1:${port}`;

  async function httpApi(urlPath, opts) {
    const r = await fetch(`${base}${urlPath}`, opts);
    const text = await r.text();
    let data = {};
    try { data = JSON.parse(text); } catch { /* non-JSON body (OPML) */ }
    return { status: r.status, data, text };
  }

  try {
    // Export with zero feeds: valid OPML, no outlines.
    const empty = await httpApi('/api/opml');
    assert.equal(empty.status, 200);
    assert.deepEqual(parseOpml(empty.text), []);

    // Import the fixture feed via OPML.
    const opmlDoc = buildOpml({ feeds: [{ url: feedUrl, title: 'Fixture', link: '' }] });
    const imp = await httpApi('/api/opml', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opml: opmlDoc }),
    });
    assert.equal(imp.status, 200, `import failed: ${JSON.stringify(imp.data)}`);
    assert.equal(imp.data.added.length, 1);
    assert.equal(imp.data.failed.length, 0);
    const feedId = imp.data.added[0].id;

    // Importing the same OPML again skips the duplicate.
    const imp2 = await httpApi('/api/opml', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opml: opmlDoc }),
    });
    assert.equal(imp2.data.added.length, 0);
    assert.equal(imp2.data.skipped.length, 1);

    // Export now contains the feed.
    const exported = await httpApi('/api/opml');
    assert.equal(parseOpml(exported.text).length, 1);
    assert.equal(parseOpml(exported.text)[0].url, feedUrl);

    // read-all marks everything read; feed reports zero unread, no error.
    const readAll = await httpApi(`/api/feeds/${encodeURIComponent(feedId)}/read-all`, { method: 'POST' });
    assert.equal(readAll.status, 200);
    assert.equal(readAll.data.unread, 0);
    const feeds = await httpApi('/api/feeds');
    assert.equal(feeds.data.feeds[0].unread, 0);
    assert.equal(feeds.data.feeds[0].lastError, null);

    // Malformed OPML is rejected with 400.
    const bad = await httpApi('/api/opml', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opml: '<rss></rss>' }),
    });
    assert.equal(bad.status, 400);
  } finally {
    appChild.kill();
    fixSrv.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
