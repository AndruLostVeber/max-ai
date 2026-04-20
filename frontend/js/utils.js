// Shared helpers.

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function autoH(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 180) + 'px';
}

function fmtTime(s) {
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

function scrollBot() {
  const scroll = document.getElementById('chatScroll');
  setTimeout(() => {
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  }, 40);
}

function toast(msg, type, dur) {
  if (type === undefined) type = 'inf';
  if (dur === undefined) dur = 2600;

  const root = document.getElementById('toastRoot');
  if (!root) return;

  const icons = {
    ok: '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
    inf: '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    err: '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  };

  const node = document.createElement('div');
  node.className = 'toast';
  node.innerHTML = `<div class="toast-ic ${type}">${icons[type] || icons.inf}</div><span>${esc(msg)}</span>`;
  root.appendChild(node);

  setTimeout(() => {
    node.classList.add('out');
    node.addEventListener('animationend', () => node.remove(), { once: true });
  }, dur);
}

function burstParticles() {
  const splash = document.getElementById('splash');
  if (!splash) return;

  const cx = splash.clientWidth / 2;
  const cy = splash.clientHeight / 2;
  for (let i = 0; i < 22; i += 1) {
    const particle = document.createElement('div');
    particle.className = 'sp';
    const size = 2 + Math.random() * 4;
    const angle = (Math.PI * 2 / 22) * i + Math.random() * 0.4;
    const dist = 60 + Math.random() * 120;
    const tx = Math.cos(angle) * dist;
    const ty = Math.sin(angle) * dist - 30;
    const duration = (0.5 + Math.random() * 0.5) + 's';
    particle.style.cssText = `width:${size}px;height:${size}px;left:${cx}px;top:${cy}px;--tx2:${tx}px;--ty2:${ty}px;--dur:${duration};`;
    splash.appendChild(particle);
    setTimeout(() => particle.classList.add('burst'), 10);
    setTimeout(() => particle.remove(), 900);
  }
}

const _rippledEls = new WeakSet();
function addRipple(el) {
  if (!el || _rippledEls.has(el)) return;
  _rippledEls.add(el);
  el.classList.add('rh');
  el.addEventListener('click', function handleRipple(e) {
    const rect = this.getBoundingClientRect();
    const ripple = document.createElement('span');
    const size = Math.max(rect.width, rect.height);
    ripple.className = 'rp';
    ripple.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size / 2}px;top:${e.clientY - rect.top - size / 2}px`;
    this.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
  });
}

function refreshOverlayState() {
  const overlay = document.getElementById('ov');
  if (!overlay) return false;

  const sidebarOpen = document.getElementById('sb')?.classList.contains('open');
  const active = Boolean(sidebarOpen);

  overlay.classList.toggle('on', active);
  overlay.dataset.mode = sidebarOpen ? 'sidebar' : '';
  document.body.classList.toggle('has-overlay', active);
  return active;
}

function handleOverlayClick() {
  closeAll();
}

function closeFloatingOverlays() {
  if (openDD) {
    document.getElementById(openDD)?.classList.remove('open');
    openDD = null;
  }
  document.querySelectorAll('.m-pill').forEach(pill => pill.setAttribute('aria-expanded', 'false'));

  if (openPop) {
    document.getElementById(openPop)?.classList.remove('open');
    openPop = null;
  }
  document.querySelectorAll('.sel-btn').forEach(btn => btn.classList.remove('open'));

  refreshOverlayState();
}

function closeAll() {
  closeFloatingOverlays();

  document.getElementById('agModal')?.classList.remove('show');
  const profileOverlay = document.getElementById('profileOverlay');
  if (profileOverlay?.classList.contains('show') && typeof closeProfile === 'function') closeProfile();
  else profileOverlay?.classList.remove('show');
  if (typeof closeHistoryModal === 'function') closeHistoryModal();
  else {
    document.getElementById('historyModal')?.classList.remove('show');
    document.getElementById('historyModal')?.setAttribute('aria-hidden', 'true');
  }

  if (typeof closeSidebar === 'function') closeSidebar();
  refreshOverlayState();
}

document.addEventListener('click', event => {
  if (!openDD && !openPop) return;
  if (event.target.closest('.m-pill-wrap, .m-dd, .sel-wrap, .sel-pop')) return;
  closeFloatingOverlays();
});
