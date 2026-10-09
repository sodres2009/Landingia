'use client';

import { useRef, useState } from 'react';
import type { BuilderElement, LandingPage } from '@/lib/types';
import { api, type ApiIntent } from '@/lib/api';

/**
 * Assistente IA — o agente do editor.
 * Não é um chat passivo: cada pedido produz uma alteração real na página,
 * mostrada como passos de execução (interpretar → pesquisar → selecionar → aplicar).
 * A interpretação do pedido é feita pelo agente no backend (/agent/intent);
 * o regex abaixo é só o fallback quando o backend não responde.
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
  | { kind: 'rewrite'; instruction: string; target: BuilderElement | null; sectionType?: string | null; text?: string | null }
  | { kind: 'image'; instruction: string; target: BuilderElement | null; sectionType?: string | null }
  | { kind: 'section'; instruction: string; sectionType?: string | null }
  | { kind: 'remove_section'; instruction: string; sectionType: string }
  | { kind: 'move_section'; instruction: string; sectionType: string; position: 'top' | 'bottom' }
  | { kind: 'add_field'; instruction: string; sectionType?: string | null; text?: string | null }
  | { kind: 'change_background'; instruction: string }
  | { kind: 'style'; instruction: string; target: BuilderElement | null; sectionType?: string | null; text?: string | null }
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
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [items, setItems] = useState<ChatItem[]>([
    { role: 'bot', text: 'Diz-me o que queres fazer e eu trato do resto: trocar imagens, reescrever textos, criar secções ou recriar a página.' },
  ]);
  const threadRef = useRef<HTMLDivElement>(null);

  // Placeholder enquanto o /agent/intent trabalha — some quando chegam os passos ou a resposta.
  const THINK = '\u0000thinking';
  const isThink = (it: ChatItem) => it.role === 'bot' && it.text === THINK;
  const popThinkIn = (x: ChatItem[]) => {
    const i = x.findLastIndex(isThink);
    if (i < 0) return x;
    const c = [...x];
    c.splice(i, 1);
    return c;
  };
  const popThink = () => setItems((x) => popThinkIn(x));

  function scroll() {
    requestAnimationFrame(() => threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' }));
  }

  async function run(request: AgentRequest) {
    if (busy) return;
    popThink();
    const stepLabels = request.kind === 'image'
      ? ['Interpretar pedido', 'Pesquisar imagens na Internet', 'Selecionar imagem adequada', 'Atualizar a Landing Page']
      : request.kind === 'recreate'
        ? ['Interpretar pedido', 'Novo layout e cores', 'Pesquisar imagens diferentes', 'Recompor a Landing Page']
        : request.kind === 'section'
          ? ['Interpretar pedido', 'Gerar estrutura da secção', 'Adicionar à página']
          : request.kind === 'remove_section'
            ? ['Interpretar pedido', 'Localizar a secção', 'Remover da página']
            : request.kind === 'move_section'
              ? ['Interpretar pedido', 'Localizar a secção', 'Mudar de posição']
              : request.kind === 'add_field'
                ? ['Interpretar pedido', 'Localizar o formulário', 'Adicionar o campo']
                : request.kind === 'style'
                  ? ['Interpretar pedido', 'Localizar o texto', 'Ajustar o tamanho da letra']
                  : request.kind === 'change_background'
                    ? ['Interpretar pedido', 'Desenhar novo visual', 'Aplicar o fundo à página']
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
      const p1 = onRun(request);
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

  /** Pedido do chat → o agente no backend decide a ação; regex só se o backend cair. */
  async function handleSend(text: string) {
    if (!text || busy) return;
    // a mensagem aparece JÁ — a interpretação (/agent/intent custa ~5-10s no router)
    // corre com o balão «a pensar…» visível, nunca com o chat calado à espera.
    setItems((x) => [...x, { role: 'user', text }, { role: 'bot', text: THINK }]);
    scroll();
    let queue: AgentRequest[] = [];
    /** Intent (ação principal ou passo de actions[]) → pedido executável no Builder. */
    const toRequest = (i: ApiIntent): AgentRequest => {
      const target = i.kind === 'rewrite' || i.kind === 'image' ? selected : null;
      return {
        kind: i.kind,
        instruction: text,
        ...(i.kind === 'rewrite' || i.kind === 'image' || i.kind === 'style' ? { target, sectionType: i.section_type, ...(i.kind !== 'image' ? { text: i.text } : {}) } : {}),
        ...(i.kind === 'section' ? { sectionType: i.section_type } : {}),
        ...(i.kind === 'remove_section' ? { sectionType: i.section_type ?? 'social' } : {}),
        ...(i.kind === 'move_section' ? { sectionType: i.section_type ?? 'form', position: (i.position ?? 'bottom') as 'top' | 'bottom' } : {}),
        ...(i.kind === 'add_field' ? { sectionType: i.section_type ?? 'form', text: i.text } : {}),
      } as AgentRequest;
    };
    try {
      const intent = await api.intent({
        instruction: text,
        context: [page.aiContext?.productSummary, page.aiContext?.offer, page.aiContext?.audience].filter(Boolean).join(' · ') || page.objective || null,
        // memória da conversa: o agente lê os últimos turnos para perceber «fica melhor», «outra foto»…
        history: items.filter((it) => it.role === 'user' || it.role === 'bot' || it.role === 'done')
          .slice(-6)
          .map((it) => ({ role: it.role === 'user' ? 'user' : 'bot', text: 'text' in it ? it.text : '' })),
        selection: selected
          ? `${selected.type}: ${String(selected.content.text ?? selected.content.label ?? selected.content.title ?? '').slice(0, 220)}`
          : null,
        sections: page.sections.map((s) => ({
          type: s.type,
          title: s.title,
          excerpt: s.elements
            .map((e) => String(e.content.text ?? e.content.label ?? e.content.title ?? (e.type === 'image' ? `[imagem: ${String(e.content.alt ?? '')}]` : '')))
            .filter(Boolean).join(' | ').slice(0, 400),
        })),
      });
      if (intent.kind === 'ask') {
        setItems((x) => [...popThinkIn(x), { role: 'bot', text: intent.reply || 'Preciso de mais informação para executar isso.' }]);
        scroll();
        return;
      }
      queue = [toRequest(intent), ...(intent.actions ?? []).map(toRequest)];
    } catch {
      queue = [regexFallback(text)];
    }
    for (const req of queue) await run(req);
  }

  function regexFallback(text: string): AgentRequest {
    const lower = text.toLowerCase();
    const aboutPage = /p[áa]gina|landing|inteira|toda|todo o resto/.test(lower);
    const target = selected;
    if (/fundo|cor de fundo|background|mais escuro|mais claro/.test(lower) && !/imagem|foto/.test(lower)) return { kind: 'change_background', instruction: text };
    if (/imagem|foto|banner|fundo/.test(lower)) return { kind: 'image', instruction: text, target };
    if (/remove|tira|apaga|elimina/.test(lower)) return { kind: 'remove_section', instruction: text, sectionType: /testemunh|social|prova/.test(lower) ? 'social' : /pre[cç]o/.test(lower) ? 'pricing' : 'faq' };
    if (/campo/.test(lower)) return { kind: 'add_field', instruction: text, sectionType: 'form', text: /telem[óo]vel|telefone|contacto|n[úu]mero|numero|tel\b/i.test(lower) ? 'Número de telemóvel' : null };
    if (/puxa|move|muda para cima|topo|final|baixo/.test(lower)) return { kind: 'move_section', instruction: text, sectionType: /formul[áa]rio/.test(lower) ? 'form' : 'pricing', position: /cima|topo/.test(lower) ? 'top' : 'bottom' };
    if (!selected ? (/recria|recriar|nova vers|de outra forma|diferente|modific|design|layout/.test(lower) ? true : false) : aboutPage && /recria|recriar|nova vers|design|layout/.test(lower)) return { kind: 'recreate', instruction: text };
    if (!selected || aboutPage) {
      if (/sec[cç][aã]o|secao|adicion|pre[cç]os|precos|faq|formul[áa]rio|formulario/.test(lower)) return { kind: 'section', instruction: text };
    }
    return { kind: 'rewrite', instruction: text, target };
  }

  /** Atalho do menu +: fecha o menu, abre a gaveta e envia o pedido. */
  function quick(text: string) {
    setMenu(false);
    setOpen(true);
    void handleSend(text);
  }

  function ask() {
    setMenu(false);
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setOpen(true);
    void handleSend(text);
  }

  return (
    <div className={`ai-dock${open ? ' open' : ''}`}>
      {open && (
        <div className="ai-sheet">
          <div className="ai-sheet-head">
            <span className="spark2">✨</span><b>Assistente IA</b>
            {busy && <span className="live">A TRABALHAR…</span>}
            <button className="sheet-close" onClick={() => setOpen(false)} title="Fechar conversa">▾</button>
          </div>
          <div className="thread" ref={threadRef}>
            {items.map((it, i) => {
              if (it.role === 'user') return <div className="msg-user" key={i}>{it.text}</div>;
              if (it.role === 'bot') return <div className="msg-ai" key={i}><span className="m">✦</span><div className={isThink(it) ? 'bub think' : 'bub'}>{isThink(it) ? 'A pensar…' : it.text}</div></div>;
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
        </div>
      )}

      <div className="ai-bar">
        {menu && (
          <div className="ai-menu">
            <button className="chip" disabled={busy} onClick={() => quick('Troca a imagem por uma imagem profissional relacionada com o tema.')}>🖼 Alterar imagens</button>
            <button className="chip" disabled={busy} onClick={() => quick('Recria esta página de outra forma, mais moderna, mantendo o produto.')}>🎨 Modificar design</button>
            <button className="chip" disabled={busy} onClick={() => quick('Adiciona uma secção de preços.')}>➕ Adicionar secção</button>
            <button className="chip" disabled={busy} onClick={() => quick('Reescreve para ficar mais curto e direto.')}>✨ Melhorar conteúdo</button>
            <button className="chip" disabled={busy} onClick={() => quick('Torna este texto mais orientado à conversão.')}>📈 Otimizar conversão</button>
            <button className="chip" disabled={busy} onClick={() => quick('Recriar de outra forma.')}>🔄 Recriar de outra forma</button>
          </div>
        )}
        <div className="box">
          <button className={`plus${menu ? ' on' : ''}`} onClick={() => setMenu((m) => !m)} title="Ações rápidas" disabled={busy}>+</button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => { if (e.key === 'Enter') ask(); }}
            placeholder="✨ Pede ao agente: «troca a foto», «encurta o texto», «adiciona preços»…"
          />
          <button className="send" onClick={ask} disabled={busy}>{busy ? '…' : '➤'}</button>
        </div>
      </div>
    </div>
  );
}
