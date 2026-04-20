// Profile overlay renderer and flows.

let _profileLastFocus = null;

const PROFILE_DEFAULT_NAME = 'Пользователь MTS';
const PROFILE_TABS = ['account', 'security', 'settings'];
const PROFILE_TAB_META = {
  account: { titleKey: 'prof.head.account', subKey: 'prof.sub.account' },
  security: { titleKey: 'prof.head.security', subKey: 'prof.sub.security' },
  settings: { titleKey: 'prof.head.settings', subKey: 'prof.sub.settings' },
};

function profileMarkup() {
  return `
    <div class="prof-shell">
      <aside class="prof-rail">
        <div class="prof-kicker" data-i18n="prof.kicker">${t('prof.kicker', 'Account')}</div>

        <div class="prof-user-card">
          <div class="prof-av rh" id="profAv">
            <span id="profAvInitials">MT</span>
          </div>

          <div class="prof-user-copy">
            <div class="prof-user-name" id="profName">${PROFILE_DEFAULT_NAME}</div>
            <div class="prof-user-email" id="profRailEmail">${t('prof.meta.noEmail', 'Email not added')}</div>
          </div>
        </div>

        <div class="prof-nav" role="tablist" aria-label="${esc(t('prof.tabListLabel', 'Profile sections'))}">
          ${profileTabButton('account', '<circle cx="12" cy="8" r="4"></circle><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"></path>', true)}
          ${profileTabButton('security', '<rect x="3" y="11" width="18" height="10" rx="2"></rect><path d="M7 11V7a5 5 0 0110 0v4"></path>')}
          ${profileTabButton('settings', '<line x1="4" y1="6" x2="20" y2="6"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="18" x2="20" y2="18"></line><circle cx="9" cy="6" r="2"></circle><circle cx="15" cy="12" r="2"></circle><circle cx="9" cy="18" r="2"></circle>')}
        </div>

        <div class="prof-rail-foot">
          <button class="prof-logout rh" type="button" onclick="logoutProfile()" data-i18n="prof.logout">${t('prof.logout', 'Sign out')}</button>
        </div>
      </aside>

      <section class="prof-main">
        <div class="prof-topbar">
          <div class="prof-top-copy">
            <h2 class="prof-top-title" id="profSectionTitle">${t('prof.head.account', 'Account')}</h2>
            <p class="prof-top-sub" id="profSectionSub">${t('prof.sub.account', 'Manage the core details that define your workspace identity.')}</p>
          </div>

          <button class="prof-close rh" type="button" onclick="closeProfile()" data-i18n-aria-label="prof.close" aria-label="${esc(t('prof.close', 'Close profile'))}">
            <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="prof-body">
          <section class="prof-tab-panel act" id="profTab-account" role="tabpanel" aria-labelledby="profNav-account" aria-hidden="false">
            <div class="prof-card">
              <div class="prof-card-title" data-i18n="prof.account.formTitle">${t('prof.account.formTitle', 'Core details')}</div>
              <div class="prof-card-copy" data-i18n="prof.account.formCopy">${t('prof.account.formCopy', 'Update your name, email, and organization so the interface stays relevant.')}</div>

              <div class="prof-fields prof-fields-grid">
                <div class="prof-field">
                  <label class="prof-lbl" for="profInpName" data-i18n="prof.label.name">${t('prof.label.name', 'Name')}</label>
                  <input class="prof-inp" type="text" id="profInpName" value="${esc(PROFILE_DEFAULT_NAME)}" data-i18n-placeholder="prof.placeholder.name" placeholder="${esc(t('prof.placeholder.name', 'Your name'))}">
                </div>
                <div class="prof-field">
                  <label class="prof-lbl" for="profInpEmail" data-i18n="prof.email">${t('prof.email', 'Email')}</label>
                  <input class="prof-inp" type="email" id="profInpEmail" value="" data-i18n-placeholder="prof.placeholder.email" placeholder="${esc(t('prof.placeholder.email', 'name@example.com'))}">
                </div>
                <div class="prof-field prof-field-wide">
                  <label class="prof-lbl" for="profInpOrg" data-i18n="prof.label.organization">${t('prof.label.organization', 'Organization')}</label>
                  <input class="prof-inp" type="text" id="profInpOrg" value="" data-i18n-placeholder="prof.placeholder.organization" placeholder="${esc(t('prof.placeholder.organization', 'Company or project'))}">
                </div>
              </div>

              <div class="prof-action-row">
                <button class="prof-save rh" type="button" onclick="saveProfile()" data-i18n="prof.saveProfile">${t('prof.saveProfile', 'Save changes')}</button>
              </div>
            </div>
          </section>

          <section class="prof-tab-panel" id="profTab-security" role="tabpanel" aria-labelledby="profNav-security" aria-hidden="true" hidden>
            <div class="prof-card">
              <div class="prof-card-title" data-i18n="prof.security.title">${t('prof.security.title', 'Protect your account')}</div>
              <div class="prof-card-copy" data-i18n="prof.security.copy">${t('prof.security.copy', 'Change your password and keep workspace access under control.')}</div>

              <div class="prof-security-note">
                <span class="prof-security-dot"></span>
                <span id="profSecurityEmail">${t('prof.meta.noEmail', 'Email not added')}</span>
              </div>

              <div class="prof-fields">
                <div class="prof-field">
                  <label class="prof-lbl" for="profPwdCurrent" data-i18n="prof.security.currentPassword">${t('prof.security.currentPassword', 'Current password')}</label>
                  <input class="prof-inp" type="password" id="profPwdCurrent" placeholder="********">
                </div>
                <div class="prof-field">
                  <label class="prof-lbl" for="profPwdNew" data-i18n="prof.security.newPassword">${t('prof.security.newPassword', 'New password')}</label>
                  <input class="prof-inp" type="password" id="profPwdNew" data-i18n-placeholder="prof.security.newPasswordHint" placeholder="${esc(t('prof.security.newPasswordHint', 'At least 8 characters'))}" oninput="checkPwdStrength(this.value)">
                  <div class="prof-pwd-strength"><div class="prof-pwd-bar" id="profPwdBar"></div></div>
                </div>
                <div class="prof-field">
                  <label class="prof-lbl" for="profPwdConfirm" data-i18n="prof.security.confirmPassword">${t('prof.security.confirmPassword', 'Confirm password')}</label>
                  <input class="prof-inp" type="password" id="profPwdConfirm" placeholder="********">
                </div>
              </div>

              <div class="prof-action-row">
                <button class="prof-save rh" type="button" onclick="changePassword()" data-i18n="prof.security.changeAction">${t('prof.security.changeAction', 'Change password')}</button>
              </div>
            </div>
          </section>

          <section class="prof-tab-panel" id="profTab-settings" role="tabpanel" aria-labelledby="profNav-settings" aria-hidden="true" hidden>
            <div class="prof-card prof-card-settings">
              <div class="prof-card-title" data-i18n="prof.settings.title">${t('prof.settings.title', 'Interface settings')}</div>
              <div class="prof-card-copy" data-i18n="prof.settings.copy">${t('prof.settings.copy', 'All interface, model, and privacy controls live here in one place.')}</div>
              <div class="prof-settings-host" id="profSettingsHost"></div>
            </div>
          </section>
        </div>
      </section>
    </div>
  `;
}

function profileTabButton(tab, iconMarkup, active) {
  const selected = active ? 'true' : 'false';
  const tabIndex = active ? '0' : '-1';
  const actClass = active ? ' act' : '';
  return `
    <button class="prof-tab${actClass}" id="profNav-${tab}" type="button" role="tab" aria-selected="${selected}" aria-controls="profTab-${tab}" tabindex="${tabIndex}" data-prof-tab="${tab}" onclick="switchProfTab('${tab}', this)">
      <span class="prof-tab-ic">
        <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">${iconMarkup}</svg>
      </span>
      <span class="prof-tab-copy">
        <span class="prof-tab-title" data-i18n="prof.tab.${tab}">${t('prof.tab.' + tab, tab)}</span>
        <span class="prof-tab-note" data-i18n="prof.tab.${tab}Note">${t('prof.tab.' + tab + 'Note', '')}</span>
      </span>
    </button>
  `;
}

function getProfileOverlay() {
  return document.getElementById('profileOverlay');
}

function isProfileOpen() {
  return getProfileOverlay()?.classList.contains('show');
}

function getActiveProfileTab() {
  return document.querySelector('.prof-tab.act')?.dataset.profTab || 'account';
}

function getProfileInputValue(id, fallback) {
  return document.getElementById(id)?.value?.trim() || fallback || '';
}

function getInitials(name) {
  return name.trim().split(/\s+/).map(word => word[0] || '').join('').toUpperCase().slice(0, 2) || 'MT';
}

function getProfileFocusableNodes() {
  const overlay = getProfileOverlay();
  if (!overlay) return [];

  return [...overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter(node => !node.disabled && node.getClientRects().length);
}

function syncProfileA11y() {
  const overlay = getProfileOverlay();
  if (!overlay) return;

  overlay.setAttribute('tabindex', '-1');
  overlay.setAttribute('aria-label', t('prof.dialogLabel', 'User profile'));

  const nav = overlay.querySelector('.prof-nav');
  if (nav) nav.setAttribute('aria-label', t('prof.tabListLabel', 'Profile sections'));

  const closeBtn = overlay.querySelector('.prof-close');
  if (closeBtn) closeBtn.setAttribute('aria-label', t('prof.close', 'Close profile'));

  const trigger = document.querySelector('.sb-foot .u-row');
  if (trigger) trigger.setAttribute('aria-expanded', isProfileOpen() ? 'true' : 'false');
}

function syncProfileHeader(tab) {
  const meta = PROFILE_TAB_META[tab] || PROFILE_TAB_META.account;
  const title = document.getElementById('profSectionTitle');
  const sub = document.getElementById('profSectionSub');
  if (title) title.textContent = t(meta.titleKey);
  if (sub) sub.textContent = t(meta.subKey);
}

function syncProfileSummary() {
  const savedName = localStorage.getItem('mts-display-name') || document.getElementById('sbUserName')?.textContent?.trim() || PROFILE_DEFAULT_NAME;
  const savedEmail = localStorage.getItem('mts-user-email') || '';
  const liveName = getProfileInputValue('profInpName', savedName) || savedName;
  const liveEmail = getProfileInputValue('profInpEmail', savedEmail) || savedEmail;
  const name = isProfileOpen() ? liveName : savedName;
  const email = isProfileOpen() ? liveEmail : savedEmail;
  const emailLabel = email || t('prof.meta.noEmail', 'Email not added');
  const initials = getInitials(name || PROFILE_DEFAULT_NAME);

  document.getElementById('profName')?.replaceChildren(document.createTextNode(name || PROFILE_DEFAULT_NAME));
  document.getElementById('profAvInitials')?.replaceChildren(document.createTextNode(initials));
  document.getElementById('profRailEmail')?.replaceChildren(document.createTextNode(emailLabel));
  document.getElementById('profSecurityEmail')?.replaceChildren(document.createTextNode(emailLabel));
}

function renderProfileShell() {
  const overlay = getProfileOverlay();
  if (!overlay) return;

  const existingSettings = overlay.querySelector('#profSettingsHost .st-scroll');
  overlay.innerHTML = profileMarkup();
  if (existingSettings) overlay.querySelector('#profSettingsHost')?.appendChild(existingSettings);

  syncProfileA11y();
}

function ensureProfileSettingsTab() {
  const host = document.getElementById('profSettingsHost');
  if (!host || host.querySelector('.st-scroll')) return;

  const sourcePanel = document.getElementById('panel-settings');
  const scroll = sourcePanel?.querySelector('.st-scroll');
  if (scroll) {
    host.appendChild(scroll);
    sourcePanel.remove();
  }
}

function hydrateProfileInputs() {
  const savedName = localStorage.getItem('mts-display-name') || document.getElementById('sbUserName')?.textContent?.trim() || PROFILE_DEFAULT_NAME;
  const savedEmail = localStorage.getItem('mts-user-email') || '';
  const savedOrg = localStorage.getItem('mts-org') || '';

  if (document.getElementById('profInpName')) document.getElementById('profInpName').value = savedName;
  if (document.getElementById('profInpEmail')) document.getElementById('profInpEmail').value = savedEmail;
  if (document.getElementById('profInpOrg')) document.getElementById('profInpOrg').value = savedOrg;
}

function focusActiveProfileField(tab) {
  const selectors = {
    account: '#profInpName',
    security: '#profPwdCurrent',
    settings: '#profSettingsHost .sel-btn, #profSettingsHost button, #profSettingsHost input',
  };
  document.querySelector(selectors[tab] || selectors.account)?.focus?.();
}

function animateSettingsRows() {
  document.querySelectorAll('#profSettingsHost .st-row').forEach((row, index) => {
    row.style.transitionDelay = `${index * 30}ms`;
  });
}

function flashProfileAction(selector, doneLabel) {
  const btn = document.querySelector(selector);
  if (!btn) return;

  const original = btn.textContent;
  btn.textContent = doneLabel;
  setTimeout(() => {
    btn.textContent = original;
  }, 1600);
}

function syncProfileTexts() {
  syncProfileA11y();
  syncProfileHeader(getActiveProfileTab());
  syncProfileSummary();
}

function openProfile(tab) {
  ensureProfileSettingsTab();
  hydrateProfileInputs();
  syncProfileTexts();

  _profileLastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const initialTab = PROFILE_TABS.includes(tab) ? tab : getActiveProfileTab();
  switchProfTab(initialTab);

  getProfileOverlay()?.classList.add('show');
  syncProfileA11y();
  refreshOverlayState();
  setTimeout(() => focusActiveProfileField(initialTab), 50);
}

function closeProfile(options = {}) {
  const restoreFocus = options.restoreFocus !== false;
  const wasOpen = isProfileOpen();

  getProfileOverlay()?.classList.remove('show');
  syncProfileA11y();
  refreshOverlayState();

  if (!restoreFocus || !wasOpen) return;

  const fallbackTarget = document.querySelector('.sb-foot .u-row');
  const target = _profileLastFocus && document.contains(_profileLastFocus) ? _profileLastFocus : fallbackTarget;
  setTimeout(() => {
    target?.focus?.();
    _profileLastFocus = null;
  }, 40);
}

function closeProfileOuter(event) {
  if (event.target === getProfileOverlay()) closeProfile();
}

function switchProfTab(tab, btn) {
  ensureProfileSettingsTab();

  const safeTab = PROFILE_TABS.includes(tab) ? tab : 'account';
  const targetBtn = btn || document.querySelector(`.prof-tab[data-prof-tab="${safeTab}"]`);
  const targetPanel = document.getElementById(`profTab-${safeTab}`);

  document.querySelectorAll('.prof-tab').forEach(node => {
    node.classList.remove('act');
    node.setAttribute('aria-selected', 'false');
    node.setAttribute('tabindex', '-1');
  });

  document.querySelectorAll('.prof-tab-panel').forEach(node => {
    node.classList.remove('act');
    node.hidden = true;
    node.setAttribute('aria-hidden', 'true');
  });

  targetBtn?.classList.add('act');
  targetBtn?.setAttribute('aria-selected', 'true');
  targetBtn?.setAttribute('tabindex', '0');

  if (targetPanel) {
    targetPanel.classList.add('act');
    targetPanel.hidden = false;
    targetPanel.setAttribute('aria-hidden', 'false');
  }

  syncProfileHeader(safeTab);
  if (safeTab === 'settings') animateSettingsRows();
}

function saveProfile() {
  const name = getProfileInputValue('profInpName', PROFILE_DEFAULT_NAME) || PROFILE_DEFAULT_NAME;
  const email = getProfileInputValue('profInpEmail');
  const org = getProfileInputValue('profInpOrg');
  const initials = getInitials(name);

  document.getElementById('sbUserName').textContent = name;
  document.getElementById('sbAvatar').textContent = initials;

  localStorage.setItem('mts-display-name', name);
  if (email) localStorage.setItem('mts-user-email', email);
  else localStorage.removeItem('mts-user-email');
  if (org) localStorage.setItem('mts-org', org);
  else localStorage.removeItem('mts-org');

  if (currentUserId) {
    const headers = { 'Content-Type': 'application/json', ...authHeaders() };
    upsertMemoryFactLocally({ key: 'display_name', value: name, category: 'preferences', score: 1, updated_at: new Date().toISOString() });
    fetch(`${API}/memory/${currentUserId}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ key: 'display_name', value: name, category: 'preferences' }),
    }).catch(() => {});

    if (org) {
      upsertMemoryFactLocally({ key: 'organization', value: org, category: 'preferences', score: 1, updated_at: new Date().toISOString() });
      fetch(`${API}/memory/${currentUserId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ key: 'organization', value: org, category: 'preferences' }),
      }).catch(() => {});
    }
  }

  syncProfileSummary();
  flashProfileAction('#profTab-account .prof-save', t('prof.saveDone', 'Saved'));
  toast(t('prof.toast.saved', 'Profile updated'), 'ok');
}

function checkPwdStrength(value) {
  const bar = document.getElementById('profPwdBar');
  if (!bar) return;

  if (!value) {
    bar.style.width = '0%';
    return;
  }

  const hasUpper = /[A-Z]/.test(value);
  const hasNum = /[0-9]/.test(value);
  const hasSpec = /[^A-Za-z0-9]/.test(value);
  const score = value.length < 6 ? 1 : value.length < 10 ? 2 : (hasUpper && hasNum && hasSpec) ? 4 : (hasUpper || hasNum) ? 3 : 2;
  bar.style.width = `${score * 25}%`;
  bar.style.background = ['', '#ef4444', '#f97316', '#eab308', '#22c55e'][score];
}

function changePassword() {
  const curr = document.getElementById('profPwdCurrent');
  const next = document.getElementById('profPwdNew');
  const confirm = document.getElementById('profPwdConfirm');
  if (!curr || !next || !confirm) return;

  if (!curr.value) {
    toast(t('prof.toast.currentPasswordMissing', 'Enter the current password'), 'err');
    return;
  }
  if (next.value.length < 6) {
    toast(t('prof.toast.passwordMin', 'At least 6 characters'), 'err');
    return;
  }
  if (next.value !== confirm.value) {
    toast(t('prof.toast.passwordMismatch', 'Passwords do not match'), 'err');
    return;
  }
  if (!currentUserId) {
    toast(t('prof.toast.unauthorized', 'Not authorized'), 'err');
    return;
  }

  const btn = document.querySelector('#profTab-security .prof-save');
  if (btn) {
    btn.textContent = t('prof.security.saving', 'Saving...');
    btn.disabled = true;
  }

  fetch(`${API}/auth/password`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ user_id: currentUserId, current_password: curr.value, new_password: next.value }),
  }).then(response => response.json().then(data => ({ ok: response.ok, data })))
    .then(({ ok, data }) => {
      if (!ok) throw new Error(data.detail || t('prof.toast.genericError', 'Error'));

      curr.value = '';
      next.value = '';
      confirm.value = '';
      document.getElementById('profPwdBar').style.width = '0%';
      toast(t('prof.toast.passwordChanged', 'Password changed'), 'ok');
    })
    .catch(error => toast(error.message, 'err', 3000))
    .finally(() => {
      if (btn) {
        btn.textContent = t('prof.security.changeAction', 'Change password');
        btn.disabled = false;
      }
    });
}

function logoutProfile() {
  closeProfile({ restoreFocus: false });

  authToken = null;
  currentUserId = null;
  resetConversationRuntimeState();
  if (typeof resetConversationAgentState === 'function') resetConversationAgentState();
  if (typeof resetConversationModelState === 'function') resetConversationModelState();
  historyConversations = [];
  historySearchQuery = '';
  userMemory = [];
  resetMemorySyncState();

  localStorage.removeItem('mts-token');
  localStorage.removeItem('mts-user-id');
  localStorage.removeItem('mts-user-email');
  localStorage.removeItem('mts-display-name');
  localStorage.removeItem('mts-org');

  setTimeout(() => {
    const auth = document.getElementById('authScreen');
    if (auth) {
      auth.style.display = 'flex';
      auth.classList.remove('out');
      document.getElementById('authStep1').style.display = 'flex';
      document.getElementById('authStep2').style.display = 'none';
      document.getElementById('authConfirmWrap').style.display = 'none';
      document.getElementById('authEmail').value = '';
      document.getElementById('authPassword').value = '';
      document.getElementById('authConfirmPwd').value = '';
      regMode = false;
      const btn = document.getElementById('authCodeBtn');
      if (btn) btn.disabled = false;
      syncAuthModeTexts();
      auth.style.animation = 'none';
      auth.style.opacity = '1';
      auth.style.transform = 'none';
      setTimeout(() => document.getElementById('authEmail')?.focus(), 200);
    }

    if (typeof closeHistorySearch === 'function') closeHistorySearch();
    else if (typeof syncHistorySearchUI === 'function') syncHistorySearchUI();

    document.getElementById('sb-hist').innerHTML = '';
    document.getElementById('sbUserName').textContent = PROFILE_DEFAULT_NAME;
    document.getElementById('sbAvatar').textContent = 'MT';
    document.getElementById('profInpName').value = PROFILE_DEFAULT_NAME;
    document.getElementById('profInpEmail').value = '';
    document.getElementById('profInpOrg').value = '';
    document.getElementById('profPwdCurrent').value = '';
    document.getElementById('profPwdNew').value = '';
    document.getElementById('profPwdConfirm').value = '';
    document.getElementById('profPwdBar').style.width = '0%';
    switchProfTab('account');
    syncProfileTexts();
    newChat();
  }, 350);

  toast(t('prof.toast.loggedOut', 'Signed out'), 'inf');
}

function moveProfileTabFocus(key) {
  const tabs = [...document.querySelectorAll('.prof-tab')];
  const current = document.activeElement?.closest?.('.prof-tab');
  const currentIndex = tabs.indexOf(current);
  if (currentIndex < 0) return;

  let nextIndex = currentIndex;
  if (key === 'Home') nextIndex = 0;
  else if (key === 'End') nextIndex = tabs.length - 1;
  else if (key === 'ArrowDown' || key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
  else if (key === 'ArrowUp' || key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;

  const nextTab = tabs[nextIndex];
  if (!nextTab) return;

  switchProfTab(nextTab.dataset.profTab, nextTab);
  nextTab.focus();
}

function trapProfileFocus(event) {
  const nodes = getProfileFocusableNodes();
  if (!nodes.length) return;

  const first = nodes[0];
  const last = nodes[nodes.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
    return;
  }

  if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function handleProfileKeydown(event) {
  if (!isProfileOpen()) return;

  if (event.key === 'Tab') {
    trapProfileFocus(event);
    return;
  }

  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) && document.activeElement?.closest?.('.prof-tab')) {
    event.preventDefault();
    moveProfileTabFocus(event.key);
  }
}

(function initProfileUI() {
  const trigger = document.querySelector('.sb-foot .u-row');
  if (trigger && !trigger.dataset.profileBound) {
    trigger.dataset.profileBound = 'true';
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('tabindex', '0');
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openProfile();
      }
    });
  }

  renderProfileShell();
  ensureProfileSettingsTab();
  hydrateProfileInputs();
  syncProfileTexts();
  document.addEventListener('keydown', handleProfileKeydown);
})();
