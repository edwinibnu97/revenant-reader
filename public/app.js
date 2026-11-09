'use strict';

/* Revenant Reader — front end. Vanilla JS, no build step. */

const $ = (sel) => document.querySelector(sel);

let feeds = [];
let currentFeedId = null; // null = all unread
let searchMode = false;

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
}

async function api(path, opts) {
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

function renderFeeds() {
  const list = $('#feed-list');
  const totalUnread = feeds.reduce((n, f) => n + f.unread, 0);
  const all = document.createElement('li');
  all.innerHTML = `<button type="button" data-feed="" class="${currentFeedId === null && !searchMode ? 'active' : ''}">All unread <span class="count">${totalUnread}</span></button>`;
  list.replaceChildren(all);
  for (const f of feeds) {
    const li = document.createElement('li');
    li.innerHTML = `<button type="button" data-feed="${esc(f.id)}" class="${currentFeedId === f.id && !searchMode ? 'active' : ''}">${esc(f.title)} <span class="count">${f.unread}</span></button>`;
    list.appendChild(li);
  }
  list.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentFeedId = btn.dataset.feed || null;
      searchMode = false;
      $('#search').value = '';
      loadItems();
    });
  });
}

function renderItems(items, title, meta) {
  $('#feed-title').textContent = title;
  $('#feed-meta').textContent = meta || '';
  const list = $('#item-list');
  if (!items.length) {
    list.innerHTML = '<li class="empty">Nothing here yet. Add a feed, or press Refresh all to wake the dead.</li>';
    return;
  }
  list.replaceChildren();
  for (const item of items) {
    const li = document.createElement('li');
    li.className = `item${item.read ? ' read' : ''}`;
    li.innerHTML = `
      <a href="${esc(item.link)}" target="_blank" rel="noopener noreferrer" class="item-title">${esc(item.title)}</a>
      <p class="item-desc">${esc(item.description || '')}</p>
      <p class="item-meta">
        ${esc(item.feedTitle || '')} · ${esc(fmtDate(item.pubDate))}
        ${item.read ? '' : `<button type="button" class="mark-read" data-feed="${esc(item.feedId)}" data-item="${esc(item.id)}">Mark read</button>`}
      </p>`;
    list.appendChild(li);
  }
  list.querySelectorAll('.mark-read').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api('/api/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feedId: btn.dataset.feed, itemId: btn.dataset.item }),
        });
        await loadFeeds();
        await loadItems();
      } catch (err) {
        setStatus(err.message, true);
      }
    });
  });
}

function setStatus(msg, isError) {
  const el = $('#status');
  el.textContent = msg || '';
  el.classList.toggle('error', Boolean(isError));
}

async function loadFeeds() {
  const data = await api('/api/feeds');
  feeds = data.feeds;
  renderFeeds();
}

async function loadItems() {
  try {
    setStatus('');
    if (searchMode) return; // search renders separately
    if (currentFeedId === null) {
      const all = [];
      for (const f of feeds) {
        const data = await api(`/api/feeds/${encodeURIComponent(f.id)}/items`);
        for (const it of data.items) {
          if (!it.read) all.push({ ...it, feedId: f.id, feedTitle: f.title });
        }
      }
      all.sort((a, b) => (b.pubDate ? Date.parse(b.pubDate) : 0) - (a.pubDate ? Date.parse(a.pubDate) : 0));
      renderItems(all.slice(0, 100), 'All unread', `${all.length} unread across ${feeds.length} feeds`);
    } else {
      const data = await api(`/api/feeds/${encodeURIComponent(currentFeedId)}/items`);
      const feed = feeds.find((f) => f.id === currentFeedId);
      renderItems(
        data.items.map((it) => ({ ...it, feedId: feed.id, feedTitle: feed.title })),
        feed ? feed.title : 'Feed',
        `${data.items.length} items · ${feed ? feed.unread : 0} unread`,
      );
    }
  } catch (err) {
    setStatus(err.message, true);
  }
}

async function doSearch(q) {
  searchMode = true;
  try {
    const data = await api(`/api/search?q=${encodeURIComponent(q)}`);
    renderItems(data.items, `Search: “${q}”`, `${data.items.length} matches`);
  } catch (err) {
    setStatus(err.message, true);
  }
}

$('#add-feed').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const url = $('#feed-url').value.trim();
  $('#add-error').textContent = '';
  try {
    const data = await api('/api/feeds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    $('#feed-url').value = '';
    setStatus(`Raised “${data.feed.title}” with ${data.added} items.`);
    await loadFeeds();
    currentFeedId = data.feed.id;
    await loadItems();
  } catch (err) {
    $('#add-error').textContent = err.message;
  }
});

$('#refresh').addEventListener('click', async () => {
  setStatus('Waking the dead…');
  try {
    const data = await api('/api/refresh', { method: 'POST' });
    const added = data.results.reduce((n, r) => n + (r.added || 0), 0);
    const failed = data.results.filter((r) => !r.ok).length;
    setStatus(`Refreshed ${data.results.length} feeds, ${added} new items${failed ? `, ${failed} failed` : ''}.`);
    await loadFeeds();
    await loadItems();
  } catch (err) {
    setStatus(err.message, true);
  }
});

let searchTimer = null;
$('#search').addEventListener('input', (ev) => {
  const q = ev.target.value.trim();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    if (!q) {
      searchMode = false;
      loadItems();
      return;
    }
    doSearch(q);
  }, 300);
});

(async function init() {
  try {
    await loadFeeds();
    await loadItems();
  } catch (err) {
    setStatus(err.message, true);
  }
})();
