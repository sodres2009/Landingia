/* Regressão cloud: briefing JÁ com telefone/email/preço → entrevista não pode voltar a perguntá-los. */
const API = 'https://app-d76b73421919.factorai.cloud';
let r;
for (let i = 0; i < 4; i++) {
  r = await fetch(`${API}/agent/interview`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: 'Restaurante de comida alentejana em Alvalade, Lisboa. Reservas pelo telefone 266 000 000 '
        + 'ou email reservas@herdadedafonte.pt. Menu de almoço 15€, jantares 22€. Nome: Herdade da Fonte.',
      objective: 'Marcações de mesa', style: 'Moderno',
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (r.ok) break;
  if (r.status !== 502) break;
  await new Promise((s) => setTimeout(s, 4000)); // free tier 502 em rajada
}
if (!r.ok) { console.log('HTTP', r.status); process.exit(1); }
const iv = await r.json();
const qs = (iv.questions ?? []).map((q) => q.question);
console.log('perguntas:', qs.length ? qs : '(nenhuma — segue direto para o plano)');
const bad = qs.filter((q) => /telefone|telem|whatsapp|email|contacto|pre[çc]o|quanto custa/i.test(q));
console.log(bad.length === 0 ? '✓ nada do que o cliente já deu foi re-perguntado' : `✗ redundantes: ${bad.join(' | ')}`);
