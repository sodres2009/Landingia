/* Testa /agent/intent com comandos PT reais, como o utilizador os escreve. */
const BASE = process.env.API_BASE || 'http://127.0.0.1:8100';
const SECTIONS = [
  { type: 'hero', title: 'Venda o seu carro em 72 horas' },
  { type: 'benefits', title: 'Porquê nós' },
  { type: 'social', title: 'Testemunhos de clientes' },
  { type: 'pricing', title: 'Planos' },
  { type: 'faq', title: 'Perguntas frequentes' },
  { type: 'form', title: 'Pedido de orçamento' },
];
// retry: o free tier da Groq devolve 502 quando fatiado — não é bug do endpoint.
const post = async (b) => {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(BASE + '/agent/intent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b), signal: AbortSignal.timeout(120000) });
    const txt = await r.text();
    try { return JSON.parse(txt); } catch { await new Promise((x) => setTimeout(x, 4000)); } // gateway 502 → recuar e repetir
  }
  throw new Error('API indisponível após 5 tentativas');
};

const cases = [
  ['Muda o título do Hero para Moradias chave-na-mão em 9 meses', 'rewrite', 'hero', 'Moradias'],
  ['Remove os testemunhos', 'remove_section', 'social', null],
  ['Adiciona uma secção de preços com três planos', 'section', 'pricing', null],
  ['Puxa o formulário de contacto para o topo da página', 'move_section', 'form', null, 'top'],
  ['Troca a imagem do Hero por uma conferência empresarial moderna', 'image', 'hero', null],
  ['Recria a página de outra forma', 'recreate', null, null],
];
for (const [text, wantKind, wantSec, wantText, wantPos] of cases) {
  const d = await post({ instruction: text, selection: null, sections: SECTIONS });
  const ok = d.kind === wantKind && (wantSec === undefined || d.section_type === wantSec) && (!wantText || String(d.text ?? '').includes(wantText)) && (!wantPos || d.position === wantPos);
  console.log(`${ok ? 'OK ' : 'FALHA'} "${text}" → kind=${d.kind} sec=${d.section_type} text=${JSON.stringify(String(d.text ?? '').slice(0, 40))} pos=${d.position ?? '-'}`);
}
