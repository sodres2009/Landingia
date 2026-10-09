/* Editor: criar secção via /agent/section deve cumprir o contrato (tipos + content). */
const BASE = 'https://app-d76b73421919.factorai.cloud';
const r = await fetch(`${BASE}/agent/section`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    description: 'adiciona uma secção de preços com 2 planos',
    objective: 'Vender inscrições',
    context: { productSummary: 'Curso online de copywriting, 6 semanas, 149€', audience: 'freelancers', cta: 'INSCREVER' },
  }),
  signal: AbortSignal.timeout(180000),
});
if (!r.ok) { console.log('FALHOU', r.status, (await r.text()).slice(0, 200)); process.exit(1); }
const rawText = await r.text();
let body;
try { body = JSON.parse(rawText); } catch { console.log('nao-JSON', r.status, rawText.slice(0, 200)); process.exit(1); }
const sec = body.section ?? body;
const TYPES = new Set(['text', 'list', 'button', 'image', 'video', 'stats', 'marquee', 'form', 'scheduling', 'testimonials', 'faq', 'pricing', 'gallery', 'map', 'modal', 'social', 'demo', 'steps', 'comparison', 'quote', 'custom']);
let bad = 0;
for (const el of sec.elements) {
  if (!TYPES.has(el.type)) { console.log('✗ tipo inválido:', el.type); bad++; }
  if (el.type === 'pricing' && !(Array.isArray(el.content?.plans) && el.content.plans.length >= 2)) { console.log('✗ pricing sem plans[]'); bad++; }
}
console.log(`layout=${sec.style?.layout} | tipos: ${sec.elements.map((e) => e.type).join(',')}`);
console.log(bad === 0 && sec.elements.length > 0 ? '✓ secção cumpre o contrato' : `✗ ${bad} problemas`);
