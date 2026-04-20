// ══════════════════════════════════════════════
//  memory.js — long-term memory (load, build, extract)
// ══════════════════════════════════════════════

async function loadMemory() {
  if (!currentUserId) return;
  try {
    const r = await fetch(`${API}/memory/${currentUserId}`, { headers: authHeaders() });
    if (r.ok) {
      const d = await r.json();
      userMemory = d.memories || [];
    }
  } catch {}
}

function buildMemoryBlock() {
  if (!userMemory.length) return null;
  const top = userMemory.slice(0, 10);
  return 'Факты о пользователе:\n' + top.map(m => `- ${m.key}: ${m.value}`).join('\n');
}

function fireExtractMemory(assistantText) {
  if (!currentUserId || !assistantText || assistantText.length < 30) return;
  fetch(`${API}/memory/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      user_id: currentUserId,
      conv_id: currentConvId,
      assistant_message: assistantText,
    }),
  }).catch(() => {});
}
