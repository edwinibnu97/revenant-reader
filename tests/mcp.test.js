'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

/** Drive the MCP server over stdio with JSON-RPC, collect replies. */
function mcpSession() {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'mcp-server', 'index.js')], {
    cwd: path.join(__dirname, '..'),
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

test('MCP: initialize + tools/list exposes the 5 reader tools', async () => {
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
    assert.deepEqual(names, ['add_feed', 'list_feeds', 'mark_read', 'search_items', 'unread_count']);
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
  // Point the store at a temp data dir via monkey-patched paths is overkill;
  // exercise mergeItems/unreadCount logic directly against a plain object.
  const store = require('../lib/store');
  const feed = { items: [{ id: 'a', link: 'https://x/1', pubDate: '2026-11-01T00:00:00.000Z', read: false }] };
  const added = store.mergeItems(feed, [
    { id: 'a', link: 'https://x/1', pubDate: '2026-11-01T00:00:00.000Z' },
    { id: 'b', link: 'https://x/2', pubDate: '2026-11-05T00:00:00.000Z' },
  ]);
  assert.equal(added, 1);
  assert.equal(feed.items[0].id, 'b'); // newest first
  assert.equal(store.unreadCount(feed), 2);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'data', 'seed.json')));
  void os;
});
