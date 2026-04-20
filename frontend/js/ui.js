// UI state helpers.

const PANELS = ['chat', 'agents'];
const PANEL_ORDER = { chat: 0, agents: 1 };
const MOBILE_SIDEBAR_BREAKPOINT = 980;

let curPanel = 'chat';
let col = false;
let openPop = null;

function isMobileViewport() {
  return window.innerWidth <= MOBILE_SIDEBAR_BREAKPOINT;
}

function updateSidebarToggleState() {
  const mobileBtn = document.getElementById('mobileMenuBtn');
  const sidebar = document.getElementById('sb');
  if (!mobileBtn || !sidebar) return;

  const expanded = isMobileViewport() ? sidebar.classList.contains('open') : !sidebar.classList.contains('col');
  mobileBtn.setAttribute('aria-expanded', String(expanded));
  mobileBtn.setAttribute('aria-label', expanded ? t('sidebar.close', 'Close menu') : t('sidebar.open', 'Open menu'));
}

function collapseSb() {
  col = true;
  document.getElementById('sb')?.classList.add('col');
  updateSidebarToggleState();
}

function expandSb() {
  col = false;
  document.getElementById('sb')?.classList.remove('col');
  updateSidebarToggleState();
}

function closeSidebar() {
  const sidebar = document.getElementById('sb');
  if (!sidebar) return;
  sidebar.classList.remove('open');
  updateSidebarToggleState();
  refreshOverlayState();
}

function syncSidebarUI() {
  const sidebar = document.getElementById('sb');
  if (!sidebar) return;

  if (isMobileViewport()) {
    sidebar.classList.remove('col');
  } else {
    sidebar.classList.remove('open');
    sidebar.classList.toggle('col', col);
  }

  updateSidebarToggleState();
  refreshOverlayState();
  if (typeof queueHistoryMarqueeRefresh === 'function') queueHistoryMarqueeRefresh(180);
}

function toggleSb() {
  const sidebar = document.getElementById('sb');
  if (!sidebar) return;

  if (isMobileViewport()) {
    sidebar.classList.toggle('open');
    updateSidebarToggleState();
    refreshOverlayState();
    return;
  }

  if (sidebar.classList.contains('col')) expandSb();
  else collapseSb();
}

function sw(name, btn) {
  if (col && !isMobileViewport()) expandSb();

  const fromIdx = PANEL_ORDER[curPanel] ?? 0;
  const toIdx = PANEL_ORDER[name] ?? 0;
  const dir = toIdx > fromIdx ? 'slide-left' : 'slide-right';

  PANELS.forEach(panelName => {
    document.getElementById('panel-' + panelName)?.classList.remove('act', 'slide-left', 'slide-right');
    document.getElementById('nav-' + panelName)?.classList.remove('act');
  });

  const target = document.getElementById('panel-' + name);
  target?.classList.add('act', dir);
  setTimeout(() => target?.classList.remove('slide-left', 'slide-right'), 280);
  (btn || document.getElementById('nav-' + name))?.classList.add('act');
  curPanel = name;

  if (typeof queueHistoryMarqueeRefresh === 'function') queueHistoryMarqueeRefresh(180);
}

function togglePop(id, e, btn) {
  e.stopPropagation();
  const pop = document.getElementById(id);
  if (!pop) return;

  if (typeof openDD !== 'undefined' && openDD) {
    document.getElementById(openDD)?.classList.remove('open');
    openDD = null;
    document.querySelectorAll('.m-pill').forEach(node => node.setAttribute('aria-expanded', 'false'));
  }

  if (openPop && openPop !== id) {
    document.getElementById(openPop)?.classList.remove('open');
    document.querySelectorAll('.sel-btn').forEach(node => node.classList.remove('open'));
  }

  const isOpen = pop.classList.toggle('open');
  btn?.classList.toggle('open', isOpen);
  openPop = isOpen ? id : null;
  refreshOverlayState();
}

function pickTemp(e, el, val, sub) {
  e.stopPropagation();
  document.getElementById('tempVal').textContent = val;
  document.getElementById('tempSub').textContent = sub;

  const pop = document.getElementById('pTemp');
  pop.querySelectorAll('.sel-opt').forEach(option => {
    option.classList.remove('on');
    option.querySelector('.sel-chk').textContent = '';
  });

  el.classList.add('on');
  el.querySelector('.sel-chk').textContent = '✓';
  pop.classList.remove('open');
  document.getElementById('tempBtn').classList.remove('open');
  openPop = null;
  refreshOverlayState();

  const temperature = parseFloat(val);
  if (!isNaN(temperature)) localStorage.setItem('mts-temperature', temperature);
}

function getTemperature() {
  const value = parseFloat(localStorage.getItem('mts-temperature'));
  return isNaN(value) ? 0.7 : value;
}

function isMemoryEnabled() {
  return true;
}

function isHistoryEnabled() {
  return document.querySelector('[data-setting="saveHistory"]')?.classList.contains('on') ?? true;
}

function isVoiceEnabled() {
  return document.querySelector('[data-setting="voiceInput"]')?.classList.contains('on') ?? true;
}

function toggleAgentMemory(btn) {
  btn.classList.add('on');
}

function toggleSaveHistory(btn) {
  btn.classList.toggle('on');
}

function toggleVoiceInput(btn) {
  btn.classList.toggle('on');
  const enabled = btn.classList.contains('on');
  document.querySelectorAll('.btn-voice').forEach(node => {
    node.style.display = enabled ? '' : 'none';
  });
}

function toggleTheme(btn) {
  btn.classList.toggle('on');
  const isDark = !btn.classList.contains('on');
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  localStorage.setItem('mts-theme', isDark ? 'dark' : 'light');
}

function toggleBgWords(btn) {
  const el = document.getElementById('bgWords');
  const off = el.classList.toggle('off');
  localStorage.setItem('bgWordsOff', off ? '1' : '0');
}

function toggleCompact(btn) {
  btn.classList.toggle('on');
  const enabled = btn.classList.contains('on');
  document.body.classList.toggle('compact', enabled);
  localStorage.setItem('mts-compact', enabled ? '1' : '0');
}

function toggleEnterSend(btn) {
  btn.classList.toggle('on');
  localStorage.setItem('mts-enter-send', btn.classList.contains('on') ? '1' : '0');
}

function handleK(e, src) {
  if (e.key === 'Enter' && !e.shiftKey) {
    const enterSend = localStorage.getItem('mts-enter-send') !== '0';
    if (enterSend) {
      e.preventDefault();
      doSend(src);
    }
  }
}
