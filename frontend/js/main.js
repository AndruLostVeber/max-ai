// ══ MAIN — global state, DOMContentLoaded init, event listeners ══

// ── Global state ──────────────────────────────
let currentUserId     = null;
let currentConvId     = null;
let currentMessages   = [];   // [{role, content}]
let currentAgent      = null;
let selectedModel     = 'auto';   // actual API id
let selectedModelName = 'Auto';   // display name

const conversationRuntimeState = new Map();

function clonePlainValue(value) {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function cloneConversationMessage(message) {
  if (!message || typeof message !== 'object') return message;
  const cloned = { ...message };
  if (Array.isArray(message.attachments)) cloned.attachments = message.attachments.map(item => ({ ...item }));
  if (Array.isArray(message.sources)) cloned.sources = message.sources.map(item => ({ ...item }));
  if (Array.isArray(message.sub_queries)) cloned.sub_queries = message.sub_queries.map(item => (
    item && typeof item === 'object' ? { ...item } : item
  ));
  if (Array.isArray(message.notes)) cloned.notes = [...message.notes];
  if (message.image && typeof message.image === 'object') cloned.image = { ...message.image };
  if (message.stats && typeof message.stats === 'object') cloned.stats = { ...message.stats };
  if (message.research && typeof message.research === 'object') cloned.research = clonePlainValue(message.research);
  return cloned;
}

function normalizeConversationMessage(message) {
  if (!message?.role || typeof message.content !== 'string') return null;
  return cloneConversationMessage({
    kind: message.kind || 'text',
    ...message,
  });
}

function normalizeConversationId(convId) {
  return String(convId || '').trim();
}

function createConversationBinding() {
  return {
    agentId: null,
    modelId: 'auto',
  };
}

function cloneConversationProcess(process) {
  if (!process || typeof process !== 'object') return null;
  return {
    ...process,
    abortCtrl: process.abortCtrl || null,
  };
}

function ensureConversationState(convId) {
  const id = normalizeConversationId(convId);
  if (!id) return null;
  if (!conversationRuntimeState.has(id)) {
    conversationRuntimeState.set(id, {
      messages: [],
      pendingMessage: null,
      binding: createConversationBinding(),
      process: null,
    });
  }
  const state = conversationRuntimeState.get(id);
  if (!state.binding || typeof state.binding !== 'object') state.binding = createConversationBinding();
  if (!('pendingMessage' in state)) state.pendingMessage = null;
  if (!('process' in state)) state.process = null;
  return state;
}

function getConversationMessagesSnapshot(convId = currentConvId) {
  const state = ensureConversationState(convId);
  return state ? state.messages.map(cloneConversationMessage) : [];
}

function getConversationBinding(convId = currentConvId) {
  const id = normalizeConversationId(convId);
  const state = ensureConversationState(id);
  return {
    conversationId: id || null,
    agentId: state?.binding?.agentId || null,
    modelId: state?.binding?.modelId || 'auto',
  };
}

function patchConversationBinding(convId, patch) {
  const state = ensureConversationState(convId);
  if (!state) return null;
  state.binding = {
    ...createConversationBinding(),
    ...(state.binding || {}),
    ...(patch || {}),
  };
  return getConversationBinding(convId);
}

function setConversationRuntimeAgent(convId, agentId) {
  return patchConversationBinding(convId, {
    agentId: String(agentId || '').trim() || null,
  });
}

function setConversationRuntimeModel(convId, modelId) {
  const normalized = String(modelId || '').trim() || 'auto';
  return patchConversationBinding(convId, {
    modelId: normalized === 'auto' ? 'auto' : normalized,
  });
}

function getConversationProcess(convId = currentConvId) {
  const state = ensureConversationState(convId);
  return cloneConversationProcess(state?.process);
}

function setActiveConversation(convId) {
  const id = normalizeConversationId(convId);
  const state = ensureConversationState(id);
  currentConvId = state ? id : null;
  currentMessages = state ? state.messages : [];
  currentAgent = null;
  if (state && typeof restoreConversationAgent === 'function') restoreConversationAgent(id);
  if (state && typeof restoreConversationModel === 'function') restoreConversationModel(id);
  if (typeof setSendStop === 'function') setSendStop(Boolean(state?.process));
  if (typeof renderSidebarHistory === 'function') renderSidebarHistory();
  return state;
}

function createConversationSession(options) {
  const opts = options || {};
  const convId = normalizeConversationId(opts.convId) || uuid();
  setActiveConversation(convId);
  replaceConversationMessages(convId, []);
  clearConversationPendingMessage(convId);
  finishConversationRequest(convId);

  if (typeof setConversationAgent === 'function') setConversationAgent(convId, opts.agentId || null);
  else setConversationRuntimeAgent(convId, opts.agentId || null);

  const modelId = String(opts.modelId || 'auto').trim() || 'auto';
  if (typeof setConversationModel === 'function') setConversationModel(convId, modelId);
  else setConversationRuntimeModel(convId, modelId);

  if (currentConvId === convId) {
    if (typeof restoreConversationAgent === 'function') restoreConversationAgent(convId);
    if (typeof restoreConversationModel === 'function') restoreConversationModel(convId);
  }

  return convId;
}

function replaceConversationMessages(convId, messages) {
  const state = ensureConversationState(convId);
  if (!state) return [];
  state.messages = Array.isArray(messages)
    ? messages
      .map(normalizeConversationMessage)
      .filter(Boolean)
    : [];
  if (normalizeConversationId(convId) === currentConvId) currentMessages = state.messages;
  return state.messages;
}

function appendConversationMessage(convId, message) {
  const state = ensureConversationState(convId);
  const normalized = normalizeConversationMessage(message);
  if (!state || !normalized) return;
  state.messages.push(normalized);
  if (normalizeConversationId(convId) === currentConvId) currentMessages = state.messages;
}

function mergeConversationMessagesFromHistory(convId, messages) {
  const state = ensureConversationState(convId);
  if (!state) return [];

  const incoming = Array.isArray(messages)
    ? messages.map(normalizeConversationMessage).filter(Boolean)
    : [];

  const local = state.messages
    .filter(message => message?.role !== 'system')
    .map(cloneConversationMessage);

  if (!local.length) {
    state.messages = incoming;
    if (normalizeConversationId(convId) === currentConvId) currentMessages = state.messages;
    return getConversationMessagesSnapshot(convId);
  }
  const matchesAt = (left, right) => left?.role === right?.role && left?.content === right?.content;
  const matchesPrefix = local.every((message, index) => matchesAt(message, incoming[index]));

  if (local.length === incoming.length && matchesPrefix) {
    state.messages = local.map((message, index) => ({
      ...incoming[index],
      ...message,
      model_used: message.model_used || incoming[index]?.model_used || null,
    }));
  } else if (local.length < incoming.length && matchesPrefix) {
    const enrichedPrefix = local.map((message, index) => ({
      ...incoming[index],
      ...message,
      model_used: message.model_used || incoming[index]?.model_used || null,
    }));
    state.messages = [...enrichedPrefix, ...incoming.slice(local.length)];
  } else {
    state.messages = local;
  }

  if (normalizeConversationId(convId) === currentConvId) currentMessages = state.messages;
  return getConversationMessagesSnapshot(convId);
}

function isConversationStreaming(convId = currentConvId) {
  return Boolean(ensureConversationState(convId)?.process);
}

function getConversationAbortController(convId = currentConvId) {
  return ensureConversationState(convId)?.process?.abortCtrl || null;
}

function getConversationPendingMessage(convId = currentConvId) {
  const pending = ensureConversationState(convId)?.pendingMessage;
  return pending ? { ...pending } : null;
}

function setConversationPendingMessage(convId, pendingMessage, requestId) {
  const state = ensureConversationState(convId);
  if (!state) return null;
  const normalizedRequestId = String(requestId || pendingMessage?.requestId || '').trim() || null;
  if (normalizedRequestId && state.process?.id && state.process.id !== normalizedRequestId) return null;
  state.pendingMessage = pendingMessage
    ? {
      ...pendingMessage,
      requestId: normalizedRequestId || state.pendingMessage?.requestId || state.process?.id || null,
    }
    : null;
  if (pendingMessage?.status && state.process) {
    state.process.status = pendingMessage.status;
    if (typeof renderSidebarHistory === 'function') renderSidebarHistory();
  }
  return state.pendingMessage;
}

function patchConversationPendingMessage(convId, patch, requestId) {
  const state = ensureConversationState(convId);
  if (!state) return null;
  const normalizedRequestId = String(requestId || patch?.requestId || '').trim() || null;
  if (normalizedRequestId && state.process?.id && state.process.id !== normalizedRequestId) return null;
  if (normalizedRequestId && state.pendingMessage?.requestId && state.pendingMessage.requestId !== normalizedRequestId) return null;
  state.pendingMessage = {
    ...(state.pendingMessage || {}),
    ...(patch || {}),
    requestId: normalizedRequestId || state.pendingMessage?.requestId || state.process?.id || null,
  };
  if (patch?.status && state.process) {
    state.process.status = patch.status;
    if (typeof renderSidebarHistory === 'function') renderSidebarHistory();
  }
  return state.pendingMessage;
}

function clearConversationPendingMessage(convId, requestId) {
  const state = ensureConversationState(convId);
  if (!state) return;
  const normalizedRequestId = String(requestId || '').trim() || null;
  if (normalizedRequestId && state.pendingMessage?.requestId && state.pendingMessage.requestId !== normalizedRequestId) return;
  state.pendingMessage = null;
  if (typeof renderSidebarHistory === 'function') renderSidebarHistory();
}

function startConversationRequest(convId, abortCtrl, meta) {
  const state = ensureConversationState(convId);
  if (!state) return;
  if (state.process?.abortCtrl && state.process.abortCtrl !== abortCtrl) {
    try { state.process.abortCtrl.abort(); } catch {}
  }
  const binding = getConversationBinding(convId);
  state.process = {
    id: meta?.id || `req-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    kind: meta?.kind || 'chat',
    status: meta?.status || 'running',
    modelId: meta?.modelId || binding.modelId || 'auto',
    agentId: Object.prototype.hasOwnProperty.call(meta || {}, 'agentId')
      ? (meta?.agentId || null)
      : binding.agentId,
    startedAt: meta?.startedAt || Date.now(),
    abortCtrl: abortCtrl || null,
  };
  if (normalizeConversationId(convId) === currentConvId && typeof setSendStop === 'function') {
    setSendStop(true);
  }
  if (typeof renderSidebarHistory === 'function') renderSidebarHistory();
  return cloneConversationProcess(state.process);
}

function patchConversationRequest(convId, patch, requestId) {
  const state = ensureConversationState(convId);
  if (!state?.process) return null;
  const normalizedRequestId = String(requestId || '').trim() || null;
  if (normalizedRequestId && state.process.id !== normalizedRequestId) return null;
  state.process = {
    ...state.process,
    ...(patch || {}),
  };
  if (typeof renderSidebarHistory === 'function') renderSidebarHistory();
  return cloneConversationProcess(state.process);
}

function finishConversationRequest(convId, abortCtrl, requestId) {
  const state = ensureConversationState(convId);
  if (!state) return;
  const normalizedRequestId = String(requestId || '').trim() || null;
  if (normalizedRequestId && state.process?.id && state.process.id !== normalizedRequestId) return;
  if (abortCtrl && state.process?.abortCtrl && state.process.abortCtrl !== abortCtrl) return;
  state.process = null;
  if (normalizeConversationId(convId) === currentConvId && typeof setSendStop === 'function') {
    setSendStop(false);
  }
  if (typeof renderSidebarHistory === 'function') renderSidebarHistory();
}

function clearConversationState(convId, options) {
  const id = normalizeConversationId(convId);
  if (!id) return;
  const opts = options || {};
  const state = conversationRuntimeState.get(id);
  if (opts.abort !== false) state?.process?.abortCtrl?.abort();
  conversationRuntimeState.delete(id);
  if (currentConvId === id) {
    currentConvId = null;
    currentMessages = [];
    if (typeof setSendStop === 'function') setSendStop(false);
  }
}

function resetConversationRuntimeState() {
  conversationRuntimeState.forEach(state => state?.process?.abortCtrl?.abort());
  conversationRuntimeState.clear();
  currentConvId = null;
  currentMessages = [];
  if (typeof setSendStop === 'function') setSendStop(false);
}

// ── Init ──────────────────────────────────────
(async function init(){
  localStorage.removeItem('mts-selected-model');
  const t=localStorage.getItem('mts-theme');
  if(t==='light'){ document.documentElement.setAttribute('data-theme','light'); document.getElementById('thTgl').classList.add('on'); }
  const l=localStorage.getItem('mts-lang')||'ru';
  applyLang(l);
  buildDD('mDDH'); buildDD('mDDB');
  syncSidebarUI();

  // Settings persistence
  if(localStorage.getItem('mts-compact')==='1') document.body.classList.add('compact');
  if(localStorage.getItem('mts-enter-send')==='0'){ const tgl=document.querySelector('[data-setting="enterSend"]'); if(tgl) tgl.classList.remove('on'); }

  // Auto-login: если токен уже есть в localStorage — пропускаем authScreen
  const savedToken = localStorage.getItem('mts-token');
  const savedUserId = localStorage.getItem('mts-user-id');
  const savedEmail = localStorage.getItem('mts-user-email');
  if(savedToken && savedUserId){
    authToken = savedToken;
    currentUserId = savedUserId;
    try {
      const me = await apiAuthMe();
      currentUserId = me.user_id || savedUserId;
      if(savedEmail || me.email) document.getElementById('profInpEmail').value = me.email || savedEmail;
      const savedName=localStorage.getItem('mts-display-name');
      const displayName=savedName||((me.email||savedEmail)?(me.email||savedEmail).split('@')[0]:'Пользователь MTS');
      document.getElementById('profInpName').value=displayName;
      document.getElementById('sbUserName').textContent=displayName;
      document.getElementById('sbAvatar').textContent=getInitials(displayName);
      const org=localStorage.getItem('mts-org')||'';
      if(org) document.getElementById('profInpOrg').value=org;
      document.getElementById('authScreen').style.display='none';
      initSplash({skip:true});
    } catch {
      authToken = null;
      currentUserId = null;
      localStorage.removeItem('mts-token');
      localStorage.removeItem('mts-user-id');
      localStorage.removeItem('mts-user-email');
      setTimeout(()=>document.getElementById('authEmail')?.focus(),400);
      toast(t('auth.sessionExpired','Session expired, please sign in again'),'inf',3000);
    }
  } else {
    setTimeout(()=>document.getElementById('authEmail')?.focus(),400);
  }
})();

// ── Build agents grid ────────────────────────
(function(){
  const g=document.getElementById('agGrid');
  AGENTS.forEach((a,i)=>{
    const c=document.createElement('div');
    c.className='ag-card rh'; c.style.animationDelay=(i*40)+'ms';
    c.innerHTML=`<div class="ag-ico">${a.ic}</div><div class="ag-name">${esc(a.name)}</div><div class="ag-desc">${esc(a.desc)}</div>`;
    c.onclick=()=>openAgModal(i);
    g.appendChild(c); addRipple(c);
  });
})();

// ── BG floating words ─────────────────────────
(function(){
  const phrases=['Искусственный интеллект','Artificial Intelligence','人工智能','Intelligence Artificielle','Künstliche Intelligenz','Inteligencia Artificial','人工知能','الذكاء الاصطناعي','Inteligência Artificial','인공지능','Intelligenza Artificiale','Yapay Zeka','Kunstmatige Intelligentie','Sztuczna Inteligencja','Artificiell Intelligens','Kunstig Intelligens','Tekoäly','Mesterséges Intelligencia','Artificiální Inteligence','Umelá Inteligencia','Τεχνητή Νοημοσύνη','कृत्रिम बुद्धिमत्ता','কৃত্রিম বুদ্ধিমত্তা','செயற்கை நுண்ணறிவு','Dirbtinis Intelektas'];
  const durations=[38,44,32,50,40,46,34,52,41,47,36,54,39,45,33,51,43,48,35,53,37,49,42,55,31,57,44,38,50,36];
  const wrap=document.getElementById('bgWords-inner'); if(!wrap) return;
  for(let i=0;i<160;i++){
    const row=document.createElement('div');
    row.className='bgr '+(i%2===0?'ev':'od');
    row.textContent=(phrases[i%phrases.length]+'   ').repeat(55);
    row.style.setProperty('--dur',durations[i%durations.length]+'s');
    wrap.appendChild(row);
  }
  if(localStorage.getItem('bgWordsOff')==='1'){
    document.getElementById('bgWords').classList.add('off');
    const tgl=document.getElementById('bgWordsTgl'); if(tgl) tgl.classList.remove('on');
  }
})();

// ── Global event wiring ───────────────────────
document.querySelectorAll('.rh').forEach(addRipple);
document.querySelectorAll('.prof-save,.prof-logout').forEach(addRipple);
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeAll(); });
window.addEventListener('resize', syncSidebarUI);
