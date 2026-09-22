'use client';

import { useRef, useState } from 'react';
import type { BuilderElement, LandingPage } from '@/lib/types';

/**
 * Assistente IA — o agente do editor.
 * Não é um chat passivo: cada pedido produz uma alteração real na página,
 * mostrada como passos de execução (interpretar → pesquisar → selecionar → aplicar).
 */

export interface AgentAction {
  /** Texto de apoio devolvido pelo motor de IA (rewrite). */
  text?: string;
  /** Nova imagem escolhida pelo motor de imagens para o elemento-alvo. */
  imageUrl?: string;
  /** Secção candidata do pedido de nova secção. */
  sectionDraft?: { type: string; title: string; style?: Record<string, unknown>; elements: Array<{ type: string; content: Record<string, unknown> }> };
}

export type AgentRequest =
  | { kind: 'rewrite'; instruction: string; target: BuilderElement | null }
  | { kind: 'image'; instruction: string; target: BuilderElement | null }
  | { kind: 'section'; instruction: string }
  | { kind: 'recreate'; instruction: string };

type ChatItem = { role: 'user'; text: string } | { role: 'bot'; text: string } | { role: 'steps'; steps: Array<{ label: string; done: boolean; running?: boolean }>; note?: string; thumbUrl?: string } | { role: 'done'; text: string };

export default function AiPanel({
  page,
  selected,
  busy,
  onRun,
}: {
  page: LandingPage;
  selected: BuilderElement | null;
  busy: boolean;
  onRun: (request: AgentRequest) => Promise<AgentAction | string>;
}) {
  const [input, setInput] = useState('');
  const [items, setItems] = useState<ChatItem[]>([
    { role: 'bot', text: 'Diz-me o que queres fazer e eu trato do resto: trocar imagens, reescrever textos, criar secções ou recriar a página.' },
  ]);
  const threadRef = useRef<HTMLDivElement>(null);

  function scroll() {
    requestAnimationFrame(() => threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' }));
  }

  async function run(kind: AgentRequest['kind'], instruction: string) {
    if (busy) return;
    const target = kind === 'rewrite' || kind === 'image' ? selected : null;
    if ((kind === 'rewrite' || kind === 'image') && !target) {
      setItems((x) => [...x, { role: 'user', text: instruction }, { role: 'bot', text: 'Seleciona primeiro um elemento na página (clica nele no canvas) e volta a pedir.' }]);
      scroll();
      return;
    }
    setItems((x) => [...x, { role: 'user', text: instruction }]);
    const stepLabels = kind === 'image'
      ? ['Interpretar pedido', 'Pesquisar imagens na Internet', 'Selecionar imagem adequada', 'Atualizar a Landing Page']
      : kind === 'recreate'
        ? ['Interpretar pedido', 'Novo layout e cores', 'Pesquisar imagens diferentes', 'Recompor a Landing Page']
        : kind === 'section'
          ? ['Interpretar pedido', 'Gerar estrutura da secção', 'Adicionar à página']
          : ['Interpretar pedido', 'Reescrever conteúdo', 'Atualizar elemento'];
    setItems((x) => [...x, { role: 'steps', steps: stepLabels.map((label, i) => ({ label, done: false, running: i === 0 })) }]);
    scroll();

    const advance = (thumbUrl?: string) => {
      setItems((x) => {
        const copy = [...x];
        const idx = copy.findLastIndex((it) => it.role === 'steps');
        if (idx < 0) return x;
        const st = copy[idx] as Extract<ChatItem, { role: 'steps' }>;
        const firstOpen = st.steps.findIndex((s) => !s.done);
        const steps = st.steps.map((s, i) => (i < firstOpen ? s : i === firstOpen ? { ...s, done: true, running: false } : i === firstOpen + 1 ? { ...s, running: true } : s));
        copy[idx] = { ...st, steps, thumbUrl: thumbUrl ?? st.thumbUrl };
        return copy;
      });
      scroll();
    };

    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    try {
      const p1 = onRun({ kind, instruction, target: kind === 'rewrite' || kind === 'image' ? target : undefined } as AgentRequest);
      await wait(250); advance();
      const result = await p1;
      await wait(200); advance(typeof result === 'object' ? result.imageUrl : undefined);
      await wait(200); advance();
      await wait(150); advance();
      const message = typeof result === 'string' ? result : 'Alteração aplicada com sucesso. O resto da página ficou intacto.';
      setItems((x) => [...x, { role: 'done', text: `✓ ${message}` }]);
    } catch (e) {
      setItems((x) => [...x, { role: 'bot', text: `Não consegui aplicar isso: ${e instanceof Error ? e.message : 'erro inesperado'}.` }]);
    }
    scroll();
  }

  function submit() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    const lower = text.toLowerCase();
    // Com um elemento selecionado, a regra é mexer SÓ nesse elemento.
    // Alterações globais (recriar/secção) só com pedido explícito da página.
    const aboutPage = /p[áa]gina|landing|inteira|toda|todo o resto/.test(lower);
    const kind: AgentRequest['kind'] = /imagem|foto|banner|fundo/.test(lower) ? 'image'
      : !selected ? (/recria|recriar|nova vers|de outra forma|diferente|modific|design|layout/.test(lower) ? 'recreate'
          : /sec[cç][aã]o|secao|adicion|pre[cç]os|precos|faq|formul[áa]rio|formulario/.test(lower) ? 'section'
          : 'rewrite')
      : aboutPage && /recria|recriar|nova vers|design|layout/.test(lower) ? 'recreate'
      : aboutPage && /sec[cç][aã]o|adicion/.test(lower) ? 'section'
      : 'rewrite';
    void run(kind, text);
  }

  return (
    <aside className="ai">
      <div className="ai-head">
        <div className="t"><span className="spark2">✨</span><b>Assistente IA</b><span className="live">AGENTE ATIVO</span></div>
        <p>Diz-me o que queres fazer e eu trato do resto.</p>
      </div>

      <div className="chips">
        <button className="chip" disabled={busy} onClick={() => void run('image', 'Troca a imagem por uma imagem profissional relacionada com o tema.')}>🖼 Alterar imagens</button>
        <button className="chip" disabled={busy} onClick={() => void run('recreate', 'Recria esta página de outra forma, mais moderna, mantendo o produto.')}>🎨 Modificar design</button>
        <button className="chip" disabled={busy} onClick={() => void run('section', 'Adiciona uma secção de preços.')}>➕ Adicionar secções</button>
        <button className="chip" disabled={busy} onClick={() => void run('rewrite', 'Reescreve para ficar mais curto e direto.')}>✨ Melhorar conteúdo</button>
        <button className="chip" disabled={busy} onClick={() => void run('rewrite', 'Torna este texto mais orientado à conversão.')}>📈 Otimizar conversão</button>
      </div>

      <div className="thread" ref={threadRef}>
        {items.map((it, i) => {
          if (it.role === 'user') return <div className="msg-user" key={i}>{it.text}</div>;
          if (it.role === 'bot') return <div className="msg-ai" key={i}><span className="m">✦</span><div className="bub">{it.text}</div></div>;
          if (it.role === 'done') return <div className="msg-ok" key={i}>{it.text}</div>;
          return (
            <div className="steps" key={i}>
              <div className="st">A EXECUTAR</div>
              {it.steps.map((s, j) => (
                <div className={`step${s.running ? ' run' : ''}`} key={j}><span className="ck">{s.done ? '✓' : ''}</span>{s.label}</div>
              ))}
              {it.thumbUrl && (
                <div className="found-row" style={{ border: 0, paddingTop: 4 }}>
                  <div>
                    <small>Pré-visualização da imagem escolhida:</small>
                    <div className="found-row" style={{ border: 0, padding: 0 }}><img className="thumb pick" style={{ width: 96, height: 60 }} src={it.thumbUrl} alt="Imagem escolhida" /></div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="ai-input">
        <div className="box">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            placeholder="Descreve o que queres alterar ou melhorar…"
          />
          <button className="send" onClick={submit} disabled={busy}>➤</button>
        </div>
        <div className="quick">
          <button className="qbtn" disabled={busy} onClick={() => void run('image', 'Pesquisa uma imagem melhor para este elemento.')}>🌐 Pesquisar imagens</button>
          <button className="qbtn" disabled={busy} onClick={() => void run('recreate', 'Recriar de outra forma.')}>🔄 Recriar de outra forma</button>
          <button className="qbtn" disabled={busy} onClick={() => void run('rewrite', 'Otimiza esta página para conversão.')}>✨ Otimizar página</button>
        </div>
      </div>
    </aside>
  );
}
