'use strict';

/**
 * Feed parser: RSS 2.0, Atom, RSS 1.0/RDF, and JSON Feed 1.x.
 * Input: raw feed string (XML or JSON). Output: normalized feed object.
 *
 *   {
 *     title: string,
 *     link: string,
 *     description: string,
 *     items: [{ id, title, link, description, pubDate (ISO string|null) }]
 *   }
 *
 * Format detection:
 * - JSON Feed: trimmed body starts with '{', parses to an object whose
 *   `version` string contains "jsonfeed" (case-insensitive) and which has
 *   an `items` array.
 * - Otherwise treated as XML (RSS 2.0 / Atom / RSS 1.0/RDF).
 *
 * Notes:
 * - HTML inside descriptions is stripped; the UI renders plain text.
 * - Feeds that require auth, or whose format is not recognised, throw an Error.
 */

const { XMLParser } = require('fast-xml-parser');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => name === 'item' || name === 'entry' || name === 'link',
  trimValues: true,
  parseTagValue: false,
});

function text(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    if ('#text' in value) return String(value['#text']);
    if ('__cdata' in value) return String(value['__cdata']);
  }
  return String(value);
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function stripTags(str) {
  return decodeEntities(str.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

function toIso(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function pickLink(links, fallback) {
  if (!links) return fallback || '';
  const list = Array.isArray(links) ? links : [links];
  const alt = list.find((l) => typeof l === 'object' && l['@_href'] && (!l['@_rel'] || l['@_rel'] === 'alternate'));
  if (alt) return alt['@_href'];
  const first = list.find((l) => typeof l === 'object' && l['@_href']);
  if (first) return first['@_href'];
  if (typeof list[0] === 'string') return list[0];
  return fallback || '';
}

/**
 * Parse a JSON Feed 1.x string into the standard feed object.
 * Throws if the input is not a valid JSON Feed.
 */
function parseJsonFeed(body) {
  let obj;
  try {
    obj = JSON.parse(body);
  } catch {
    throw new Error('Feed is not XML or valid JSON');
  }
  if (
    !obj ||
    typeof obj !== 'object' ||
    typeof obj.version !== 'string' ||
    !obj.version.toLowerCase().includes('jsonfeed') ||
    !Array.isArray(obj.items)
  ) {
    throw new Error('Unrecognized feed format (not RSS 2.0, Atom, RSS 1.0, or JSON Feed)');
  }

  return {
    title: stripTags(String(obj.title || '')) || 'Untitled feed',
    link: String(obj.home_page_url || ''),
    description: stripTags(String(obj.description || '')),
    items: obj.items.map((it) => {
      // description: content_text first, then stripped content_html, then summary
      let description = '';
      if (typeof it.content_text === 'string' && it.content_text.trim()) {
        description = it.content_text.trim();
      } else if (typeof it.content_html === 'string' && it.content_html.trim()) {
        description = stripTags(it.content_html);
      } else if (typeof it.summary === 'string') {
        description = it.summary.trim();
      }

      return {
        id: String(it.id || it.url || it.title || ''),
        title: stripTags(String(it.title || '')) || '(no title)',
        link: String(it.url || it.external_url || ''),
        description,
        pubDate: toIso(typeof it.date_published === 'string' ? it.date_published : null),
      };
    }),
  };
}

function parseFeed(body) {
  if (typeof body !== 'string') {
    throw new Error('Feed is not XML');
  }
  const trimmed = body.trim();

  // JSON Feed detection: starts with '{' and parses to a JSON Feed object.
  if (trimmed.startsWith('{')) {
    return parseJsonFeed(trimmed);
  }

  if (!trimmed.startsWith('<')) {
    throw new Error('Feed is not XML');
  }
  const xml = body;
  const doc = parser.parse(xml);

  // RSS 2.0
  if (doc.rss && doc.rss.channel) {
    const ch = doc.rss.channel;
    const rawItems = Array.isArray(ch.item) ? ch.item : ch.item ? [ch.item] : [];
    return {
      title: stripTags(text(ch.title)) || 'Untitled feed',
      link: pickLink(ch.link, ''),
      description: stripTags(text(ch.description)),
      items: rawItems.map((it) => ({
        id: text(it.guid) || text(it.link) || text(it.title),
        title: stripTags(text(it.title)) || '(no title)',
        link: pickLink(it.link, text(it.link)),
        description: stripTags(text(it.description) || text(it['content:encoded']) || ''),
        pubDate: toIso(text(it.pubDate) || text(it['dc:date'])),
      })),
    };
  }

  // Atom
  if (doc.feed) {
    const feed = doc.feed;
    const rawEntries = Array.isArray(feed.entry) ? feed.entry : feed.entry ? [feed.entry] : [];
    return {
      title: stripTags(text(feed.title)) || 'Untitled feed',
      link: pickLink(feed.link, ''),
      description: stripTags(text(feed.subtitle)),
      items: rawEntries.map((en) => ({
        id: text(en.id) || pickLink(en.link, '') || text(en.title),
        title: stripTags(text(en.title)) || '(no title)',
        link: pickLink(en.link, ''),
        description: stripTags(text(en.summary) || text(en.content) || ''),
        pubDate: toIso(text(en.updated) || text(en.published)),
      })),
    };
  }

  // RDF / RSS 1.0 (channel + item siblings) — best effort
  if (doc['rdf:RDF']) {
    const rdf = doc['rdf:RDF'];
    const rawItems = Array.isArray(rdf.item) ? rdf.item : rdf.item ? [rdf.item] : [];
    const ch = rdf.channel || {};
    return {
      title: stripTags(text(ch.title)) || 'Untitled feed',
      link: pickLink(ch.link, ''),
      description: stripTags(text(ch.description)),
      items: rawItems.map((it) => ({
        id: text(it.link) || text(it.title),
        title: stripTags(text(it.title)) || '(no title)',
        link: pickLink(it.link, text(it.link)),
        description: stripTags(text(it.description) || ''),
        pubDate: toIso(text(it['dc:date'])),
      })),
    };
  }

  throw new Error('Unrecognized feed format (not RSS 2.0, Atom, or RSS 1.0)');
}

module.exports = { parseFeed };
