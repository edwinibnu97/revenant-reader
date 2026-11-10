'use strict';

/* Revenant Reader — front end. Vanilla JS, no build step. */

const $ = (sel) => document.querySelector(sel);

let feeds = [];
let currentFeedId = null; // null = all unread
let searchMode = false;
let unreadOnly = true; // filter for single-feed view
let currentItems = []; // items currently rendered (with feedId attached)
let selectedIdx = -1; // keyboard-selected item index into currentItems

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
    const last = f.lastFetched ? `Last refreshed ${fmtDate(f.lastFetched)}` : 'Never refreshed';
    const err = f.lastError ? `<span class="feed-error" title="${esc(f.lastError)}">⚠ Refresh failed</span>` : '';
    li.innerHTML = `<div class="feed-row"><button type="button" data-feed="${esc(f.id)}" class="${currentFeedId === f.id && !searchMode ? 'active' : ''}">${esc(f.title)} <span class="count">${f.unread}</span></button><button type="button" class="delete-feed" data-feed-id="${esc(f.id)}" aria-label="Remove ${esc(f.title)}" title="Remove feed">×</button></div><div class="feed-meta">${esc(last)} ${err}</div>`;
    list.appendChild(li);
  }
  list.querySelectorAll('button[data-feed]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentFeedId = btn.dataset.feed || null;
      searchMode = false;
      $('#search').value = '';
      loadItems();
    });
  });
  list.querySelectorAll('.delete-feed').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.feedId;
      const feed = feeds.find((f) => f.id === id);
      const name = feed ? feed.title : id;
      if (!confirm(`Remove feed "${name}"?`)) return;
      try {
        await api(`/api/feeds/${encodeURIComponent(id)}`, { method: 'DELETE' });
        setStatus(`Removed "${name}".`);
        if (currentFeedId === id) currentFeedId = null;
        await loadFeeds();
        await loadItems();
      } catch (err) {
        setStatus(err.message, true);
      }
    });
  });
}

async function markItemRead(feedId, itemId) {
  await api('/api/read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feedId, itemId }),
  });
  await loadFeeds();
  await loadItems();
}

function updateSelection() {
  document.querySelectorAll('#item-list .item').forEach((li, idx) => {
    li.classList.toggle('selected', idx === selectedIdx);
    if (idx === selectedIdx) li.scrollIntoView({ block: 'nearest' });
  });
}

function renderItems(items, title, meta) {
  $('#feed-title').textContent = title;
  $('#feed-meta').textContent = meta || '';
  currentItems = items;
  selectedIdx = -1;
  const list = $('#item-list');
  if (!items.length) {
    list.innerHTML = '<li class="empty">Nothing here yet. Add a feed, or press Refresh all to wake the dead.</li>';
    return;
  }
  list.replaceChildren();
  for (const [idx, item] of items.entries()) {
    const li = document.createElement('li');
    li.className = `item${item.read ? ' read' : ''}`;
    li.dataset.idx = String(idx);
    li.innerHTML = `
      <a href="${esc(item.link)}" target="_blank" rel="noopener noreferrer" class="item-title">${esc(item.title)}</a>
      <p class="item-desc">${esc(item.description || '')}</p>
      <p class="item-meta">
        ${esc(item.feedTitle || '')} · ${esc(fmtDate(item.pubDate))}
        ${item.read ? '' : `<button type="button" class="mark-read" data-feed="${esc(item.feedId)}" data-item="${esc(item.id)}">Mark read</button>`}
      </p>`;
    li.addEventListener('click', () => {
      selectedIdx = idx;
      updateSelection();
    });
    list.appendChild(li);
  }
  list.querySelectorAll('.mark-read').forEach((btn) => {
    btn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      try {
        await markItemRead(btn.dataset.feed, btn.dataset.item);
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
      const all = data.items.map((it) => ({ ...it, feedId: feed.id, feedTitle: feed.title }));
      const shown = unreadOnly ? all.filter((it) => !it.read) : all;
      renderItems(
        shown,
        feed ? feed.title : 'Feed',
        `${all.length} items · ${feed ? feed.unread : 0} unread${unreadOnly ? ' · showing unread only' : ''}`,
      );
    }
    // Reader tools (filter + mark-all-read) only apply to a single feed view.
    $('#reader-tools').style.display = currentFeedId !== null && !searchMode ? '' : 'none';
    $('#filter-unread').classList.toggle('active', unreadOnly);
    $('#filter-all').classList.toggle('active', !unreadOnly);
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

$('#filter-unread').addEventListener('click', () => {
  unreadOnly = true;
  searchMode = false;
  loadItems();
});

$('#filter-all').addEventListener('click', () => {
  unreadOnly = false;
  searchMode = false;
  loadItems();
});

$('#mark-all-read').addEventListener('click', async () => {
  if (!currentFeedId) return;
  const feed = feeds.find((f) => f.id === currentFeedId);
  if (!feed || !confirm(`Mark all items in "${feed.title}" as read?`)) return;
  try {
    await api(`/api/feeds/${encodeURIComponent(currentFeedId)}/read-all`, { method: 'POST' });
    setStatus(`All caught up in "${feed.title}".`);
    await loadFeeds();
    await loadItems();
  } catch (err) {
    setStatus(err.message, true);
  }
});

$('#opml-file').addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  try {
    const opml = await file.text();
    setStatus('Importing OPML…');
    const data = await api('/api/opml', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opml }),
    });
    const failed = data.failed.length ? `, ${data.failed.length} failed` : '';
    setStatus(`OPML import: ${data.added.length} added, ${data.skipped.length} skipped${failed}.`);
    await loadFeeds();
    await loadItems();
  } catch (err) {
    setStatus(err.message, true);
  }
});

// Keyboard shortcuts: j/k move, x mark read, Enter opens the selected item.
// Ignored while typing in an input, textarea, or select.
document.addEventListener('keydown', async (ev) => {
  const tag = (ev.target && ev.target.tagName) || '';
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  if (!currentItems.length) return;
  if (ev.key === 'j') {
    selectedIdx = Math.min(selectedIdx + 1, currentItems.length - 1);
    updateSelection();
  } else if (ev.key === 'k') {
    selectedIdx = Math.max(selectedIdx - 1, 0);
    updateSelection();
  } else if (ev.key === 'x' && selectedIdx >= 0) {
    const item = currentItems[selectedIdx];
    if (item && !item.read) {
      try {
        await markItemRead(item.feedId, item.id);
      } catch (err) {
        setStatus(err.message, true);
      }
    }
  } else if (ev.key === 'Enter' && selectedIdx >= 0) {
    const item = currentItems[selectedIdx];
    if (item && item.link) window.open(item.link, '_blank', 'noopener');
  }
});

(async function init() {
  try {
    await loadFeeds();
    await loadItems();
  } catch (err) {
    setStatus(err.message, true);
  }
})();
