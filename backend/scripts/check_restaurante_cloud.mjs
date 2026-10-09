/* Regressão cloud: briefing de restaurante → sem NIF no conteúdo, sem perguntas de nome/email. */
const API = 'https://app-d76b73421919.factorai.cloud';
const r = await fetch(`${API}/agent/plan`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    description: 'Restaurante de comida alentejana no centro de Alvalade, Lisboa. Especialidades: migas, porco preto e ensopado de borrego. Objetivo: receber marcações de mesa.',
    objective: 'Marcações de mesa', style: 'Moderno', depth: 'rich',
    answers: { preco: 'Refeições entre 15€ e 22€' },
  }),
  signal: AbortSignal.timeout(300000),
});
if (!r.ok) { console.log('HTTP', r.status); process.exit(1); }
const plan = (await r.json()).plans[0].plan;
const els = plan.sections.flatMap((s) => s.elements);
const all = JSON.stringify(els).toLowerCase();
const qBad = plan.questions.filter((q) => /nome|email|whatsapp|telefone|telemov|contacto/i.test(q.question));
console.log('checklist:', plan.questions.map((q) => q.question));
console.log(qBad.length === 0 ? '✓ zero perguntas de dados do visitante' : `✗ ${JSON.stringify(qBad)}`);
console.log(/nif|contribuinte|iban/.test(all) ? '✗ NIF/IBAN no conteúdo' : '✓ zero NIF/IBAN no conteúdo');
console.log(/15€|15 €|22€/.test(all) ? '✓ preço real do cliente presente' : '⚠ preço ausente (verificar)');
