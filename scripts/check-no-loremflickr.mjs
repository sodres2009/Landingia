/* Fase 0: prova que nenhuma geração devolve LoremFlickr e que jiu-jitsu sai com foto decente. */
const BASE = process.env.BASE || 'http://localhost:3005';
const log = (...a) => console.log(...a);

const plan = await (await fetch(BASE + '/api/ai', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'plan', description: 'academia de jiu-jitsu brasileiro em Lisboa, aulas para adultos e crianças', objective: 'Marcar aula experimental', style: 'Moderno' }),
  signal: AbortSignal.timeout(180000),
})).json();
const imgs = (plan.sections ?? []).flatMap((s) => s.elements).filter((e) => e.type === 'image' || e.type === 'gallery')
  .flatMap((e) => e.type === 'image' ? [String(e.content.url ?? '')] : (e.content.images ?? []).map((g) => String(g.url ?? '')));
log('plan: source=' + plan.source + ' imagens=' + imgs.length);
for (const u of imgs) log('  ' + u.slice(0, 90));
log('loremflickr-no-plan=' + (JSON.stringify(plan).includes('loremflickr') ? 'SIM (FALHOU)' : 'não'));

const img = await (await fetch(BASE + '/api/ai', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'image', instruction: 'troca por uma foto de treino de jiu-jitsu com kimono', objective: 'Marcar aula experimental', context: { productSummary: 'academia de jiu-jitsu' }, exclude: [] }),
  signal: AbortSignal.timeout(120000),
})).json();
log('image: fonte-esperda=pexels|curated url=' + img.url + ' alt=' + img.alt);
log('loremflickr-na-image=' + (String(img.url).includes('loremflickr') ? 'SIM (FALHOU)' : 'não'));
