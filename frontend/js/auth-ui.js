// Authentication screen logic.

let authEmailVal = '';
let regMode = false;

function syncAuthModeTexts() {
  const step1Title = document.querySelector('#authStep1 .auth-title');
  const step1Sub = document.querySelector('#authStep1 .auth-sub');
  const step1Btn = document.querySelector('#authStep1 .auth-btn');
  const codeBtn = document.getElementById('authCodeBtn');
  const step2Title = document.getElementById('authStep2Title');
  const sentInfo = document.querySelector('#authStep2 .auth-sent-info');
  const modeToggle = document.getElementById('authModeToggleText');
  const backBtn = document.querySelector('.auth-back');
  const confirmInput = document.getElementById('authConfirmPwd');
  const pwdButton = document.getElementById('pwdEyeBtn');
  const pwdInput = document.getElementById('authPassword');

  if (step1Title) step1Title.textContent = t('auth.welcome', 'Welcome');
  if (step1Sub) step1Sub.textContent = t('auth.subtitle', 'Enter your email to continue');
  if (step1Btn) step1Btn.textContent = t('auth.continue', 'Continue');
  if (step2Title) step2Title.textContent = t(regMode ? 'auth.createAccount' : 'auth.enterPassword');
  if (sentInfo) sentInfo.innerHTML = `${t('auth.account', 'Account')}: <strong id="authEmailShow">${esc(authEmailVal)}</strong>`;
  if (modeToggle) modeToggle.textContent = t(regMode ? 'auth.haveAccount' : 'auth.noAccount');
  if (backBtn) backBtn.textContent = t('auth.changeEmail', '← Change email');
  if (confirmInput) confirmInput.setAttribute('placeholder', t('auth.confirmPassword', 'Repeat password'));
  if (codeBtn && !codeBtn.disabled) codeBtn.textContent = t(regMode ? 'auth.createAccount' : 'auth.signIn');
  if (pwdButton) pwdButton.setAttribute('aria-label', pwdInput?.type === 'text' ? (curLang === 'ru' ? 'Скрыть пароль' : 'Hide password') : (curLang === 'ru' ? 'Показать пароль' : 'Show password'));
}

function toggleRegMode() {
  regMode = !regMode;
  document.getElementById('authConfirmWrap').style.display = regMode ? 'block' : 'none';
  document.getElementById('authConfirmPwd').value = '';
  syncAuthModeTexts();
}

function authSubmitEmail() {
  const input = document.getElementById('authEmail');
  const value = input.value.trim();
  if (!value || !value.includes('@')) {
    input.style.borderColor = 'var(--red)';
    input.focus();
    setTimeout(() => { input.style.borderColor = ''; }, 1200);
    return;
  }

  authEmailVal = value;
  document.getElementById('authEmailShow').textContent = value;
  const step1 = document.getElementById('authStep1');
  step1.classList.add('exit-left');
  setTimeout(() => {
    step1.style.display = 'none';
    step1.classList.remove('exit-left');
    const step2 = document.getElementById('authStep2');
    step2.style.display = 'flex';
    step2.style.opacity = '1';
    step2.classList.add('enter-right');
    setTimeout(() => step2.classList.remove('enter-right'), 450);
    setTimeout(() => document.getElementById('authPassword')?.focus(), 80);
  }, 290);
}

function authGoBack() {
  const step2 = document.getElementById('authStep2');
  step2.classList.add('exit-left');
  setTimeout(() => {
    step2.style.display = 'none';
    step2.classList.remove('exit-left');
    document.getElementById('authPassword').value = '';
    document.getElementById('authConfirmPwd').value = '';

    if (regMode) {
      regMode = false;
      document.getElementById('authConfirmWrap').style.display = 'none';
      syncAuthModeTexts();
    }

    const step1 = document.getElementById('authStep1');
    step1.style.display = 'flex';
    step1.classList.add('enter-right');
    setTimeout(() => step1.classList.remove('enter-right'), 450);
    setTimeout(() => document.getElementById('authEmail')?.focus(), 80);
  }, 290);
}

function togglePwdVis() {
  const input = document.getElementById('authPassword');
  const icon = document.getElementById('pwdEyeIcon');
  const button = document.getElementById('pwdEyeBtn');
  if (input.type === 'password') {
    input.type = 'text';
    button?.setAttribute('aria-label', curLang === 'ru' ? 'Скрыть пароль' : 'Hide password');
    icon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>';
  } else {
    input.type = 'password';
    button?.setAttribute('aria-label', curLang === 'ru' ? 'Показать пароль' : 'Show password');
    icon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
  }
}

function _finishAuthBoot() {
  document.getElementById('appRoot')?.classList.add('vis');
  fetchModels();
  loadHistory();
  loadMemory();
  checkHealth();
  if (typeof createConversationSession === 'function') createConversationSession({ modelId: 'auto', agentId: null });
  else {
    setActiveConversation(uuid());
    replaceConversationMessages(currentConvId, []);
    if (typeof resetConversationModel === 'function') resetConversationModel(currentConvId);
  }
}

function _authSuccess(data, options) {
  const { skipSplash = false } = options || {};

  authToken = data.token;
  currentUserId = data.user_id;
  localStorage.setItem('mts-token', authToken);
  localStorage.setItem('mts-user-id', currentUserId);
  localStorage.setItem('mts-user-email', data.email);
  document.getElementById('profInpEmail').value = data.email;

  const savedName = localStorage.getItem('mts-display-name');
  const displayName = savedName || data.email.split('@')[0];
  document.getElementById('profInpName').value = displayName;
  document.getElementById('sbUserName').textContent = displayName;
  document.getElementById('sbAvatar').textContent = getInitials(displayName);

  const org = localStorage.getItem('mts-org') || '';
  if (org) document.getElementById('profInpOrg').value = org;

  document.getElementById('authScreen').classList.add('out');
  setTimeout(() => {
    document.getElementById('authScreen').style.display = 'none';
    initSplash({ skip: skipSplash });
  }, 260);
}

function authSubmitCode() {
  const password = document.getElementById('authPassword').value;
  if (!password) {
    const input = document.getElementById('authPassword');
    input.style.borderColor = 'var(--red)';
    input.focus();
    setTimeout(() => { input.style.borderColor = ''; }, 1200);
    return;
  }

  const button = document.getElementById('authCodeBtn');

  if (regMode) {
    if (password.length < 6) {
      toast(t('auth.passwordMin', 'Password must contain at least 6 characters'), 'err');
      return;
    }

    const confirmPassword = document.getElementById('authConfirmPwd').value;
    if (!confirmPassword) {
      const input = document.getElementById('authConfirmPwd');
      input.style.borderColor = 'var(--red)';
      input.focus();
      setTimeout(() => { input.style.borderColor = ''; }, 1200);
      return;
    }
    if (password !== confirmPassword) {
      toast(t('auth.passwordMismatch', 'Passwords do not match'), 'err');
      return;
    }

    button.textContent = t('auth.creating', 'Creating...');
    button.disabled = true;
    apiAuthRegister(authEmailVal, password)
      .then(data => _authSuccess(data))
      .catch(error => {
        button.disabled = false;
        syncAuthModeTexts();
        toast(error.message || t('auth.registrationFailed', 'Registration failed'), 'err', 3000);
      });
  } else {
    button.textContent = t('auth.signingIn', 'Signing in...');
    button.disabled = true;
    apiAuthLogin(authEmailVal, password)
      .then(data => _authSuccess(data))
      .catch(error => {
        button.disabled = false;
        syncAuthModeTexts();
        const input = document.getElementById('authPassword');
        input.style.borderColor = 'var(--red)';
        input.focus();
        setTimeout(() => { input.style.borderColor = ''; }, 1800);
        toast(error.message || t('auth.wrongPassword', 'Wrong password'), 'err', 3000);
      });
  }
}

function initSplash(options) {
  const { skip = false } = options || {};
  const splash = document.getElementById('splash');
  if (!splash) return;

  if (skip) {
    splash.style.display = 'none';
    _finishAuthBoot();
    return;
  }

  // Сброс предыдущих состояний для повторного показа
  splash.style.display = 'flex';
  splash.classList.remove('out');
  splash.style.opacity = '1';
  
  const brain = document.getElementById('splash-brain');
  const sub = document.getElementById('splash-sub');
  const lettersWrap = document.getElementById('splash-letters');
  const letters = ['sl-m', 'sl-a', 'sl-x'];

  // Очистка классов перед запуском
  brain?.classList.remove('show', 'glow');
  sub?.classList.remove('show');
  lettersWrap?.classList.remove('gather');
  letters.forEach(id => document.getElementById(id)?.classList.remove('lit'));

  // Запуск анимации
  setTimeout(() => {
    brain?.classList.add('show');
    setTimeout(() => brain?.classList.add('glow'), 320);
  }, 120);

  letters.forEach((id, index) => {
    setTimeout(() => document.getElementById(id)?.classList.add('lit'), 240 + index * 120);
  });

  if (typeof burstParticles === 'function') setTimeout(burstParticles, 760);
  
  setTimeout(() => sub?.classList.add('show'), 980);
  setTimeout(() => lettersWrap?.classList.add('gather'), 1240);
  
  setTimeout(() => {
    splash.classList.add('out');
    document.getElementById('appRoot')?.classList.add('vis');
  }, 1560);

  setTimeout(() => {
    splash.style.display = 'none'; // Скрываем, а не удаляем (remove)
    _finishAuthBoot();
  }, 1880);
}

async function checkHealth() {
  try {
    const response = await fetch(`${API}/health`, { signal: AbortSignal.timeout(4000) });
    const data = await response.json();
    toast(
      data.status === 'ok' ? t('health.ok', 'Backend connected') : t('health.degraded', 'Backend is running in degraded mode'),
      data.status === 'ok' ? 'ok' : 'inf',
      2500
    );
  } catch {
    toast(t('health.down', 'Backend is unavailable'), 'err', 5000);
  }
}
