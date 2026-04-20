// History sidebar, chat search, and modal flows.

let historyModalState = {
  mode: null,
  convId: null,
  title: '',
};

let historyConversations = [];
let historySearchQuery = '';
let historySearchOpen = false;
let historyMarqueeTimer = null;

function syncHistoryModalTexts() {
  const modal = document.getElementById('historyModal');
  if (!modal) return;

  const isDelete = historyModalState.mode === 'delete';
  const eyebrow = document.getElementById('historyModalEyebrow');
  const title = document.getElementById('historyModalTitle');
  const copy = document.getElementById('historyModalCopy');
  const field = document.getElementById('historyModalField');
  const label = document.querySelector('label[for="historyModalInput"]');
  const confirm = document.getElementById('historyModalConfirm');
  const cancel = document.getElementById('historyModalCancel');

  if (eyebrow) eyebrow.textContent = t('st.history', 'History');
  if (title) title.textContent = t(isDelete ? 'hist.deleteTitle' : 'hist.renameTitle');
  if (copy) copy.textContent = t(isDelete ? 'hist.deleteCopy' : 'hist.renameCopy');
  if (label) label.textContent = t('hist.fieldLabel', 'Conversation title');
  if (confirm) confirm.textContent = t(isDelete ? 'hist.deleteAction' : 'hist.renameAction');
  if (cancel) cancel.textContent = t('common.cancel', 'Cancel');
  if (field) field.style.display = isDelete ? 'none' : 'flex';
  if (confirm) confirm.classList.toggle('history-modal-btn-danger', isDelete);
  if (confirm) confirm.classList.toggle('history-modal-btn-primary', !isDelete);
}

function initHistorySidebarUI() {
  const navChat = document.getElementById('nav-chat');
  if (navChat) {
    navChat.setAttribute('onclick', 'newChat()');
    const label = navChat.querySelector('.ni-lb');
    if (label) {
      label.dataset.i18n = 'nav.newChat';
      label.textContent = t('nav.newChat', 'New chat');
    }
    const icon = navChat.querySelector('svg');
    if (icon) {
      icon.innerHTML = '<path d="M12 5v14"/><path d="M5 12h14"/>';
    }
  }

  const navSearch = document.getElementById('nav-settings');
  if (navSearch) {
    navSearch.id = 'nav-search';
    navSearch.setAttribute('type', 'button');
    navSearch.setAttribute('onclick', 'toggleHistorySearch(this)');

    const label = navSearch.querySelector('.ni-lb');
    if (label) {
      label.dataset.i18n = 'nav.searchChats';
      label.textContent = t('nav.searchChats', 'Search chats');
    }

    const icon = navSearch.querySelector('svg');
    if (icon) {
      icon.innerHTML = '<circle cx="11" cy="11" r="7"/><line x1="20" y1="20" x2="16.65" y2="16.65"/>';
    }
  }

  document.querySelector('.sb-new')?.remove();
  document.querySelector('#chatHero .hero-copy')?.remove();

  if (!document.getElementById('sb-search-shell')) {
    const historyNode = document.getElementById('sb-hist');
    if (historyNode) {
      const shell = document.createElement('div');
      shell.id = 'sb-search-shell';
      shell.className = 'sb-search-shell';
      shell.innerHTML = `
        <label class="sb-search" for="sbHistSearch">
          <svg class="sb-search-ic" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7"></circle>
            <line x1="20" y1="20" x2="16.65" y2="16.65"></line>
          </svg>
          <input class="sb-search-inp" id="sbHistSearch" type="text" autocomplete="off" data-i18n-placeholder="hist.searchPlaceholder" placeholder="${esc(t('hist.searchPlaceholder', 'Search chats...'))}">
          <button class="sb-search-clear rh" id="sbHistSearchClear" type="button" data-i18n-aria-label="hist.searchClear" aria-label="${esc(t('hist.searchClear', 'Clear search'))}">
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </label>
      `;

      historyNode.before(shell);

      const input = shell.querySelector('#sbHistSearch');
      input?.addEventListener('input', event => updateHistorySearch(event.target.value));
      input?.addEventListener('keydown', handleHistorySearchKey);
      shell.querySelector('#sbHistSearchClear')?.addEventListener('click', clearHistorySearch);
    }
  }

  syncHistorySearchUI();
}

function syncHistorySearchUI() {
  const shell = document.getElementById('sb-search-shell');
  const input = document.getElementById('sbHistSearch');
  const clear = document.getElementById('sbHistSearchClear');
  const navSearch = document.getElementById('nav-search');
  const hasQuery = Boolean(historySearchQuery);
  const shouldShow = historySearchOpen || hasQuery;

  shell?.classList.toggle('open', shouldShow);
  clear?.classList.toggle('show', hasQuery);
  navSearch?.classList.toggle('act', shouldShow);

  if (input && input.value !== historySearchQuery) input.value = historySearchQuery;
  queueHistoryMarqueeRefresh();
}

function openHistorySearch() {
  if (col && !isMobileViewport()) expandSb();
  historySearchOpen = true;
  syncHistorySearchUI();
  setTimeout(() => {
    const input = document.getElementById('sbHistSearch');
    input?.focus();
    input?.select();
  }, 40);
}

function closeHistorySearch() {
  historySearchOpen = false;
  syncHistorySearchUI();
}

function toggleHistorySearch() {
  if (!historySearchOpen) {
    openHistorySearch();
    return;
  }

  if (historySearchQuery) {
    openHistorySearch();
    return;
  }

  closeHistorySearch();
}

function updateHistorySearch(value) {
  historySearchQuery = String(value || '').trim().toLowerCase();
  renderSidebarHistory();
  syncHistorySearchUI();
}

function clearHistorySearch() {
  historySearchQuery = '';
  renderSidebarHistory();
  openHistorySearch();
}

function handleHistorySearchKey(event) {
  if (event.key !== 'Escape') return;

  event.preventDefault();
  if (historySearchQuery) {
    clearHistorySearch();
    return;
  }

  closeHistorySearch();
}

function getHistorySearchResults() {
  if (!historySearchQuery) return historyConversations.slice();

  return historyConversations.filter(conv => {
    const title = (conv.title || t('hist.untitled', 'Untitled')).toLowerCase();
    return title.includes(historySearchQuery);
  });
}

function queueHistoryMarqueeRefresh(delay) {
  clearTimeout(historyMarqueeTimer);
  historyMarqueeTimer = setTimeout(refreshHistoryMarquee, delay ?? 60);
}

function refreshHistoryMarquee() {
  const sidebar = document.getElementById('sb');
  const collapsed = sidebar?.classList.contains('col') && !isMobileViewport();

  document.querySelectorAll('.h-item').forEach(item => {
    const label = item.querySelector('.h-item-lb');
    const track = item.querySelector('.h-item-track');
    if (!label || !track) return;

    item.classList.remove('h-marquee');
    item.style.removeProperty('--h-marquee-shift');
    item.style.removeProperty('--h-marquee-duration');
    track.style.transform = 'translateX(0)';

    const visibleWidth = Math.floor(label.clientWidth);
    const fullWidth = Math.ceil(track.scrollWidth);
    const overflow = fullWidth - visibleWidth;

    if (collapsed || visibleWidth <= 0 || overflow <= 18) return;

    item.classList.add('h-marquee');
    item.style.setProperty('--h-marquee-shift', `${overflow}px`);
    item.style.setProperty('--h-marquee-duration', `${Math.max(6, overflow / 16)}s`);
  });
}

function openHistoryModal(mode, convId, title) {
  if (openDD) {
    document.getElementById(openDD)?.classList.remove('open');
    openDD = null;
  }
  if (openPop) {
    document.getElementById(openPop)?.classList.remove('open');
    openPop = null;
    document.querySelectorAll('.sel-btn').forEach(btn => btn.classList.remove('open'));
  }

  historyModalState = {
    mode,
    convId,
    title: title || '',
  };

  const modal = document.getElementById('historyModal');
  const input = document.getElementById('historyModalInput');
  if (!modal || !input) return;

  syncHistoryModalTexts();
  input.value = historyModalState.title;
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  refreshOverlayState();

  if (mode === 'delete') {
    setTimeout(() => document.getElementById('historyModalConfirm')?.focus(), 40);
  } else {
    setTimeout(() => {
      input.focus();
      input.select();
    }, 40);
  }
}

function closeHistoryModal() {
  const modal = document.getElementById('historyModal');
  const input = document.getElementById('historyModalInput');
  if (!modal || !input) return;

  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
  input.value = '';
  historyModalState = { mode: null, convId: null, title: '' };
  refreshOverlayState();
}

async function performDeleteConversation(convId) {
  if (!currentUserId || !convId) return false;

  try {
    const response = await fetch(`${API}/history/${currentUserId}/${convId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    if (!response.ok) {
      toast(t('hist.deleteFailed', 'Could not delete conversation'), 'err');
      return false;
    }

    const wasCurrent = currentConvId === convId;
    clearConversationState(convId);
    if (typeof removeConversationModel === 'function') removeConversationModel(convId);
    if (typeof removeConversationAgent === 'function') removeConversationAgent(convId);
    if (wasCurrent) newChat();
    loadHistory();
    toast(t('hist.deleted', 'Conversation deleted'), 'ok', 2000);
    return true;
  } catch {
    toast(t('hist.deleteFailed', 'Could not delete conversation'), 'err');
    return false;
  }
}

async function performRenameConversation(convId, newTitle) {
  try {
    const response = await fetch(`${API}/history/${currentUserId}/${convId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ title: newTitle.trim() }),
    });

    if (!response.ok) {
      toast(t('hist.renameFailed', 'Could not rename conversation'), 'err');
      return false;
    }

    loadHistory();
    toast(t('hist.renamed', 'Conversation renamed'), 'ok', 1800);
    return true;
  } catch {
    toast(t('hist.renameFailed', 'Could not rename conversation'), 'err');
    return false;
  }
}

async function submitHistoryModal() {
  const { mode, convId } = historyModalState;
  if (!mode || !convId) return;

  if (mode === 'delete') {
    const ok = await performDeleteConversation(convId);
    if (ok) closeHistoryModal();
    return;
  }

  const input = document.getElementById('historyModalInput');
  const value = input?.value.trim();
  if (!value) {
    input?.focus();
    return;
  }

  const ok = await performRenameConversation(convId, value);
  if (ok) closeHistoryModal();
}

function renameConversation(convId, currentTitle) {
  openHistoryModal('rename', convId, currentTitle);
}

function deleteConversation(convId, currentTitle) {
  openHistoryModal('delete', convId, currentTitle);
}

async function loadHistory() {
  if (!currentUserId) return;

  try {
    const response = await fetch(`${API}/history/${currentUserId}?limit=50`, {
      headers: authHeaders(),
    });
    if (!response.ok) return;

    const data = await response.json();
    historyConversations = data.conversations || [];
    renderSidebarHistory();
  } catch {}
}

function renderSidebarHistory(convs) {
  const historyNode = document.getElementById('sb-hist');
  if (!historyNode) return;

  const items = Array.isArray(convs) ? convs : getHistorySearchResults();
  historyNode.innerHTML = '';

  if (!items.length) {
    const key = historySearchQuery ? 'hist.searchEmpty' : 'hist.empty';
    historyNode.innerHTML = `<div class="h-empty">${esc(t(key, 'History is empty for now'))}</div>`;
    queueHistoryMarqueeRefresh();
    return;
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const groups = { today: [], yesterday: [], earlier: [] };

  items.forEach(conv => {
    const updatedAt = new Date(conv.updated_at || conv.created_at);
    if (updatedAt >= today) groups.today.push(conv);
    else if (updatedAt >= yesterday) groups.yesterday.push(conv);
    else groups.earlier.push(conv);
  });

  const labels = {
    today: t('hist.today', 'Today'),
    yesterday: t('hist.yesterday', 'Yesterday'),
    earlier: t('hist.earlier', 'Earlier'),
  };

  Object.entries(groups).forEach(([key, list]) => {
    if (!list.length) return;

    const groupLabel = document.createElement('div');
    groupLabel.className = 'h-grp';
    groupLabel.textContent = labels[key];
    historyNode.appendChild(groupLabel);

    list.forEach(conv => {
      const item = document.createElement('div');
      item.className = 'h-item rh';
      item.dataset.convId = conv.id;
      item.setAttribute('tabindex', '0');
      item.classList.toggle('act', currentConvId === conv.id);
      item.classList.toggle('busy', typeof isConversationStreaming === 'function' && isConversationStreaming(conv.id));

      const title = (conv.title || t('hist.untitled', 'Untitled')).trim() || t('hist.untitled', 'Untitled');
      item.innerHTML = `
        <div class="h-dot"></div>
        <span class="h-item-lb"><span class="h-item-track">${esc(title)}</span></span>
        <div class="h-actions">
          <button class="h-act-btn h-act-rename" type="button" title="${esc(t('hist.renameTitle', 'Rename conversation'))}" aria-label="${esc(t('hist.renameTitle', 'Rename conversation'))}">
            <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4z"/></svg>
          </button>
          <button class="h-act-btn h-del-btn h-act-delete" type="button" title="${esc(t('hist.deleteTitle', 'Delete conversation'))}" aria-label="${esc(t('hist.deleteTitle', 'Delete conversation'))}">
            <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
          </button>
        </div>
      `;

      const openCurrentConversation = () => {
        document.querySelectorAll('.h-item').forEach(node => node.classList.remove('act'));
        item.classList.add('act');
        openConversation(conv.id);
      };

      item.onclick = openCurrentConversation;
      item.onkeydown = event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openCurrentConversation();
        }
      };

      item.querySelector('.h-act-rename')?.addEventListener('click', event => {
        event.stopPropagation();
        renameConversation(conv.id, conv.title || '');
      });
      item.querySelector('.h-act-delete')?.addEventListener('click', event => {
        event.stopPropagation();
        deleteConversation(conv.id, conv.title || '');
      });

      historyNode.appendChild(item);
      addRipple(item);
    });
  });

  queueHistoryMarqueeRefresh();
}

function renderConversationFromState(convId) {
  const panel = document.getElementById('panel-chat');
  const chatInner = document.getElementById('chatInner');
  if (!panel || !chatInner) return;

  const messages = getConversationMessagesSnapshot(convId).filter(message => message.role !== 'system');
  const pending = getConversationPendingMessage(convId);
  const process = typeof getConversationProcess === 'function' ? getConversationProcess(convId) : null;
  chatInner.innerHTML = '';

  if (!messages.length && !pending) {
    panel.classList.remove('has-messages');
    document.getElementById('inpZoneBottom').style.display = 'none';
    return;
  }

  panel.classList.add('has-messages');
  document.getElementById('inpZoneBottom').style.display = 'block';
  messages.forEach(message => {
    if (typeof renderConversationMessage === 'function') renderConversationMessage(message);
    else {
      appendMsg(
        message.role === 'user' ? 'user' : 'ai',
        message.content,
        message.role === 'assistant',
        message.model_used || null,
      );
    }
  });

  if (pending?.role === 'assistant') {
    const pendingEl = appendMsg(
      'ai',
      pending.content || '',
      Boolean(pending.content) && pending.isMarkdown !== false,
      pending.usedModel || process?.modelId || null,
    );
    const bbl = pendingEl.querySelector('.msg-bbl');

    if (pending.kind === 'progress' && typeof renderResearchProgressState === 'function') {
      const lines = Array.isArray(pending.lines) && pending.lines.length
        ? pending.lines
        : [pending.status || 'Processing...'];
      renderResearchProgressState(bbl, lines);
    } else if (!pending.content) {
      bbl.innerHTML = `<span style="color:var(--muted)"><span style="display:inline-block;animation:vwa 1s ease-in-out 0s infinite">...</span> ${esc(pending.status || 'Generating response...')}</span>`;
    } else if (pending.status) {
      bbl.innerHTML += `<div style="margin-top:8px;font-size:11px;color:var(--muted)">${esc(pending.status)}</div>`;
    }
  }

  scrollBot();
}

async function openConversation(convId) {
  setActiveConversation(convId);
  sw('chat', document.getElementById('nav-chat'));

  const renderCurrentConversation = () => {
    if (typeof restoreConversationModel === 'function') restoreConversationModel(convId);
    if (typeof restoreConversationAgent === 'function') restoreConversationAgent(convId);
    renderConversationFromState(convId);
    queueHistoryMarqueeRefresh(120);
  };

  renderCurrentConversation();

  if (!currentUserId || !isHistoryEnabled()) {
    return;
  }

  try {
    const response = await fetch(`${API}/history/${currentUserId}/${convId}?limit=200`, {
      headers: authHeaders(),
    });
    if (!response.ok) {
      renderCurrentConversation();
      return;
    }

    const data = await response.json();
    const historyMessages = (data.messages || []).map(message => ({
      role: message.role,
      content: message.content,
      model_used: message.model_used || null,
    }));
    if (typeof mergeConversationMessagesFromHistory === 'function') mergeConversationMessagesFromHistory(convId, historyMessages);
    else replaceConversationMessages(convId, historyMessages);
    if (currentConvId !== convId) return;
    renderCurrentConversation();
  } catch {
    if (currentConvId !== convId) return;
    if (getConversationMessagesSnapshot(convId).length || getConversationPendingMessage(convId)) renderCurrentConversation();
    else toast(t('hist.loadFailed', 'Could not load conversation'), 'err');
  }
}

function openH(el) {
  if (col && !isMobileViewport()) expandSb();
  document.querySelectorAll('.h-item').forEach(item => item.classList.remove('act'));
  el.classList.add('act');
  const convId = el.dataset.convId;
  if (convId) openConversation(convId);
  else sw('chat', document.getElementById('nav-chat'));
}

function newChat() {
  const panel = document.getElementById('panel-chat');
  panel.classList.remove('has-messages');
  document.getElementById('inpZoneBottom').style.display = 'none';
  document.getElementById('chatInner').innerHTML = '';
  document.querySelectorAll('.h-item').forEach(item => item.classList.remove('act'));
  document.getElementById('heroAgentIcon').style.display = 'none';
  if (typeof createConversationSession === 'function') createConversationSession({ modelId: 'auto', agentId: null });
  else {
    setActiveConversation(uuid());
    replaceConversationMessages(currentConvId, []);
    if (typeof setConversationAgent === 'function') setConversationAgent(currentConvId, null);
    else currentAgent = null;
    if (typeof resetConversationModel === 'function') resetConversationModel(currentConvId);
  }
  sw('chat', document.getElementById('nav-chat'));
  setTimeout(() => document.getElementById('inpHero')?.focus(), 50);
}

(function initHistory() {
  initHistorySidebarUI();

  const confirm = document.getElementById('historyModalConfirm');
  const input = document.getElementById('historyModalInput');
  if (confirm) confirm.addEventListener('click', submitHistoryModal);
  if (input) {
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submitHistoryModal();
      }
    });
  }
})();
