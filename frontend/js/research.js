const RESEARCH_STEP_LABELS = {
  1: '🔍 Генерирую подзапросы…',
  2: '📋 Подзапросы готовы',
  3: '🌐 Ищу и парсю страницы…',
  4: '📄 Страницы получены',
  5: '🧠 Синтезирую ответ…',
};

async function doDeepResearch(query, ci) {
  isStreaming = true;
  const el = document.createElement('div');
  el.className = 'msg';
  el.innerHTML = `<div class="msg-av ai">AI</div><div class="msg-body"><div class="msg-meta"><span class="msg-sender">Deep Research</span><span class="msg-badge">Deep Research</span></div><div class="msg-bbl" id="researchProg" style="line-height:1.75"><div style="color:var(--muted)">🔍 Начинаю исследование...</div></div></div>`;
  ci.appendChild(el); scrollBot();
  const prog = document.getElementById('researchProg');

  try {
    const resp = await fetch(`${API}/research`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ query, user_id: currentUserId || 'anonymous' }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP ${resp.status}`);
    }

    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = ''; let evType = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('event:')) {
          evType = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          try {
            const data = JSON.parse(line.slice(5).trim());

            if (evType === 'done') {
              // Final answer — render as markdown
              prog.innerHTML = renderMd(data.answer || 'Готово.');
              currentMessages.push({ role: 'assistant', content: data.answer || '' });
              fireSaveMessage('assistant', data.answer || '', 'deep-research');
              scrollBot();

            } else if (evType === 'progress') {
              const step = data.step;
              const div = document.createElement('div');
              div.style.cssText = 'color:var(--muted);font-size:12.5px;margin:3px 0';
              let msg = RESEARCH_STEP_LABELS[step] || '';
              if (step === 2 && data.sub_queries?.length) {
                // Show first 3 subqueries
                msg += ': ' + data.sub_queries.slice(0, 3).map(q => `"${q}"`).join(', ');
                if (data.sub_queries.length > 3) msg += ` +${data.sub_queries.length - 3}`;
              } else if (step === 4) {
                const pages = data.pages_fetched ?? 0;
                msg = `📄 Страниц спарсено: ${pages}`;
              } else if (data.message) {
                msg = data.message;
              }
              if (msg) { div.textContent = msg; prog.appendChild(div); scrollBot(); }

            } else if (evType === 'error') {
              // FIX: explicitly handle error events
              const errDiv = document.createElement('div');
              errDiv.style.cssText = 'color:var(--red);font-size:12.5px;margin:3px 0';
              errDiv.textContent = '⚠ ' + (data.message || 'Ошибка исследования');
              prog.appendChild(errDiv); scrollBot();
              toast('Deep Research: ' + (data.message || 'ошибка'), 'err', 4000);
            }
          } catch {}
          evType = '';
        }
      }
    }
  } catch (e) {
    prog.innerHTML = `<span style="color:var(--red)">⚠ Ошибка: ${esc(e.message)}</span>`;
    toast('Deep Research: ошибка', 'err');
  } finally { isStreaming = false; }
}

