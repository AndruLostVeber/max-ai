// Interface translations.

const LANG = {
  ru: {
    'nav.chat': 'Чат',
    'nav.newChat': 'Новый чат',
    'nav.agents': 'Агенты',
    'nav.settings': 'Настройки',
    'nav.searchChats': 'Поиск чатов',
    'btn.newChat': 'Новый чат',
    'user.plan': 'План Pro',

    'hero.titleAccent': 'Один',
    'hero.titleRest': 'интерфейс для вопросов, ресерча и файлов',
    'hero.subFull': 'Выберите агента или начните с короткого запроса. Быстрые подсказки ниже помогут стартовать без пустого экрана.',
    'hero.minTitle': 'Новый чат',
    'hero.promptResearch': 'Собрать обзор рынка',
    'hero.promptCompare': 'Сравнить подходы',
    'hero.promptFile': 'Разобрать документ',
    'hero.promptImage': 'Проверить изображение',
    'chat.placeholder': 'Спросите что угодно...',
    'chat.promptLabel': 'Поле ввода запроса',

    'hist.today': 'Сегодня',
    'hist.yesterday': 'Вчера',
    'hist.earlier': 'Ранее',
    'hist.empty': 'История пока пуста',
    'hist.searchEmpty': 'Ничего не найдено',
    'hist.searchPlaceholder': 'Поиск по чатам...',
    'hist.searchClear': 'Очистить поиск',
    'hist.untitled': 'Без названия',
    'hist.renameTitle': 'Изменить название',
    'hist.renameCopy': 'Обновите название, чтобы нужный диалог было легче найти позже.',
    'hist.renameAction': 'Сохранить',
    'hist.deleteTitle': 'Удалить диалог',
    'hist.deleteCopy': 'Диалог и его сообщения исчезнут из истории. Это действие нельзя отменить.',
    'hist.deleteAction': 'Удалить',
    'hist.fieldLabel': 'Название диалога',
    'hist.renamed': 'Название обновлено',
    'hist.renameFailed': 'Не удалось переименовать диалог',
    'hist.deleted': 'Диалог удалён',
    'hist.deleteFailed': 'Не удалось удалить диалог',
    'hist.loadFailed': 'Не удалось загрузить диалог',

    'st.interface': 'Интерфейс',
    'st.lightTheme': 'Светлая тема',
    'st.lightThemeSub': 'Переключить цветовую схему',
    'st.lang': 'Язык интерфейса',
    'st.compact': 'Компактный режим',
    'st.compactSub': 'Уменьшить отступы',
    'st.models': 'Модели и агенты',
    'st.autoModel': 'Автовыбор модели',
    'st.autoModelSub': 'Оптимальная под задачу',
    'st.temp': 'Температура',
    'st.memory': 'Память агентов',
    'st.memorySub': 'Контекст между сессиями',
    'st.voice': 'Голос и ввод',
    'st.voiceInput': 'Голосовой ввод',
    'st.voiceInputSub': 'Распознавание через микрофон',
    'st.enterSend': 'Отправка по Enter',
    'st.enterSendSub': 'Shift+Enter для переноса строки',
    'st.privacy': 'Конфиденциальность',
    'st.history': 'История чатов',
    'st.historySub': 'Сохранять на сервере',
    'st.analytics': 'Аналитика',
    'st.analyticsSub': 'Анонимные данные',

    'auth.titleMain': 'Авторизация',
    'auth.emailLabel': 'Электронная почта',
    'auth.emailPlaceholder': 'example@mail.ru',
    'auth.passwordPlaceholder': 'Введите пароль',
    'auth.confirmPassword': 'Повторите пароль',
    'auth.confirmPasswordLabel': 'Подтвердите пароль',
    'auth.welcome': 'Добро пожаловать',
    'auth.subtitle': 'Введите вашу почту для входа',
    'auth.continue': 'Продолжить',
    'auth.signIn': 'Войти',
    'auth.createAccount': 'Создать аккаунт',
    'auth.enterPassword': 'Введите пароль',
    'auth.account': 'Аккаунт',
    'auth.changeEmail': '← Изменить почту',
    'auth.noAccount': 'Нет аккаунта? Зарегистрироваться →',
    'auth.haveAccount': 'Уже есть аккаунт? Войти →',
    'auth.creating': 'Создаём...',
    'auth.signingIn': 'Входим...',
    'auth.passwordMin': 'Пароль должен содержать минимум 6 символов',
    'auth.passwordMismatch': 'Пароли не совпадают',
    'auth.registrationFailed': 'Не удалось создать аккаунт',
    'auth.wrongPassword': 'Неверный пароль',
    'auth.sessionExpired': 'Сессия истекла, войдите снова',
    'health.ok': 'Бэкенд подключён',
    'health.degraded': 'Бэкенд работает с ограничениями',
    'health.down': 'Бэкенд недоступен',

    'sidebar.open': 'Открыть меню',
    'sidebar.close': 'Закрыть меню',
    'lang.changed': 'Язык изменён',
    'prof.kicker': 'Аккаунт',
    'prof.brandSub': 'Управление аккаунтом и настройками рабочего пространства',
    'prof.topEyebrow': 'Центр управления',
    'prof.dialogLabel': 'Профиль пользователя',
    'prof.close': 'Закрыть профиль',
    'prof.tabListLabel': 'Разделы профиля',
    'prof.meta.organization': 'Организация',
    'prof.meta.language': 'Язык',
    'prof.meta.plan': 'План',
    'prof.meta.emptyOrg': 'Не указана',
    'prof.meta.noEmail': 'Почта не указана',
    'prof.lang.ru': 'Русский',
    'prof.lang.en': 'Английский',
    'prof.tab.account': 'Аккаунт',
    'prof.tab.accountNote': 'Имя, почта и организация',
    'prof.tab.security': 'Безопасность',
    'prof.tab.securityNote': 'Пароль и защита входа',
    'prof.tab.billing': 'Подписка',
    'prof.tab.billingNote': 'Тариф и лимиты',
    'prof.tab.settings': 'Настройки',
    'prof.tab.settingsNote': 'Интерфейс и поведение',
    'prof.head.account': 'Аккаунт',
    'prof.sub.account': 'Управляйте основными данными и тем, как вы представлены в рабочем пространстве.',
    'prof.head.security': 'Безопасность',
    'prof.sub.security': 'Обновляйте пароль и контролируйте доступ к аккаунту.',
    'prof.head.billing': 'Подписка',
    'prof.sub.billing': 'Выберите тариф под текущую нагрузку и набор доступных моделей.',
    'prof.head.settings': 'Настройки',
    'prof.sub.settings': 'Интерфейс, поведение и конфиденциальность в одном месте.',
    'prof.account.kicker': 'Профиль',
    'prof.account.title': 'Публичный профиль',
    'prof.account.copy': 'Эти данные формируют ваше имя и контекст внутри AI Hub.',
    'prof.account.pillWorkspace': 'Рабочее пространство активно',
    'prof.account.formTitle': 'Основные данные',
    'prof.account.formCopy': 'Обновите имя, почту и организацию, чтобы интерфейс и память агентов опирались на актуальные данные.',
    'prof.email': 'Электронная почта',
    'prof.label.name': 'Имя',
    'prof.label.organization': 'Организация',
    'prof.placeholder.name': 'Ваше имя',
    'prof.placeholder.email': 'name@example.com',
    'prof.placeholder.organization': 'Компания или проект',
    'prof.saveProfile': 'Сохранить изменения',
    'prof.saveDone': 'Сохранено',
    'prof.security.kicker': 'Безопасность',
    'prof.security.title': 'Защита аккаунта',
    'prof.security.copy': 'Смените пароль и держите доступ к рабочему пространству под контролем.',
    'prof.security.currentPassword': 'Текущий пароль',
    'prof.security.newPassword': 'Новый пароль',
    'prof.security.newPasswordHint': 'Минимум 8 символов',
    'prof.security.confirmPassword': 'Подтвердите пароль',
    'prof.security.changeAction': 'Сменить пароль',
    'prof.security.saving': 'Сохраняем...',
    'prof.billing.kicker': 'Подписка',
    'prof.billing.title': 'Текущий тариф',
    'prof.billing.copy': 'Выберите подходящий план под интенсивность работы, число агентов и доступные модели.',
    'prof.billing.currentPlan': 'Сейчас активен',
    'prof.billing.apply': 'Применить тариф',
    'prof.settings.kicker': 'Пространство',
    'prof.settings.title': 'Настройки интерфейса',
    'prof.settings.copy': 'Здесь собраны все параметры поведения интерфейса, моделей и конфиденциальности.',
    'prof.logout': 'Выйти из аккаунта',
    'prof.toast.saved': 'Профиль обновлён',
    'prof.toast.planSaved': 'Тариф обновлён',
    'prof.toast.passwordChanged': 'Пароль изменён',
    'prof.toast.currentPasswordMissing': 'Введите текущий пароль',
    'prof.toast.passwordMin': 'Минимум 6 символов',
    'prof.toast.passwordMismatch': 'Пароли не совпадают',
    'prof.toast.unauthorized': 'Не авторизован',
    'prof.toast.loggedOut': 'Выход из аккаунта',
    'prof.toast.genericError': 'Ошибка',
    'prof.plan.free': 'Бесплатный',
    'prof.plan.freeCopy': 'Базовый доступ к AI Hub для личной работы и быстрых запросов.',
    'prof.plan.pro': 'План Pro',
    'prof.plan.proCopy': 'Основной рабочий тариф с приоритетом, всеми агентами и расширенными моделями.',
    'prof.plan.enterprise': 'Корпоративный',
    'prof.plan.enterpriseCopy': 'Корпоративный пакет с SLA, выделенными ресурсами и расширенной интеграцией.',
    'prof.plan.enterprisePrice': 'По запросу',
    'prof.plan.feature.freeDaily': '50 запросов в день',
    'prof.plan.feature.freeAgents': '3 агента',
    'prof.plan.feature.modelMini': 'GPT-4o mini',
    'prof.plan.feature.unlimited': 'Безлимит',
    'prof.plan.feature.allAgents': 'Все агенты',
    'prof.plan.feature.priority': 'Приоритетная очередь',
    'prof.plan.feature.allModels': 'Все модели',
    'prof.plan.feature.api': 'Доступ к API',
    'prof.plan.feature.support': 'Поддержка 24/7',
    'prof.settingsTab': 'Настройки',
    'common.cancel': 'Отмена',
    'common.attachFile': 'Прикрепить файл',
    'common.voiceInput': 'Голосовой ввод',
    'common.chooseModel': 'Выбрать модель',
    'common.sendPrompt': 'Отправить запрос',
    'common.closeDialog': 'Закрыть диалог',
    'common.copy': 'Скопировать',
    'common.helpful': 'Полезно',
  },
  en: {
    'nav.chat': 'Chat',
    'nav.newChat': 'New chat',
    'nav.agents': 'Agents',
    'nav.settings': 'Settings',
    'nav.searchChats': 'Search chats',
    'btn.newChat': 'New Chat',
    'user.plan': 'Pro Plan',

    'hero.titleAccent': 'One',
    'hero.titleRest': 'workspace for prompts, research, and files',
    'hero.subFull': 'Choose an agent or start with a short prompt. The quick actions below help you begin without an empty screen.',
    'hero.minTitle': 'New chat',
    'hero.promptResearch': 'Research the market',
    'hero.promptCompare': 'Compare approaches',
    'hero.promptFile': 'Review a document',
    'hero.promptImage': 'Inspect an image',
    'chat.placeholder': 'Ask anything...',
    'chat.promptLabel': 'Chat prompt',

    'hist.today': 'Today',
    'hist.yesterday': 'Yesterday',
    'hist.earlier': 'Earlier',
    'hist.empty': 'History is empty for now',
    'hist.searchEmpty': 'No chats found',
    'hist.searchPlaceholder': 'Search chats...',
    'hist.searchClear': 'Clear search',
    'hist.untitled': 'Untitled',
    'hist.renameTitle': 'Rename conversation',
    'hist.renameCopy': 'Update the title so this conversation is easier to find later.',
    'hist.renameAction': 'Save',
    'hist.deleteTitle': 'Delete conversation',
    'hist.deleteCopy': 'This removes the conversation and its messages from history. This action cannot be undone.',
    'hist.deleteAction': 'Delete',
    'hist.fieldLabel': 'Conversation title',
    'hist.renamed': 'Conversation renamed',
    'hist.renameFailed': 'Could not rename conversation',
    'hist.deleted': 'Conversation deleted',
    'hist.deleteFailed': 'Could not delete conversation',
    'hist.loadFailed': 'Could not load conversation',

    'st.interface': 'Interface',
    'st.lightTheme': 'Light Theme',
    'st.lightThemeSub': 'Toggle color scheme',
    'st.lang': 'Language',
    'st.compact': 'Compact Mode',
    'st.compactSub': 'Reduce spacing',
    'st.models': 'Models & Agents',
    'st.autoModel': 'Auto Model',
    'st.autoModelSub': 'Best model for the task',
    'st.temp': 'Temperature',
    'st.memory': 'Agent Memory',
    'st.memorySub': 'Context between sessions',
    'st.voice': 'Voice & Input',
    'st.voiceInput': 'Voice Input',
    'st.voiceInputSub': 'Recognition via microphone',
    'st.enterSend': 'Send on Enter',
    'st.enterSendSub': 'Shift+Enter for new line',
    'st.privacy': 'Privacy',
    'st.history': 'Chat History',
    'st.historySub': 'Save on server',
    'st.analytics': 'Analytics',
    'st.analyticsSub': 'Anonymous usage data',

    'auth.titleMain': 'Authentication',
    'auth.emailLabel': 'Email',
    'auth.emailPlaceholder': 'example@mail.com',
    'auth.passwordPlaceholder': 'Enter password',
    'auth.confirmPassword': 'Repeat password',
    'auth.confirmPasswordLabel': 'Confirm password',
    'auth.welcome': 'Welcome',
    'auth.subtitle': 'Enter your email to continue',
    'auth.continue': 'Continue',
    'auth.signIn': 'Sign in',
    'auth.createAccount': 'Create account',
    'auth.enterPassword': 'Enter password',
    'auth.account': 'Account',
    'auth.changeEmail': '← Change email',
    'auth.noAccount': 'No account yet? Register →',
    'auth.haveAccount': 'Already have an account? Sign in →',
    'auth.creating': 'Creating...',
    'auth.signingIn': 'Signing in...',
    'auth.passwordMin': 'Password must contain at least 6 characters',
    'auth.passwordMismatch': 'Passwords do not match',
    'auth.registrationFailed': 'Registration failed',
    'auth.wrongPassword': 'Wrong password',
    'auth.sessionExpired': 'Session expired, please sign in again',
    'health.ok': 'Backend connected',
    'health.degraded': 'Backend is running in degraded mode',
    'health.down': 'Backend is unavailable',

    'sidebar.open': 'Open menu',
    'sidebar.close': 'Close menu',
    'lang.changed': 'Language changed',
    'prof.kicker': 'Account',
    'prof.brandSub': 'Manage your account and workspace settings',
    'prof.topEyebrow': 'Control center',
    'prof.dialogLabel': 'User profile',
    'prof.close': 'Close profile',
    'prof.tabListLabel': 'Profile sections',
    'prof.meta.organization': 'Organization',
    'prof.meta.language': 'Language',
    'prof.meta.plan': 'Plan',
    'prof.meta.emptyOrg': 'Not specified',
    'prof.meta.noEmail': 'Email not added',
    'prof.lang.ru': 'Russian',
    'prof.lang.en': 'English',
    'prof.tab.account': 'Account',
    'prof.tab.accountNote': 'Name, email, and organization',
    'prof.tab.security': 'Security',
    'prof.tab.securityNote': 'Password and sign-in protection',
    'prof.tab.billing': 'Subscription',
    'prof.tab.billingNote': 'Plan and usage limits',
    'prof.tab.settings': 'Settings',
    'prof.tab.settingsNote': 'Interface and behavior',
    'prof.head.account': 'Account',
    'prof.sub.account': 'Manage the core details that define your workspace identity.',
    'prof.head.security': 'Security',
    'prof.sub.security': 'Update your password and keep account access under control.',
    'prof.head.billing': 'Subscription',
    'prof.sub.billing': 'Choose the plan that matches your workload and model access.',
    'prof.head.settings': 'Settings',
    'prof.sub.settings': 'Interface, behavior, and privacy in one place.',
    'prof.account.kicker': 'Profile',
    'prof.account.title': 'Public profile',
    'prof.account.copy': 'These details shape how you appear inside AI Hub.',
    'prof.account.pillWorkspace': 'Workspace ready',
    'prof.account.formTitle': 'Core details',
    'prof.account.formCopy': 'Update your name, email, and organization so the interface stays relevant.',
    'prof.email': 'Email',
    'prof.label.name': 'Name',
    'prof.label.organization': 'Organization',
    'prof.placeholder.name': 'Your name',
    'prof.placeholder.email': 'name@example.com',
    'prof.placeholder.organization': 'Company or project',
    'prof.saveProfile': 'Save changes',
    'prof.saveDone': 'Saved',
    'prof.security.kicker': 'Security',
    'prof.security.title': 'Protect your account',
    'prof.security.copy': 'Change your password and keep workspace access under control.',
    'prof.security.currentPassword': 'Current password',
    'prof.security.newPassword': 'New password',
    'prof.security.newPasswordHint': 'At least 8 characters',
    'prof.security.confirmPassword': 'Confirm password',
    'prof.security.changeAction': 'Change password',
    'prof.security.saving': 'Saving...',
    'prof.billing.kicker': 'Subscription',
    'prof.billing.title': 'Current plan',
    'prof.billing.copy': 'Pick the right tier for your workload, number of agents, and model access.',
    'prof.billing.currentPlan': 'Currently active',
    'prof.billing.apply': 'Apply plan',
    'prof.settings.kicker': 'Workspace',
    'prof.settings.title': 'Interface settings',
    'prof.settings.copy': 'All interface, model, and privacy controls live here in one place.',
    'prof.logout': 'Sign out',
    'prof.toast.saved': 'Profile updated',
    'prof.toast.planSaved': 'Plan updated',
    'prof.toast.passwordChanged': 'Password changed',
    'prof.toast.currentPasswordMissing': 'Enter the current password',
    'prof.toast.passwordMin': 'At least 6 characters',
    'prof.toast.passwordMismatch': 'Passwords do not match',
    'prof.toast.unauthorized': 'Not authorized',
    'prof.toast.loggedOut': 'Signed out',
    'prof.toast.genericError': 'Error',
    'prof.plan.free': 'Free',
    'prof.plan.freeCopy': 'Basic access to AI Hub for personal use and quick prompts.',
    'prof.plan.pro': 'Pro plan',
    'prof.plan.proCopy': 'Core working tier with all agents, priority, and broader model access.',
    'prof.plan.enterprise': 'Enterprise',
    'prof.plan.enterpriseCopy': 'Corporate tier with SLA, dedicated resources, and deeper integration.',
    'prof.plan.enterprisePrice': 'On request',
    'prof.plan.feature.freeDaily': '50 requests/day',
    'prof.plan.feature.freeAgents': '3 agents',
    'prof.plan.feature.modelMini': 'GPT-4o mini',
    'prof.plan.feature.unlimited': 'Unlimited',
    'prof.plan.feature.allAgents': 'All agents',
    'prof.plan.feature.priority': 'Priority queue',
    'prof.plan.feature.allModels': 'All models',
    'prof.plan.feature.api': 'API access',
    'prof.plan.feature.support': '24/7 support',
    'prof.settingsTab': 'Settings',
    'common.cancel': 'Cancel',
    'common.attachFile': 'Attach file',
    'common.voiceInput': 'Voice input',
    'common.chooseModel': 'Choose model',
    'common.sendPrompt': 'Send prompt',
    'common.closeDialog': 'Close dialog',
    'common.copy': 'Copy',
    'common.helpful': 'Helpful',
  },
};

let curLang = localStorage.getItem('mts-lang') || 'ru';

function t(key, fallback) {
  const dict = LANG[curLang] || LANG.ru;
  if (dict[key] !== undefined) return dict[key];
  if (fallback !== undefined) return fallback;
  return key;
}

function applyLang(code) {
  curLang = LANG[code] ? code : 'ru';
  localStorage.setItem('mts-lang', curLang);
  document.documentElement.setAttribute('data-lang', curLang);

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const value = t(key);
    if (value !== key) el.textContent = value;
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const value = t(key);
    if (value !== key) el.setAttribute('placeholder', value);
  });

  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    const value = t(key);
    if (value !== key) el.setAttribute('title', value);
  });

  document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
    const key = el.getAttribute('data-i18n-aria-label');
    const value = t(key);
    if (value !== key) el.setAttribute('aria-label', value);
  });

  const langVal = document.getElementById('langVal');
  const langSub = document.getElementById('langSub');
  if (langVal) langVal.textContent = curLang === 'ru' ? 'Русский' : 'English';
  if (langSub) langSub.textContent = curLang === 'ru' ? 'Русский выбран' : 'English selected';

  if (typeof selectedModel !== 'undefined' && selectedModel === 'auto' && typeof autoModelLabel === 'function') {
    document.querySelectorAll('.m-name-txt').forEach(el => { el.textContent = autoModelLabel(); });
  }

  if (typeof syncAuthModeTexts === 'function') syncAuthModeTexts();
  if (typeof syncHistoryModalTexts === 'function') syncHistoryModalTexts();
  if (typeof syncHistorySearchUI === 'function') syncHistorySearchUI();
  if (typeof ensureProfileSettingsTab === 'function') ensureProfileSettingsTab();
  if (typeof syncProfileTexts === 'function') syncProfileTexts();
  if (typeof updateSidebarToggleState === 'function') updateSidebarToggleState();
}

function pickLang(e, el, code, label, sub) {
  e.stopPropagation();
  document.getElementById('langVal').textContent = label;
  document.getElementById('langSub').textContent = sub;

  const pop = document.getElementById('pLang');
  pop.querySelectorAll('.sel-opt').forEach(option => {
    option.classList.remove('on');
    option.querySelector('.sel-chk').textContent = '';
  });

  el.classList.add('on');
  el.querySelector('.sel-chk').textContent = '✓';
  pop.classList.remove('open');
  document.getElementById('langBtn').classList.remove('open');
  openPop = null;

  applyLang(code);
  refreshOverlayState();
  toast(`${t('lang.changed', 'Language changed')}: ${label}`, 'ok');
}
