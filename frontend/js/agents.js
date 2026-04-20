// ══ AGENTS — openAgModal(), closeAgModal(), selectAgent(), filterAgents() ══

const AGENTS = [
  {id:'assistant', name:'Ассистент', desc:'Универсальный ИИ для любых задач', model:'mistralai/mistral-small-4-119b-2603',
   detail:'Универсальный ИИ-ассистент: от ответов на вопросы до анализа и генерации контента.',
   features:[{title:'Ответы на вопросы',sub:'Мгновенные ответы по любой теме'},{title:'Анализ текста',sub:'Суммаризация, извлечение данных'},{title:'Генерация контента',sub:'Тексты, сценарии, письма'},{title:'Решение задач',sub:'Логические, творческие, технические'}],
   ic:'<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>'},
  {id:'code', name:'Код Агент', desc:'Генерация, ревью и отладка кода', model:'qwen/qwen3-coder-480b-a35b-instruct',
   detail:'Профессиональный агент для разработчиков: пишет, отлаживает и ревьюит код.',
    features:[{title:'Генерация кода',sub:'Написание кода по описанию'},{title:'Ревью кода',sub:'Анализ и улучшение кода'},{title:'Отладка',sub:'Поиск и исправление ошибок'},{title:'Документация',sub:'Автодокументирование'}],
   ic:'<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>'},
  {id:'vision', name:'Анализ картинок', desc:'Распознавание и анализ изображений', model:'meta/llama-3.2-90b-vision-instruct',
   detail:'Анализирует изображения, читает текст на фото, описывает сцены.',
   features:[{title:'Объекты',sub:'Детектирование и классификация'},{title:'OCR',sub:'Текст с фото'},{title:'Сцены',sub:'Подробный анализ'},{title:'Сравнение',sub:'Отличия и сходства'}],
   ic:'<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'},
  {id:'medicine', name:'Медицина', desc:'Медицинские вопросы, симптомы и здоровье', model:'nvidia/llama-3.3-nemotron-super-49b-v1',
   detail:'Медицинский ИИ-ассистент: помогает разобраться в симптомах, терминах и рекомендациях по здоровью.',
   features:[{title:'Симптомы',sub:'Анализ и возможные причины'},{title:'Термины',sub:'Объяснение медицинских понятий'},{title:'Препараты',sub:'Информация о лекарствах'},{title:'Профилактика',sub:'Рекомендации по здоровью'}],
   ic:'<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>'},
  {id:'finance', name:'Финансы', desc:'Финансовый анализ, инвестиции и бюджет', model:'mistralai/mixtral-8x22b-instruct-v0.1',
   detail:'Финансовый аналитик-ассистент: инвестиции, бюджетирование, рыночный анализ и финансовое планирование.',
   features:[{title:'Инвестиции',sub:'Анализ активов и рынков'},{title:'Бюджет',sub:'Планирование и оптимизация'},{title:'Отчётность',sub:'Анализ финансовых данных'},{title:'Риски',sub:'Оценка и управление'}],
   ic:'<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>'},
  {id:'creativity', name:'Творчество', desc:'Истории, стихи, сценарии и идеи', model:'meta/llama-3.3-70b-instruct',
   detail:'Творческий ИИ-ассистент: пишет рассказы, стихи, сценарии и генерирует оригинальные идеи.',
   features:[{title:'Рассказы',sub:'Художественная проза и сюжеты'},{title:'Стихи',sub:'Поэзия в разных стилях'},{title:'Сценарии',sub:'Диалоги и скрипты'},{title:'Идеи',sub:'Брейншторминг и концепции'}],
   ic:'<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M12 2a7 7 0 017 7c0 3.5-2.5 6-4 7.5V18a2 2 0 01-2 2h-2a2 2 0 01-2-2v-1.5C7.5 15 5 12.5 5 9a7 7 0 017-7z"/><line x1="9" y1="21" x2="15" y2="21"/></svg>'},
  {id:'corporate', name:'Корпоративные задачи', desc:'Бизнес-процессы и документооборот', model:'nvidia/llama-3.3-nemotron-super-49b-v1',
   detail:'Отчёты, KPI, презентации и деловая переписка.',
   features:[{title:'Документы',sub:'Отчёты, протоколы, приказы'},{title:'KPI',sub:'Метрики и дашборды'},{title:'Презентации',sub:'Структура и контент'},{title:'Переписка',sub:'Письма и предложения'}],
   ic:'<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>'},
  {id:'websearch', name:'Поиск в интернете', desc:'Актуальная информация с источниками', model:'mistralai/mistral-small-4-119b-2603',
   detail:'Ищет актуальную информацию со ссылками на источники.',
   features:[{title:'Реальное время',sub:'Актуальная информация'},{title:'Цитирование',sub:'Ссылки на источники'},{title:'Синтез',sub:'Объединение данных'},{title:'Факт-чек',sub:'Верификация'}],
   ic:'<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'},
  {id:'audio', name:'Анализ по аудио', desc:'Транскрипция и анализ аудиозаписей', model:'mistralai/mistral-small-4-119b-2603',
   detail:'Транскрибирует аудио, определяет спикеров, извлекает ключевые моменты.',
   features:[{title:'Транскрипция',sub:'Речь в текст'},{title:'Спикеры',sub:'Разделение по голосам'},{title:'Тезисы',sub:'Пересказ'},{title:'Тональность',sub:'Эмоции'}],
   ic:'<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" viewBox="0 0 24 24"><path d="M12 1a3 3 0 00-3 3v7a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M5 10a7 7 0 0014 0"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="8" y1="21" x2="16" y2="21"/></svg>'},
  {id:'docs', name:'Анализ документов', desc:'Умная работа с PDF, Word, Excel', model:'nvidia/nemoretriever-parse',
   detail:'Читает и анализирует документы, отвечает на вопросы по содержимому.',
    features:[{title:'PDF и Word',sub:'Извлечение текста'},{title:'Суммаризация',sub:'Краткое изложение'},{title:'Вопросы и ответы',sub:'Ответы по содержимому'},{title:'Сравнение',sub:'Поиск изменений'}],
   ic:'<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>'},
  {id:'deepresearch', name:'Глубокое исследование', desc:'Многошаговый веб-анализ с источниками и прогрессом', model:'research-v2',
   detail:'Запускает отдельную исследовательскую сессию: строит план, собирает источники, извлекает факты и готовит итоговый отчёт.',
   features:[{title:'Планирование',sub:'Разбивает тему на фокусные аспекты'},{title:'Источники',sub:'Собирает и фильтрует веб-данные'},{title:'Прогресс',sub:'Показывает этапы исследования в реальном времени'},{title:'Отчёт',sub:'Возвращает финальный ответ с источниками'}],
   ic:'<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M4 5h8v14H4z"/><path d="M12 5h8v14h-8"/><path d="M8 9h1"/><path d="M8 13h1"/><path d="M15 9h2"/><path d="M15 13h3"/></svg>'},
];

const CONVERSATION_AGENT_STORAGE_KEY = 'mts-conversation-agents';

function readConversationAgentState() {
  try {
    const raw = localStorage.getItem(CONVERSATION_AGENT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

let conversationAgentState = readConversationAgentState();

function writeConversationAgentState() {
  try {
    const keys = Object.keys(conversationAgentState);
    if (!keys.length) localStorage.removeItem(CONVERSATION_AGENT_STORAGE_KEY);
    else localStorage.setItem(CONVERSATION_AGENT_STORAGE_KEY, JSON.stringify(conversationAgentState));
  } catch {}
}

function getAgentById(agentId) {
  const normalized = String(agentId || '').trim();
  return normalized ? (AGENTS.find(agent => agent.id === normalized) || null) : null;
}

function syncConversationAgentUI(agent) {
  const heroIcon = document.getElementById('heroAgentIcon');
  if (!heroIcon) return;

  if (!agent) {
    heroIcon.style.display = 'none';
    heroIcon.innerHTML = '';
    return;
  }

  heroIcon.style.display = 'flex';
  heroIcon.innerHTML = agent.ic.replace('width="20" height="20"', 'width="24" height="24"');
}

function getConversationAgentId(convId) {
  const normalized = String(convId || '').trim();
  if (!normalized) return null;
  const runtime = typeof getConversationBinding === 'function'
    ? getConversationBinding(normalized)?.agentId
    : null;
  return runtime || conversationAgentState[normalized] || null;
}

function setConversationAgent(convId, agentId) {
  const normalizedConvId = String(convId || '').trim();
  if (!normalizedConvId) return null;

  const agent = getAgentById(agentId);
  if (typeof setConversationRuntimeAgent === 'function') setConversationRuntimeAgent(normalizedConvId, agent?.id || null);

  if (agent) conversationAgentState[normalizedConvId] = agent.id;
  else delete conversationAgentState[normalizedConvId];
  writeConversationAgentState();

  if (normalizedConvId === currentConvId) {
    currentAgent = agent || null;
    syncConversationAgentUI(currentAgent);
  }

  return agent;
}

function restoreConversationAgent(convId) {
  const normalizedConvId = String(convId || '').trim();
  const agent = getAgentById(getConversationAgentId(normalizedConvId));

  if (typeof setConversationRuntimeAgent === 'function') setConversationRuntimeAgent(normalizedConvId, agent?.id || null);

  if (normalizedConvId === currentConvId) {
    currentAgent = agent || null;
    syncConversationAgentUI(currentAgent);
  }

  return agent;
}

function removeConversationAgent(convId) {
  return setConversationAgent(convId, null);
}

function resetConversationAgentState() {
  conversationAgentState = {};
  writeConversationAgentState();
  currentAgent = null;
  syncConversationAgentUI(null);
}

const AGENT_SYSTEM_PROMPTS = {
  assistant:    null,
  code:         'Ты — опытный разработчик программного обеспечения. Помогай с написанием, ревью, отладкой и документированием кода. Давай чистый, рабочий код с краткими пояснениями.',
  vision:       'Ты — мультимодальный ИИ-ассистент. Детально анализируй прикреплённые изображения, описывай содержимое, распознавай текст (OCR) и отвечай на вопросы о визуальных данных.',
  medicine:     'Ты — медицинский ИИ-ассистент. Помогай с вопросами о здоровье, медицинских терминах, симптомах и лечении. Объясняй понятно и точно. Всегда рекомендуй обращаться к врачу для постановки диагноза и назначения лечения.',
  finance:      'Ты — финансовый аналитик-ассистент. Помогай с вопросами об инвестициях, бюджетировании, финансовом анализе и рынках. При инвестиционных рекомендациях обязательно упоминай риски и необходимость консультации с профессиональным советником.',
  creativity:   'Ты — творческий ИИ-ассистент. Помогай с написанием рассказов, стихов, сценариев, копирайтингом и генерацией идей. Поощряй нестандартное мышление, экспериментируй со стилями и жанрами.',
  corporate:    'Ты — профессиональный бизнес-ассистент. Помогай с деловыми документами, отчётами, KPI-анализом, презентациями и корпоративной перепиской. Используй официально-деловой стиль.',
  websearch:    'Ты — ИИ-ассистент с доступом к поиску в интернете. Используй актуальную информацию для ответов. Обязательно указывай источники в формате [ссылка]. Если информация устарела, предупреди об этом.',
  audio:        'Ты — ассистент по анализу аудиоконтента. Помогай с транскрипцией, анализом речи, определением спикеров и извлечением ключевых моментов из записей.',
  docs:         'Ты — ассистент по работе с документами. Анализируй загруженные файлы (PDF, Word, Excel), делай краткое изложение, отвечай на вопросы по содержимому и сравнивай документы. Попроси пользователя прикрепить документ, если он не приложен.',
  deepresearch: null,
};

function openAgModal(idx){
  if(openDD){
    document.getElementById(openDD)?.classList.remove('open');
    openDD=null;
    document.querySelectorAll('.m-pill').forEach(p=>p.setAttribute('aria-expanded','false'));
  }
  if(openPop){
    document.getElementById(openPop)?.classList.remove('open');
    openPop=null;
    document.querySelectorAll('.sel-btn').forEach(b=>b.classList.remove('open'));
  }
  refreshOverlayState();
  const a=AGENTS[idx];
  document.getElementById('agmIcon').innerHTML=a.ic.replace('width="20" height="20"','width="26" height="26"');
  document.getElementById('agmName').textContent=a.name;
  document.getElementById('agmModel').textContent=modelDisplayName(a.model)||a.model;
  document.getElementById('agmDesc').textContent=a.detail;
  const fl=document.getElementById('agmFeats'); fl.innerHTML='';
  a.features.forEach(f=>{
    const li=document.createElement('li');
    li.innerHTML=`<div class="agm-feat-ic"><svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div><div class="agm-feat-txt"><div class="agm-feat-title">${esc(f.title)}</div><div class="agm-feat-sub">${esc(f.sub)}</div></div>`;
    fl.appendChild(li);
  });
  document.getElementById('agmStart').onclick=()=>{ closeAgModal(); selectAgent(idx); };
  document.getElementById('agModal').classList.add('show');
  refreshOverlayState();
  toast('Подробно: '+a.name,'inf',1600);
}

function closeAgModal(e){
  if(e&&e.target!==document.getElementById('agModal')) return;
  document.getElementById('agModal').classList.remove('show');
  refreshOverlayState();
}

function selectAgent(idx){
  const a=AGENTS[idx]; closeAll();
  const overlay=document.getElementById('agTrans');
  document.getElementById('agTrans-icon').innerHTML=a.ic.replace('width="20" height="20"','width="30" height="30"');
  document.getElementById('agTrans-text').textContent=a.name;
  const mName = modelDisplayName(a.model)||a.model;
  document.getElementById('agTrans-model').textContent=a.name+' · '+mName;
  overlay.classList.remove('out'); overlay.classList.add('show');
  setTimeout(()=>{
    overlay.classList.add('out');
    setTimeout(()=>{
      overlay.classList.remove('show','out');
      const heroIcon=document.getElementById('heroAgentIcon');
      heroIcon.style.display='flex';
      heroIcon.innerHTML=a.ic.replace('width="20" height="20"','width="24" height="24"');
      const panel=document.getElementById('panel-chat');
      panel.classList.remove('has-messages');
      document.getElementById('inpZoneBottom').style.display='none';
      document.getElementById('chatInner').innerHTML='';
      const defaultModelId = a.id==='deepresearch' ? 'auto' : a.model;
      if(typeof createConversationSession === 'function') createConversationSession({
        agentId: a.id,
        modelId: defaultModelId,
      });
      else {
        setActiveConversation(uuid());
        setConversationAgent(currentConvId, a.id);
        replaceConversationMessages(currentConvId, []);
      }
      sw('chat',document.getElementById('nav-chat'));
      setTimeout(()=>document.getElementById('inpHero').focus(),80);
    },350);
  },1300);
}

function filterAgents(q){
  const lower=q.toLowerCase();
  document.querySelectorAll('#agGrid .ag-card').forEach(card=>{
    const name=card.querySelector('.ag-name')?.textContent.toLowerCase()||'';
    const desc=card.querySelector('.ag-desc')?.textContent.toLowerCase()||'';
    card.style.display=(!q||name.includes(lower)||desc.includes(lower))?'':'none';
  });
}
