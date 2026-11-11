'use strict';

/**
 * Unit tests for JSON Feed 1.x support in lib/rss.js parseFeed().
 * Uses a local fixture — no network access.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { parseFeed } = require('../lib/rss');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'sample-jsonfeed.json'),
  'utf8'
);

test('JSON Feed: parses title, link, and description from feed-level fields', () => {
  const feed = parseFeed(fixture);
  assert.equal(feed.title, 'Test JSON Feed');
  assert.equal(feed.link, 'https://example.com/');
  assert.equal(feed.description, 'A fixture feed for unit tests.');
});

test('JSON Feed: returns five items', () => {
  const feed = parseFeed(fixture);
  assert.equal(feed.items.length, 5);
});

test('JSON Feed: normal item — id, title, link, content_text description, pubDate as ISO', () => {
  const feed = parseFeed(fixture);
  const item = feed.items[0];
  assert.equal(item.id, 'item-1');
  assert.equal(item.title, 'Normal item with content_text');
  assert.equal(item.link, 'https://example.com/1');
  assert.equal(item.description, 'Plain text description from content_text.');
  assert.equal(item.pubDate, '2026-11-01T10:00:00.000Z');
});

test('JSON Feed: content_html-only description is stripped of tags', () => {
  const feed = parseFeed(fixture);
  const item = feed.items[1];
  assert.equal(item.id, 'item-2');
  // Tags must be gone, text must remain
  assert.ok(!item.description.includes('<'), 'description must not contain HTML tags');
  assert.ok(item.description.includes('content_html'), 'stripped text must be present');
  assert.ok(item.description.includes('stripped of tags'), 'stripped text must be present');
});

test('JSON Feed: item with both url and external_url uses url as link', () => {
  const feed = parseFeed(fixture);
  const item = feed.items[2];
  assert.equal(item.link, 'https://example.com/3');
});

test('JSON Feed: missing title falls back to (no title)', () => {
  const feed = parseFeed(fixture);
  const item = feed.items[3];
  assert.equal(item.title, '(no title)');
});

test('JSON Feed: undated item has pubDate null', () => {
  const feed = parseFeed(fixture);
  const item = feed.items[4];
  assert.equal(item.pubDate, null);
});

test('JSON Feed: non-JSON-Feed JSON object is rejected', () => {
  assert.throws(
    () => parseFeed('{"some":"object","no_version":true}'),
    /Unrecognized feed format/
  );
});

test('JSON Feed: plain JSON array is rejected', () => {
  assert.throws(
    () => parseFeed('[1, 2, 3]'),
    /Feed is not XML/
  );
});

test('RSS 2.0 parsing still works after JSON Feed changes', () => {
  const rssXml = fs.readFileSync(
    path.join(__dirname, 'fixtures', 'sample-rss.xml'),
    'utf8'
  );
  const feed = parseFeed(rssXml);
  assert.equal(feed.title, 'Test Gazette');
  assert.equal(feed.items.length, 2);
});

test('Atom parsing still works after JSON Feed changes', () => {
  const atomXml = fs.readFileSync(
    path.join(__dirname, 'fixtures', 'sample-atom.xml'),
    'utf8'
  );
  const feed = parseFeed(atomXml);
  assert.equal(feed.title, 'Test Atom');
  assert.equal(feed.items.length, 2);
});
