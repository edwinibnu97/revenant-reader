'use strict';

/**
 * Revenant Reader — MCP server (stdio, newline-delimited JSON-RPC 2.0).
 * Implements the Model Context Protocol (protocol version 2024-11-05) with
 * no SDK dependency: initialize, ping, tools/list, tools/call.
 *
 * The server shares state with the reader app: both read/write
 * data/feeds.json through lib/store.js, so anything Kiro does here is
 * immediately visible in the web UI, and vice versa.
 *
 * Tools:
 *   list_feeds    -> feeds with unread counts
 *   search_items  -> search titles/descriptions across all feeds
 *   mark_read     -> mark one item read
 *   add_feed      -> add a feed URL (fetches + parses it now)
 *   unread_count  -> total unread items
 *
 * Run:  node mcp-server/index.js
 * Wire it into Kiro via .kiro/settings/mcp.json (server "revenant").
 */

const { parseFeed } = require('../lib/rss');
const store = require('../lib/store');

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'revenant-reader', version: '0.1.0' };

const TOOLS = [
  {
    name: 'list_feeds',
    description: 'List all RSS/Atom feeds in the reader with unread counts.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'search_items',
    description: 'Search feed item titles and descriptions across all feeds.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Search text' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'mark_read',
    description: 'Mark one feed item as read.',
    inputSchema: {
      type: 'object',
      properties: {
        feedId: { type: 'string' },
        itemId: { type: 'string' },
      },
      required: ['feedId', 'itemId'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_feed',
    description: 'Add a feed by URL. Fetches and parses it immediately.',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string', description: 'http(s) URL of an RSS/Atom feed' } },
      required: ['url'],
      additionalProperties: false,
    },
  },
  {
    name: 'unread_count',
    description: 'Total number of unread items across all feeds.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

function textResult(text) {
  return { content: [{ type: 'text', text }] };
}

function errorResult(message) {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

async function callTool(name, args) {
  const state = store.load();
  switch (name) {
    case 'list_feeds': {
      const feeds = state.feeds.map((f) => ({
        id: f.id,
        url: f.url,
        title: f.title,
        unread: store.unreadCount(f),
        total: f.items.length,
        lastFetched: f.lastFetched,
      }));
      return textResult(JSON.stringify(feeds, null, 2));
    }
    case 'search_items': {
      const q = String((args && args.query) || '').trim().toLowerCase();
      if (!q) return errorResult('query must not be empty');
      const hits = [];
      for (const feed of state.feeds) {
        for (const item of feed.items) {
          if ((item.title + ' ' + item.description).toLowerCase().includes(q)) {
            hits.push({ feedId: feed.id, feedTitle: feed.title, ...item });
          }
        }
      }
      hits.sort((a, b) => (b.pubDate ? Date.parse(b.pubDate) : 0) - (a.pubDate ? Date.parse(a.pubDate) : 0));
      return textResult(JSON.stringify(hits.slice(0, 20), null, 2));
    }
    case 'mark_read': {
      const feed = state.feeds.find((f) => f.id === args.feedId);
      if (!feed) return errorResult(`Feed not found: ${args.feedId}`);
      const item = feed.items.find((i) => i.id === args.itemId);
      if (!item) return errorResult(`Item not found: ${args.itemId}`);
      item.read = true;
      store.save(state);
      return textResult(`Marked read: "${item.title}" (${store.unreadCount(feed)} unread left in ${feed.title}).`);
    }
    case 'add_feed': {
      const url = String((args && args.url) || '').trim();
      if (!/^https?:\/\/.+/.test(url)) return errorResult('Provide a valid http(s) feed URL');
      if (state.feeds.some((f) => f.url === url)) return errorResult('Feed already added');
      const res = await fetch(url, {
        headers: { 'User-Agent': 'RevenantReader/0.1 (MCP)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return errorResult(`Feed fetch failed: HTTP ${res.status}`);
      const parsed = parseFeed(await res.text());
      const feed = {
        id: store.nextId(state),
        url,
        title: parsed.title,
        link: parsed.link,
        description: parsed.description,
        lastFetched: new Date().toISOString(),
        items: [],
      };
      const added = store.mergeItems(feed, parsed.items);
      state.feeds.push(feed);
      store.save(state);
      return textResult(`Added feed "${feed.title}" with ${added} items.`);
    }
    case 'unread_count': {
      const total = state.feeds.reduce((n, f) => n + store.unreadCount(f), 0);
      return textResult(JSON.stringify({ unread: total, feeds: state.feeds.length }));
    }
    default:
      return errorResult(`Unknown tool: ${name}`);
  }
}

function handleMessage(msg) {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0') return null;
  const { id, method, params } = msg;
  const isNotification = id === undefined;

  const respond = (result) => ({ jsonrpc: '2.0', id, result });
  const respondError = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

  switch (method) {
    case 'initialize':
      return respond({
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
    case 'ping':
      return respond({});
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null; // notifications get no reply
    case 'tools/list':
      return respond({ tools: TOOLS });
    case 'tools/call': {
      if (isNotification) return null;
      return callTool(params.name, params.arguments || {})
        .then((result) => respond(result))
        .catch((err) => respondError(-32603, err.message));
    }
    default:
      if (isNotification) return null;
      return respondError(-32601, `Method not found: ${method}`);
  }
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', async (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue; // ignore malformed lines
    }
    const reply = await handleMessage(msg);
    if (reply) process.stdout.write(`${JSON.stringify(reply)}\n`);
  }
});
