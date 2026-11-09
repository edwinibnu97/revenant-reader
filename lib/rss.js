'use strict';

/**
 * Minimal RSS 2.0 + Atom feed parser, built on fast-xml-parser.
 * Input: raw feed XML string. Output: normalized feed object.
 *
 *   {
 *     title: string,
 *     link: string,
 *     description: string,
 *     items: [{ id, title, link, description, pubDate (ISO string|null) }]
 *   }
 *
 * Known limits (tracked in .kiro/specs/feed-engine/tasks.md):
 * - Only RSS 2.0 (<channel>/<item>) and Atom (<feed>/<entry>) shapes.
 * - HTML inside descriptions is kept as text; the UI renders it as plain text.
 * - Feeds that require auth or return non-XML are rejected with an error.
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

function parseFeed(xml) {
  if (typeof xml !== 'string' || !xml.trim().startsWith('<')) {
    throw new Error('Feed is not XML');
  }
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
