// Regressão: página no formato antigo (sem style.layout) publica, serve e não parte.
const BASE = process.env.BASE ?? 'http://localhost:3005';
const slug = 'regressao-' + Date.now().toString(36);
const oldSections = [
  { id: 's1', type: 'hero', title: 'Bem-vindo', elements: [
    { id: 'e1', type: 'text', content: { text: 'Título antigo', level: 'heading' } },
    { id: 'e2', type: 'button', content: { label: 'Saber mais', url: '#', variant: 'primary' } }] },
  { id: 's2', type: 'faq', title: 'Perguntas', elements: [
    { id: 'e4', type: 'faq', content: { items: [{ q: 'Funciona?', a: 'Sim.' }] } }] },
];
const pubRes = await fetch(BASE + '/api/publish', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'publish', slug, page: { id: slug, name: 'Antiga', status: 'published', sections: oldSections } }),
});
console.log('publicar: http=' + pubRes.status + ' ok=' + ((await pubRes.json()).ok === true));

const pageRes = await fetch(`${BASE}/p/${slug}`);
const html = await pageRes.text();
console.log('url-publica: http=' + pageRes.status + ' sem-erro-500=' + (pageRes.status === 200 && !html.includes('Application error')));

const storedRes = await fetch(`${BASE}/api/publish?slug=${slug}`);
const stored = await storedRes.json();
// O ficheiro publicado envolve a página: { page: { page: {...}, publishedAt } }.
const secs = stored?.page?.page?.sections ?? stored?.page?.sections ?? [];
const layouts = secs.map((s) => s.style?.layout ?? 'stack');
console.log('stored: http=' + storedRes.status + ' seccoes=' + secs.length + ' layouts=' + layouts.join(','));
console.log('fallback-stack=' + layouts.every((l) => l === 'stack'));

await fetch(BASE + '/api/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'unpublish', slug }) });
console.log('limpeza feita');
