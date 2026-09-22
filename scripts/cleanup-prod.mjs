// Um uso: confirmar/cleanup de slugs de teste na produção.
const BASE = 'https://app-ed93ae2db29d.factorai.cloud';
const list = await (await fetch(BASE + '/api/publish')).json();
console.log('publicadas:', JSON.stringify((list.pages ?? []).map((p) => p.slug)));
for (const s of process.argv.slice(2)) {
  const r = await fetch(BASE + '/api/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'unpublish', slug: s }) });
  console.log('unpublish', s, '→', r.status, JSON.stringify(await r.json()));
}
const after = await (await fetch(BASE + '/api/publish')).json();
console.log('depois:', JSON.stringify((after.pages ?? []).map((p) => p.slug)));
