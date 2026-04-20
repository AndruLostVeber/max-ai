// ══ MODELS — isChatModel(), modelGroup(), modelDisplayName(), modelIcon(),
//             fetchModels(), buildDD(), pickModel(), toggleMDD() ══

// Исключаем embeddings, ASR и прочие non-chat модели
const EXCLUDE_KEYWORDS = ['embed', 'whisper', 'rerank', 'bge-', 'e5-v', 'clip', 'asr'];
const CONVERSATION_MODEL_STORAGE_KEY = 'mts-conversation-models';

function readConversationModelState(){
  try {
    const raw = localStorage.getItem(CONVERSATION_MODEL_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

let conversationModelState = readConversationModelState();

function writeConversationModelState(){
  try {
    const keys = Object.keys(conversationModelState);
    if(!keys.length) localStorage.removeItem(CONVERSATION_MODEL_STORAGE_KEY);
    else localStorage.setItem(CONVERSATION_MODEL_STORAGE_KEY, JSON.stringify(conversationModelState));
  } catch {}
}

function normalizeModelId(id){
  const value = String(id || '').trim();
  return value && value !== 'auto' ? value : 'auto';
}

function resolveModelName(id){
  const normalized = normalizeModelId(id);
  return normalized === 'auto' ? autoModelLabel() : (modelDisplayName(normalized) || normalized);
}

function hasConversationModel(convId){
  return Boolean(convId && Object.prototype.hasOwnProperty.call(conversationModelState, convId));
}

function getConversationModel(convId){
  const runtime = typeof getConversationBinding === 'function'
    ? getConversationBinding(convId)?.modelId
    : null;
  if(runtime) return normalizeModelId(runtime);
  return hasConversationModel(convId) ? normalizeModelId(conversationModelState[convId]) : 'auto';
}

function setConversationModel(convId, modelId){
  if(!convId) return;
  const normalized = normalizeModelId(modelId);
  if(typeof setConversationRuntimeModel === 'function') setConversationRuntimeModel(convId, normalized);
  if(normalized === 'auto') delete conversationModelState[convId];
  else conversationModelState[convId] = normalized;
  writeConversationModelState();
}

function removeConversationModel(convId){
  if(!convId || !hasConversationModel(convId)) return;
  delete conversationModelState[convId];
  writeConversationModelState();
}

function resetConversationModelState(){
  conversationModelState = {};
  writeConversationModelState();
}

function isChatModel(id){
  const lower = id.toLowerCase();
  return !EXCLUDE_KEYWORDS.some(kw => lower.includes(kw));
}

function modelGroup(id){
  // NVIDIA NIM format: "org/model-name"
  if(id.startsWith('meta/'))                return 'Meta';
  if(id.startsWith('nvidia/'))              return 'NVIDIA';
  if(id.startsWith('mistralai/'))           return 'Mistral';
  if(id.startsWith('google/'))              return 'Google';
  if(id.startsWith('microsoft/'))          return 'Microsoft';
  if(id.startsWith('deepseek-ai/'))         return 'DeepSeek';
  if(id.startsWith('qwen/') || id.startsWith('Qwen/')) return 'Qwen';
  if(id.startsWith('nv-mistralai/'))        return 'NVIDIA';
  if(id.startsWith('moonshotai/'))           return 'Moonshot';
  if(id.startsWith('writer/'))              return 'Writer';
  if(id.startsWith('upstage/'))             return 'Upstage';
  if(id.startsWith('snowflake/'))           return 'Snowflake';
  if(id.startsWith('01-ai/'))              return '01.AI';
  if(id.startsWith('aisingapore/'))         return 'AI Singapore';
  if(id.startsWith('baichuan-inc/'))        return 'Baichuan';
  if(id.startsWith('ibm/'))                 return 'IBM';
  if(id.startsWith('adept/'))              return 'Adept';
  // legacy / без org-префикса
  if(id.startsWith('llama'))               return 'Meta';
  if(id.startsWith('qwen') || id.startsWith('Qwen') || id.startsWith('QwQ')) return 'Qwen';
  if(id.startsWith('gemma'))               return 'Google';
  if(id.startsWith('deepseek'))            return 'DeepSeek';
  if(id.startsWith('mistral') || id.startsWith('mixtral')) return 'Mistral';
  return 'Другие';
}

function modelDisplayName(id){
  const map = {
    // NVIDIA NIM models
    // ── Ключевые модели проекта ──────────────────────────────────
    'mistralai/mistral-small-4-119b-2603':          'Mistral Small 4 (119B)',
    'qwen/qwen3-coder-480b-a35b-instruct':          'Qwen3 Coder 480B',
    'moonshotai/kimi-k2-thinking':                  'Kimi K2 Thinking',
    'nvidia/llama-3.3-nemotron-super-49b-v1':       'Nemotron Super 49B',
    'mistralai/mixtral-8x22b-instruct-v0.1':        'Mixtral 8x22B',
    'meta/llama-3.2-90b-vision-instruct':           'Llama 3.2 90B Vision',
    'nvidia/nemoretriever-parse':                   'NemoRetriever Parse',
    'writer/palmyra-med-70b-32k':                   'Palmyra Med 70B',
    'writer/palmyra-fin-70b-32k':                   'Palmyra Fin 70B',
    'writer/palmyra-creative-122b':                 'Palmyra Creative 122B',
    // ── Meta Llama ───────────────────────────────────────────────
    'meta/llama-3.1-8b-instruct':                   'Llama 3.1 8B',
    'meta/llama-3.1-70b-instruct':                  'Llama 3.1 70B',
    'meta/llama-3.1-405b-instruct':                 'Llama 3.1 405B',
    'meta/llama-3.2-3b-instruct':                   'Llama 3.2 3B',
    'meta/llama-3.2-11b-vision-instruct':           'Llama 3.2 11B Vision',
    'meta/llama-3.3-70b-instruct':                  'Llama 3.3 70B',
    // ── NVIDIA ───────────────────────────────────────────────────
    'nvidia/llama-3.1-nemotron-70b-instruct':       'Nemotron 70B',
    'nvidia/llama-3.1-nemotron-nano-8b-v1':         'Nemotron Nano 8B',
    'nvidia/llama-3.3-nemotron-super-49b-v1':       'Nemotron Super 49B',
    'nvidia/llama-3.1-nemotron-51b-instruct':       'Nemotron 51B',
    // ── Mistral ──────────────────────────────────────────────────
    'mistralai/mistral-7b-instruct-v0.3':           'Mistral 7B',
    'mistralai/mixtral-8x7b-instruct-v0.1':         'Mixtral 8x7B',
    'mistralai/mixtral-8x22b-instruct-v0.1':        'Mixtral 8x22B',
    'mistralai/mistral-large-2-instruct':           'Mistral Large 2',
    'mistralai/mistral-nemo-12b-instruct':          'Mistral NeMo 12B',
    'nv-mistralai/mistral-nemo-12b-instruct':       'Mistral NeMo 12B',
    // ── Google ───────────────────────────────────────────────────
    'google/gemma-2-2b-it':                         'Gemma 2 2B',
    'google/gemma-2-9b-it':                         'Gemma 2 9B',
    'google/gemma-2-27b-it':                        'Gemma 2 27B',
    // ── Microsoft ────────────────────────────────────────────────
    'microsoft/phi-3-mini-128k-instruct':           'Phi-3 Mini 128K',
    'microsoft/phi-3-medium-128k-instruct':         'Phi-3 Medium 128K',
    'microsoft/phi-3.5-mini-instruct':              'Phi-3.5 Mini',
    'microsoft/phi-3.5-vision-instruct':            'Phi-3.5 Vision',
    // ── DeepSeek ─────────────────────────────────────────────────
    'deepseek-ai/deepseek-r1':                      'DeepSeek R1',
    'deepseek-ai/deepseek-r1-distill-llama-70b':    'DeepSeek R1 70B',
    'deepseek-ai/deepseek-coder-6.7b-instruct':     'DeepSeek Coder 6.7B',
    // ── Qwen ─────────────────────────────────────────────────────
    'qwen/qwen2.5-72b-instruct':                    'Qwen2.5 72B',
    'qwen/qwen2.5-coder-32b-instruct':              'Qwen2.5 Coder 32B',
    'qwen/qwq-32b':                                 'QwQ 32B',
    // ── Прочие ───────────────────────────────────────────────────
    'ibm/granite-3.1-8b-instruct':                  'Granite 3.1 8B',
    'upstage/solar-10.7b-instruct':                 'Solar 10.7B',
    'snowflake/arctic-instruct':                    'Arctic Instruct',
    'moonshotai/kimi-k2-instruct':                  'Kimi K2',
    // special
    'research-v2':                                  'Research V2',
  };
  return map[id] || id;
}

function autoModelLabel(){
  return curLang==='ru' ? 'Авто' : 'Auto';
}

function autoModelSubtitle(){
  return curLang==='ru' ? 'Оптимальная модель подбирается автоматически' : 'The best model is selected automatically';
}

function modelIcon(id){
  if(id.includes('coder') || id.includes('code') || id.includes('starcoder') || id.includes('granite'))
    return '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';
  if(id.includes('vision') || id.includes('vl') || id.includes('VL') || id.includes('visual') || id.includes('parse'))
    return '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  if(id.includes('thinking') || id.includes('deepseek') || id.includes('r1') || id.includes('QwQ') || id.includes('qwq') || id.includes('nemotron') || id.includes('kimi'))
    return '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>';
  if(id.includes('llama'))
    return '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9z"/></svg>';
  if(id.includes('palmyra') || id.includes('med') || id.includes('fin') || id.includes('creative'))
    return '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
  return '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>';
}

let CHAT_MODELS = []; // [{id, name, group, icon}]

function applyModelSelection(id, options){
  const opts = options || {};
  const normalized = normalizeModelId(id);
  const exists = normalized === 'auto' || !CHAT_MODELS.length || CHAT_MODELS.some(model => model.id === normalized);
  selectedModel = exists ? normalized : 'auto';
  selectedModelName = resolveModelName(selectedModel);

  if(!opts.skipConversationSync && currentConvId) setConversationModel(currentConvId, selectedModel);

  syncModelSelectionUI();
  if(!opts.skipDropdownRebuild){
    buildDD('mDDH');
    buildDD('mDDB');
  }
}

function restoreConversationModel(convId){
  const modelId = getConversationModel(convId);
  if(typeof setConversationRuntimeModel === 'function') setConversationRuntimeModel(convId, modelId);
  applyModelSelection(modelId, { skipConversationSync: true });
}

function resetConversationModel(convId){
  if(convId) removeConversationModel(convId);
  if(convId && typeof setConversationRuntimeModel === 'function') setConversationRuntimeModel(convId, 'auto');
  applyModelSelection('auto', { skipConversationSync: true });
}

function syncModelSelectionUI(){
  const isAuto = !selectedModel || selectedModel === 'auto';
  const label = isAuto ? autoModelLabel() : (selectedModelName || resolveModelName(selectedModel));

  document.querySelectorAll('.m-name-txt').forEach(el => el.textContent = label);
  document.querySelectorAll('.mp-dot').forEach(el => {
    el.className = 'mp-dot ' + (isAuto ? 'auto-dot' : 'ready-dot');
  });
}

async function fetchModels(){
  try {
    const r = await fetch(`${API}/models`);
    const d = await r.json();
    const raw = (d.data||[]).filter(m => isChatModel(m.id));
    CHAT_MODELS = raw.map(m=>({
      id: m.id,
      name: modelDisplayName(m.id),
      group: modelGroup(m.id),
      icon: modelIcon(m.id)
    }));
  } catch {
    // Fallback — ключевые модели проекта
    CHAT_MODELS = [
      {id:'mistralai/mistral-small-4-119b-2603',    name:'Mistral Small 4 (119B)',   group:'Mistral'},
      {id:'qwen/qwen3-coder-480b-a35b-instruct',    name:'Qwen3 Coder 480B',         group:'Qwen'},
      {id:'nvidia/llama-3.3-nemotron-super-49b-v1',  name:'Nemotron Super 49B',       group:'NVIDIA'},
      {id:'meta/llama-3.2-90b-vision-instruct',     name:'Llama 3.2 90B Vision',     group:'Meta'},
      {id:'meta/llama-3.3-70b-instruct',            name:'Llama 3.3 70B',            group:'Meta'},
      {id:'nvidia/nemoretriever-parse',             name:'NemoRetriever Parse',       group:'NVIDIA'},
      {id:'mistralai/mixtral-8x22b-instruct-v0.1',  name:'Mixtral 8x22B',            group:'Mistral'},
    ].map(m=>({...m, icon: modelIcon(m.id)}));
  }
  applyModelSelection(selectedModel, { skipConversationSync: true });
}

function buildDD(ddId){
  const dd = document.getElementById(ddId);
  if(!dd) return;
  dd.innerHTML = '';

  const searchWrap = document.createElement('div'); searchWrap.className='dd-search-wrap';
  const searchInp  = document.createElement('input');
  searchInp.className='dd-search'; searchInp.placeholder='Поиск модели...'; searchInp.type='text';
  searchInp.onclick = e=>e.stopPropagation();
  searchWrap.appendChild(searchInp);
  dd.appendChild(searchWrap);

  const list = document.createElement('div'); list.className='dd-list';
  dd.appendChild(list);

  const autoDiv = document.createElement('div');
  autoDiv.className = 'dd-opt' + (selectedModel==='auto'?' sel':'');
  autoDiv.dataset.search = 'авто auto';
  autoDiv.innerHTML = `<div class="dd-ico"><svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg></div><div class="dd-info"><div class="dd-nm">${autoModelLabel()}</div><div class="dd-sb">${autoModelSubtitle()}</div></div>${selectedModel==='auto'?'<span class="dd-chk">✓</span>':''}`;
  autoDiv.onclick = e=>{ e.stopPropagation(); pickModel('auto',autoModelLabel(),true); };
  list.appendChild(autoDiv);

  const groups = {};
  CHAT_MODELS.forEach(m=>{
    if(!groups[m.group]) groups[m.group]=[];
    groups[m.group].push(m);
  });

  const groupEls = [];
  for(const [grpName, models] of Object.entries(groups)){
    const sep = document.createElement('div'); sep.className='dd-sep'; list.appendChild(sep);
    const hdr = document.createElement('div'); hdr.className='dd-hdr'; hdr.textContent=grpName; list.appendChild(hdr);
    const grpOpts = [];
    models.forEach(m=>{
      const opt = document.createElement('div');
      opt.className = 'dd-opt'+(selectedModel===m.id?' sel':'');
      opt.dataset.search = (m.name+' '+m.id+' '+grpName).toLowerCase();
      opt.innerHTML = `<div class="dd-ico">${m.icon}</div><div class="dd-info"><div class="dd-nm">${esc(m.name)}</div><div class="dd-sb">${esc(m.id)}</div></div>${selectedModel===m.id?'<span class="dd-chk">✓</span>':''}`;
      opt.onclick = e=>{ e.stopPropagation(); pickModel(m.id, m.name, false); };
      list.appendChild(opt);
      grpOpts.push(opt);
    });
    groupEls.push({sep, hdr, opts: grpOpts});
  }

  const emptyMsg = document.createElement('div'); emptyMsg.className='dd-empty'; emptyMsg.textContent='Ничего не найдено'; emptyMsg.style.display='none'; list.appendChild(emptyMsg);

  searchInp.oninput = ()=>{
    const q = searchInp.value.toLowerCase().trim();
    let anyVisible = false;
  const autoMatch = !q || 'авто auto'.includes(q);
    autoDiv.classList.toggle('hidden', !autoMatch);
    groupEls.forEach(({sep, hdr, opts})=>{
      let grpAny = false;
      opts.forEach(opt=>{
        const match = !q || opt.dataset.search.includes(q);
        opt.classList.toggle('hidden', !match);
        if(match) grpAny = true;
      });
      sep.style.display = grpAny ? '' : 'none';
      hdr.style.display = grpAny ? '' : 'none';
      if(grpAny) anyVisible = true;
    });
    emptyMsg.style.display = (!anyVisible && !autoMatch) ? '' : 'none';
  };
}

function pickModel(id, name, isAuto){
  applyModelSelection(id);
  if(typeof closeFloatingOverlays === 'function') closeFloatingOverlays();
  else closeAll();
  toast(isAuto ? (curLang==='ru' ? 'Авто выберет модель под задачу' : 'Auto will choose the right model') : (curLang==='ru' ? `${name} выбрана` : `${name} selected`), 'ok');
}

let openDD=null;
function toggleMDD(e,ddId,pillId){
  e.stopPropagation();
  const dd=document.getElementById(ddId); const pill=document.getElementById(pillId);
  if(openPop){
    document.getElementById(openPop)?.classList.remove('open');
    openPop=null;
    document.querySelectorAll('.sel-btn').forEach(btn => btn.classList.remove('open'));
  }
  if(openDD&&openDD!==ddId){ document.getElementById(openDD)?.classList.remove('open'); document.querySelectorAll('.m-pill').forEach(p=>p.setAttribute('aria-expanded','false')); }
  const open=dd.classList.toggle('open');
  pill.setAttribute('aria-expanded',open);
  openDD=open?ddId:null;
  refreshOverlayState();
}
