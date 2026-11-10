'use strict';

/**
 * OPML import/export for Revenant Reader.
 * Export: build an OPML 2.0 document from the store state.
 * Import: parse an OPML document into [{ title, url }] (outline elements
 * with an xmlUrl attribute, nested outlines flattened).
 */

const { XMLParser } = require('fast-xml-parser');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => name === 'outline',
  trimValues: true,
  parseTagValue: false,
});

function escXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildOpml(state) {
  const feeds = (state.feeds || []).map((f) => {
    const title = escXml(f.title || f.url);
    const url = escXml(f.url);
    return `    <outline type="rss" text="${title}" title="${title}" xmlUrl="${url}" htmlUrl="${escXml(f.link || '')}" />`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head>\n    <title>Revenant Reader subscriptions</title>\n  </head>\n  <body>\n${feeds}\n  </body>\n</opml>\n`;
}

function collectOutlines(node, out) {
  if (!node || typeof node !== 'object') return;
  const outlines = Array.isArray(node.outline) ? node.outline : node.outline ? [node.outline] : [];
  for (const o of outlines) {
    const url = typeof o['@_xmlUrl'] === 'string' ? o['@_xmlUrl'].trim() : '';
    if (url) {
      out.push({ title: o['@_title'] || o['@_text'] || url, url });
    }
    collectOutlines(o, out);
  }
}

function parseOpml(xml) {
  if (typeof xml !== 'string' || !xml.trim().startsWith('<')) {
    throw new Error('OPML is not XML');
  }
  const doc = parser.parse(xml);
  if (!doc.opml || doc.opml.body === undefined || doc.opml.body === null) {
    throw new Error('Not an OPML document (missing <opml><body>)');
  }
  const out = [];
  collectOutlines(doc.opml.body, out);
  return out;
}

module.exports = { buildOpml, parseOpml };
