'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { parseFeed } = require('../lib/rss');

const rssXml = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-rss.xml'), 'utf8');
const atomXml = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-atom.xml'), 'utf8');

test('parses RSS 2.0: title, items, dates, CDATA stripped', () => {
  const feed = parseFeed(rssXml);
  assert.equal(feed.title, 'Test Gazette');
  assert.equal(feed.items.length, 2);
  assert.equal(feed.items[0].title, 'First post & friends');
  assert.equal(feed.items[0].description, 'Hello world');
  assert.equal(feed.items[0].pubDate, '2026-11-03T10:00:00.000Z');
  assert.equal(feed.items[1].link, 'https://example.com/2');
});

test('parses Atom: title, entries, links, updated dates', () => {
  const feed = parseFeed(atomXml);
  assert.equal(feed.title, 'Test Atom');
  assert.equal(feed.items.length, 2);
  assert.equal(feed.items[0].title, 'Atom entry one');
  assert.equal(feed.items[0].link, 'https://example.com/a1');
  assert.equal(feed.items[0].pubDate, '2026-11-05T08:00:00.000Z');
});

test('rejects non-XML and unknown formats', () => {
  assert.throws(() => parseFeed('not xml at all'), /not XML/);
  assert.throws(() => parseFeed('<html><body>hi</body></html>'), /Unrecognized/);
});
