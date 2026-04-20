// ══ CHAT — renderMd(), appendMsg(), updateMsgModel(), doSend(), sendVoiceMsg(),
//           doVlmAnalyze(), downloadImg(),
//           doWebSearch(), copyMsg(), likeMsg(), fillQ(), syncTA() ══

function renderMd(raw){
  if(!raw) return '';
  let t=raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  t=t.replace(/```[\w]*\n?([\s\S]*?)```/g,(_,code)=>`<pre style="background:var(--s2);border:1px solid var(--border);border-radius:8px;padding:10px 13px;overflow-x:auto;margin:8px 0;font-size:12px;font-family:Consolas,monospace;white-space:pre">${code.trim()}</pre>`);
  t=t.replace(/`([^`\n]+)`/g,'<code style="background:var(--s2);padding:1px 6px;border-radius:4px;font-family:monospace;font-size:12.5px">$1</code>');
  t=t.replace(/\*\*\*(.+?)\*\*\*/g,'<strong><em>$1</em></strong>');
  t=t.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
  t=t.replace(/\*(.+?)\*/g,'<em>$1</em>');
  t=t.replace(/^### (.+)$/gm,'<strong style="font-size:14px;display:block;margin:10px 0 3px">$1</strong>');
  t=t.replace(/^## (.+)$/gm,'<strong style="font-size:15px;display:block;margin:12px 0 4px">$1</strong>');
  t=t.replace(/^# (.+)$/gm,'<strong style="font-size:16px;display:block;margin:14px 0 5px">$1</strong>');
  t=t.replace(/^[\-\*] (.+)$/gm,'<div style="padding-left:14px;margin:2px 0">• $1</div>');
  t=t.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g,'<a href="$2" target="_blank" style="color:var(--red);text-decoration:underline">$1</a>');
  t=t.replace(/(^|\s)(https?:\/\/[^\s<"]+)/g,'$1<a href="$2" target="_blank" style="color:var(--red);text-decoration:underline">$2</a>');
  t=t.replace(/\n/g,'<br>');
  t=t.replace(/(<\/pre>|<\/div>)<br>/g,'$1');
  return t;
}

function appendMsg(who, content, isMarkdown, usedModel){
  const ci=document.getElementById('chatInner');
  const el=document.createElement('div');

  const displayBadge = usedModel
    ? (modelDisplayName(usedModel)||usedModel)
    : (typeof getConversationRequestModelLabel === 'function'
      ? getConversationRequestModelLabel(currentConvId)
      : (selectedModel==='auto' ? 'Авто' : (selectedModelName||selectedModel)));

  if(who==='user'){
    el.className='msg u';
    el.innerHTML=`<div class="msg-av usr">Вы</div><div class="msg-body"><div class="msg-actions"><button class="msg-act copyBtn" title="Копировать"><svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button></div><div class="msg-meta" style="justify-content:flex-end"><span class="msg-sender">Вы</span></div><div class="msg-bbl">${esc(content)}</div></div>`;
    el.querySelector('.copyBtn').onclick=()=>{ navigator.clipboard.writeText(content).then(()=>toast('Скопировано','ok',1500)); };
  } else {
    el.className='msg';
    el.innerHTML=`<div class="msg-av ai">AI</div><div class="msg-body"><div class="msg-actions"><button class="msg-act copyBtn" title="Копировать"><svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button><button class="msg-act likeBtn" title="Полезно"><svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg></button></div><div class="msg-meta"><span class="msg-sender msg-model-name">${esc(displayBadge)}</span><span class="msg-badge msg-model-badge">${esc(displayBadge)}</span></div><div class="msg-bbl" style="line-height:1.7"></div></div>`;
    const bbl=el.querySelector('.msg-bbl');
    if(isMarkdown) bbl.innerHTML=renderMd(content);
    else if(content) bbl.textContent=content;
    el.querySelector('.copyBtn').onclick=()=>{ navigator.clipboard.writeText(content).then(()=>toast('Скопировано','ok',1500)); };
    el.querySelector('.likeBtn').onclick=()=>{ el.querySelector('.likeBtn').style.color='#22C55E'; toast('Отмечено как полезное','ok',1800); };
  }
  ci.appendChild(el);
  return el;
}

function updateMsgModel(el, modelId){
  if(!el||!modelId) return;
  const name = modelDisplayName(modelId)||modelId;
  const senderEl=el.querySelector('.msg-model-name');
  const badgeEl =el.querySelector('.msg-model-badge');
  if(senderEl) senderEl.textContent=name;
  if(badgeEl)  badgeEl.textContent=name;
}

function appendUserAttachmentsToMessage(el, attachments){
  const list = Array.isArray(attachments) ? attachments.filter(item => item?.name) : [];
  const bubble = el?.querySelector('.msg-bbl');
  if(!bubble || !list.length) return;

  const fileList=document.createElement('div');
  fileList.style.cssText='margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-end';
  list.forEach(file=>{
    const span=document.createElement('span');
    span.style.cssText='font-size:11px;background:var(--s2);border:1px solid var(--border);border-radius:6px;padding:2px 7px;color:var(--muted);display:inline-flex;align-items:center;gap:4px';
    span.innerHTML=`<svg width="9" height="9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>${esc(file.name||'Файл')}`;
    fileList.appendChild(span);
  });
  bubble.appendChild(fileList);
}

function renderConversationImageBubble(container, imageData, fallbackText){
  if(!container) return;
  const data = imageData && typeof imageData === 'object' ? imageData : {};
  if(!data.src){
    container.innerHTML=`<span style="color:var(--muted)">${esc(fallbackText || 'Изображение недоступно')}</span>`;
    return;
  }

  container.innerHTML='';

  const img=document.createElement('img');
  img.src=data.src;
  img.alt=data.alt || data.caption || data.prompt || 'Image';
  img.style.cssText='max-width:100%;border-radius:12px;margin-top:8px;display:block;box-shadow:0 4px 20px rgba(0,0,0,.4)';
  img.onerror=()=>{
    container.innerHTML=`<span style="color:var(--red)">${esc(fallbackText || 'Изображение недоступно')}</span>`;
    if(data.caption){
      const cap=document.createElement('small');
      cap.style.cssText='color:var(--muted);display:block;margin-top:6px';
      cap.textContent=data.caption;
      container.appendChild(cap);
    }
  };
  container.appendChild(img);

  if(data.caption){
    const cap=document.createElement('small');
    cap.style.cssText='color:var(--muted);display:block;margin-top:6px';
    cap.textContent=data.caption;
    container.appendChild(cap);
  }

  if(data.src.startsWith('data:')){
    const btn=document.createElement('button');
    btn.type='button';
    btn.style.cssText='font-size:11px;color:var(--red);background:none;border:none;padding:0;display:inline-flex;align-items:center;gap:4px;margin-top:4px;cursor:pointer';
    btn.innerHTML='<svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Скачать';
    btn.onclick=()=>downloadImg(data.src, data.downloadName || data.prompt || data.caption || 'изображение');
    container.appendChild(btn);
  } else {
    const link=document.createElement('a');
    link.href=data.src;
    link.target='_blank';
    link.rel='noreferrer';
    link.style.cssText='font-size:11px;color:var(--red);text-decoration:none;display:inline-flex;align-items:center;gap:4px;margin-top:4px';
    link.innerHTML='<svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Открыть';
    container.appendChild(link);
  }
}

function renderConversationMessage(message){
  if(!message?.role) return null;

  if(message.role === 'user'){
    const userEl = appendMsg('user', message.content, false, null);
    appendUserAttachmentsToMessage(userEl, message.attachments);
    return userEl;
  }

  const usedModel = message.model_used || message.usedModel || null;
  if(message.kind === 'image' && message.image?.src){
    const imageEl = appendMsg('ai', message.content || message.image?.caption || '', false, usedModel);
    renderConversationImageBubble(imageEl.querySelector('.msg-bbl'), message.image, 'Изображение недоступно');
    return imageEl;
  }

  const aiEl = appendMsg('ai', message.content, message.isMarkdown !== false, usedModel);
  const bbl = aiEl.querySelector('.msg-bbl');
  if(message.research && typeof message.research === 'object'){
    appendRichResearchResult(bbl, {
      result: message.research,
      plan: { facets: Array.isArray(message.sub_queries) ? message.sub_queries : [] },
    });
  } else if((message.sources && message.sources.length) || (message.sub_queries && message.sub_queries.length) || message.stats || (message.notes && message.notes.length)){
    appendResearchMeta(bbl, message.sources, message.sub_queries, message.stats, message.notes);
  }
  return aiEl;
}

function getConversationAgentIdStrict(convId){
  return typeof getConversationAgentId === 'function'
    ? (getConversationAgentId(convId) || null)
    : null;
}

function getConversationRequestModel(convId){
  const binding = typeof getConversationBinding === 'function'
    ? getConversationBinding(convId)
    : null;
  if(binding?.modelId) return binding.modelId;
  return typeof getConversationModel === 'function'
    ? (getConversationModel(convId) || 'auto')
    : (selectedModel || 'auto');
}

function getConversationRequestModelLabel(convId){
  const modelId = getConversationRequestModel(convId);
  if(modelId === 'auto'){
    return typeof autoModelLabel === 'function' ? autoModelLabel() : 'Auto';
  }
  return (typeof modelDisplayName === 'function' ? modelDisplayName(modelId) : null) || modelId;
}

function buildConversationRequestContext(convId, overrides){
  const binding = typeof getConversationBinding === 'function'
    ? getConversationBinding(convId)
    : null;
  return {
    convId,
    userId: currentUserId,
    modelId: binding?.modelId || getConversationRequestModel(convId),
    modelLabel: getConversationRequestModelLabel(convId),
    agentId: binding?.agentId ?? getConversationAgentIdStrict(convId),
    ...(overrides || {}),
  };
}

function getConversationSystemPrompt(convId){
  if(typeof AGENT_SYSTEM_PROMPTS !== 'object' || !AGENT_SYSTEM_PROMPTS) return null;
  const agentId = getConversationAgentIdStrict(convId);
  return agentId ? (AGENT_SYSTEM_PROMPTS[agentId] || null) : null;
}

function buildConversationRequestMessages(convId){
  const baseMessages = getConversationMessagesSnapshot(convId)
    .filter(message => message?.role === 'user' || message?.role === 'assistant')
    .map(message => ({ role: message.role, content: message.content }));
  const systemPrompt = getConversationSystemPrompt(convId);
  return systemPrompt
    ? [{ role:'system', content: systemPrompt }, ...baseMessages]
    : baseMessages;
}

function compactResearchContextText(text, limit = 420){
  const normalized = String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/\s*\[[A-Z]\d[^\]]*\]([.!?])?\s*$/, '$1')
    .trim();
  if(!normalized) return '';
  if(normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(80, limit - 1)).trimEnd()}…`;
}

function formatResearchMetricName(metricName){
  const normalized = String(metricName || '').trim();
  const labels = {
    percent_change: 'change',
    absolute_change: 'net change',
    start_price: 'start',
    end_price: 'end',
    high: 'high',
    low: 'low',
  };
  return labels[normalized] || normalized.replace(/_/g, ' ');
}

function formatResearchMetricPreview(metric){
  if(!metric || typeof metric !== 'object') return '';
  const entity = String(metric.entity || '').trim();
  const name = formatResearchMetricName(metric.name);
  const value = String(metric.value || '').trim();
  const unit = String(metric.unit || '').trim();
  if(!value) return '';
  const withUnit = unit && !value.includes(unit) ? `${value} ${unit}` : value;
  return `${[entity, name].filter(Boolean).join(' ').trim()}: ${withUnit}`;
}

function summarizeResearchPayloadForContext(research, options){
  if(!research || typeof research !== 'object') return '';
  const presentation = research.presentation && typeof research.presentation === 'object'
    ? research.presentation
    : null;
  const findings = Array.isArray(research.findings)
    ? research.findings.filter(Boolean).slice(0, 3)
    : [];
  const tables = Array.isArray(research.tables)
    ? research.tables.filter(table => table?.title).slice(0, 1)
    : [];
  const metrics = Array.isArray(research.metrics)
    ? research.metrics.map(formatResearchMetricPreview).filter(Boolean).slice(0, 3)
    : [];
  const sources = Array.isArray(research.sources)
    ? research.sources.map(source => source?.domain || source?.title || '').filter(Boolean).slice(0, 3)
    : [];
  const intent = research.intent && typeof research.intent === 'object'
    ? research.intent
    : null;
  const question = compactResearchContextText(options?.question || '', 150);
  const parts = [];
  if(question) parts.push(`topic: ${question}`);
  if(presentation?.summary) parts.push(`summary: ${presentation.summary}`);
  if(intent?.entities?.length) parts.push(`entities: ${intent.entities.join(', ')}`);
  if(intent?.time_range?.label) parts.push(`period: ${intent.time_range.label}`);
  if(findings.length) parts.push(`findings: ${findings.join('; ')}`);
  if(tables.length) parts.push(`table: ${tables[0].title}`);
  if(metrics.length) parts.push(`numbers: ${metrics.join('; ')}`);
  if(sources.length) parts.push(`sources: ${sources.join(', ')}`);
  return compactResearchContextText(parts.join(' | '), 420);
}

function serializeConversationMessageForResearch(message){
  if(!message || (message.role !== 'user' && message.role !== 'assistant')) return null;
  let content = String(message.content || '').trim();
  if(message.role === 'assistant' && message.research && typeof message.research === 'object'){
    const researchSummary = summarizeResearchPayloadForContext(message.research, {
      question: message.research_query || '',
    });
    content = researchSummary || content;
  }
  content = compactResearchContextText(content, message.role === 'assistant' ? 420 : 320);
  if(!content) return null;
  return { role: message.role, content };
}

function buildResearchConversationMemoryBlock(convId, currentQuery){
  const normalizedQuery = String(currentQuery || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const messages = getConversationMessagesSnapshot(convId)
    .filter(message => message?.role === 'user' || message?.role === 'assistant');
  const memoryLines = [];

  messages.forEach((message, index)=>{
    if(message?.role !== 'assistant' || !message?.research || typeof message.research !== 'object') return;
    const linkedQuestion = String(message.research_query || messages[index - 1]?.content || '').replace(/\s+/g, ' ').trim();
    if(linkedQuestion && linkedQuestion.toLowerCase() === normalizedQuery) return;

    const summary = summarizeResearchPayloadForContext(message.research, {
      question: linkedQuestion,
    });
    if(summary) memoryLines.push(summary);
  });

  const uniqueLines = [...new Map(memoryLines.map(item => [item.toLowerCase(), item])).values()].slice(-3);
  if(!uniqueLines.length) return null;
  return [
    'Conversation research memory. Use only if it helps answer the current request.',
    ...uniqueLines.map(item => `- ${item}`),
  ].join('\n');
}

function combineResearchMemoryContexts(...blocks){
  const cleaned = [];
  const seen = new Set();
  blocks.forEach(block=>{
    const text = String(block || '').trim();
    if(!text) return;
    const key = text.toLowerCase();
    if(seen.has(key)) return;
    seen.add(key);
    cleaned.push(text);
  });
  return cleaned.length ? cleaned.join('\n\n') : null;
}

function buildResearchConversationContext(convId, currentQuery){
  const normalizedQuery = String(currentQuery || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const messages = getConversationMessagesSnapshot(convId)
    .filter(message => message?.role === 'user' || message?.role === 'assistant');
  const trimmedMessages = [...messages];
  const last = trimmedMessages[trimmedMessages.length - 1];
  if(last?.role === 'user' && String(last.content || '').replace(/\s+/g, ' ').trim().toLowerCase() === normalizedQuery){
    trimmedMessages.pop();
  }
  return trimmedMessages
    .slice(-6)
    .map(serializeConversationMessageForResearch)
    .filter(Boolean);
}

function buildStoredResearchResult(result){
  if(!result || typeof result !== 'object') return null;
  return {
    answer: result.answer || '',
    intent: result.intent || null,
    findings: Array.isArray(result.findings) ? result.findings.slice(0, 6) : [],
    uncertainties: Array.isArray(result.uncertainties) ? result.uncertainties.slice(0, 4) : [],
    tables: Array.isArray(result.tables) ? result.tables.slice(0, 2) : [],
    metrics: Array.isArray(result.metrics) ? result.metrics.slice(0, 12) : [],
    sources: Array.isArray(result.sources) ? result.sources.slice(0, 6) : [],
    presentation: result.presentation || null,
    stats: result.stats || null,
  };
}

function buildResearchMetaSection(sources, subQueries, stats){
  const safeSources = Array.isArray(sources) ? sources : [];
  const safeQueries = Array.isArray(subQueries) ? subQueries : [];
  const safeStats = stats && typeof stats === 'object' ? stats : null;
  if(!safeSources.length && !safeQueries.length && !safeStats) return null;

  const wrap=document.createElement('div');
  wrap.style.cssText='margin-top:12px;padding-top:10px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px';

  if(safeQueries.length){
    const queries=document.createElement('div');
    queries.style.cssText='display:flex;flex-wrap:wrap;gap:6px';
    safeQueries.forEach(q=>{
      const chip=document.createElement('span');
      chip.style.cssText='font-size:11px;padding:3px 8px;border-radius:999px;background:var(--s2);border:1px solid var(--border);color:var(--muted)';
      chip.textContent=q;
      queries.appendChild(chip);
    });
    wrap.appendChild(queries);
  }

  if(safeSources.length){
    const title=document.createElement('div');
    title.style.cssText='font-size:12px;font-weight:600;color:var(--muted)';
    title.textContent='Источники';
    wrap.appendChild(title);

    const list=document.createElement('div');
    list.style.cssText='display:flex;flex-direction:column;gap:6px';
    safeSources.forEach(source=>{
      const item=document.createElement('a');
      item.href=source.url||'#';
      item.target='_blank';
      item.rel='noreferrer';
      item.style.cssText='padding:8px 10px;border-radius:10px;background:var(--s2);border:1px solid var(--border);text-decoration:none;color:inherit;display:block';
      item.innerHTML=`<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><strong style="font-size:12px">${esc(source.title||source.url||'Источник')}</strong><span style="font-size:10px;color:var(--red)">${esc(source.source_id||'')}</span></div><div style="font-size:11px;color:var(--muted);margin-top:3px">${esc(source.excerpt||source.snippet||'')}</div><div style="font-size:10px;color:var(--dim);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(source.url||'')}</div>`;
      list.appendChild(item);
    });
    wrap.appendChild(list);
  }

  if(safeStats){
    const statsEl=document.createElement('div');
    statsEl.style.cssText='font-size:11px;color:var(--dim)';
    const parts=[];
    if(Number.isFinite(safeStats.pages_fetched)) parts.push(`источников собрано: ${safeStats.pages_fetched}`);
    if(Number.isFinite(safeStats.sources_used)) parts.push(`использовано: ${safeStats.sources_used}`);
    if(Number.isFinite(safeStats.queries_completed) && Number.isFinite(safeStats.queries_total)) parts.push(`запросов: ${safeStats.queries_completed}/${safeStats.queries_total}`);
    if(safeStats.timed_out) parts.push('достигнут лимит времени');
    statsEl.textContent=parts.join(' • ');
    if(statsEl.textContent) wrap.appendChild(statsEl);
  }

  return wrap;
}

function appendResearchMeta(container, sources, subQueries, stats){
  if(!container) return;
  const section = buildResearchMetaSection(sources, subQueries, stats);
  if(section) container.appendChild(section);
}

function formatResearchProgress(data){
  if(data?.message) return data.message;
  if(Array.isArray(data?.sub_queries) && data.sub_queries.length){
    return data.sub_queries.slice(0,4).join(' • ');
  }
  if(data?.query){
    const completed = Number.isFinite(data.queries_completed) ? data.queries_completed : 0;
    const total = Number.isFinite(data.queries_total) ? data.queries_total : '?';
    const sourcesTotal = Number.isFinite(data.sources_total) ? data.sources_total : 0;
    return `${data.query} (${completed}/${total}), источников: ${sourcesTotal}`;
  }
  if(Number.isFinite(data?.pages_fetched)){
    return `источников собрано ${data.pages_fetched}${data.timed_out ? ' • достигнут лимит времени' : ''}`;
  }
  return '';
}

function normalizeResearchTags(items){
  if(!Array.isArray(items)) return [];
  return items
    .map(item=>{
      if(typeof item==='string') return item.trim();
      if(item && typeof item==='object'){
        return String(item.title || item.query || item.facet_id || '').trim();
      }
      return '';
    })
    .filter(Boolean)
    .slice(0,6);
}

function buildResearchMetaSection(sources, subQueries, stats, notes){
  const safeSources = Array.isArray(sources) ? sources : [];
  const safeQueries = normalizeResearchTags(subQueries);
  const safeStats = stats && typeof stats === 'object' ? stats : null;
  const safeNotes = Array.isArray(notes) ? notes.filter(Boolean).slice(0, 4) : [];
  if(!safeSources.length && !safeQueries.length && !safeStats && !safeNotes.length) return null;

  const wrap=document.createElement('div');
  wrap.style.cssText='margin-top:12px;padding-top:10px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px';

  if(safeQueries.length){
    const queries=document.createElement('div');
    queries.style.cssText='display:flex;flex-wrap:wrap;gap:6px';
    safeQueries.forEach(q=>{
      const chip=document.createElement('span');
      chip.style.cssText='font-size:11px;padding:3px 8px;border-radius:999px;background:var(--s2);border:1px solid var(--border);color:var(--muted)';
      chip.textContent=q;
      queries.appendChild(chip);
    });
    wrap.appendChild(queries);
  }

  if(safeSources.length){
    const title=document.createElement('div');
    title.style.cssText='font-size:12px;font-weight:600;color:var(--muted)';
    title.textContent='Источники';
    wrap.appendChild(title);

    const list=document.createElement('div');
    list.style.cssText='display:flex;flex-direction:column;gap:6px';
    safeSources.forEach(source=>{
      const item=document.createElement('a');
      item.href=source.url||'#';
      item.target='_blank';
      item.rel='noreferrer';
      item.style.cssText='padding:8px 10px;border-radius:10px;background:var(--s2);border:1px solid var(--border);text-decoration:none;color:inherit;display:block';
      item.innerHTML=`<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><strong style="font-size:12px">${esc(source.title||source.url||'Источник')}</strong><span style="font-size:10px;color:var(--red)">${esc(source.source_id||'')}</span></div><div style="font-size:11px;color:var(--muted);margin-top:3px">${esc(source.excerpt||source.snippet||'')}</div><div style="font-size:10px;color:var(--dim);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(source.url||'')}</div>`;
      list.appendChild(item);
    });
    wrap.appendChild(list);
  }

  if(safeNotes.length){
    const notesEl=document.createElement('div');
    notesEl.style.cssText='display:flex;flex-direction:column;gap:4px';
    safeNotes.forEach(note=>{
      const line=document.createElement('div');
      line.style.cssText='font-size:11px;color:var(--dim)';
      line.textContent=note;
      notesEl.appendChild(line);
    });
    wrap.appendChild(notesEl);
  }

  if(safeStats){
    const statsEl=document.createElement('div');
    statsEl.style.cssText='font-size:11px;color:var(--dim)';
    const parts=[];
    if(Number.isFinite(safeStats.pages_fetched)) parts.push(`источников собрано: ${safeStats.pages_fetched}`);
    if(Number.isFinite(safeStats.sources_used)) parts.push(`использовано: ${safeStats.sources_used}`);
    if(Number.isFinite(safeStats.queries_completed) && Number.isFinite(safeStats.queries_total)) parts.push(`запросов: ${safeStats.queries_completed}/${safeStats.queries_total}`);
    if(Number.isFinite(safeStats.iterations_completed)) parts.push(`итераций: ${safeStats.iterations_completed}`);
    if(Number.isFinite(safeStats.sources_discovered)) parts.push(`найдено источников: ${safeStats.sources_discovered}`);
    if(Number.isFinite(safeStats.sources_selected)) parts.push(`источников отобрано: ${safeStats.sources_selected}`);
    if(Number.isFinite(safeStats.evidences_extracted)) parts.push(`фактов извлечено: ${safeStats.evidences_extracted}`);
    if(Number.isFinite(safeStats.duration_ms) && safeStats.duration_ms > 0) parts.push(`время: ${(safeStats.duration_ms/1000).toFixed(1)}с`);
    if(safeStats.stop_reason) parts.push(`остановка: ${safeStats.stop_reason}`);
    if(safeStats.timed_out) parts.push('достигнут лимит времени');
    statsEl.textContent=parts.join(' • ');
    if(statsEl.textContent) wrap.appendChild(statsEl);
  }

  return wrap;
}

function appendResearchMeta(container, sources, subQueries, stats, notes){
  if(!container) return;
  const section = buildResearchMetaSection(sources, subQueries, stats, notes);
  if(section) container.appendChild(section);
}

function compactResearchText(text, limit = 180){
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if(!normalized) return '';
  if(normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 1).trim()}…`;
}

function appendRichResearchResult(container, session){
  if(!container || !session?.result) return;
  const result = session.result;
  const wrap=document.createElement('div');
  wrap.style.cssText='margin-top:12px;padding-top:10px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:10px';

  const deliverables = Array.isArray(result.deliverables) ? result.deliverables : [];
  if(deliverables.length){
    const block=document.createElement('div');
    block.innerHTML='<div style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:6px">Проверка результата</div>';
    const list=document.createElement('div');
    list.style.cssText='display:flex;flex-direction:column;gap:5px';
    deliverables.slice(0,6).forEach(item=>{
      const row=document.createElement('div');
      const done=Boolean(item?.satisfied);
      row.style.cssText='font-size:11px;color:var(--dim);display:flex;gap:6px;align-items:flex-start';
      row.innerHTML=`<span style="color:${done ? '#22C55E' : 'var(--red)'}">${done ? 'OK' : '!!'}</span><span>${esc(item?.title || 'Пункт результата')}${item?.details ? ` — ${esc(item.details)}` : ''}</span>`;
      list.appendChild(row);
    });
    block.appendChild(list);
    wrap.appendChild(block);
  }

  const tables = Array.isArray(result.tables) ? result.tables.filter(table => Array.isArray(table?.rows) && table.rows.length) : [];
  tables.slice(0,2).forEach(table=>{
    const block=document.createElement('div');
    const title=document.createElement('div');
    title.style.cssText='font-size:12px;font-weight:600;color:var(--muted);margin-bottom:6px';
    title.textContent=table.title || 'Таблица';
    block.appendChild(title);

    const tableEl=document.createElement('table');
    tableEl.style.cssText='width:100%;border-collapse:collapse;font-size:11px;background:var(--s2);border:1px solid var(--border);border-radius:10px;overflow:hidden;display:block';
    const head=document.createElement('thead');
    const headRow=document.createElement('tr');
    (table.columns || []).forEach(column=>{
      const th=document.createElement('th');
      th.style.cssText='text-align:left;padding:8px;border-bottom:1px solid var(--border);color:var(--muted);white-space:nowrap';
      th.textContent=column;
      headRow.appendChild(th);
    });
    head.appendChild(headRow);
    tableEl.appendChild(head);

    const body=document.createElement('tbody');
    (table.rows || []).slice(0,8).forEach(row=>{
      const tr=document.createElement('tr');
      row.forEach(cell=>{
        const td=document.createElement('td');
        td.style.cssText='padding:8px;border-bottom:1px solid rgba(255,255,255,.04);vertical-align:top';
        td.textContent=compactResearchText(cell, 90);
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    tableEl.appendChild(body);
    block.appendChild(tableEl);
    wrap.appendChild(block);
  });

  const metrics = Array.isArray(result.metrics) ? result.metrics : [];
  if(metrics.length){
    const block=document.createElement('div');
    const title=document.createElement('div');
    title.style.cssText='font-size:12px;font-weight:600;color:var(--muted);margin-bottom:6px';
    title.textContent='Метрики';
    block.appendChild(title);
    const chips=document.createElement('div');
    chips.style.cssText='display:flex;flex-wrap:wrap;gap:6px';
    metrics.slice(0,12).forEach(metric=>{
      const chip=document.createElement('span');
      chip.style.cssText='font-size:10.5px;padding:4px 8px;border-radius:999px;background:var(--s2);border:1px solid var(--border);color:var(--dim)';
      chip.textContent=`${metric.entity || 'Сущность'}: ${metric.name || 'метрика'} = ${metric.value || '-'}`;
      chips.appendChild(chip);
    });
    block.appendChild(chips);
    wrap.appendChild(block);
  }

  const sources = Array.isArray(result.sources) ? result.sources : [];
  if(sources.length){
    const block=document.createElement('div');
    const title=document.createElement('div');
    title.style.cssText='font-size:12px;font-weight:600;color:var(--muted);margin-bottom:6px';
    title.textContent='Источники';
    block.appendChild(title);
    const list=document.createElement('div');
    list.style.cssText='display:flex;flex-direction:column;gap:6px';
    sources.slice(0,6).forEach(source=>{
      const item=document.createElement('a');
      item.href=source.url||'#';
      item.target='_blank';
      item.rel='noreferrer';
      item.style.cssText='padding:8px 10px;border-radius:10px;background:var(--s2);border:1px solid var(--border);text-decoration:none;color:inherit;display:block';
      item.innerHTML=`<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><strong style="font-size:12px">${esc(compactResearchText(source.title||source.url||'Источник', 90))}</strong><span style="font-size:10px;color:var(--red)">${esc(source.domain||'')}</span></div><div style="font-size:11px;color:var(--muted);margin-top:3px">${esc(compactResearchText(source.snippet||source.excerpt||'', 180))}</div><div style="font-size:10px;color:var(--dim);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(source.url||'')}</div>`;
      list.appendChild(item);
    });
    block.appendChild(list);
    wrap.appendChild(block);
  }

  const stats = result.stats && typeof result.stats === 'object' ? result.stats : null;
  if(stats){
    const statsEl=document.createElement('div');
    statsEl.style.cssText='font-size:11px;color:var(--dim)';
    const parts=[];
    if(Number.isFinite(stats.iterations_completed)) parts.push(`итераций: ${stats.iterations_completed}`);
    if(Number.isFinite(stats.sources_discovered)) parts.push(`найдено источников: ${stats.sources_discovered}`);
    if(Number.isFinite(stats.sources_selected)) parts.push(`источников отобрано: ${stats.sources_selected}`);
    if(Number.isFinite(stats.evidences_extracted)) parts.push(`фактов извлечено: ${stats.evidences_extracted}`);
    if(Number.isFinite(stats.metrics_computed)) parts.push(`метрик: ${stats.metrics_computed}`);
    if(Number.isFinite(stats.tables_built)) parts.push(`таблиц: ${stats.tables_built}`);
    if(Number.isFinite(stats.deliverables_satisfied) && Number.isFinite(stats.deliverables_total)) parts.push(`результатов закрыто: ${stats.deliverables_satisfied}/${stats.deliverables_total}`);
    if(Number.isFinite(stats.duration_ms) && stats.duration_ms > 0) parts.push(`time: ${(stats.duration_ms/1000).toFixed(1)}s`);
    if(stats.stop_reason) parts.push(`stop: ${stats.stop_reason}`);
    statsEl.textContent=parts.join(' • ');
    if(statsEl.textContent) wrap.appendChild(statsEl);
  }

  const notes = Array.isArray(result.uncertainties) ? result.uncertainties.filter(Boolean).slice(0, 4) : [];
  if(notes.length){
    const block=document.createElement('div');
    block.style.cssText='display:flex;flex-direction:column;gap:4px';
    notes.forEach(note=>{
      const line=document.createElement('div');
      line.style.cssText='font-size:11px;color:var(--dim)';
      line.textContent=compactResearchText(note, 180);
      block.appendChild(line);
    });
    wrap.appendChild(block);
  }

  container.appendChild(wrap);
}

function compactResearchText(text, limit = 180){
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if(!normalized) return '';
  if(normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(1, limit - 3)).trim()}...`;
}

function buildResearchStatPills(stats){
  const safeStats = stats && typeof stats === 'object' ? stats : null;
  if(!safeStats) return [];
  const pills = [];
  if(Number.isFinite(safeStats.sources_selected)) pills.push(`Источники ${safeStats.sources_selected}`);
  else if(Number.isFinite(safeStats.sources_used)) pills.push(`Источники ${safeStats.sources_used}`);
  if(Number.isFinite(safeStats.metrics_computed) && safeStats.metrics_computed > 0) pills.push(`Метрики ${safeStats.metrics_computed}`);
  if(Number.isFinite(safeStats.tables_built) && safeStats.tables_built > 0) pills.push(`Таблицы ${safeStats.tables_built}`);
  if(Number.isFinite(safeStats.deliverables_satisfied) && Number.isFinite(safeStats.deliverables_total) && safeStats.deliverables_total > 0){
    pills.push(`Покрытие ${safeStats.deliverables_satisfied}/${safeStats.deliverables_total}`);
  }
  if(Number.isFinite(safeStats.duration_ms) && safeStats.duration_ms > 0) pills.push(`${(safeStats.duration_ms/1000).toFixed(1)}s`);
  return pills.slice(0, 5);
}

function pickPrimaryResearchMetrics(metrics){
  const safeMetrics = Array.isArray(metrics) ? metrics : [];
  const priority = ['percent_change', 'end_price', 'absolute_change', 'start_price'];
  return [...safeMetrics]
    .sort((left, right)=>{
      const leftRank = priority.indexOf(left?.name || '');
      const rightRank = priority.indexOf(right?.name || '');
      return (leftRank === -1 ? 99 : leftRank) - (rightRank === -1 ? 99 : rightRank);
    })
    .slice(0, 6);
}

function buildResearchMetaSection(sources, subQueries, stats, notes){
  const safeSources = Array.isArray(sources) ? sources : [];
  const safeQueries = normalizeResearchTags(subQueries);
  const safeStats = stats && typeof stats === 'object' ? stats : null;
  const safeNotes = Array.isArray(notes) ? notes.filter(Boolean).slice(0, 4) : [];
  if(!safeSources.length && !safeQueries.length && !safeStats && !safeNotes.length) return null;

  const wrap=document.createElement('div');
  wrap.style.cssText='margin-top:12px;padding-top:10px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px';

  if(safeQueries.length){
    const queries=document.createElement('div');
    queries.style.cssText='display:flex;flex-wrap:wrap;gap:6px';
    safeQueries.forEach(q=>{
      const chip=document.createElement('span');
      chip.style.cssText='font-size:11px;padding:3px 8px;border-radius:999px;background:var(--s2);border:1px solid var(--border);color:var(--muted)';
      chip.textContent=q;
      queries.appendChild(chip);
    });
    wrap.appendChild(queries);
  }

  if(safeSources.length){
    const title=document.createElement('div');
    title.style.cssText='font-size:12px;font-weight:600;color:var(--muted)';
    title.textContent='Источники';
    wrap.appendChild(title);

    const list=document.createElement('div');
    list.style.cssText='display:flex;flex-direction:column;gap:6px';
    safeSources.slice(0,4).forEach(source=>{
      const item=document.createElement('a');
      item.href=source.url||'#';
      item.target='_blank';
      item.rel='noreferrer';
      item.style.cssText='padding:8px 10px;border-radius:10px;background:var(--s2);border:1px solid var(--border);text-decoration:none;color:inherit;display:block';
      item.innerHTML=`<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><strong style="font-size:12px">${esc(compactResearchText(source.title||source.url||'Источник', 90))}</strong><span style="font-size:10px;color:var(--red)">${esc(source.source_id||'')}</span></div><div style="font-size:11px;color:var(--muted);margin-top:3px">${esc(compactResearchText(source.snippet||source.excerpt||'', 140))}</div><div style="font-size:10px;color:var(--dim);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(source.url||'')}</div>`;
      list.appendChild(item);
    });
    wrap.appendChild(list);
  }

  if(safeNotes.length){
    const notesEl=document.createElement('div');
    notesEl.style.cssText='display:flex;flex-direction:column;gap:4px';
    safeNotes.forEach(note=>{
      const line=document.createElement('div');
      line.style.cssText='font-size:11px;color:var(--dim)';
      line.textContent=compactResearchText(note, 180);
      notesEl.appendChild(line);
    });
    wrap.appendChild(notesEl);
  }

  if(safeStats){
    const statsEl=document.createElement('div');
    statsEl.style.cssText='font-size:11px;color:var(--dim)';
    const parts=[];
    if(Number.isFinite(safeStats.iterations_completed)) parts.push(`итераций: ${safeStats.iterations_completed}`);
    if(Number.isFinite(safeStats.sources_discovered)) parts.push(`найдено источников: ${safeStats.sources_discovered}`);
    if(Number.isFinite(safeStats.sources_selected)) parts.push(`источников отобрано: ${safeStats.sources_selected}`);
    if(Number.isFinite(safeStats.evidences_extracted)) parts.push(`фактов извлечено: ${safeStats.evidences_extracted}`);
    if(Number.isFinite(safeStats.metrics_computed)) parts.push(`метрик: ${safeStats.metrics_computed}`);
    if(Number.isFinite(safeStats.tables_built)) parts.push(`таблиц: ${safeStats.tables_built}`);
    if(Number.isFinite(safeStats.deliverables_satisfied) && Number.isFinite(safeStats.deliverables_total)) parts.push(`результатов закрыто: ${safeStats.deliverables_satisfied}/${safeStats.deliverables_total}`);
    if(Number.isFinite(safeStats.duration_ms) && safeStats.duration_ms > 0) parts.push(`time: ${(safeStats.duration_ms/1000).toFixed(1)}s`);
    if(safeStats.stop_reason) parts.push(`stop: ${safeStats.stop_reason}`);
    statsEl.textContent=parts.join(' • ');
    if(statsEl.textContent) wrap.appendChild(statsEl);
  }

  return wrap;
}

function appendResearchMeta(container, sources, subQueries, stats, notes){
  if(!container) return;
  const section = buildResearchMetaSection(sources, subQueries, stats, notes);
  if(section) container.appendChild(section);
}

function buildResearchMetaSection(sources, subQueries, stats, notes){
  const safeSources = Array.isArray(sources) ? sources : [];
  const safeQueries = normalizeResearchTags(subQueries);
  const safeNotes = Array.isArray(notes) ? notes.filter(Boolean).slice(0, 3) : [];
  const statPills = buildResearchStatPills(stats);
  if(!safeSources.length && !safeQueries.length && !safeNotes.length && !statPills.length) return null;

  const wrap=document.createElement('div');
  wrap.className='research-meta';

  if(safeQueries.length){
    const queries=document.createElement('div');
    queries.className='research-tags';
    safeQueries.slice(0,4).forEach(q=>{
      const chip=document.createElement('span');
      chip.className='research-tag';
      chip.textContent=compactResearchText(q, 32);
      queries.appendChild(chip);
    });
    wrap.appendChild(queries);
  }

  if(safeSources.length){
    const list=document.createElement('div');
    list.className='research-source-list';
    safeSources.slice(0,3).forEach(source=>{
      const item=document.createElement('a');
      item.className='research-source';
      item.href=source.url||'#';
      item.target='_blank';
      item.rel='noreferrer';
      item.innerHTML=`<div class="research-source-top"><strong>${esc(compactResearchText(source.title||source.url||'Источник', 72))}</strong><span>${esc(source.source_id||'')}</span></div><div class="research-source-snippet">${esc(compactResearchText(source.snippet||source.excerpt||'', 100))}</div>`;
      list.appendChild(item);
    });
    wrap.appendChild(list);
  }

  if(safeNotes.length){
    const notesEl=document.createElement('div');
    notesEl.className='research-note-list';
    safeNotes.forEach(note=>{
      const line=document.createElement('div');
      line.className='research-note';
      line.textContent=compactResearchText(note, 120);
      notesEl.appendChild(line);
    });
    wrap.appendChild(notesEl);
  }

  if(statPills.length){
    const statsEl=document.createElement('div');
    statsEl.className='research-pills';
    statPills.forEach(label=>{
      const pill=document.createElement('span');
      pill.className='research-pill';
      pill.textContent=label;
      statsEl.appendChild(pill);
    });
    wrap.appendChild(statsEl);
  }

  return wrap;
}

function appendResearchMeta(container, sources, subQueries, stats, notes){
  if(!container) return;
  const section = buildResearchMetaSection(sources, subQueries, stats, notes);
  if(section) container.appendChild(section);
}

function appendRichResearchResult(container, session){
  if(!container || !session?.result) return;
  const result = session.result;
  const wrap=document.createElement('section');
  wrap.className='research-card';

  const deliverables = Array.isArray(result.deliverables) ? result.deliverables : [];
  const missing = deliverables.filter(item => item && item.required !== false && item.satisfied === false);
  const statPills = buildResearchStatPills(result.stats);
  const metrics = pickPrimaryResearchMetrics(result.metrics);
  const tables = Array.isArray(result.tables) ? result.tables.filter(table => Array.isArray(table?.rows) && table.rows.length) : [];
  const sources = Array.isArray(result.sources) ? result.sources : [];
  const notes = Array.isArray(result.uncertainties) ? result.uncertainties.filter(Boolean).slice(0, 2) : [];

  const top=document.createElement('div');
  top.className='research-card-top';
  top.innerHTML=`<div class="research-card-title-wrap"><div class="research-card-kicker">Краткий отчёт</div><div class="research-card-title">${missing.length ? 'Требует внимания' : 'Структурированный результат готов'}</div></div><div class="research-card-state ${missing.length ? 'is-warning' : 'is-ready'}">${missing.length ? `не закрыто: ${missing.length}` : 'Готово'}</div>`;
  wrap.appendChild(top);

  if(statPills.length){
    const pills=document.createElement('div');
    pills.className='research-pills';
    statPills.forEach(label=>{
      const pill=document.createElement('span');
      pill.className='research-pill';
      pill.textContent=label;
      pills.appendChild(pill);
    });
    wrap.appendChild(pills);
  }

  if(missing.length){
    const panel=document.createElement('div');
    panel.className='research-panel';
    panel.innerHTML='<div class="research-panel-title">Что ещё не закрыто</div>';
    const list=document.createElement('div');
    list.className='research-note-list';
    missing.slice(0,3).forEach(item=>{
      const row=document.createElement('div');
      row.className='research-note';
      row.textContent=`${item.title}${item.details ? `: ${compactResearchText(item.details, 88)}` : ''}`;
      list.appendChild(row);
    });
    panel.appendChild(list);
    wrap.appendChild(panel);
  }

  if(tables.length){
    const primaryTable = tables[0];
    const panel=document.createElement('div');
    panel.className='research-panel';
    panel.innerHTML=`<div class="research-panel-title">${esc(primaryTable.title || 'Таблица')}</div>`;
    const tableWrap=document.createElement('div');
    tableWrap.className='research-table-wrap';
    const tableEl=document.createElement('table');
    tableEl.className='research-table';
    const head=document.createElement('thead');
    const headRow=document.createElement('tr');
    (primaryTable.columns || []).forEach(column=>{
      const th=document.createElement('th');
      th.textContent=column;
      headRow.appendChild(th);
    });
    head.appendChild(headRow);
    tableEl.appendChild(head);

    const body=document.createElement('tbody');
    (primaryTable.rows || []).slice(0,6).forEach(row=>{
      const tr=document.createElement('tr');
      row.forEach(cell=>{
        const td=document.createElement('td');
        td.textContent=compactResearchText(cell, 64);
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    tableEl.appendChild(body);
    tableWrap.appendChild(tableEl);
    panel.appendChild(tableWrap);
    wrap.appendChild(panel);
  }

  if(metrics.length){
    const panel=document.createElement('div');
    panel.className='research-panel';
    panel.innerHTML='<div class="research-panel-title">Ключевые метрики</div>';
    const metricGrid=document.createElement('div');
    metricGrid.className='research-metric-grid';
    metrics.forEach(metric=>{
      const card=document.createElement('div');
      card.className='research-metric';
      card.innerHTML=`<div class="research-metric-label">${esc(metric.entity || 'Сущность')} • ${esc(metric.name || 'метрика')}</div><div class="research-metric-value">${esc(metric.value || '-')}</div>`;
      metricGrid.appendChild(card);
    });
    panel.appendChild(metricGrid);
    wrap.appendChild(panel);
  }

  if(sources.length){
    const panel=document.createElement('div');
    panel.className='research-panel';
    panel.innerHTML='<div class="research-panel-title">Выбранные источники</div>';
    const list=document.createElement('div');
    list.className='research-source-list';
    sources.slice(0,3).forEach(source=>{
      const item=document.createElement('a');
      item.className='research-source';
      item.href=source.url||'#';
      item.target='_blank';
      item.rel='noreferrer';
      item.innerHTML=`<div class="research-source-top"><strong>${esc(compactResearchText(source.title||source.url||'Источник', 68))}</strong><span>${esc(source.domain||'')}</span></div><div class="research-source-snippet">${esc(compactResearchText(source.snippet||source.excerpt||'', 110))}</div>`;
      list.appendChild(item);
    });
    panel.appendChild(list);
    wrap.appendChild(panel);
  }

  if(notes.length){
    const panel=document.createElement('div');
    panel.className='research-panel';
    panel.innerHTML='<div class="research-panel-title">Ограничения</div>';
    const list=document.createElement('div');
    list.className='research-note-list';
    notes.forEach(note=>{
      const row=document.createElement('div');
      row.className='research-note';
      row.textContent=compactResearchText(note, 110);
      list.appendChild(row);
    });
    panel.appendChild(list);
    wrap.appendChild(panel);
  }

  container.appendChild(wrap);
}

function appendRichResearchResult(container, session){
  if(!container || !session?.result) return;
  const result = session.result;
  const wrap=document.createElement('section');
  wrap.className='research-card';

  const statPills = buildResearchStatPills(result.stats);
  const findings = Array.isArray(result.findings) ? result.findings.filter(Boolean).slice(0, 3) : [];
  const metrics = pickPrimaryResearchMetrics(result.metrics);
  const tables = Array.isArray(result.tables) ? result.tables.filter(table => Array.isArray(table?.rows) && table.rows.length) : [];
  const sources = Array.isArray(result.sources) ? result.sources : [];
  const notes = Array.isArray(result.uncertainties) ? result.uncertainties.filter(Boolean).slice(0, 2) : [];

  const top=document.createElement('div');
  top.className='research-card-top';
  top.innerHTML=`<div class="research-card-title-wrap"><div class="research-card-kicker">Research snapshot</div><div class="research-card-title">${findings.length ? 'Key takeaways at a glance' : 'Structured answer overview'}</div></div><div class="research-card-state ${notes.length ? 'is-warning' : 'is-ready'}">${notes.length ? 'Review caveats' : 'Ready'}</div>`;
  wrap.appendChild(top);

  if(statPills.length){
    const pills=document.createElement('div');
    pills.className='research-pills';
    statPills.forEach(label=>{
      const pill=document.createElement('span');
      pill.className='research-pill';
      pill.textContent=label;
      pills.appendChild(pill);
    });
    wrap.appendChild(pills);
  }

  if(findings.length){
    const panel=document.createElement('div');
    panel.className='research-panel';
    panel.innerHTML='<div class="research-panel-title">Key takeaways</div>';
    const list=document.createElement('div');
    list.className='research-highlight-list';
    findings.forEach(item=>{
      const row=document.createElement('div');
      row.className='research-highlight';
      row.textContent=compactResearchText(item, 140);
      list.appendChild(row);
    });
    panel.appendChild(list);
    wrap.appendChild(panel);
  }

  if(tables.length){
    const primaryTable = tables[0];
    const panel=document.createElement('div');
    panel.className='research-panel';
    panel.innerHTML=`<div class="research-panel-title">${esc(primaryTable.title || 'Table')}</div>`;
    const tableWrap=document.createElement('div');
    tableWrap.className='research-table-wrap';
    const tableEl=document.createElement('table');
    tableEl.className='research-table';
    const head=document.createElement('thead');
    const headRow=document.createElement('tr');
    (primaryTable.columns || []).forEach(column=>{
      const th=document.createElement('th');
      th.textContent=column;
      headRow.appendChild(th);
    });
    head.appendChild(headRow);
    tableEl.appendChild(head);

    const body=document.createElement('tbody');
    (primaryTable.rows || []).slice(0,6).forEach(row=>{
      const tr=document.createElement('tr');
      row.forEach(cell=>{
        const td=document.createElement('td');
        td.textContent=compactResearchText(cell, 64);
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    tableEl.appendChild(body);
    tableWrap.appendChild(tableEl);
    panel.appendChild(tableWrap);
    wrap.appendChild(panel);
  }

  if(metrics.length){
    const panel=document.createElement('div');
    panel.className='research-panel';
    panel.innerHTML='<div class="research-panel-title">Key numbers</div>';
    const metricGrid=document.createElement('div');
    metricGrid.className='research-metric-grid';
    metrics.forEach(metric=>{
      const card=document.createElement('div');
      card.className='research-metric';
      const metricLabel = [metric.entity || '', formatResearchMetricName(metric.name || '')].filter(Boolean).join(' • ');
      const metricValue = String(metric.value || '').trim();
      const metricUnit = String(metric.unit || '').trim();
      const metricDisplay = metricUnit && !metricValue.includes(metricUnit)
        ? `${metricValue} ${metricUnit}`
        : metricValue;
      card.innerHTML=`<div class="research-metric-label">${esc(metricLabel || 'Metric')}</div><div class="research-metric-value">${esc(metricDisplay || '-')}</div>`;
      metricGrid.appendChild(card);
    });
    panel.appendChild(metricGrid);
    wrap.appendChild(panel);
  }

  if(sources.length){
    const panel=document.createElement('div');
    panel.className='research-panel';
    panel.innerHTML='<div class="research-panel-title">Sources</div>';
    const list=document.createElement('div');
    list.className='research-source-list';
    sources.slice(0,3).forEach(source=>{
      const item=document.createElement('a');
      item.className='research-source';
      item.href=source.url||'#';
      item.target='_blank';
      item.rel='noreferrer';
      item.innerHTML=`<div class="research-source-top"><strong>${esc(compactResearchText(source.title||source.url||'Source', 68))}</strong><span>${esc(source.domain||'')}</span></div><div class="research-source-snippet">${esc(compactResearchText(source.snippet||source.excerpt||'', 110))}</div>`;
      list.appendChild(item);
    });
    panel.appendChild(list);
    wrap.appendChild(panel);
  }

  if(notes.length){
    const panel=document.createElement('div');
    panel.className='research-panel';
    panel.innerHTML='<div class="research-panel-title">What to verify</div>';
    const list=document.createElement('div');
    list.className='research-note-list';
    notes.forEach(note=>{
      const row=document.createElement('div');
      row.className='research-note';
      row.textContent=compactResearchText(note, 110);
      list.appendChild(row);
    });
    panel.appendChild(list);
    wrap.appendChild(panel);
  }

  container.appendChild(wrap);
}

 function formatResearchProgress(event){
  const type = event?.type || '';
  const payload = event?.payload && typeof event.payload === 'object' ? event.payload : {};
  if(payload.message) return payload.message;

  switch(type){
    case 'session_started':
      return payload.query ? `Исследование запущено: ${payload.query}` : 'Исследование запущено.';
    case 'plan_ready': {
      const facets = normalizeResearchTags(payload.facets);
      return facets.length ? `План готов: ${facets.join(' | ')}` : 'План готов.';
    }
    case 'sources_discovered':
      return `Собрано источников: ${payload.total ?? payload.count ?? 0}`;
    case 'sources_selected':
      return `Отобрано источников: ${payload.count ?? 0}`;
    case 'evidence_extracted':
      return `Извлечено фактов: ${payload.count ?? 0}`;
    case 'coverage_updated': {
      const coverage = Array.isArray(payload.coverage) ? payload.coverage : [];
      const ready = coverage.filter(item => item?.complete).length;
      return coverage.length ? `Покрытие: ${ready}/${coverage.length} аспектов закрыто` : 'Покрытие обновлено.';
    }
    case 'iteration_completed': {
      const missing = Array.isArray(payload.missing_facet_ids) ? payload.missing_facet_ids.length : 0;
      return `Итерация ${payload.iteration ?? '?'} завершена${missing ? `, незакрытых аспектов: ${missing}` : ''}`;
    }
    case 'answer_ready':
      return 'Пишу финальный ответ...';
    case 'completed':
      return 'Исследование завершено.';
    case 'failed':
      return payload.error?.message || 'Исследование завершилось ошибкой.';
    case 'cancelled':
      return payload.message || 'Исследование отменено.';
    default:
      return '';
  }
}

function renderResearchProgressState(container, lines){
  if(!container) return;
  container.innerHTML = lines.map((line, index)=>{
    const color = index === lines.length - 1 ? 'var(--tx)' : 'var(--muted)';
    return `<div style="display:flex;gap:8px;align-items:flex-start;color:${color}"><span style="color:var(--red)">-</span><span>${esc(line)}</span></div>`;
  }).join('');
}

async function waitForResearchTerminalSession(sessionId){
  let last = null;
  for(let attempt = 0; attempt < 20; attempt += 1){
    last = await apiGetResearchSession(sessionId);
    if(['completed','failed','cancelled'].includes(last?.status)) return last;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return last;
}

function isConversationVisible(convId){
  return currentConvId === convId && document.getElementById('panel-chat')?.classList.contains('act');
}

function scrollConversationIfVisible(convId, anchorEl){
  if(!anchorEl?.isConnected) return;
  if(isConversationVisible(convId)) scrollBot();
}

function pushAssistantIfActive(convId, contentOrMessage){
  const message = typeof contentOrMessage === 'string'
    ? { role:'assistant', content: contentOrMessage }
    : { role:'assistant', ...(contentOrMessage || {}) };
  appendConversationMessage(convId, message);
}

function restoreDetachedConversation(convId, anchorEl){
  if(!anchorEl || anchorEl.isConnected) return;
  if(!isConversationVisible(convId)) return;
  if(typeof renderConversationFromState === 'function'){
    renderConversationFromState(convId);
    return;
  }
  if(typeof openConversation !== 'function') return;
  openConversation(convId).catch(()=>{});
}

async function doResearchV2(query, ci, options, requestContext){
  const hasAttachments = Boolean(options?.hasAttachments);
  const context = buildConversationRequestContext(requestContext?.convId || currentConvId, requestContext);
  const requestConvId = context.convId;
  const requestUserId = context.userId;
  const historyEnabled = isHistoryEnabled();
  const aiEl=appendMsg('ai','',false,'research-v2');
  const bbl=aiEl.querySelector('.msg-bbl');
  const progress=[];
  let sessionId=null;
  let full='';
  let requestProcess=null;

  const pushProgress=line=>{
    if(!line) return;
    if(progress[progress.length-1]===line) return;
    progress.push(line);
    if(typeof patchConversationRequest === 'function'){
      patchConversationRequest(requestConvId, { status: line }, requestProcess?.id);
    }
    setConversationPendingMessage(requestConvId, {
      role:'assistant',
      kind:'progress',
      lines:[...progress],
      status:line,
      usedModel:'research-v2',
      isMarkdown:false,
    }, requestProcess?.id);
    renderResearchProgressState(bbl, progress);
    scrollConversationIfVisible(requestConvId, aiEl);
  };

  if(historyEnabled) fireSaveMessage('user', query, null, requestConvId, requestUserId);

  const requestAbortCtrl = new AbortController();
  requestProcess = startConversationRequest(requestConvId, requestAbortCtrl, {
    kind: 'research',
    status: 'starting',
    modelId: 'research-v2',
    agentId: context.agentId || 'deepresearch',
  });
  try {
    if(hasAttachments){
      pushProgress('Вложения пока не поддерживаются в этом режиме исследования. Запускаю веб-исследование только по текстовому запросу.');
    }

    const conversationContext = buildResearchConversationContext(requestConvId, query);
    const memoryContext = combineResearchMemoryContexts(
      typeof buildMemoryBlock === 'function' ? buildMemoryBlock() : null,
      buildResearchConversationMemoryBlock(requestConvId, query),
    );

    pushProgress('Запускаю сессию исследования...');
    const session = await apiCreateResearchSession({
      query,
      user_id: requestUserId || 'anonymous',
      conversation_id: requestConvId || null,
      conversation_context: conversationContext,
      memory_context: memoryContext,
      output_mode: 'report',
    });
    sessionId = session.session_id;
    pushProgress('Начинаю исследование...');

    for await (const event of streamResearchSession(sessionId, requestAbortCtrl.signal)) {
      const line = formatResearchProgress(event);
      if(line) pushProgress(line);
      if(event?.type === 'failed'){
        throw new Error(event?.payload?.error?.message || 'Сессия исследования завершилась ошибкой');
      }
      if(event?.type === 'cancelled'){
        throw new DOMException(event?.payload?.message || 'Сессия исследования отменена', 'AbortError');
      }
    }

    const finalSession = await waitForResearchTerminalSession(sessionId);
    if(!finalSession || !['completed','failed','cancelled'].includes(finalSession.status)){
      throw new Error('Сессия исследования ещё выполняется. Попробуйте снова через пару секунд.');
    }
    if(finalSession?.status === 'failed'){
      throw new Error(finalSession?.error?.message || 'Сессия исследования завершилась ошибкой');
    }
    if(finalSession?.status === 'cancelled'){
      throw new DOMException('Сессия исследования отменена', 'AbortError');
    }

    full = finalSession?.result?.answer || 'Исследование завершено, но финальный ответ не был сформирован.';
    bbl.innerHTML=renderMd(full);
    appendRichResearchResult(bbl, finalSession);
    aiEl.querySelector('.copyBtn').onclick=()=>{ navigator.clipboard.writeText(full).then(()=>toast('Скопировано','ok',1500)); };

    const storedResearch = buildStoredResearchResult(finalSession?.result);
    const assistantMessage = {
      role:'assistant',
      content: full,
      model_used: 'research-v2',
      research: storedResearch,
      research_query: query,
      sources: storedResearch?.sources || [],
      stats: storedResearch?.stats || null,
      notes: storedResearch?.uncertainties || [],
    };

    clearConversationPendingMessage(requestConvId, requestProcess?.id);
    pushAssistantIfActive(requestConvId, assistantMessage);
    const savePromise = historyEnabled
      ? fireSaveConversationMessage(assistantMessage, requestConvId, requestUserId)
      : Promise.resolve(null);
    queueMemorySync(query, full, requestConvId, requestUserId);
    await savePromise;
    setTimeout(()=>{
      loadHistory();
      restoreDetachedConversation(requestConvId, aiEl);
    },800);
  } catch(e){
    if(e.name === 'AbortError'){
      if(sessionId){
        try { await apiCancelResearchSession(sessionId); } catch {}
      }
      clearConversationPendingMessage(requestConvId, requestProcess?.id);
      bbl.innerHTML='<span style="color:var(--muted)">Сессия исследования остановлена.</span>';
      toast('Исследование остановлено','inf',2200);
    } else {
      clearConversationPendingMessage(requestConvId, requestProcess?.id);
      bbl.innerHTML=`<span style="color:var(--red)">&#9888; ${esc(e.message || 'Ошибка исследования')}</span>`;
      toast('Ошибка исследования: ' + (e.message || 'неизвестная ошибка'),'err',4000);
    }
  } finally {
    clearConversationPendingMessage(requestConvId, requestProcess?.id);
    finishConversationRequest(requestConvId, requestAbortCtrl, requestProcess?.id);
  }
}

async function doSendLegacy(src){ return doSend(src); }
/*
  if(isStreaming) return;
  const ta=src==='hero'?document.getElementById('inpHero'):document.getElementById('inpBot');
  const chipsId=src==='hero'?'fChipsHero':'fChipsBot';
  const chips=document.getElementById(chipsId);
  let txt=ta.value.trim();
  const voiceId=src==='hero'?'H':'B';
  const voiceChip=chips?.querySelector('.v-chip');

  if(voiceChip&&vBlob[voiceId]){
    const textContext=txt||'';
    await sendVoiceMsg(voiceId,chips,textContext);
    ta.value=''; ta.style.height='auto';
    return;
  }

  const pendingFileChips = chips?[...chips.querySelectorAll('.f-chip:not(.v-chip)')]:[];
  if(!txt && !pendingFileChips.length) return;

  const panel=document.getElementById('panel-chat');
  const ci=document.getElementById('chatInner');
  if(!panel.classList.contains('has-messages')){
    panel.classList.add('has-messages');
    document.getElementById('inpZoneBottom').style.display='block';
    if(!currentConvId) {
      setActiveConversation(uuid());
      replaceConversationMessages(currentConvId, []);
      if(typeof setConversationModel === 'function') setConversationModel(currentConvId, selectedModel);
    }
    setTimeout(()=>document.getElementById('inpBot').focus(),50);
  }

  const attachments=[];
  let injectedDocText='';
  for(const ch of pendingFileChips){
    const att={name:ch.dataset.name, mime:ch.dataset.mime||'application/octet-stream'};
    if(ch.dataset.b64) att.data=ch.dataset.b64;
    if(ch.dataset.textContent) injectedDocText+=`\n\n[Содержимое файла ${esc(ch.dataset.name)}]:\n${ch.dataset.textContent}`;
    attachments.push(att);
  }

  if(!txt && attachments.length){
    const hasDoc = attachments.some(a=>/\.(pdf|docx|txt)$/i.test(a.name||''));
    const hasImg = attachments.some(a=>a.data || /\.(png|jpg|jpeg|gif|webp)$/i.test(a.name||''));
    if(hasDoc)      txt='Проанализируй этот документ';
    else if(hasImg) txt='Опиши это изображение';
    else            txt='Проанализируй прикреплённый файл';
  }
  if(!txt) return;

  const hasImageAtt = attachments.some(a=>a.data||(a.mime||'').startsWith('image/'));

  ta.value=''; ta.style.height='auto';
  if(chips) chips.innerHTML='';
  document.getElementById(src==='hero'?'fChipsBot':'fChipsHero').innerHTML='';

  currentMessages.push({role:'user',content:txt});
  const requestConvId = currentConvId;
  const requestUserId = currentUserId;
  const requestSelectedModel = getConversationRequestModel(requestConvId);
  const requestAgentId = getConversationAgentIdStrict(requestConvId);
  const requestMessages = buildConversationRequestMessages(requestConvId);
  const userEl=appendMsg('user',txt,false,null);
  if(pendingFileChips.length){
    const fileList=document.createElement('div');
    fileList.style.cssText='margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-end';
    pendingFileChips.forEach(ch=>{
      const span=document.createElement('span');
      span.style.cssText='font-size:11px;background:var(--s2);border:1px solid var(--border);border-radius:6px;padding:2px 7px;color:var(--muted);display:inline-flex;align-items:center;gap:4px';
      span.innerHTML=`<svg width="9" height="9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>${esc(ch.dataset.name||'файл')}`;
      fileList.appendChild(span);
    });
    userEl.querySelector('.msg-bbl').appendChild(fileList);
  }

  const typing=document.createElement('div');
  typing.className='msg'; typing.id='typing';
  const tBadge=getConversationRequestModelLabel(requestConvId);
  typing.innerHTML=`<div class="msg-av ai">AI</div><div class="msg-body"><div class="msg-meta"><span class="msg-sender">${esc(tBadge)}</span></div><div class="msg-bbl" style="color:var(--muted)"><span style="display:inline-block;animation:vwa 1s ease-in-out 0s infinite">●</span><span style="display:inline-block;animation:vwa 1s ease-in-out .18s infinite"> ●</span><span style="display:inline-block;animation:vwa 1s ease-in-out .36s infinite"> ●</span></div></div>`;
  ci.appendChild(typing); scrollBot();

  if(requestAgentId==='deepresearch'){ typing.remove(); await doResearchV2(txt, ci, { hasAttachments: attachments.length > 0 }, { convId: requestConvId, userId: requestUserId }); return; }
  if(requestAgentId==='websearch'){    typing.remove(); await doWebSearch(txt,ci,{ convId: requestConvId, userId: requestUserId });    return; }

  if(hasImageAtt && (!requestAgentId || requestAgentId==='vision')){
    typing.remove();
    await doVlmAnalyze(txt, attachments, ci, { convId: requestConvId, userId: requestUserId });
    return;
  }

  if(isHistoryEnabled()) fireSaveMessage('user', txt, null, requestConvId, requestUserId);

  isStreaming=true; setSendStop(true);
  abortCtrl=new AbortController();
  try {
    await waitForMemorySync();
    const messages = requestMessages.map(message=>({ ...message }));
    if(injectedDocText){
      const last=messages[messages.length-1];
      if(last && last.role==='user') messages[messages.length-1]={...last, content: last.content+injectedDocText};
    }
    const body={
      model: requestSelectedModel,
      messages,
      stream: true,
      temperature: getTemperature(),
      user: requestUserId||'anonymous',
      conversation_id: requestConvId,
      use_memory: true,
    };
    if(attachments.length) body.attachments=attachments;

    const resp=await fetch(`${API}/chat/completions`,{
      method:'POST', headers:{'Content-Type':'application/json', ...authHeaders()}, body:JSON.stringify(body),
      signal: abortCtrl.signal,
    });
    if(!resp.ok){
      const err=await resp.json().catch(()=>({}));
      throw new Error(err?.error?.message||`HTTP ${resp.status}`);
    }

    if(typing.isConnected) typing.remove();

    const ct = resp.headers.get('content-type')||'';
    let full=''; let usedModelId=null;

    if(ct.includes('application/json')){
      const data = await resp.json();
      if(data.data && data.data[0]){
        const imgItem = data.data[0];
        const imgSrc = imgItem.url || (imgItem.b64_json ? `data:image/png;base64,${imgItem.b64_json}` : null);
        if(imgSrc){
          const imgEl=document.createElement('div'); imgEl.className='msg';
          imgEl.innerHTML=`<div class="msg-av ai">AI</div><div class="msg-body"><div class="msg-meta"><span class="msg-sender">Генерация изображений</span></div><div class="msg-bbl"><img src="${imgSrc}" alt="${esc(txt)}" style="max-width:100%;border-radius:10px;margin-top:6px;display:block" onerror="this.parentElement.innerHTML='<span style=color:var(--muted)>⚠ Не удалось загрузить изображение</span>'"><br><small style="color:var(--muted)">${esc(imgItem.revised_prompt||txt)}</small></div></div>`;
          ci.appendChild(imgEl); scrollBot();
          full=`[Изображение: ${imgItem.revised_prompt||txt}]`;
        }
      } else {
        usedModelId = data.model||null;
        full = data.choices?.[0]?.message?.content
            || data.answer
            || data.description
            || data.error
            || 'Ответ получен';
        const aiEl=appendMsg('ai',full,true,usedModelId);
        appendResearchMeta(aiEl.querySelector('.msg-bbl'), data.sources, data.sub_queries, data.stats);
        aiEl.querySelector('.copyBtn').onclick=()=>{ navigator.clipboard.writeText(full).then(()=>toast('Скопировано','ok',1500)); };
      }
    } else {
      const aiEl=appendMsg('ai','',false,null);
      const bbl=aiEl.querySelector('.msg-bbl');
      let buf='';
      const reader=resp.body.getReader();
      const dec=new TextDecoder();
      while(true){
        const {done,value}=await reader.read();
        if(done) break;
        buf+=dec.decode(value,{stream:true});
        const lines=buf.split('\n'); buf=lines.pop()||'';
        for(const line of lines){
          if(!line.startsWith('data:')) continue;
          const data=line.slice(5).trim();
          if(data==='[DONE]') continue;
          try {
            const json=JSON.parse(data);
            if(json.model && json.model!=='auto' && !usedModelId){
              usedModelId=json.model; updateMsgModel(aiEl,usedModelId);
            }
            const delta=json.choices?.[0]?.delta?.content||'';
            if(delta){ full+=delta; bbl.innerHTML=renderMd(full); scrollBot(); }
          } catch {}
        }
      }
      if(!usedModelId && requestSelectedModel!=='auto') updateMsgModel(aiEl, requestSelectedModel);
      aiEl.querySelector('.copyBtn').onclick=()=>{ navigator.clipboard.writeText(full).then(()=>toast('Скопировано','ok',1500)); };
    }

    if(full){
      currentMessages.push({role:'assistant',content:full});
      if(isHistoryEnabled()) fireSaveMessage('assistant', full, usedModelId || (requestSelectedModel !== 'auto' ? requestSelectedModel : null));
      queueMemorySync(txt, full);
      setTimeout(()=>loadHistory(),800);
    }
  } catch(e){
    if(typing.isConnected) typing.remove();
    if(e.name === 'AbortError') return;
    if(e.name!=='AbortError'){
      appendMsg('ai','⚠ Ошибка соединения: '+e.message,false,null);
      toast('Ошибка API: '+e.message,'err',4000);
    }
  } finally { isStreaming=false; abortCtrl=null; setSendStop(false); }
}

*/
async function doSend(src){
  if(isConversationStreaming(currentConvId)) return;
  const ta=src==='hero'?document.getElementById('inpHero'):document.getElementById('inpBot');
  const chipsId=src==='hero'?'fChipsHero':'fChipsBot';
  const chips=document.getElementById(chipsId);
  let txt=ta.value.trim();
  const voiceId=src==='hero'?'H':'B';
  const voiceChip=chips?.querySelector('.v-chip');

  if(voiceChip&&vBlob[voiceId]){
    const textContext=txt||'';
    await sendVoiceMsg(voiceId,chips,textContext);
    ta.value=''; ta.style.height='auto';
    return;
  }

  const pendingFileChips = chips?[...chips.querySelectorAll('.f-chip:not(.v-chip)')]:[];
  if(!txt && !pendingFileChips.length) return;

  const panel=document.getElementById('panel-chat');
  const ci=document.getElementById('chatInner');
  if(!panel.classList.contains('has-messages')){
    panel.classList.add('has-messages');
    document.getElementById('inpZoneBottom').style.display='block';
    if(!currentConvId) {
      if(typeof createConversationSession === 'function') createConversationSession({
        modelId: selectedModel,
        agentId: currentAgent?.id || null,
      });
      else {
        setActiveConversation(uuid());
        replaceConversationMessages(currentConvId, []);
        if(typeof setConversationModel === 'function') setConversationModel(currentConvId, selectedModel);
      }
    }
    setTimeout(()=>document.getElementById('inpBot').focus(),50);
  }

  const attachments=[];
  let injectedDocText='';
  for(const ch of pendingFileChips){
    const att={name:ch.dataset.name, mime:ch.dataset.mime||'application/octet-stream'};
    if(ch.dataset.b64) att.data=ch.dataset.b64;
    if(ch.dataset.textContent) injectedDocText+=`\n\n[Содержимое файла ${esc(ch.dataset.name)}]:\n${ch.dataset.textContent}`;
    attachments.push(att);
  }

  if(!txt && attachments.length){
    const hasDoc = attachments.some(a=>/\.(pdf|docx|txt)$/i.test(a.name||''));
    const hasImg = attachments.some(a=>a.data || /\.(png|jpg|jpeg|gif|webp)$/i.test(a.name||''));
    if(hasDoc) txt='Проанализируй этот документ';
    else if(hasImg) txt='Опиши это изображение';
    else txt='Проанализируй прикреплённый файл';
  }
  if(!txt) return;

  const hasImageAtt = attachments.some(a=>a.data||(a.mime||'').startsWith('image/'));

  ta.value=''; ta.style.height='auto';
  if(chips) chips.innerHTML='';
  document.getElementById(src==='hero'?'fChipsBot':'fChipsHero').innerHTML='';

  const messageAttachments = pendingFileChips.map(ch => ({
    name: ch.dataset.name || 'Файл',
    mime: ch.dataset.mime || 'application/octet-stream',
    isImage: ch.dataset.isImage === '1',
  }));
  const requestConvId = currentConvId;
  const context = buildConversationRequestContext(requestConvId);
  const requestUserId = context.userId;
  const requestSelectedModel = context.modelId;
  const requestAgentId = context.agentId;
  appendConversationMessage(requestConvId, {
    role:'user',
    content:txt,
    attachments: messageAttachments,
  });
  const requestMessages = buildConversationRequestMessages(requestConvId);
  const historyEnabled = isHistoryEnabled();

  const userEl=appendMsg('user',txt,false,null);
  appendUserAttachmentsToMessage(userEl, messageAttachments);

  const typing=document.createElement('div');
  typing.className='msg';
  typing.innerHTML=`<div class="msg-av ai">AI</div><div class="msg-body"><div class="msg-meta"><span class="msg-sender">${esc(context.modelLabel)}</span></div><div class="msg-bbl" style="color:var(--muted)"><span style="display:inline-block;animation:vwa 1s ease-in-out 0s infinite">...</span></div></div>`;
  ci.appendChild(typing);
  scrollConversationIfVisible(requestConvId, typing);
  setConversationPendingMessage(requestConvId, {
    role:'assistant',
    kind:'text',
    content:'',
    status:'Generating response...',
    usedModel:requestSelectedModel === 'auto' ? 'auto' : requestSelectedModel,
    isMarkdown:true,
  });

  if(requestAgentId==='deepresearch'){ typing.remove(); await doResearchV2(txt, ci, { hasAttachments: attachments.length > 0 }, { convId: requestConvId, userId: requestUserId }); return; }
  if(requestAgentId==='websearch'){ typing.remove(); await doWebSearch(txt,ci,{ convId: requestConvId, userId: requestUserId }); return; }
  if(hasImageAtt && (!requestAgentId || requestAgentId==='vision')){
    typing.remove();
    await doVlmAnalyze(txt, attachments, ci, { convId: requestConvId, userId: requestUserId });
    return;
  }

  if(historyEnabled) fireSaveMessage('user', txt, null, requestConvId, requestUserId);

  const requestAbortCtrl = new AbortController();
  const requestProcess = startConversationRequest(requestConvId, requestAbortCtrl, {
    kind: 'chat',
    status: 'streaming',
    modelId: requestSelectedModel,
    agentId: requestAgentId,
  });
  patchConversationPendingMessage(requestConvId, {}, requestProcess?.id);
  let full='';

  try {
    await waitForMemorySync(requestConvId, requestUserId);
    const messages = requestMessages.map(message=>({ ...message }));
    if(injectedDocText){
      const last=messages[messages.length-1];
      if(last && last.role==='user') messages[messages.length-1]={...last, content: last.content+injectedDocText};
    }

    const body={
      model: requestSelectedModel,
      messages,
      stream: true,
      temperature: getTemperature(),
      user: requestUserId||'anonymous',
      conversation_id: requestConvId,
      use_memory: true,
    };
    if(attachments.length) body.attachments=attachments;

    const resp=await fetch(`${API}/chat/completions`,{
      method:'POST',
      headers:{'Content-Type':'application/json', ...authHeaders()},
      body:JSON.stringify(body),
      signal: requestAbortCtrl.signal,
    });
    if(!resp.ok){
      const err=await resp.json().catch(()=>({}));
      throw new Error(err?.error?.message||`HTTP ${resp.status}`);
    }

    const modelBadge=context.modelLabel;
    typing.innerHTML=`<div class="msg-av ai">AI</div><div class="msg-body"><div class="msg-actions"><button class="msg-act copyBtn" title="Скопировать"><svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button><button class="msg-act likeBtn" title="Полезно"><svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg></button></div><div class="msg-meta"><span class="msg-sender msg-model-name">${esc(modelBadge)}</span><span class="msg-badge msg-model-badge">${esc(modelBadge)}</span></div><div class="msg-bbl" style="line-height:1.7"></div></div>`;
    const aiEl=typing;
    const bbl=aiEl.querySelector('.msg-bbl');
    aiEl.querySelector('.likeBtn').onclick=()=>{ aiEl.querySelector('.likeBtn').style.color='#22C55E'; toast('Отмечено как полезное','ok',1800); };

    const ct = resp.headers.get('content-type')||'';
    let usedModelId=null;
    let assistantMessage=null;

    if(ct.includes('application/json')){
      const data = await resp.json();
      if(data.data && data.data[0]){
        const imgItem = data.data[0];
        const imgSrc = imgItem.url || (imgItem.b64_json ? `data:image/png;base64,${imgItem.b64_json}` : null);
        if(imgSrc){
          const imageCaption = imgItem.revised_prompt || txt;
          renderConversationImageBubble(bbl, {
            src: imgSrc,
            caption: imageCaption,
            prompt: txt,
            downloadName: txt,
          }, 'Изображение недоступно');
          scrollConversationIfVisible(requestConvId, aiEl);
          full=`[Изображение: ${imageCaption}]`;
          assistantMessage = {
            content: full,
            kind: 'image',
            model_used: usedModelId || (requestSelectedModel !== 'auto' ? requestSelectedModel : 'meta/llama-3.3-70b-instruct'),
            image: {
              src: imgSrc,
              caption: imageCaption,
              prompt: txt,
              downloadName: txt,
            },
            isMarkdown: false,
          };
        }
      } else {
        usedModelId = data.model||null;
        if(usedModelId && typeof patchConversationRequest === 'function'){
          patchConversationRequest(requestConvId, { modelId: usedModelId }, requestProcess?.id);
        }
        if(usedModelId) updateMsgModel(aiEl, usedModelId);
        if(usedModelId) patchConversationPendingMessage(requestConvId, { usedModel: usedModelId }, requestProcess?.id);
        full = data.choices?.[0]?.message?.content
            || data.answer
            || data.description
            || data.error
            || 'Ответ получен';
        patchConversationPendingMessage(requestConvId, { content: full }, requestProcess?.id);
        bbl.innerHTML=renderMd(full);
        appendResearchMeta(bbl, data.sources, data.sub_queries, data.stats);
        assistantMessage = {
          content: full,
          model_used: usedModelId || null,
          sources: data.sources || [],
          sub_queries: data.sub_queries || [],
          stats: data.stats || null,
        };
      }
    } else {
      let buf='';
      const reader=resp.body.getReader();
      const dec=new TextDecoder();
      while(true){
        const {done,value}=await reader.read();
        if(done) break;
        buf+=dec.decode(value,{stream:true});
        const lines=buf.split('\n'); buf=lines.pop()||'';
        for(const line of lines){
          if(!line.startsWith('data:')) continue;
          const data=line.slice(5).trim();
          if(data==='[DONE]') continue;
          try {
            const json=JSON.parse(data);
            if(json.model && json.model!=='auto' && !usedModelId){
              usedModelId=json.model;
              if(typeof patchConversationRequest === 'function'){
                patchConversationRequest(requestConvId, { modelId: usedModelId }, requestProcess?.id);
              }
              updateMsgModel(aiEl,usedModelId);
              patchConversationPendingMessage(requestConvId, { usedModel: usedModelId }, requestProcess?.id);
            }
            const delta=json.choices?.[0]?.delta?.content||'';
            if(delta){
              full+=delta;
              patchConversationPendingMessage(requestConvId, { content: full }, requestProcess?.id);
              bbl.innerHTML=renderMd(full);
              scrollConversationIfVisible(requestConvId, aiEl);
            }
          } catch {}
        }
      }
      if(!usedModelId && requestSelectedModel!=='auto') updateMsgModel(aiEl, requestSelectedModel);
    }

    if(full && !assistantMessage){
      assistantMessage = {
        content: full,
        model_used: usedModelId || (requestSelectedModel !== 'auto' ? requestSelectedModel : null),
      };
    }

    aiEl.querySelector('.copyBtn').onclick=()=>{ navigator.clipboard.writeText(full).then(()=>toast('Скопировано','ok',1500)); };

    if(full){
      clearConversationPendingMessage(requestConvId, requestProcess?.id);
      pushAssistantIfActive(requestConvId, assistantMessage || full);
      const persistedModel = assistantMessage?.model_used || usedModelId || (requestSelectedModel !== 'auto' ? requestSelectedModel : null);
      const savePromise = historyEnabled
        ? fireSaveMessage('assistant', full, persistedModel, requestConvId, requestUserId)
        : Promise.resolve(null);
      queueMemorySync(txt, full, requestConvId, requestUserId);
      await savePromise;
      setTimeout(()=>{
        loadHistory();
        restoreDetachedConversation(requestConvId, aiEl);
      },800);
    } else if(aiEl.isConnected){
      clearConversationPendingMessage(requestConvId, requestProcess?.id);
      aiEl.remove();
    }
  } catch(e){
    if(e.name!=='AbortError'){
      clearConversationPendingMessage(requestConvId, requestProcess?.id);
      if(typing.isConnected){
        typing.innerHTML=`<div class="msg-av ai">AI</div><div class="msg-body"><div class="msg-meta"><span class="msg-sender">AI</span></div><div class="msg-bbl" style="color:var(--red)">Ошибка соединения: ${esc(e.message)}</div></div>`;
      }
      toast('Ошибка API: '+e.message,'err',4000);
    } else if(!full && typing.isConnected){
      clearConversationPendingMessage(requestConvId, requestProcess?.id);
      typing.remove();
    }
  } finally {
    finishConversationRequest(requestConvId, requestAbortCtrl, requestProcess?.id);
  }
}

async function sendVoiceMsg(id, chips, textContext){
  const blob=vBlob[id];
  if(!blob){ toast('Нет аудиозаписи','err'); return; }
  const panel=document.getElementById('panel-chat');
  const ci=document.getElementById('chatInner');
  if(!panel.classList.contains('has-messages')){
    panel.classList.add('has-messages');
    document.getElementById('inpZoneBottom').style.display='block';
    if(!currentConvId) {
      if(typeof createConversationSession === 'function') createConversationSession({
        modelId: selectedModel,
        agentId: currentAgent?.id || null,
      });
      else {
        setActiveConversation(uuid());
        replaceConversationMessages(currentConvId, []);
        if(typeof setConversationModel === 'function') setConversationModel(currentConvId, selectedModel);
      }
    }
  }
  const requestConvId = currentConvId;
  const context = buildConversationRequestContext(requestConvId);
  const requestUserId = context.userId;
  const historyEnabled = isHistoryEnabled();
  if(chips) chips.innerHTML=''; vBlob[id]=null;

  const userLabel=textContext?`🎤 ${textContext}`:'🎤 Голосовое сообщение';
  const sendEl=appendMsg('user',userLabel,false,null);
  const typing=document.createElement('div');
  typing.className='msg'; typing.id='typing';
  typing.innerHTML=`<div class="msg-av ai">AI</div><div class="msg-body"><div class="msg-meta"><span class="msg-sender">Голос → AI</span></div><div class="msg-bbl" style="color:var(--muted)"><span style="display:inline-block;animation:vwa 1s ease-in-out 0s infinite">●</span><span style="display:inline-block;animation:vwa 1s ease-in-out .18s infinite"> ●</span><span style="display:inline-block;animation:vwa 1s ease-in-out .36s infinite"> ●</span></div></div>`;
  ci.appendChild(typing); scrollBot();
  const requestAbortCtrl = new AbortController();
  const requestProcess = startConversationRequest(requestConvId, requestAbortCtrl, {
    kind: 'voice',
    status: 'processing',
    modelId: 'voice',
    agentId: context.agentId,
  });
  setConversationPendingMessage(requestConvId, {
    role:'assistant',
    kind:'text',
    content:'',
    status:'Processing voice message...',
    usedModel:'voice',
    isMarkdown:false,
  }, requestProcess?.id);
  try {
    const fd=new FormData();
    fd.append('audio',blob,'recording.webm');
    fd.append('user_id',requestUserId||'anonymous');
    const resp=await fetch(`${API}/voice/message`,{
      method:'POST',
      body:fd,
      signal: requestAbortCtrl.signal,
    });
    if(typing.isConnected) typing.remove();
    const ct=resp.headers.get('content-type')||'';
    if(ct.includes('audio')){
      const transcript=decodeURIComponent(resp.headers.get('X-Transcript')||'');
      const answer=decodeURIComponent(resp.headers.get('X-Answer')||'');
      sendEl.querySelector('.msg-bbl').textContent=transcript||userLabel;
      appendMsg('ai',answer,false,null); scrollBot();
      const audioBlob=await resp.blob();
      const url=URL.createObjectURL(audioBlob);
      const audio=new Audio(url);
      audio.play().catch(()=>{});
      audio.onended=()=>URL.revokeObjectURL(url);
      if(transcript) appendConversationMessage(requestConvId, {role:'user',content:transcript});
      if(answer)     appendConversationMessage(requestConvId, {role:'assistant',content:answer});
      if(historyEnabled && transcript) fireSaveMessage('user', transcript, null, requestConvId, requestUserId);
      if(historyEnabled && answer) fireSaveMessage('assistant', answer, null, requestConvId, requestUserId);
      if(transcript && answer) queueMemorySync(transcript, answer, requestConvId, requestUserId);
    } else {
      const data=await resp.json();
      const transcript=data.transcript||userLabel;
      const answer=data.answer||'Голосовой ответ получен';
      sendEl.querySelector('.msg-bbl').textContent=transcript;
      appendMsg('ai',answer,false,null); scrollBot();
      toast('Озвучивание недоступно, доступен только текст','inf');
      appendConversationMessage(requestConvId, {role:'user',content:transcript});
      appendConversationMessage(requestConvId, {role:'assistant',content:answer});
      if(historyEnabled) fireSaveMessage('user', transcript, null, requestConvId, requestUserId);
      if(historyEnabled) fireSaveMessage('assistant', answer, null, requestConvId, requestUserId);
      queueMemorySync(transcript, answer, requestConvId, requestUserId);
    }
    setTimeout(()=>{
      loadHistory();
      restoreDetachedConversation(requestConvId, sendEl);
    },800);
  } catch(e){
    if(typing.isConnected) typing.remove();
    if(e.name === 'AbortError') return;
    appendMsg('ai','⚠ Ошибка голосового API: '+e.message,false,null);
    toast('Ошибка голосового API: '+e.message,'err');
  } finally {
    clearConversationPendingMessage(requestConvId, requestProcess?.id);
    finishConversationRequest(requestConvId, requestAbortCtrl, requestProcess?.id);
  }
}

async function doVlmAnalyze(txt, attachments, ci, requestContext){
  const context = buildConversationRequestContext(requestContext?.convId || currentConvId, requestContext);
  const requestConvId = context.convId;
  const requestUserId = context.userId;
  const historyEnabled = isHistoryEnabled();
  const promptText = txt || 'Describe this image';
  txt = promptText;
  const requestAbortCtrl = new AbortController();
  const requestProcess = startConversationRequest(requestConvId, requestAbortCtrl, {
    kind: 'vision',
    status: 'analyzing',
    modelId: 'nvidia/llama-3.2-90b-vision-instruct',
    agentId: context.agentId || 'vision',
  });
  setConversationPendingMessage(requestConvId, {
    role:'assistant',
    kind:'text',
    content:'',
    status:'Analyzing image...',
    usedModel:'nvidia/llama-3.2-90b-vision-instruct',
    isMarkdown:false,
  }, requestProcess?.id);
  const wrapEl=document.createElement('div'); wrapEl.className='msg';
  wrapEl.innerHTML=`<div class="msg-av ai">AI</div><div class="msg-body"><div class="msg-meta"><span class="msg-sender">Анализ изображений</span></div><div class="msg-bbl" id="vlmBbl" style="line-height:1.6"><div style="color:var(--muted)">🔍 Анализирую изображение...</div></div></div>`;
  ci.appendChild(wrapEl); scrollBot();
  const bbl=document.getElementById('vlmBbl');
  try {
    const imgAtt=attachments.find(a=>a.data||(a.mime||'').startsWith('image/'));
    if(!imgAtt){ bbl.innerHTML='<span style="color:var(--red)">⚠ Изображение не найдено</span>'; return; }
    const imageUrl=imgAtt.data
      ? `data:${imgAtt.mime||'image/jpeg'};base64,${imgAtt.data}`
      : imgAtt.url||'';
    const r=await fetch(`${API}/vlm/analyze`,{
      method:'POST', headers:{'Content-Type':'application/json',...authHeaders()},
      signal: requestAbortCtrl.signal,
      body:JSON.stringify({image_url:imageUrl, question:txt||'Опиши это изображение', model:'nvidia/llama-3.2-90b-vision-instruct'})
    });
    const d=await r.json();
    const answer=d.choices?.[0]?.message?.content || d.answer || d.description || d.error || 'Анализ завершён';
    bbl.innerHTML=renderMd(answer);
    appendConversationMessage(requestConvId, {
      role:'assistant',
      content:answer,
      model_used:'nvidia/llama-3.2-90b-vision-instruct',
    });
    if(historyEnabled) fireSaveMessage('user', txt, null, requestConvId, requestUserId);
    if(historyEnabled) fireSaveMessage('assistant', answer, 'nvidia/llama-3.2-90b-vision-instruct', requestConvId, requestUserId);
    queueMemorySync(txt, answer, requestConvId, requestUserId);
    setTimeout(()=>{
      loadHistory();
      restoreDetachedConversation(requestConvId, wrapEl);
    },600);
  } catch(e){
    if(e.name === 'AbortError'){
      if(wrapEl.isConnected) wrapEl.remove();
      return;
    }
    bbl.innerHTML=`<span style="color:var(--red)">⚠ Ошибка: ${esc(e.message)}</span>`;
    toast('Ошибка VLM','err');
  } finally {
    clearConversationPendingMessage(requestConvId, requestProcess?.id);
    finishConversationRequest(requestConvId, requestAbortCtrl, requestProcess?.id);
    scrollConversationIfVisible(requestConvId, wrapEl);
  }
}


function downloadImg(sourceOrPrompt, prompt){
  const imgSrc=typeof prompt === 'string'
    ? sourceOrPrompt
    : document.querySelector('#imgGenBbl img')?.src;
  if(!imgSrc) return;
  const a=document.createElement('a');
  a.href=imgSrc;
  a.download=((prompt||sourceOrPrompt)||'image').slice(0,40).replace(/[^a-zа-я0-9]/gi,'_')+'.png';
  a.click();
}

async function doWebSearch(query, ci, requestContext){
  const context = buildConversationRequestContext(requestContext?.convId || currentConvId, requestContext);
  const requestConvId = context.convId;
  const requestUserId = context.userId;
  const historyEnabled = isHistoryEnabled();
  const requestAbortCtrl = new AbortController();
  const requestProcess = startConversationRequest(requestConvId, requestAbortCtrl, {
    kind: 'websearch',
    status: 'searching',
    modelId: 'auto',
    agentId: context.agentId || 'websearch',
  });
  setConversationPendingMessage(requestConvId, {
    role:'assistant',
    kind:'text',
    content:'',
    status:'Ищу в интернете...',
    usedModel:'auto',
    isMarkdown:true,
  }, requestProcess?.id);
  const el=document.createElement('div'); el.className='msg';
  el.innerHTML=`<div class="msg-av ai">AI</div><div class="msg-body"><div class="msg-meta"><span class="msg-sender">Поиск</span><span class="msg-badge">Веб-поиск</span></div><div class="msg-bbl" id="searchProg" style="line-height:1.75"><div style="color:var(--muted)">🔍 Ищу в интернете...</div></div></div>`;
  ci.appendChild(el); scrollBot();
  const prog=document.getElementById('searchProg');
  try {
    const sr=await fetch(`${API}/tools/web-search`,{method:'POST',headers:{'Content-Type':'application/json', ...authHeaders()},body:JSON.stringify({query,max_results:5}),signal: requestAbortCtrl.signal});
    if(!sr.ok) throw new Error('Поиск недоступен');
    const sd=await sr.json();
    const results=sd.results||[];
    if(!results.length){ prog.innerHTML='<span style="color:var(--muted)">Результатов не найдено.</span>'; return; }

    const srcDiv=document.createElement('div');
    srcDiv.style.cssText='margin-bottom:10px;display:flex;flex-wrap:wrap;gap:5px';
    results.forEach(r=>{
      const chip=document.createElement('a');
      chip.href=r.url; chip.target='_blank';
      chip.style.cssText='font-size:10.5px;padding:2px 8px;border-radius:5px;background:var(--s3);color:var(--muted);text-decoration:none;border:1px solid var(--border);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block';
      chip.textContent=r.title||r.url;
      chip.title=r.url;
      srcDiv.appendChild(chip);
    });
    prog.innerHTML=''; prog.appendChild(srcDiv);
    const ansDiv=document.createElement('div'); prog.appendChild(ansDiv);
    patchConversationPendingMessage(requestConvId, {
      content:'',
      status:'Готовлю ответ по результатам поиска...',
      usedModel:'auto',
      isMarkdown:true,
    }, requestProcess?.id);

    const context=results.map((r,i)=>`[${i+1}] ${r.title}\n${r.snippet}\nURL: ${r.url}`).join('\n\n');
    const synthMessages=[
      {role:'system',content:'Ты — поисковый ассистент. Дай чёткий, структурированный ответ на основе найденных результатов. Цитируй источники в формате [N]. Отвечай на языке вопроса.'},
      {role:'user',content:`Вопрос: ${query}\n\nНайденные материалы:\n${context}`}
    ];
    const resp=await fetch(`${API}/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json', ...authHeaders()},body:JSON.stringify({model:'auto',messages:synthMessages,stream:true,user:requestUserId||'anonymous'}),signal: requestAbortCtrl.signal});
    if(!resp.ok) throw new Error('LLM недоступен');
    const reader=resp.body.getReader(); const dec=new TextDecoder();
    let full=''; let buf='';
    while(true){
      const {done,value}=await reader.read(); if(done) break;
      buf+=dec.decode(value,{stream:true});
      const lines=buf.split('\n'); buf=lines.pop()||'';
      for(const line of lines){
        if(!line.startsWith('data:')) continue;
        const data=line.slice(5).trim();
        if(data==='[DONE]') break;
        try {
          const json=JSON.parse(data);
          const delta=json.choices?.[0]?.delta?.content||'';
          if(delta){
            full+=delta;
            patchConversationPendingMessage(requestConvId, {
              content:full,
              status:'Готовлю ответ по результатам поиска...',
              usedModel:json.model || 'auto',
              isMarkdown:true,
            }, requestProcess?.id);
            ansDiv.innerHTML=renderMd(full);
            scrollBot();
          }
        } catch {}
      }
    }
    appendConversationMessage(requestConvId, {
      role:'assistant',
      content:full,
      sources: results.map((result, index) => ({
        title: result.title || result.url || `Источник ${index + 1}`,
        url: result.url || '#',
        excerpt: result.snippet || '',
        source_id: String(index + 1),
      })),
      sub_queries: [],
      stats: { sources_used: results.length },
    });
    if(historyEnabled) fireSaveMessage('user', query, null, requestConvId, requestUserId);
    if(historyEnabled) fireSaveMessage('assistant', full, null, requestConvId, requestUserId);
    setTimeout(()=>{
      loadHistory();
      restoreDetachedConversation(requestConvId, el);
    },800);
  } catch(e){
    if(e.name === 'AbortError'){
      if(el.isConnected) el.remove();
      return;
    }
    prog.innerHTML=`<span style="color:var(--red)">⚠ Ошибка: ${esc(e.message)}</span>`;
    toast('Поиск: ошибка','err');
  }
  finally {
    clearConversationPendingMessage(requestConvId, requestProcess?.id);
    finishConversationRequest(requestConvId, requestAbortCtrl, requestProcess?.id);
  }
}

function copyMsg(btn,text){ navigator.clipboard?.writeText(text).then(()=>{ btn.classList.add('copied'); toast('Скопировано','ok',1800); setTimeout(()=>btn.classList.remove('copied'),2000); }).catch(()=>toast('Не удалось скопировать','err')); }
function likeMsg(btn){ btn.style.color='#22C55E'; btn.querySelector('svg').style.fill='rgba(34,197,94,.2)'; toast('Отмечено как полезное','ok',1800); }
function fillQ(txt){ const ta=document.getElementById('inpHero'); ta.value=txt; autoH(ta); ta.focus(); }
function syncTA(el){ autoH(el); }

function formatResearchProgress(event){
  const type = event?.type || '';
  const payload = event?.payload && typeof event.payload === 'object' ? event.payload : {};

  if(type === 'failed'){
    return payload.error?.message || 'Исследование завершилось с ошибкой.';
  }
  if(type === 'cancelled'){
    return payload.message || 'Исследование отменено.';
  }

  switch(type){
    case 'session_started':
      return 'Уточняю задачу...';
    case 'plan_ready':
    case 'sources_discovered':
    case 'sources_selected':
      return 'Собираю и проверяю источники...';
    case 'evidence_extracted':
    case 'coverage_updated':
    case 'iteration_completed':
      return 'Сопоставляю факты и выделяю главное...';
    case 'answer_ready':
      return 'Собираю короткий ответ...';
    case 'completed':
      return 'Готовлю финальную выдачу...';
    default:
      return '';
  }
}

function renderResearchProgressState(container, lines){
  if(!container) return;
  const current = Array.isArray(lines) && lines.length
    ? lines[lines.length - 1]
    : 'Ищу и проверяю данные...';
  container.innerHTML = `<div style="display:flex;gap:8px;align-items:flex-start;color:var(--tx)"><span style="color:var(--red)">•</span><span>${esc(current)}</span></div>`;
}

