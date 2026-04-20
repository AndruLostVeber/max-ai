// API helpers: auth, memory sync, lightweight history persistence.

const API = (() => {
  const override = window.MTS_API_BASE || localStorage.getItem('mts-api-base');
  if (override) return override.replace(/\/$/, '');

  const protocol = window.location?.protocol || '';
  const host = window.location?.hostname || '';
  const port = window.location?.port || '';

  // If the frontend is served by a random static server on localhost, prefer the backend port directly.
  if (
    (host === '127.0.0.1' || host === 'localhost')
    && port
    && !['3000', '8000', '8010'].includes(port)
  ) {
    return 'http://localhost:8000/v1';
  }

  if (protocol === 'http:' || protocol === 'https:') {
    return `${window.location.origin}/v1`;
  }

  return 'http://localhost:8000/v1';
})();

let authToken = localStorage.getItem('mts-token') || null;
let userMemory = [];
const pendingMemorySync = new Map();
const STORED_MESSAGE_PREFIX = '[[MTS_MESSAGE_V1]]';

function memorySyncKey(convId = currentConvId, userId = currentUserId) {
  return String(convId || userId || 'anonymous');
}

function authHeaders() {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

async function readApiError(response, fallbackMessage) {
  const data = await response.json().catch(() => ({}));
  return data?.detail || data?.error?.message || data?.message || fallbackMessage;
}

function sortMemoryFacts(memories) {
  return [...memories].sort((a, b) => {
    const scoreDiff = (Number(b?.score) || 0) - (Number(a?.score) || 0);
    if (scoreDiff) return scoreDiff;
    const aTs = Date.parse(a?.updated_at || '') || 0;
    const bTs = Date.parse(b?.updated_at || '') || 0;
    return bTs - aTs;
  });
}

function upsertMemoryFactLocally(fact) {
  if (!fact?.key || !fact?.value) return;
  const index = userMemory.findIndex(item => item.key === fact.key);
  if (index >= 0) userMemory[index] = { ...userMemory[index], ...fact };
  else userMemory.push(fact);
  userMemory = sortMemoryFacts(userMemory);
}

function mergeMemoryFacts(facts) {
  (facts || []).forEach(upsertMemoryFactLocally);
  return userMemory;
}

async function apiAuthRegister(email, password) {
  const response = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, 'Registration failed'));
  }
  return response.json();
}

async function apiAuthLogin(email, password) {
  const response = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, 'Login failed'));
  }
  return response.json();
}

async function apiAuthMe() {
  const response = await fetch(`${API}/auth/me`, {
    headers: authHeaders(),
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, 'Session is not valid'));
  }
  return response.json();
}

async function loadMemory() {
  if (!currentUserId) return;
  try {
    const response = await fetch(`${API}/memory/${currentUserId}`, {
      headers: authHeaders(),
    });
    if (response.ok) {
      const data = await response.json();
      userMemory = sortMemoryFacts(data.memories || []);
    }
  } catch {}
}

function buildMemoryBlock() {
  if (!userMemory.length) return null;
  const top = userMemory.slice(0, 8);
  return [
    'User memory context. Use only the facts that are relevant to the current answer.',
    ...top.map(item => `- [${item.category || 'general'}] ${item.key}: ${item.value}`),
  ].join('\n');
}

async function extractMemory(userText, assistantText, convId = currentConvId, userId = currentUserId) {
  const activeUserId = userId;
  const combined = `${userText || ''}\n${assistantText || ''}`.trim();
  if (!activeUserId || !combined) return [];

  try {
    const response = await fetch(`${API}/memory/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        user_id: activeUserId,
        conv_id: convId || null,
        user_message: userText || null,
        assistant_message: assistantText,
      }),
    });
    if (!response.ok) return [];

    const data = await response.json().catch(() => ({}));
    const facts = Array.isArray(data.memories) ? data.memories : [];
    if (currentUserId === activeUserId) mergeMemoryFacts(facts);
    return facts;
  } catch {
    return [];
  }
}

function queueMemorySync(userText, assistantText, convId = currentConvId, userId = currentUserId) {
  const key = memorySyncKey(convId, userId);
  const previous = pendingMemorySync.get(key) || Promise.resolve([]);
  const next = previous.catch(() => []).then(() => extractMemory(userText, assistantText, convId, userId));
  pendingMemorySync.set(key, next);
  next.finally(() => {
    if (pendingMemorySync.get(key) === next) pendingMemorySync.delete(key);
  });
  return next;
}

async function waitForMemorySync(convId = currentConvId, userId = currentUserId) {
  const pending = pendingMemorySync.get(memorySyncKey(convId, userId));
  if (!pending) return;
  try {
    await pending;
  } catch {}
}

function resetMemorySyncState() {
  pendingMemorySync.clear();
}

function compactHistoryPayloadValue(value) {
  if (value == null) return null;
  if (Array.isArray(value)) {
    const items = value
      .map(compactHistoryPayloadValue)
      .filter(item => item != null && (!Array.isArray(item) || item.length) && (typeof item !== 'object' || Array.isArray(item) || Object.keys(item).length));
    return items.length ? items : null;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value).reduce((acc, [key, item]) => {
      const normalized = compactHistoryPayloadValue(item);
      if (normalized == null) return acc;
      if (Array.isArray(normalized) && !normalized.length) return acc;
      if (typeof normalized === 'object' && !Array.isArray(normalized) && !Object.keys(normalized).length) return acc;
      acc[key] = normalized;
      return acc;
    }, {});
    return Object.keys(entries).length ? entries : null;
  }
  return value;
}

function serializeConversationMessageForHistory(message) {
  const payload = compactHistoryPayloadValue({
    content: String(message?.content ?? ''),
    kind: message?.kind && message.kind !== 'text' ? message.kind : null,
    image: message?.image || null,
    research: message?.research || null,
    sources: message?.research ? null : (Array.isArray(message?.sources) ? message.sources.slice(0, 6) : null),
    sub_queries: message?.research ? null : (Array.isArray(message?.sub_queries) ? message.sub_queries.slice(0, 4) : null),
    stats: message?.research ? null : (message?.stats || null),
    notes: message?.research ? null : (Array.isArray(message?.notes) ? message.notes.slice(0, 4) : null),
    isMarkdown: Object.prototype.hasOwnProperty.call(message || {}, 'isMarkdown')
      ? Boolean(message.isMarkdown)
      : null,
    research_query: message?.research_query || null,
  });

  if (!payload || !Object.keys(payload).some(key => key !== 'content')) {
    return String(message?.content ?? '');
  }
  return `${STORED_MESSAGE_PREFIX}\n${JSON.stringify(payload)}`;
}

function fireSaveConversationMessage(message, convId = currentConvId, userId = currentUserId) {
  const targetConvId = convId || currentConvId;
  const targetUserId = userId || currentUserId;
  if (!targetUserId || !targetConvId || !authToken || !message?.role) return Promise.resolve(null);

  return fetch(`${API}/history/${targetUserId}/${targetConvId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      role: message.role,
      content: serializeConversationMessageForHistory(message),
      model_used: message.model_used || message.modelUsed || null,
    }),
  }).catch(() => null);
}

function fireSaveMessage(role, content, modelUsed, convId = currentConvId, userId = currentUserId) {
  return fireSaveConversationMessage(
    { role, content, model_used: modelUsed || null },
    convId,
    userId,
  );
}

async function apiCreateResearchSession(body) {
  const response = await fetch(`${API}/research/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, 'Could not start research session'));
  }
  return response.json();
}

async function apiGetResearchSession(sessionId) {
  const response = await fetch(`${API}/research/sessions/${encodeURIComponent(sessionId)}`, {
    headers: authHeaders(),
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, 'Could not load research session'));
  }
  return response.json();
}

async function apiCancelResearchSession(sessionId) {
  const response = await fetch(`${API}/research/sessions/${encodeURIComponent(sessionId)}/cancel`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, 'Could not cancel research session'));
  }
  return response.json();
}

async function* streamResearchSession(sessionId, signal) {
  const response = await fetch(`${API}/research/sessions/${encodeURIComponent(sessionId)}/stream`, {
    headers: { Accept: 'text/event-stream', ...authHeaders() },
    signal,
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, 'Could not open research stream'));
  }
  if (!response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = 'message';
  let dataLines = [];

  const flushEvent = () => {
    if (!dataLines.length) {
      currentEvent = 'message';
      return null;
    }

    const rawData = dataLines.join('\n');
    dataLines = [];
    const eventName = currentEvent;

    let payload = null;
    try {
      payload = JSON.parse(rawData);
    } catch {
      payload = { type: eventName, payload: { raw: rawData } };
    }

    currentEvent = 'message';
    return payload && typeof payload === 'object'
      ? payload
      : { type: eventName, payload: { raw: rawData } };
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line) {
        const event = flushEvent();
        if (event) yield event;
        continue;
      }
      if (line.startsWith('event:')) {
        currentEvent = line.slice(6).trim() || 'message';
        continue;
      }
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (done) {
      const event = flushEvent();
      if (event) yield event;
      return;
    }
  }
}
