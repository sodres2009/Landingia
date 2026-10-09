/* E2E do backend FastAPI: plan real, rewrite, imagem, publicar→visita→lead. */
const BASE = process.env.BASE || 'http://127.0.0.1:8100';
const log = (...a) => console.log(...a);
const post = async (p, b) => { const r = await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b), signal: AbortSignal.timeout(240000) }); return { status: r.status, data: await r.json().catch(() => ({})) }; };

const t0 = Date.now();
const plan = await post('/agent/plan', { description: 'academia de jiu-jitsu brasileiro no Porto, aulas para adultos', objective: 'Marcar aula experimental', style: 'Moderno' });
const p = plan.data.plans?.[0]?.plan ?? {};
log('plan: http=' + plan.status + ' seccoes=' + (p.sections?.length ?? 0) + ' nome=' + p.name + ' (' + ((Date.now() - t0) / 1000).toFixed(1) + 's)');
log('  layouts: ' + (p.sections ?? []).map((s) => s.style?.layout ?? 'stack').join(','));
log('  hero: ' + String(p.sections?.[0]?.elements?.find((e) => e.type === 'text')?.content?.text ?? '').split('\n')[0].slice(0, 70));
const imgs = (p.sections ?? []).flatMap((s) => s.elements).filter((e) => e.type === 'image');
log('  imagens=' + imgs.length + ' pexels=' + imgs.filter((e) => String(e.content.url).includes('pexels')).length + ' loremflickr=' + JSON.stringify(plan.data).includes('loremflickr'));

const rw = await post('/agent/rewrite', { instruction: 'mais direta', current: 'Temos as melhores aulas de jiu-jitsu da cidade para todos os níveis.', context: { audience: 'adultos 25-45', cta: 'Marcar aula experimental' } });
log('rewrite: http=' + rw.status + ' texto="' + String(rw.data.text ?? rw.data.error ?? '').slice(0, 80) + '"');

const img = await post('/agent/image', { instruction: 'dois praticantes com kimono a treinar uma projecao no tapete', objective: 'Marcar aula', context: { productSummary: 'academia de jiu-jitsu' }, exclude: [] });
log('image: http=' + img.status + ' source=' + img.data.source + ' url=' + String(img.data.url).slice(0, 70) + ' alt=' + String(img.data.alt).slice(0, 60));

const sec = await post('/agent/section', { description: 'secção com os horários das aulas', objective: 'Marcar aula', context: { productSummary: 'academia de jiu-jitsu' } });
log('section: http=' + sec.status + ' type=' + sec.data.section?.type + ' elementos=' + (sec.data.section?.elements?.length ?? 0) + ' erro=' + (sec.data.error ?? 'nenhum'));

const slug = 'apitest-' + Date.now().toString(36);
if (p.sections?.length) {
  const pub = await post('/publish', { slug, page: { id: slug, name: p.name, status: 'published', sections: p.sections } });
  const v1 = await post('/visit', { slug });
  const formSec = p.sections.find((s) => s.elements.some((e) => e.type === 'form'));
  const formEl = formSec?.elements?.find((e) => e.type === 'form');
  const lead = await post('/leads', { slug, sectionId: formSec?.id, elementId: formEl?.id, values: { nome: 'Ana API', email: 'ana@api.pt' } });
  const list = await (await fetch(BASE + '/published')).json();
  const row = (list.pages ?? []).find((x) => x.slug === slug);
  log('publicar=' + pub.data.ok + ' visitas=' + v1.data.visits + ' lead=' + lead.data.ok + ' listagem(visitas/leads)=' + row?.visits + '/' + row?.leads);
  await post('/unpublish', { slug });
}
