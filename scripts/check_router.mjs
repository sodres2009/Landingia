/**
 * Valida a cabeça FactorRouter: conta, plano via cloud e turno registado.
 * Lê a chave do .env.local (nunca a imprime — só os 8 primeiros caracteres).
 * Uso: node scripts/check_router.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const API = 'https://app-d76b73421919.factorai.cloud';
const ROUTER = 'https://router-dev.factorai.cloud';

const env = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
const pick = (k) => env.split('\n').find((l) => l.startsWith(k + '='))?.split('=').slice(1).join('=').trim() ?? '';
const key = pick('AI_API_KEY');
const appId = pick('FACTOR_APP_ID') || 'landing-ai';
if (!key.startsWith('sk-fai')) {
  console.log('⚠ .env.local ainda aponta para o Groq (gsk_…) — colocar lá a chave sk-fai do router antes de correr este check.');
  process.exit(1);
}
console.log('chave:', key.slice(0, 8) + '…', '| app:', appId);

// 1) conta no router
const acct = await fetch(`${ROUTER}/v1/account`, { headers: { Authorization: `Bearer ${key}` } });
console.log('GET /v1/account →', acct.status, acct.ok ? JSON.stringify(await acct.json()).slice(0, 220) : (await acct.text()).slice(0, 200));

// 2) plano pela app cloud via SSE (o POST normal apanha 504 do edge em pedidos longos)
let plan = null; let lastErr = '';
for (let i = 0; i < 2 && !plan; i++) {
  const r = await fetch(`${API}/agent/plan/stream?variants=1`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ description: 'Pequeno café de bairro em Lisboa, tostas e café galão 1,20€.', objective: 'Captar leads', style: 'Moderno', depth: 'short' }),
    signal: AbortSignal.timeout(300000),
  });
  if (!r.ok) { lastErr = `${r.status} ${(await r.text()).slice(0, 120)}`; continue; }
  const reader = r.body.getReader(); const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, nl).trim(); buf = buf.slice(nl + 2);
      if (!chunk.startsWith('data:')) continue;
      const ev = JSON.parse(chunk.slice(5));
      if (ev.event === 'plan') { if (!ev.ok) { lastErr = ev.error; break; } plan = ev.plan; }
    }
    if (plan) break;
  }
}
if (!plan) { console.log('POST /agent/plan/stream (cloud) →', lastErr); process.exit(1); }
console.log('POST /agent/plan/stream →', plan.sections.length, 'secções ✓');

// 3) o turno apareceu nos logs de custo do router
const logs = await fetch(`${ROUTER}/usage/logs?app_id=${encodeURIComponent(appId)}&limit=5`, { headers: { Authorization: `Bearer ${key}` } });
if (logs.ok) {
  const body = await logs.json();
  const items = Array.isArray(body) ? body : body.logs ?? body.items ?? body.results ?? [];
  console.log(`GET /usage/logs → ${items.length} turno(s) recentes`, items.length ? '✓ custo a ser registado' : '⚠ sem turnos ainda (pode demorar a propagar)');
} else {
  console.log('GET /usage/logs →', logs.status, '(a chave de app pode não ter acesso a usage — verificar no admin)');
}
