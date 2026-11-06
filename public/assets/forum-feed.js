/**
 * Kiln FDE Forum — interactive feed client.
 *
 * Talks to the public feed API (`GET /api/forum/feed`, `GET /api/forum/thread/:id`)
 * and, when a verified member is signed in (session cookie shared with /app),
 * to the member APIs for posting threads, nested replies, reactions, accepted
 * answers, status changes and deletion.
 */
(function () {
  'use strict';

  const el = (id) => document.getElementById(id);
  const board = el('feedBoard');
  const statusOut = el('feedStatusOut');
  const signer = el('feedSigner');
  const statsOut = el('feedStats');
  const eventsOut = el('feedEvents');
  const peopleOut = el('feedPeople');
  const spacesBar = el('feedSpacesBar');
  const tagsBar = el('feedTagsBar');
  const query = el('feedQuery');
  const spaceSel = el('feedSpace');
  const statusSel = el('feedStatus');
  const sortSel = el('feedSort');
  const form = el('feedForm');
  const formTitle = el('feedTitle');
  const formBody = el('feedBody');
  const formSpace = el('feedSpaceInput');
  const formTags = el('feedTagsInput');
  const formStatus = el('feedFormStatus');
  const formWrap = el('feedComposer');

  const state = { me: null, feed: null, views: {}, expanded: {} };

  /* ------------------------------------------------------------ utilities */
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2)
      .map((w) => (w[0] || '').toUpperCase()).join('') || '?';
  }

  function roleLabel(role) {
    if (role === 'fde') return 'FDE';
    if (role === 'sde') return 'SDE';
    if (role === 'admin') return 'Admin';
    return 'Registered';
  }

  function roleBadge(role) {
    return `<span class="forum-role-badge role-${esc(role)}">${roleLabel(role)}</span>`;
  }

  function when(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  function say(node, kind, text) {
    if (!node) return;
    node.className = `board-note ${kind || ''}`.trim();
    node.textContent = text || '';
    if (text) {
      clearTimeout(say[node.$$t]);
      say[node.$$t] = setTimeout(() => { node.textContent = ''; node.className = 'board-note'; }, 4000);
    }
  }

  async function api(url, options = {}) {
    const opts = { method: options.method || 'GET', credentials: 'same-origin', headers: {} };
    if (opts.method !== 'GET') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(options.body || {});
    }
    const res = await fetch(url, opts);
    let payload = {};
    try { payload = await res.json(); } catch (error) { payload = {}; }
    if (!res.ok) {
      const error = new Error(payload.error || `Request failed (${res.status})`);
      error.status = res.status;
      throw error;
    }
    return payload;
  }

  function signInPrompt() {
    window.location.href = '/app?next=/fde-forum';
  }

  /* --------------------------------------------------------- data loading */
  async function loadFeed() {
    const params = new URLSearchParams();
    if (query && query.value.trim()) params.set('q', query.value.trim());
    if (spaceSel && spaceSel.value) params.set('space', spaceSel.value);
    if (statusSel && statusSel.value) params.set('status', statusSel.value);
    if (sortSel && sortSel.value) params.set('sort', sortSel.value);
    const qs = params.toString();
    const payload = await api(`/api/forum/feed${qs ? `?${qs}` : ''}`);
    state.feed = payload;
    renderFeed();
  }

  async function loadThread(threadId) {
    const detail = await api(`/api/forum/thread/${threadId}`);
    state.views[threadId] = detail;
    state.expanded[threadId] = true;
    renderFeed();
  }

  /* ------------------------------------------------------------- rendering */
  function isMine(thread) {
    return !!state.me && state.me.id === (thread.author && thread.author.id);
  }

  function isAdminNow() {
    return !!state.me && (state.me.admin || state.me.forumRole === 'fde');
  }

  function spaceChip(space) {
    const active = spaceSel && spaceSel.value === space.id ? ' on' : '';
    return `<button type="button" class="forum-chip${active}" data-space="${esc(space.id)}" title="${esc(space.about)}">${esc(space.glyph)} ${esc(space.name)}</button>`;
  }

  function statusChip(status, count) {
    const active = statusSel && statusSel.value === status ? ' on' : '';
    return `<button type="button" class="forum-chip${active}" data-status="${esc(status)}">${esc(status)} <span>${count}</span></button>`;
  }

  function tagChip(tag) {
    return `<button type="button" class="forum-chip" data-tag="${esc(tag)}">#${esc(tag)}</button>`;
  }

  function statCell(value, label) {
    return `<div class="forum-stat"><b>${esc(value)}</b><span>${esc(label)}</span></div>`;
  }

  function eventCard(eventRow) {
    const date = new Date(eventRow.startsAt);
    const day = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
    return `<article class="forum-event">
      <span class="forum-event-date">${esc(day)}</span>
      <div>
        <b>${esc(eventRow.title)}</b>
        <p>${esc(eventRow.summary)}</p>
        <small>${esc(eventRow.pod)} · ${esc(time)} UTC · ${esc(eventRow.minutes)} min</small>
      </div>
    </article>`;
  }

  function collectPeople(threads) {
    const people = new Map();
    const rank = (r) => (r === 'fde' ? 3 : r === 'sde' ? 2 : 1);
    Object.keys(state.views).forEach((key) => {
      const view = state.views[key];
      if (!view) return;
      [view.thread.author, view.thread.acceptedBy].filter(Boolean).forEach((a) => {
        if (!people.has(a.name) || rank(a.role) > rank(people.get(a.name).role)) people.set(a.name, a);
      });
      view.replies.forEach((r) => {
        if (!people.has(r.author.name) || rank(r.author.role) > rank(people.get(r.author.name).role)) people.set(r.author.name, r.author);
      });
    });
    threads.forEach((t) => {
      [t.author, t.acceptedBy].filter(Boolean).forEach((a) => {
        if (!people.has(a.name) || rank(a.role) > rank(people.get(a.name).role)) people.set(a.name, a);
      });
    });
    return Array.from(people.values()).sort((a, b) => rank(b.role) - rank(a.role)).slice(0, 8);
  }

  function replyNode(reply, threadId, depth) {
    const accepted = reply.id === (state.views[threadId].thread.acceptedReplyId || '');
    const likes = (reply.reactions || []).filter((r) => r.type === 'like').length;
    const helpful = (reply.reactions || []).filter((r) => r.type === 'helpful').length;
    const children = (reply.children || []).map((child) => replyNode(child, threadId, depth + 1)).join('');
    return `<article class="forum-reply" data-reply="${esc(reply.id)}" style="margin-left:${depth * 20}px">
      <div class="forum-reply-head">
        <span class="forum-avatar">${esc(reply.author.initials)}</span>
        <div>
          <b>${esc(reply.author.name)}</b> ${roleBadge(reply.author.role)}
          <time>· ${esc(when(reply.createdAt))}${reply.edited ? ' · edited' : ''}</time>
        </div>
      </div>
      <p class="forum-reply-body">${esc(reply.body)}</p>
      <div class="forum-reply-actions">
        <button type="button" class="forum-mini" data-act="r-like" data-reply="${esc(reply.id)}">Like${likes ? ` (${likes})` : ''}</button>
        <button type="button" class="forum-mini" data-act="r-helpful" data-reply="${esc(reply.id)}">Helpful${helpful ? ` (${helpful})` : ''}</button>
        <button type="button" class="forum-mini" data-act="r-reply" data-reply="${esc(reply.id)}">Reply</button>
        ${!accepted && (isMine(state.views[threadId].thread) || isAdminNow()) ? `<button type="button" class="forum-mini" data-act="accept" data-reply="${esc(reply.id)}" data-thread="${esc(threadId)}">Mark answer</button>` : ''}
        ${accepted ? '<span class="forum-accepted">✓ Accepted answer</span>' : ''}
      </div>
      <form class="forum-inline-reply" hidden data-reply-to="${esc(reply.id)}">
        <textarea name="body" rows="2" placeholder="Reply to ${esc(reply.author.name)}…"></textarea>
        <div class="forum-inline-actions"><button type="submit" class="btn btn-ink">Post</button>
        <button type="button" class="btn btn-line" data-act="r-cancel">Cancel</button></div>
      </form>
      ${children}
    </article>`;
  }

  function orderedReplies(replies) {
    const map = new Map(replies.map((r) => [r.id, { ...r, children: [] }]));
    const roots = [];
    replies.forEach((r) => {
      const node = map.get(r.id);
      if (r.parentId && map.has(r.parentId)) map.get(r.parentId).children.push(node);
      else roots.push(node);
    });
    return roots;
  }

  function threadCard(summary) {
    const expanded = state.expanded[summary.id];
    const view = state.views[summary.id];
    const likes = summary.counts.reactions || summary.counts.likes || 0;
    const replies = summary.counts.replies;
    const chips = []
      .concat(summary.pinned ? ['<span class="forum-chip-chip pinned">Pinned</span>'] : [])
      .concat(summary.status !== 'open' ? [`<span class="forum-chip-chip status-${esc(summary.status)}">${esc(summary.status)}</span>`] : [])
      .concat(summary.fdeAnswered ? ['<span class="forum-chip-chip fde-answered">FDE answered</span>'] : [])
      .join('');
    const tags = (summary.tags || []).map((t) => `<button type="button" class="forum-tag" data-tag="${esc(t)}">#${esc(t)}</button>`).join('');

    let repliesHtml = '';
    if (expanded && view) {
      const accepted = view.replies.find((r) => r.id === view.thread.acceptedReplyId);
      repliesHtml = `<div class="forum-thread-replies">
        ${accepted ? `<div class="forum-answer-card"><span class="forum-accepted-mark">✓</span><div><b>${esc(accepted.author.name)}</b>${roleBadge(accepted.author.role)}<p>${esc(accepted.body)}</p></div></div>` : ''}
        ${orderedReplies(view.replies).map((r) => replyNode(r, summary.id, 0)).join('') || '<p class="forum-empty">No replies yet. Be the first to help.</p>'}
        ${replyForm(summary.id, '')}
      </div>`;
    }

    return `<article class="forum-thread${summary.pinned ? ' is-pinned' : ''}" data-thread="${esc(summary.id)}">
      <div class="forum-thread-head">
        <span class="forum-avatar">${esc(summary.author.initials)}</span>
        <div class="forum-thread-titleline">
          <h3>${esc(summary.title)}</h3>
          <div class="forum-thread-meta">
            ${roleBadge(summary.author.role)}
            <span class="forum-space-name">${esc(summary.space ? summary.space.name : '')}</span>
            <time>${esc(when(summary.lastActivityAt || summary.createdAt))}</time>
            ${summary.acceptedBy ? `<span class="forum-accepted-inline">Answered by ${esc(summary.acceptedBy.name)}</span>` : ''}
          </div>
        </div>
      </div>
      <p class="forum-thread-body">${esc(summary.preview)}</p>
      <div class="forum-thread-foot">
        <div class="forum-thread-counts">
          <button type="button" class="forum-mini" data-act="toggle">${expanded ? 'Hide' : `${replies ? replies : ''} ${replies ? (replies === 1 ? 'Reply' : 'Replies') : 'Reply'}`}</button>
          <button type="button" class="forum-mini" data-act="like">Like${likes ? ` (${likes})` : ''}</button>
          <button type="button" class="forum-mini" data-act="helpful">Helpful</button>
        </div>
        <div class="forum-thread-side">
          ${state.me && (isMine(summary) || isAdminNow()) ? `<button type="button" class="forum-mini" data-act="close">Close</button>` : ''}
          ${state.me && isAdminNow() ? `<button type="button" class="forum-mini" data-act="pin">${summary.pinned ? 'Unpin' : 'Pin'}</button>` : ''}
          ${state.me && (isMine(summary) || isAdminNow()) ? `<button type="button" class="forum-mini danger" data-act="delete">Delete</button>` : ''}
        </div>
      </div>
      <div class="forum-thread-tags">${tags}</div>
      ${chips ? `<div class="forum-thread-chips">${chips}</div>` : ''}
      ${repliesHtml}
    </article>`;
  }

  function replyForm(threadId, parentId) {
    return `<form class="forum-reply-form" data-thread="${esc(threadId)}" data-parent="${esc(parentId || '')}">
      <textarea name="body" rows="2" placeholder="${state.me ? `Answer as ${roleLabel(state.me.forumRole)}…` : 'Sign in to reply…'}"></textarea>
      <div class="forum-inline-actions">
        <button type="submit" class="btn btn-ink">${parentId ? 'Post reply' : 'Post answer'}</button>
        ${parentId ? `<button type="button" class="btn btn-line" data-act="r-cancel">Cancel</button>` : ''}
      </div>
    </form>`;
  }

  function render() {
    renderFeed();
  }

  function renderFeed() {
    if (!state.feed || !board) return;
    const { threads, spaces, tags, events, stats } = state.feed;

    if (spacesBar) spacesBar.innerHTML = spaces.map(spaceChip).join('');
    if (tagsBar) tagsBar.innerHTML = tags.map(tagChip).join('');
    if (statusSel && statusSel.options.length <= 1) {
      ['open', 'answered', 'resolved', 'escalated'].forEach((st) => statusSel.add(new Option(st, st)));
    }
    if (statsOut) {
      statsOut.innerHTML = [
        statCell(stats.threads, 'Threads'),
        statCell(stats.answered, 'FDE answered'),
        statCell(stats.replies, 'Replies'),
        statCell(stats.likes, 'Reactions'),
      ].join('');
    }
    if (eventsOut) eventsOut.innerHTML = events.map(eventCard).join('');

    const people = collectPeople(threads);
    if (peopleOut) {
      peopleOut.innerHTML = people.length
        ? people.map((p) => `<div class="forum-person"><span class="forum-avatar small">${esc(p.initials)}</span><div><b>${esc(p.name)}</b>${roleBadge(p.role)}</div></div>`).join('')
        : '<p class="forum-empty">Contributors show up here after the first reply.</p>';
    }

    board.innerHTML = threads.length
      ? threads.map(threadCard).join('')
      : `<p class="forum-empty board-empty">No threads match this view yet.${state.feed.spaces.length ? '' : ' The forum is initializing — refresh in a moment.'}</p>`;

    renderSigner();
  }

  function renderSigner() {
    if (!signer) return;
    if (state.me) {
      signer.innerHTML = `${roleBadge(state.me.forumRole)} <b>${esc(state.me.name)}</b><small>${esc(state.me.forumRole === 'fde' ? 'Forward deployed engineer · can answer and accept' : state.me.forumRole === 'sde' ? 'Solutions engineer · can answer' : 'Registered member · can ask and reply')}</small>`;
    } else {
      signer.innerHTML = '<small>Signed out. Ask and reply after a quick sign-in — FDEs, SDEs and registered members all participate.</small> <a class="btn btn-ink" href="/app?next=/fde-forum">Sign in</a>';
    }
  }

  /* ------------------------------------------------------------- handlers */
  async function actThread(threadId, kind, payload) {
    if (!state.me) return signInPrompt();
    try {
      if (kind === 'delete') {
        if (!window.confirm('Delete this thread and its replies?')) return;
        await api(`/api/forum/thread/${threadId}`, { method: 'DELETE' });
        delete state.views[threadId];
        delete state.expanded[threadId];
        await loadFeed();
        say(statusOut, 'ok', 'Thread deleted.');
      } else if (kind === 'close') {
        await api(`/api/forum/thread/${threadId}/action`, { method: 'POST', body: { action: 'close', status: 'resolved' } });
        say(statusOut, 'ok', 'Thread marked resolved.');
        await loadFeed();
      } else if (kind === 'pin') {
        await api(`/api/forum/thread/${threadId}/action`, { method: 'POST', body: { action: 'pin' } });
        await loadFeed();
      } else if (kind === 'accept') {
        await api(`/api/forum/thread/${threadId}/action`, { method: 'POST', body: { action: 'accept', replyId: payload.replyId } });
        await loadThread(threadId);
        say(statusOut, 'ok', 'Accepted answer updated.');
      } else {
        await api(`/api/forum/thread/${threadId}/reaction`, { method: 'POST', body: { type: kind } });
        await loadFeed();
      }
    } catch (error) {
      say(statusOut, 'error', error.message);
    }
  }

  async function actReply(replyId, kind, payload) {
    if (!state.me) return signInPrompt();
    try {
      if (kind === 'accept') return actThread(payload.threadId, 'accept', payload);
      await api(`/api/forum/reply/${replyId}/reaction`, { method: 'POST', body: { type: kind === 'r-helpful' ? 'helpful' : 'like' } });
      if (state.expanded[payload.threadId]) await loadThread(payload.threadId);
      else await loadFeed();
    } catch (error) {
      say(statusOut, 'error', error.message);
    }
  }

  async function submitThread(event) {
    event.preventDefault();
    if (!state.me) return signInPrompt();
    const title = formTitle.value.trim();
    const body = formBody.value.trim();
    const tags = formTags.value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 6);
    try {
      const payload = await api('/api/forum/thread', { method: 'POST', body: { title, body, space: formSpace.value, tags } });
      formTitle.value = '';
      formBody.value = '';
      formTags.value = '';
      say(formStatus, 'ok', 'Posted. It is live in the feed.');
      await loadFeed();
      await loadThread(payload.thread.id);
      if (board) board.querySelector(`[data-thread="${payload.thread.id}"]`).scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (error) {
      say(formStatus, 'error', error.message);
    }
  }

  async function submitReply(event) {
    event.preventDefault();
    const formEl = event.target;
    const threadId = formEl.getAttribute('data-thread');
    const parentId = formEl.getAttribute('data-parent') || null;
    const body = formEl.querySelector('[name=body]').value.trim();
    if (!body) return;
    if (!state.me) return signInPrompt();
    try {
      await api(`/api/forum/thread/${threadId}/reply`, { method: 'POST', body: { body, parentId } });
      await loadThread(threadId);
      say(statusOut, 'ok', 'Reply posted.');
    } catch (error) {
      say(statusOut, 'error', error.message);
    }
  }

  function onClick(event) {
    const chip = event.target.closest('[data-space]');
    if (chip && !chip.hasAttribute('data-act')) {
      if (spaceSel) spaceSel.value = chip.getAttribute('data-space') === spaceSel.value ? '' : chip.getAttribute('data-space');
      loadFeed().catch((error) => say(statusOut, 'error', error.message));
      return;
    }
    const statusChipEl = event.target.closest('[data-status]');
    if (statusChipEl) {
      if (statusSel) statusSel.value = statusChipEl.getAttribute('data-status') === statusSel.value ? '' : statusChipEl.getAttribute('data-status');
      loadFeed().catch((error) => say(statusOut, 'error', error.message));
      return;
    }
    const tagChipEl = event.target.closest('[data-tag]');
    if (tagChipEl && !tagChipEl.hasAttribute('data-act')) {
      if (query) query.value = tagChipEl.getAttribute('data-tag');
      if (spaceSel) spaceSel.value = '';
      loadFeed().catch((error) => say(statusOut, 'error', error.message));
      return;
    }
    const button = event.target.closest('[data-act]');
    if (!button) return;
    const act = button.getAttribute('data-act');
    const replyId = button.getAttribute('data-reply');
    if (act === 'r-cancel') {
      const wrap = button.closest('form');
      if (wrap) {
        wrap.reset();
        if (wrap.classList.contains('forum-inline-reply')) wrap.hidden = true;
      }
      return;
    }
    if (act === 'r-reply') {
      const parent = button.closest('[data-reply]');
      if (parent) {
        const inner = parent.querySelector('.forum-inline-reply');
        if (inner) { inner.hidden = false; inner.querySelector('[name=body]').focus(); }
      }
      return;
    }
    const threadEl = button.closest('[data-thread]');
    const threadId = threadEl && threadEl.getAttribute('data-thread');
    if (!threadId) return;
    if (act === 'toggle') {
      if (state.expanded[threadId]) { state.expanded[threadId] = false; renderFeed(); }
      else if (state.views[threadId]) { state.expanded[threadId] = true; renderFeed(); }
      else loadThread(threadId).catch((error) => say(statusOut, 'error', error.message));
      return;
    }
    if (act === 'like' || act === 'helpful') return void actThread(threadId, act);
    if (act === 'close' || act === 'pin' || act === 'delete') return void actThread(threadId, act);
    if (replyId && (act === 'r-like' || act === 'r-helpful')) {
      return void actReply(replyId, act, { threadId });
    }
    if (replyId && act === 'accept') {
      return void actThread(threadId, 'accept', { replyId });
    }
  }

  function onSubmit(event) {
    if (event.target.matches('.forum-reply-form, .forum-inline-reply')) return submitReply(event);
    if (event.target === form) return submitThread(event);
  }

  /* --------------------------------------------------------------- startup */
  async function start() {
    try {
      const me = await api('/api/me');
      state.me = me.user;
    } catch (error) {
      state.me = null;
    }
    if (formSpace && state.feed) {
      // populated by renderFeed below once feed is loaded
    }
    try {
      await loadFeed();
      if (formSpace && state.feed) formSpace.innerHTML = state.feed.spaces.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
      renderSigner();
      if (state.me) say(statusOut, 'ok', `Signed in as ${roleLabel(state.me.forumRole)}. You can ask, reply and react.`);
    } catch (error) {
      if (board) board.innerHTML = '<p class="forum-empty board-empty">The feed could not load. Refresh to retry.</p>';
      say(statusOut, 'error', error.message);
    }
  }

  if (board) {
    board.addEventListener('click', onClick);
    board.addEventListener('submit', onSubmit);
  }
  [query, spaceSel, statusSel, sortSel].forEach((input) => {
    if (!input) return;
    input.addEventListener('change', () => loadFeed().catch((error) => say(statusOut, 'error', error.message)));
  });
  if (query) {
    let debounce;
    query.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => loadFeed().catch((error) => say(statusOut, 'error', error.message)), 250);
    });
  }
  if (form) form.addEventListener('submit', submitThread);

  start();
})();
