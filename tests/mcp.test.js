'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

/** Drive the MCP server over stdio with JSON-RPC, collect replies. */
function mcpSession(env) {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'mcp-server', 'index.js')], {
    cwd: path.join(__dirname, '..'),
    env: env || process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let buf = '';
  const pending = new Map();
  let nextId = 1;
  const lines = [];
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      lines.push(JSON.parse(line));
      const msg = lines[lines.length - 1];
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    }
  });
  const send = (method, params) => new Promise((resolve, reject) => {
    const id = nextId;
    nextId += 1;
    pending.set(id, resolve);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), 10000);
  });
  const notify = (method, params) => {
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  };
  return { child, send, notify };
}

test('MCP: initialize + tools/list exposes all reader tools', async () => {
  const { child, send, notify } = mcpSession();
  try {
    const init = await send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '0.0.0' },
    });
    assert.equal(init.result.serverInfo.name, 'revenant-reader');
    notify('notifications/initialized');
    const list = await send('tools/list');
    const names = list.result.tools.map((t) => t.name).sort();
    assert.deepEqual(names, ['add_feed', 'export_opml', 'import_opml', 'list_feeds', 'mark_all_read', 'mark_read', 'remove_feed', 'search_items', 'unread_count']);
  } finally {
    child.kill();
  }
});

test('MCP: unread_count returns a number, list_feeds returns an array', async () => {
  const { child, send } = mcpSession();
  try {
    await send('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0.0.0' } });
    const count = await send('tools/call', { name: 'unread_count', arguments: {} });
    const parsed = JSON.parse(count.result.content[0].text);
    assert.equal(typeof parsed.unread, 'number');
    const feeds = await send('tools/call', { name: 'list_feeds', arguments: {} });
    assert.ok(Array.isArray(JSON.parse(feeds.result.content[0].text)));
  } finally {
    child.kill();
  }
});

test('store: mergeItems dedupes and sorts newest-first', async () => {
  const store = require('../lib/store');
  const feed = { items: [{ id: 'a', link: 'https://x/1', pubDate: '2026-11-01T00:00:00.000Z', read: false }] };
  const added = store.mergeItems(feed, [
    { id: 'a', link: 'https://x/1', pubDate: '2026-11-01T00:00:00.000Z' },
    { id: 'b', link: 'https://x/2', pubDate: '2026-11-05T00:00:00.000Z' },
  ]);
  assert.equal(added, 1);
  assert.equal(feed.items[0].id, 'b');
  assert.equal(store.unreadCount(feed), 2);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'data', 'seed.json')));
});

// ---------------------------------------------------------------------------
// Helpers for remove_feed and HTTP DELETE smoke tests
// ---------------------------------------------------------------------------

function startFixtureServer(xml) {
  const http = require('http');
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
  const net = require('net');
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

// ---------------------------------------------------------------------------
// MCP: remove_feed tool
// ---------------------------------------------------------------------------

test('MCP: remove_feed removes the feed and reports remaining count', async () => {
  const { srv: fixSrv, url: feedUrl } = await startFixtureServer(FIXTURE_XML);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'revenant-mcp-test-'));
  // Pre-create an empty feeds file so the store does not fall back to the seed.
  fs.writeFileSync(path.join(tmpDir, 'feeds.json'), JSON.stringify({ feeds: [] }));
  const { child, send } = mcpSession({ ...process.env, DATA_DIR: tmpDir });
  try {
    await send('initialize', {
      protocolVersion: '2024-11-05', capabilities: {},
      clientInfo: { name: 'test', version: '0.0.0' },
    });
    // Add the fixture feed.
    const addResp = await send('tools/call', { name: 'add_feed', arguments: { url: feedUrl } });
    assert.ok(!addResp.result.isError, `add_feed failed: ${addResp.result.content[0].text}`);
    // Confirm it is listed.
    const listBefore = await send('tools/call', { name: 'list_feeds', arguments: {} });
    const feedsBefore = JSON.parse(listBefore.result.content[0].text);
    assert.equal(feedsBefore.length, 1);
    const feedId = feedsBefore[0].id;
    // Remove it.
    const removeResp = await send('tools/call', { name: 'remove_feed', arguments: { feedId } });
    assert.ok(!removeResp.result.isError, `remove_feed failed: ${removeResp.result.content[0].text}`);
    assert.ok(
      removeResp.result.content[0].text.includes('0 feed(s) remaining'),
      `unexpected text: ${removeResp.result.content[0].text}`,
    );
    // Verify it is gone.
    const listAfter = await send('tools/call', { name: 'list_feeds', arguments: {} });
    const feedsAfter = JSON.parse(listAfter.result.content[0].text);
    assert.equal(feedsAfter.length, 0);
    // Unknown id should return an error result.
    const badResp = await send('tools/call', { name: 'remove_feed', arguments: { feedId: 'no-such-feed' } });
    assert.ok(badResp.result.isError, 'expected isError for unknown feedId');
    assert.ok(
      badResp.result.content[0].text.includes('not found'),
      `unexpected: ${badResp.result.content[0].text}`,
    );
  } finally {
    child.kill();
    fixSrv.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// HTTP: DELETE /api/feeds/:id smoke test
// ---------------------------------------------------------------------------

test('HTTP DELETE /api/feeds/:id removes the feed', async () => {
  const { srv: fixSrv, url: feedUrl } = await startFixtureServer(FIXTURE_XML);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'revenant-http-test-'));
  // Pre-create an empty feeds file so the store does not fall back to the seed.
  fs.writeFileSync(path.join(tmpDir, 'feeds.json'), JSON.stringify({ feeds: [] }));
  const { child: appChild, port } = await startAppServer(tmpDir);
  const base = `http://127.0.0.1:${port}`;

  async function httpApi(urlPath, opts) {
    const r = await fetch(`${base}${urlPath}`, opts);
    const data = await r.json().catch(() => ({}));
    return { status: r.status, data };
  }

  try {
    // Add the fixture feed.
    const addRes = await httpApi('/api/feeds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: feedUrl }),
    });
    assert.equal(addRes.status, 201, `add failed: ${JSON.stringify(addRes.data)}`);
    const feedId = addRes.data.feed.id;

    // Confirm it is listed.
    const listBefore = await httpApi('/api/feeds');
    assert.ok(listBefore.data.feeds.some((f) => f.id === feedId), 'feed should be listed after add');

    // Delete it.
    const delRes = await httpApi(`/api/feeds/${encodeURIComponent(feedId)}`, { method: 'DELETE' });
    assert.equal(delRes.status, 200, `delete failed: ${JSON.stringify(delRes.data)}`);
    assert.equal(delRes.data.ok, true);
    assert.equal(delRes.data.removed, feedId);

    // Confirm it is gone.
    const listAfter = await httpApi('/api/feeds');
    assert.ok(!listAfter.data.feeds.some((f) => f.id === feedId), 'feed should be absent after delete');

    // 404 on second delete attempt.
    const del2 = await httpApi(`/api/feeds/${encodeURIComponent(feedId)}`, { method: 'DELETE' });
    assert.equal(del2.status, 404, 'second delete should return 404');
    assert.ok(del2.data.error, 'error body expected');
  } finally {
    appChild.kill();
    fixSrv.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// MCP: resources + prompts + mark_all_read + OPML tools
// ---------------------------------------------------------------------------

test('MCP: resources/list + resources/read expose feeds, prompts list/get briefing', async () => {
  const { srv: fixSrv, url: feedUrl } = await startFixtureServer(FIXTURE_XML);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'revenant-res-test-'));
  fs.writeFileSync(path.join(tmpDir, 'feeds.json'), JSON.stringify({ feeds: [] }));
  const { child, send } = mcpSession({ ...process.env, DATA_DIR: tmpDir });
  try {
    await send('initialize', {
      protocolVersion: '2024-11-05', capabilities: {},
      clientInfo: { name: 'test', version: '0.0.0' },
    });
    const addResp = await send('tools/call', { name: 'add_feed', arguments: { url: feedUrl } });
    assert.ok(!addResp.result.isError, `add_feed failed: ${addResp.result.content[0].text}`);

    const resList = await send('resources/list');
    assert.equal(resList.result.resources.length, 1);
    const uri = resList.result.resources[0].uri;
    assert.ok(uri.startsWith('revenant://feed/'), `unexpected uri: ${uri}`);
    const resRead = await send('resources/read', { uri });
    const feed = JSON.parse(resRead.result.contents[0].text);
    assert.ok(Array.isArray(feed.items) && feed.items.length > 0, 'resource should carry feed items');

    const prompts = await send('prompts/list');
    assert.deepEqual(prompts.result.prompts.map((p) => p.name), ['morning-briefing']);
    const briefing = await send('prompts/get', { name: 'morning-briefing' });
    assert.ok(briefing.result.messages[0].content.text.includes('Morning briefing'));
    assert.ok(briefing.result.messages[0].content.text.includes(feed.items[0].title));
  } finally {
    child.kill();
    fixSrv.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('MCP: mark_all_read + export_opml + import_opml round-trip', async () => {
  const { srv: fixSrv, url: feedUrl } = await startFixtureServer(FIXTURE_XML);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'revenant-opml-mcp-test-'));
  fs.writeFileSync(path.join(tmpDir, 'feeds.json'), JSON.stringify({ feeds: [] }));
  const { child, send } = mcpSession({ ...process.env, DATA_DIR: tmpDir });
  try {
    await send('initialize', {
      protocolVersion: '2024-11-05', capabilities: {},
      clientInfo: { name: 'test', version: '0.0.0' },
    });
    const addResp = await send('tools/call', { name: 'add_feed', arguments: { url: feedUrl } });
    assert.ok(!addResp.result.isError, `add_feed failed: ${addResp.result.content[0].text}`);
    const listBefore = await send('tools/call', { name: 'list_feeds', arguments: {} });
    const feedId = JSON.parse(listBefore.result.content[0].text)[0].id;

    // Export carries the feed url.
    const expResp = await send('tools/call', { name: 'export_opml', arguments: {} });
    const opmlText = expResp.result.content[0].text;
    assert.ok(opmlText.includes(feedUrl), 'exported OPML should contain the feed url');

    // Mark all read -> zero unread.
    const markResp = await send('tools/call', { name: 'mark_all_read', arguments: { feedId } });
    assert.ok(!markResp.result.isError, `mark_all_read failed: ${markResp.result.content[0].text}`);
    const countResp = await send('tools/call', { name: 'unread_count', arguments: {} });
    assert.equal(JSON.parse(countResp.result.content[0].text).unread, 0);

    // Remove the feed, then re-import from the exported OPML.
    await send('tools/call', { name: 'remove_feed', arguments: { feedId } });
    const impResp = await send('tools/call', { name: 'import_opml', arguments: { opml: opmlText } });
    assert.ok(!impResp.result.isError, `import_opml failed: ${impResp.result.content[0].text}`);
    assert.ok(impResp.result.content[0].text.includes('1 added'), `unexpected: ${impResp.result.content[0].text}`);
    const listAfter = await send('tools/call', { name: 'list_feeds', arguments: {} });
    assert.equal(JSON.parse(listAfter.result.content[0].text).length, 1);
  } finally {
    child.kill();
    fixSrv.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
