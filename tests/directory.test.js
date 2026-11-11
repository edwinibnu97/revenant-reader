'use strict';

/**
 * Integration tests for the feed directory endpoints and page.
 *
 * Spawns server.js on a free port (same pattern as health.test.js).
 * No network access beyond localhost; no live RSS feeds are contacted.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DIRECTORY = require('../directory.json');

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

test('GET /api/directory returns categories with correct feed counts', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'revenant-dir-test-'));
  fs.writeFileSync(path.join(tmpDir, 'feeds.json'), JSON.stringify({ feeds: [] }));

  const port = await getFreePort();
  const { child } = await startAppServer(port, tmpDir);

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/directory`);
    assert.equal(res.status, 200, `Expected HTTP 200, got ${res.status}`);
    assert.match(res.headers.get('content-type') || '', /application\/json/);

    const body = await res.json();
    assert.ok(Array.isArray(body.categories), 'categories must be an array');
    assert.ok(body.categories.length > 0, 'must have at least one category');

    // Count feeds across all categories returned
    const returnedCount = body.categories.reduce((sum, cat) => sum + cat.feeds.length, 0);
    assert.equal(returnedCount, DIRECTORY.length, 'total feed count must match directory.json');

    // Every category must have a name string and a non-empty feeds array
    for (const cat of body.categories) {
      assert.ok(typeof cat.name === 'string' && cat.name.length > 0, 'category name must be a non-empty string');
      assert.ok(Array.isArray(cat.feeds) && cat.feeds.length > 0, `category "${cat.name}" must have feeds`);
      for (const feed of cat.feeds) {
        assert.ok(typeof feed.title === 'string', 'feed title must be a string');
        assert.ok(typeof feed.url === 'string', 'feed url must be a string');
        assert.ok(typeof feed.description === 'string', 'feed description must be a string');
      }
    }
  } finally {
    child.kill();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('GET /api/directory/opml returns valid OPML containing all directory feed URLs', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'revenant-dir-opml-test-'));
  fs.writeFileSync(path.join(tmpDir, 'feeds.json'), JSON.stringify({ feeds: [] }));

  const port = await getFreePort();
  const { child } = await startAppServer(port, tmpDir);

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/directory/opml`);
    assert.equal(res.status, 200, `Expected HTTP 200, got ${res.status}`);
    assert.match(res.headers.get('content-type') || '', /application\/xml/);
    assert.match(res.headers.get('content-disposition') || '', /attachment/);
    assert.match(res.headers.get('content-disposition') || '', /revenant-directory\.opml/);

    const opml = await res.text();
    assert.match(opml, /^<\?xml/, 'must start with XML declaration');
    assert.ok(opml.includes('<opml'), 'must contain <opml> element');
    assert.ok(opml.includes('<outline'), 'must contain at least one <outline>');

    // Every feed URL in directory.json must appear in the OPML (URLs may be
    // XML-attribute-escaped, so compare after unescaping &amp; → &).
    function unescXml(s) {
      return s
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"');
    }
    const opmlUnescaped = unescXml(opml);
    for (const entry of DIRECTORY) {
      assert.ok(
        opmlUnescaped.includes(entry.url),
        `OPML must include URL for "${entry.title}": ${entry.url}`
      );
    }
  } finally {
    child.kill();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('GET /directory serves 200 HTML', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'revenant-dir-page-test-'));
  fs.writeFileSync(path.join(tmpDir, 'feeds.json'), JSON.stringify({ feeds: [] }));

  const port = await getFreePort();
  const { child } = await startAppServer(port, tmpDir);

  try {
    const res = await fetch(`http://127.0.0.1:${port}/directory`);
    assert.equal(res.status, 200, `Expected HTTP 200, got ${res.status}`);
    assert.match(res.headers.get('content-type') || '', /text\/html/);

    const html = await res.text();
    assert.ok(html.includes('<!doctype html'), 'response must be an HTML document');
    assert.ok(html.toLowerCase().includes('directory'), 'page must reference directory');
  } finally {
    child.kill();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
