/* Inspeciona a página em edição: estilos por secção + cores do plano. */
const BASE = process.env.API_BASE || 'http://127.0.0.1:8100';
const pages = (await (await fetch(`${BASE}/pages`)).json()).pages;
const p = pages.find((x) => /lançamento|lancamento|outono/i.test(x.name)) ?? pages[0];
console.log('página:', p?.name, '| páginas em BD:', pages.length);
if (!p) process.exit(0);
console.log('brandColors:', JSON.stringify(p.aiContext?.brandColors ?? null));
for (const s of p.sections ?? []) {
  console.log(`- ${s.type} «${(s.title ?? '').slice(0, 40)}» style=${JSON.stringify(s.style)} els=${s.elements.map((e) => e.type).join(',')}`);
}
