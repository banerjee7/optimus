'use strict';
/**
 * Kiln FDE Forum — server-backed interactive feed.
 *
 * Zero external dependencies. Threads, nested replies, role badges, reactions
 * and spaces are stored alongside the rest of the single JSON document, with
 * optional Blob persistence.
 */

const crypto = require('crypto');
const { db, save } = require('./store');
const identity = require('./identity');
const { cleanText, cleanLabel, cleanEmail } = require('./security');

const SPACES = [
  { id: 'applied-ai', name: 'Applied AI in production', glyph: '⌁', about: 'Model choice, evaluation harnesses, latency, guardrails and production gates.' },
  { id: 'data-integrations', name: 'Data & integrations', glyph: '▤', about: 'Source-of-truth boundaries, refresh waves, connector scope and privacy.' },
  { id: 'delivery-scope', name: 'Delivery & scope', glyph: '◇', about: 'Product wedge, timeline realism, proposal language and rollout gates.' },
  { id: 'security-compliance', name: 'Security & compliance', glyph: '⚖', about: 'Auth, least privilege, audit, PII/PHI, SCIM, SOC 2 and DPAs.' },
  { id: 'field-notes', name: 'Field notes', glyph: '✉', about: 'What shipped, what failed, and what the owning engineer changed next.' },
  { id: 'showcase', name: 'Showcase', glyph: '☆', about: 'Public demos, sandbox previews and applied-AI reference builds.' },
];

const EVENTS_SEED = [
  {
    id: 'evt_office_hours',
    title: 'Applied AI office hours',
    summary: 'Bring one architecture question. Senior FDEs answer live with a working slice in the sandbox.',
    startsAt: '2026-11-04T16:00:00.000Z',
    minutes: 45,
    pod: 'Applied AI pod',
    access: 'registered',
  },
  {
    id: 'evt_data_sessions',
    title: 'Data & integrations review',
    summary: 'A standing review of source-of-truth boundaries for AI products.',
    startsAt: '2026-11-11T15:30:00.000Z',
    minutes: 45,
    pod: 'Data & Integrations pod',
    access: 'registered',
  },
  {
    id: 'evt_secure_delivery',
    title: 'Secure delivery lab',
    summary: 'How to keep least-privilege access and human gates while you ship AI features.',
    startsAt: '2026-11-18T15:30:00.000Z',
    minutes: 45,
    pod: 'Security & Compliance pod',
    access: 'registered',
  },
  {
    id: 'evt_scope_clinic',
    title: 'Scope & pricing clinic',
    summary: 'A candid review of scoped proposals and what to leave out.',
    startsAt: '2026-11-25T16:30:00.000Z',
    minutes: 45,
    pod: 'Delivery & Scope pod',
    access: 'registered',
  },
];

const TAGS_SEED = [
  'architecture', 'evaluation', 'data-access', 'security', 'delivery', 'locks', 'privacy',
  'non-enumeration', 'observability', 'sso', 'scim', 'billing', 'webhooks',
];

const SEED_ROWS = [
  {
    title: 'Should a scientific-data copilot ship a five-day slice with real records?',
    space: 'delivery-scope',
    tags: ['delivery', 'data-access'],
    author: { id: 'fde_seed', name: 'Priya Raman', role: 'fde' },
    body: 'We recommend one working slice only. Pull the minimum read scope (last 90 days), gate production writes, and put the owner in the room. If the data can’t be shared, run on synthetic first and show the same workflow.',
    replies: [
      { author: { id: 'sde_seed', name: 'Alex Green', role: 'sde' }, body: 'This matches our prior three launches. The working slice is what gets executive buy-in.' },
      { author: { id: 'user_seed', name: 'Dana Petty', role: 'registered' }, body: 'Thank you. That avoids a big pre-build question and keeps the pilot scoped.' },
    ],
  },
  {
    title: 'How do you keep AI-generated operations copilots auditable?',
    space: 'security-compliance',
    tags: ['architecture', 'observability'],
    author: { id: 'fde_seed', name: 'Kip Fernando', role: 'fde' },
    body: 'Ledger everything: model, prompt, user, approval, citation and revision. Then make every production promotion an explicit human decision. If you need reproducibility, replay the same input against the same model.',
    replies: [
      { author: { id: 'sde_seed', name: 'Sora Bailey', role: 'sde' }, body: 'A tiny immutable operations log is enough. It also becomes evidence for customers.' },
    ],
  },
  {
    title: 'How should I scope evaluation for a claims-processing assistant?',
    space: 'applied-ai',
    tags: ['evaluation', 'data-access'],
    author: { id: 'sde_seed', name: 'Rae Alvarez', role: 'sde' },
    body: 'Start with one golden set of 200 past claims, stratify by complexity, then measure latency and human-edit rate. Add guardrail tests before you touch any live data.',
    replies: [
      { author: { id: 'fde_seed', name: 'Priya Raman', role: 'fde' }, body: 'Exactly. Keep the golden set small and manually inspect the first 30 failures.' },
      { author: { id: 'user_seed', name: 'Nina Choi', role: 'registered' }, body: 'This is exactly what I needed. I think the complexity tiers will make the claim volume realistic.' },
    ],
  },
];

function uid(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function now() {
  return new Date().toISOString();
}

function initials(name) {
  return String(name || '?').split(/\s+/).slice(0, 2).map((word) => word[0] || '').join('').toUpperCase();
}

function publicAuthor(raw) {
  if (!raw) return null;
  return {
    id: raw.id || null,
    name: raw.name || 'Kiln contributor',
    role: raw.role || 'registered',
    initials: initials(raw.name),
  };
}

function roleRank(role) {
  return role === 'fde' ? 4 : role === 'sde' ? 3 : 2;
}

function threadSummary(thread) {
  const replies = (db.forumReplies || []).filter((reply) => reply.threadId === thread.id && !reply.hiddenAt);
  const authors = new Set(replies.filter((reply) => reply.author.role !== 'fde').map((reply) => reply.author.role));
  const lastReply = replies.slice(-1)[0];
  const accepted = thread.acceptedReplyId ? replies.find((reply) => reply.id === thread.acceptedReplyId) : null;
  const likes = (thread.reactions || []).length;
  const helpful = replies.reduce((sum, reply) => sum + (reply.reactions || []).filter((reaction) => reaction.type === 'helpful').length, 0);
  return {
    id: thread.id,
    kind: thread.kind,
    space: SPACES.find((space) => space.id === thread.space),
    title: thread.title,
    body: thread.body,
    tags: thread.tags || [],
    status: thread.status,
    pinned: !!thread.pinned,
    fdeAnswered: replies.some((reply) => reply.author.role === 'fde' && !(reply.reactions || []).some((reaction) => reaction.type === 'flag')),
    acceptedReplyId: thread.acceptedReplyId || null,
    acceptedBy: accepted ? publicAuthor(accepted.author) : null,
    author: publicAuthor(thread.author),
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt || thread.createdAt,
    lastActivityAt: lastReply ? lastReply.createdAt : thread.createdAt,
    counts: {
      replies: replies.length,
      participants: new Set(replies.map((reply) => reply.author.id || reply.author.name)).size,
      likes,
      helpful,
      views: Number(thread.views) || 0,
      reactions: new Set([...(thread.reactions || [])].map((reaction) => reaction.type)).size,
    },
    preview: String(thread.body || '').replace(/\s+/g, ' ').slice(0, 220),
    replyRoles: [...authors],
  };
}

function feed(options = {}) {
  if (!db.forumThreads) db.forumThreads = [];
  if (!db.forumReplies) db.forumReplies = [];
  const query = String(options.q || '').trim().toLowerCase();
  const space = String(options.space || '').trim();
  const tag = String(options.tag || '').trim();
  const status = String(options.status || '').trim();
  const sort = String(options.sort || 'recent').trim();
  let threads = db.forumThreads.slice();

  if (query) {
    threads = threads.filter((thread) => `${thread.title}\n${thread.body}`.toLowerCase().includes(query));
  }
  if (space) threads = threads.filter((thread) => thread.space === space);
  if (status) threads = threads.filter((thread) => thread.status === status);
  if (tag) threads = threads.filter((thread) => (thread.tags || []).includes(tag));

  const sorters = {
    recent: (a, b) => compareIso(b.updatedAt, a.updatedAt),
    activity: (a, b) => compareIso(lastActivity(b), lastActivity(a)),
    best: (a, b) => (b.reactions || []).length - (a.reactions || []).length || compareIso(b.updatedAt, a.updatedAt),
    unanswered: (a, b) => replyCount(a) - replyCount(b) || compareIso(a.updatedAt, b.updatedAt),
    answers: (a, b) => replyCount(b) - replyCount(a),
    popular: (a, b) => (b.reactions || []).length - (a.reactions || []).length || compareIso(b.updatedAt, a.updatedAt),
  };
  threads.sort(sorters[sort] || sorters.recent);
  threads = threads.sort((a, b) => (b.pinned === true) - (a.pinned === true));

  return {
    threads: threads.slice(0, 240).map(threadSummary),
    spaces: SPACES,
    tags: TAGS_SEED,
    events: EVENTS_SEED,
    stats: {
      threads: threads.length,
      open: threads.filter((thread) => thread.status === 'open').length,
      answered: threads.filter((thread) => thread.status === 'answered').length,
      resolved: threads.filter((thread) => thread.status === 'resolved').length,
      likes: threads.reduce((sum, thread) => sum + (thread.reactions || []).length, 0),
      replies: (db.forumReplies || []).length,
    },
  };
}

function threadView(id) {
  const thread = (db.forumThreads || []).find((candidate) => candidate.id === id);
  if (!thread) return null;
  const replies = (db.forumReplies || [])
    .filter((reply) => reply.threadId === id && !reply.hiddenAt)
    .sort((a, b) => compareIso(a.createdAt, b.createdAt));
  return {
    thread: threadSummary(thread),
    replies: replies.map((reply) => ({
      id: reply.id,
      parentId: reply.parentId || null,
      author: publicAuthor(reply.author),
      body: reply.body,
      createdAt: reply.createdAt,
      updatedAt: reply.updatedAt || reply.createdAt,
      reactions: reply.reactions || [],
      helpful: (reply.reactions || []).some((reaction) => reaction.type === 'helpful'),
      likes: (reply.reactions || []).filter((reaction) => reaction.type === 'like').length,
      flags: (reply.reactions || []).filter((reaction) => reaction.type === 'flag').length,
      edited: !!reply.editedAt,
    })),
    spaces: SPACES,
    tags: TAGS_SEED,
    events: EVENTS_SEED,
  };
}

function lastActivity(thread) {
  if (!thread) return '';
  const replies = (db.forumReplies || []).filter((reply) => reply.threadId === thread.id);
  const latest = replies.slice(-1)[0];
  return latest ? latest.createdAt : thread.createdAt;
}

function replyCount(thread) {
  return (db.forumReplies || []).filter((reply) => reply.threadId === thread.id).length;
}

function compareIso(a, b) {
  return new Date(a || 0).getTime() - new Date(b || 0).getTime();
}

function createMarkerRole(user) {
  if (!user) return 'registered';
  const isAdmin = String(user.email || '').toLowerCase() === String(process.env.KILN_ADMIN_EMAIL || 'bidyut.banerjee@gmail.com').toLowerCase();
  if (isAdmin || user.admin) return 'fde';
  const workspaceRole = identity.roleFor(user, identity.ownerIdFor(user));
  if (workspaceRole === 'owner' || workspaceRole === 'admin') {
    // Solo users own only themselves — SDE is reserved for people who lead a
    // shared-team workspace with other active members.
    const members = (db.workspaceMembers || []).filter((m) => m.ownerId === identity.ownerIdFor(user) && m.status === 'active');
    const namedMembers = members.filter((m) => m.userId !== user.id);
    if (namedMembers.length > 0) return 'sde';
    return 'registered';
  }
  return 'registered';
}

function createThread(user, body) {
  const author = publicAuthor({ id: user.id, name: user.name, role: createMarkerRole(user) });
  const space = cleanLabel(body.space, 60);
  if (!SPACES.some((candidate) => candidate.id === space)) return { ok: false, error: 'Pick one of the six forum spaces.' };
  const title = cleanLabel(body.title, 180);
  if (title.length < 8) return { ok: false, error: 'Use at least eight characters in the title.' };
  const text = cleanText(body.body, 6000);
  if (text.length < 25) return { ok: false, error: 'Tell the pod what you need in 25 characters or more.' };
  const thread = {
    id: uid('thr'),
    kind: 'question',
    space,
    title,
    body: text,
    tags: normalizeTags(body.tags),
    status: 'open',
    author: publicAuthor(author),
    createdAt: now(),
    updatedAt: now(),
    views: 1,
    reactions: [],
  };
  db.forumThreads.push(thread);
  save();
  upsertMember(user, createMarkerRole(user));
  return { ok: true, thread, view: threadView(thread.id) };
}

function normalizeTags(raw) {
  if (!Array.isArray(raw)) return [];
  const out = raw.map((tag) => cleanLabel(tag, 40).toLowerCase()).filter(Boolean);
  return [...new Set(out)].slice(0, 8);
}

function upsertMember(user, role) {
  if (!db.forumMembers) db.forumMembers = [];
  const existing = db.forumMembers.find((member) => member.userId === user.id);
  if (existing) return existing;
  const member = { userId: user.id, name: user.name, email: cleanEmail(user.email), role, joinedAt: now() };
  db.forumMembers.push(member);
  save();
  return member;
}

function createReply(user, threadId, body) {
  const thread = (db.forumThreads || []).find((candidate) => candidate.id === threadId);
  if (!thread) return { ok: false, error: 'Thread not found.' };
  if (thread.status === 'resolved') return { ok: false, error: 'This thread is resolved.' };
  const text = cleanText(body.body, 6000);
  if (text.length < 5) return { ok: false, error: 'Give a useful answer in a few words.' };
  const parentId = body.parentId ? String(body.parentId) : null;
  if (parentId && !(db.forumReplies || []).some((reply) => reply.id === parentId && reply.threadId === thread.id)) {
    return { ok: false, error: 'That reply parent was not found.' };
  }
  const role = createMarkerRole(user);
  const reply = {
    id: uid('rpl'),
    threadId,
    parentId,
    author: publicAuthor({ id: user.id, name: user.name, role }),
    body: text,
    createdAt: now(),
    updatedAt: now(),
    reactions: [],
  };
  db.forumReplies.push(reply);
  thread.updatedAt = now();
  thread.status = role === 'fde' || role === 'sde' ? 'answered' : thread.status === 'answered' ? 'answered' : thread.status;
  thread.lastActivityAt = now();
  save();
  upsertMember(user, role);
  return { ok: true, reply, view: threadView(thread.id), roleRank: roleRank(role) };
}

function threadAction(user, threadId, body) {
  const thread = (db.forumThreads || []).find((candidate) => candidate.id === threadId);
  if (!thread) return { ok: false, error: 'Thread not found.' };
  if (!user) return { ok: false, error: 'Sign in first.', status: 401 };
  const action = String(body.action || '').trim();
  const siteAdmin = String(user.email || '').toLowerCase() === String(process.env.KILN_ADMIN_EMAIL || 'bidyut.banerjee@gmail.com').toLowerCase();
  const threadAuthor = thread.author && thread.author.id;
  const privileged = siteAdmin || threadAuthor === user.id;
  if (action === 'pin') {
    if (!siteAdmin) return { ok: false, error: 'Only Kiln admins can pin a thread.', status: 403 };
    thread.pinned = !thread.pinned;
    thread.updatedAt = now();
    save();
    return { ok: true, thread: threadSummary(thread), view: threadView(thread.id) };
  }
  if (action === 'accept') {
    if (!privileged) return { ok: false, error: 'Only the thread author or a Kiln admin can accept an answer.', status: 403 };
    const reply = (db.forumReplies || []).find((candidate) => candidate.id === body.replyId && candidate.threadId === thread.id);
    if (!reply) return { ok: false, error: 'Reply not found.' };
    thread.acceptedReplyId = thread.acceptedReplyId === reply.id ? null : reply.id;
    thread.status = thread.acceptedReplyId ? 'answered' : thread.status;
    thread.updatedAt = now();
    save();
    return { ok: true, thread: threadSummary(thread), view: threadView(thread.id) };
  }
  if (action === 'close') {
    if (!privileged) return { ok: false, error: 'Only the thread author or a Kiln admin can change the status.', status: 403 };
    const status = String(body.status || 'resolved').trim();
    if (!['open', 'answered', 'resolved', 'escalated'].includes(status)) return { ok: false, error: 'Unsupported status.' };
    thread.status = status;
    thread.updatedAt = now();
    save();
    return { ok: true, thread: threadSummary(thread), view: threadView(thread.id) };
  }
  return { ok: false, error: 'Unknown action.' };
}

function reactionToggle(user, threadId, body) {
  const thread = (db.forumThreads || []).find((candidate) => candidate.id === threadId);
  if (!thread) return { ok: false, error: 'Thread not found.' };
  const type = ['like', 'helpful', 'flag'].includes(body.type) ? body.type : 'like';
  if (!thread.reactions) thread.reactions = [];
  const existing = thread.reactions.find((reaction) => reaction.userId === user.id && reaction.type === type);
  if (existing) thread.reactions = thread.reactions.filter((reaction) => reaction !== existing);
  else thread.reactions.push({ userId: user.id, type, at: now() });
  thread.updatedAt = now();
  save();
  return { ok: true, thread: threadSummary(thread), view: threadView(thread.id), active: !existing };
}

function replyReaction(user, replyId, body) {
  const reply = (db.forumReplies || []).find((candidate) => candidate.id === replyId);
  if (!reply) return { ok: false, error: 'Reply not found.' };
  const type = ['like', 'helpful', 'flag'].includes(body.type) ? body.type : 'like';
  if (!reply.reactions) reply.reactions = [];
  const existing = reply.reactions.find((reaction) => reaction.userId === user.id && reaction.type === type);
  if (existing) reply.reactions = reply.reactions.filter((reaction) => reaction !== existing);
  else reply.reactions.push({ userId: user.id, type, at: now() });
  save();
  const thread = (db.forumThreads || []).find((candidate) => candidate.id === reply.threadId);
  return { ok: true, replyId, reply: reply, view: thread ? threadView(thread.id) : null };
}

function deleteThread(user, threadId) {
  const thread = (db.forumThreads || []).find((candidate) => candidate.id === threadId);
  if (!thread) return { ok: false, error: 'Thread not found.' };
  if (!user) return { ok: false, error: 'Sign in first.', status: 401 };
  const siteAdmin = String(user.email || '').toLowerCase() === String(process.env.KILN_ADMIN_EMAIL || 'bidyut.banerjee@gmail.com').toLowerCase();
  if (!siteAdmin && (!thread.author || thread.author.id !== user.id)) return { ok: false, error: 'Only the author or an admin can delete this thread.', status: 403 };
  db.forumThreads = db.forumThreads.filter((candidate) => candidate.id !== threadId);
  db.forumReplies = (db.forumReplies || []).filter((reply) => reply.threadId !== threadId);
  save();
  return { ok: true, removed: threadId };
}

module.exports = {
  SPACES,
  TAGS_SEED,
  EVENTS_SEED,
  ensureSeed,
  feed,
  threadView,
  createThread,
  createReply,
  threadAction,
  reactionToggle,
  replyReaction,
  deleteThread,
  upsertMember,
  createMarkerRole,
};

function ensureSeed() {
  if (!(db.forumThreads || []).length) {
    for (const row of SEED_ROWS) {
      const thread = {
        id: uid('thr'),
        kind: 'question',
        space: row.space,
        title: row.title,
        body: row.body,
        tags: row.tags,
        status: row.replies.length ? 'answered' : 'open',
        author: publicAuthor(row.author),
        createdAt: now(),
        updatedAt: now(),
        views: 3,
        reactions: [],
      };
      db.forumThreads.push(thread);
      for (const reply of row.replies) {
        db.forumReplies.push({
          id: uid('rpl'),
          threadId: thread.id,
          parentId: null,
          author: publicAuthor(reply.author),
          body: reply.body,
          createdAt: now(),
          updatedAt: now(),
          reactions: [{ type: 'like', userId: 'seed_' + row.title.charCodeAt(0) }],
        });
      }
    }
    save();
  }
}
