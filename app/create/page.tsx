'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import LandingRender from '@/components/builder/LandingRender';
import PlanReview from '@/components/create/PlanReview';
import StudioThumb from '@/components/builder/StudioThumb';
import type { AiContext, AiPlan } from '@/lib/types';
import { createPageFromPlan, deriveStudioTitle, planToPage, savePage as savePageLocal } from '@/lib/storage';
import type { LandingPage } from '@/lib/types';
import { api, tokenStore, type ApiInterview } from '@/lib/api';
import { extractColors, readImageFile } from '@/lib/browser';

const OBJECTIVES = ['Captar leads', 'Vender produto/serviço', 'Marcar reuniões', 'Divulgar evento', 'Campanha', 'Outro'];
const STYLES = ['Moderno', 'Minimalista', 'Business', 'Elegante', 'Criativo', 'Tecnologia'];
const VARIANT_HINTS = [
  'Abordagem montra: abre com o produto/oferta em destaque e prova visual.',
  'Abordagem autoridade: abre com a dor do cliente, mostra método e depois prova.',
  'Abordagem direta: página curta e assertiva, foco total em conversão.',
];

/** Fluxo Criar: briefing → entrevista do agente → propostas → confirmação → Editor. */
export default function CreatePage() {
  const router = useRouter();
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [docs, setDocs] = useState<Array<{ name: string; url: string }>>([]);
  const [docBusy, setDocBusy] = useState(false);
  const [objective, setObjective] = useState(OBJECTIVES[0]);
  const [style, setStyle] = useState(STYLES[0]);
  const [depth, setDepth] = useState<'short' | 'rich'>('short');
  const [interview, setInterview] = useState<ApiInterview | null>(null);
  const [plans, setPlans] = useState<AiPlan[] | null>(null);
  const [variantIdx, setVariantIdx] = useState(0);
  const plan = plans ? plans[variantIdx] ?? plans[0] : null;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [clientPhotos, setClientPhotos] = useState<string[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [brandColors, setBrandColors] = useState<string[]>([]);
  const [logo, setLogo] = useState<{ url: string; alt?: string } | undefined>();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  // Studio (segundo gerador): modo, páginas geradas e semente de direção artística
  const [mode, setMode] = useState('rapido');
  const [studioPages, setStudioPages] = useState<Array<{ html: string; phone?: string }>>([]);
  const seedRef = useRef(0);
  const runRef = useRef(0);
  const [error, setError] = useState('');

  // Cronómetro enquanto o agente trabalha: a criação pode durar minutos
  // (o router pensa devagar) — sem relógio pareciam 9s de página parada.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!busy) { setElapsed(0); return; }
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [busy]);
  const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;

  // Criar exige conta (páginas, fotos e ficheiros pertencem a alguém).
  useEffect(() => {
    if (!tokenStore.get()) router.replace('/login');
  }, [router]);

  async function uploadLogo(file: File | undefined) {
    if (!file) return;
    try {
      const url = await readImageFile(file);
      const colors = await extractColors(url);
      setLogo({ url, alt: 'Logótipo da empresa' });
      setBrandColors(colors);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar o logótipo.');
    }
  }

  /** Foto do produto/espaço do cliente → fica no topo de tudo quando a página for criada. */
  async function uploadPhoto(file: File | undefined) {
    if (!file) return;
    setPhotoBusy(true);
    setError('');
    try {
      const { url } = await api.uploadPhoto(file);
      setClientPhotos((prev) => (prev.includes(url) ? prev : [...prev, url]));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível enviar a foto.');
    } finally {
      setPhotoBusy(false);
    }
  }

  /** Anexar «qualquer coisa»: imagens vão para o conteúdo; PDF/TXT/CSV ficam linkáveis. */
  async function attachFile(file: File | undefined) {
    if (!file) return;
    setDocBusy(true);
    setError('');
    try {
      if (file.type.startsWith('image/')) {
        const { url } = await api.uploadPhoto(file);
        setClientPhotos((prev) => (prev.includes(url) ? prev : [...prev, url]));
      } else if (file.type === 'application/pdf' || file.type === 'text/plain' || file.type === 'text/csv') {
        const { url } = await api.uploadDoc(file);
        setDocs((prev) => (prev.some((d) => d.url === url) ? prev : [...prev, { name: file.name, url }]));
      } else {
        setError(`«${file.name}» não é aceite por agora — usa imagens, PDF, TXT ou CSV.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível anexar o ficheiro.');
    } finally {
      setDocBusy(false);
    }
  }

  /** Briefing efetivo: descrição + preço literal + anexos nomeados — tudo o que o agente lê. */
  function briefText(): string {
    let text = description.trim();
    if (price.trim()) text += `\nPREÇO OFICIAL (usa literalmente, não inventes outro): ${price.trim()}`;
    if (docs.length) text += `\nDOCUMENTOS DO CLIENTE (linka na página quando fizer sentido, ex.: botão «Ver em PDF»):\n${docs.map((d) => `- ${d.name}: ${d.url}`).join('\n')}`;
    return text;
  }

  /**
   * Propostas em fila, uma por vez: o free tier da IA externa bloqueia
   * chamadas simultâneas (429). Cada proposta aparece assim que estiver
   * pronta — o utilizador vê progresso real em vez de um spinner cego.
   */
  async function runAnalysis(nextAnswers: Record<string, string>, photos: string[] = clientPhotos) {
    setError('');
    setBusy(true);
    setPlans([]);
    const run = ++runRef.current;
    try {
      const context: AiContext = { brandColors, answers: nextAnswers, contentSources: photos };
      const collected: AiPlan[] = [];
      for (let i = 0; i < VARIANT_HINTS.length; i++) {
        setProgress(i === 0 ? 'A montar a estratégia…' : `A escrever a proposta ${i + 1} de ${VARIANT_HINTS.length}…`);
        const plan = await api.plan({ action: 'plan', description: briefText(), objective, style, depth, context, answers: nextAnswers, variantHint: VARIANT_HINTS[i] });
        if (runRef.current !== run) return; // nova análise pedida entretanto
        collected.push(plan as unknown as AiPlan);
        setPlans([...collected]);
        setVariantIdx(0);
        if (i + 1 < VARIANT_HINTS.length) await new Promise((r) => setTimeout(r, 1200)); // fila — free tier não admite paralelismo
      }
    } catch (e) {
      if (runRef.current === run) setError(e instanceof Error ? e.message : 'Não foi possível gerar a análise.');
    } finally {
      if (runRef.current === run) { setBusy(false); setProgress(''); }
    }
  }

  /** 1.º passo: o agente lê o briefing e pergunta só o que não pode inventar. */
  async function analyze() {
    if (!description.trim() && !logo) {
      setError('Descreva o que quer criar ou carregue o logótipo da marca.');
      return;
    }
    setError('');
    setBusy(true);
    setInterview(null);
    setPlans(null);
    setAnswers({});
    try {
      const iv = await api.interview({ description: briefText(), objective, style });
      if (iv.questions.length === 0) {
        setInterview(null);
        await runAnalysis({});
        return;
      }
      setInterview(iv);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível analisar o briefing.');
      await runAnalysis({}); // entrevista falha não bloqueia a criação
    } finally {
      if (!plans) setBusy(false);
    }
  }

  function startFromInterview() {
    const clean = Object.fromEntries(Object.entries(answers).filter(([, v]) => String(v).trim()));
    setInterview(null);
    void runAnalysis(clean);
  }

  function refine() {
    const clean = Object.fromEntries(Object.entries(answers).filter(([, v]) => String(v).trim()));
    void runAnalysis(clean);
  }

  /** Studio: o agente desenha UMA página de HTML livre por clique, direção nova a cada semente. */
  async function runStudio() {
    setError("");
    setBusy(true);
    setProgress("O Studio está a desenhar a tua página…");
    const clean = Object.fromEntries(Object.entries(answers).filter(([, v]) => String(v).trim()));
    try {
      await api.designStream({ description: briefText(), objective, style, depth, answers: clean, context: { brandColors, answers: clean, contentSources: clientPhotos } }, seedRef.current++, (ev) => {
        if (ev.event === "design" && ev.ok) setStudioPages((prev) => [...prev, { html: String(ev.html), phone: ev.phone ? String(ev.phone) : undefined }]);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "O Studio não conseguiu criar a página.");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  /** Adota uma página do Studio: grava como página studio e abre no editor. */
  function adoptStudio(i: number) {
    const sp = studioPages[i];
    if (!sp) return;
    const nowIso = new Date().toISOString();
    // O nome vem do <title>/<h1> que o próprio agente desenhou — o briefing cru
    // («tenho um stand de carro aqui na covilha») não é um título de página.
    const name = (deriveStudioTitle(sp.html) || plans?.[0]?.name || description || "Página Studio").slice(0, 48).trim();
    const page = {
      id: `p-${Date.now().toString(36)}-st`,
      name,
      status: "draft", createdAt: nowIso, updatedAt: nowIso, objective, style,
      kind: "studio", html: sp.html, phone: sp.phone, logo,
      aiContext: { brandColors, answers: { ...answers, __briefing: briefText() }, contentSources: clientPhotos },
    } as unknown as LandingPage;
    savePageLocal(page);
    void api.pageSave(page).catch(() => undefined); // falha de rede não perde a página local
    router.push(`/builder/${page.id}`);
  }

  function create() {
    if (!plan) return;
    const clean = Object.fromEntries(Object.entries(answers).filter(([, v]) => String(v).trim()));
    const page = createPageFromPlan({ plan, style, logo, answers: clean, photos: clientPhotos });
    router.push(`/builder/${page.id}`);
  }

  // Mini-visualizações reais: cada proposta renderizada a sério, em escala.
  const previewPages = useMemo(() => (plans ?? []).map((p) => planToPage({ plan: p, style, logo })), [plans, style, logo]);

  return (
    <main className="shell create-wrap">
      <div className="create-card">
        <span className="spark">✦ AGENTE IA</span>
        <h1>Crie a sua Landing Page com IA</h1>
        <div style={{ display: "flex", gap: 8, margin: "12px 0 2px" }}>
          <button type="button" className={"btn small" + (mode === "rapido" ? " primary" : "")} onClick={() => setMode("rapido")}>⚡ Rápido — editável ao clique</button>
          <button type="button" className={"btn small" + (mode === "studio" ? " primary" : "")} onClick={() => setMode("studio")}>✦ Studio — design livre por IA</button>
        </div>
        <p className="intro">O agente não adivinha: primeiro entende o seu negócio, analisa o que já forneceu e pergunta apenas o que falta para criar uma página completa.</p>

        <div className="field">
          <label>Logótipo da empresa (extrai as cores da marca automaticamente)</label>
          <input type="file" accept="image/*" onChange={(e) => void uploadLogo(e.target.files?.[0])} />
        </div>
        {brandColors.length > 0 && (
          <div style={{ display: 'flex', gap: 6, margin: '4px 0 14px' }}>
            {brandColors.map((c) => <i key={c} title={c} style={{ width: 22, height: 22, borderRadius: 6, background: c, display: 'inline-block', border: '1px solid var(--line)' }} />)}
          </div>
        )}

        <div className="field">
          <label>Descreva o que quer criar</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex.: Quero uma Landing Page para um encontro empresarial sobre IA, com testemunhos de empresários e inscrição gratuita."
          />
        </div>

        <div className="row2">
          <div className="field">
            <label>Preço (o agente usa este valor literal, não inventa outro)</label>
            <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Ex.: 15€ almoço · 22€ jantar · grátis até aos 12" />
          </div>
          <div className="field">
            <label>Ficheiros da marca (imagens, PDF, TXT, CSV)</label>
            <label className="btn small" style={{ cursor: 'pointer', textAlign: 'center' }}>
              {docBusy ? '⏳ A enviar…' : '📎 Anexar ficheiros'}
              <input type="file" multiple hidden accept="image/*,application/pdf,text/plain,text/csv" onChange={(e) => {
                for (const f of Array.from(e.target.files ?? [])) void attachFile(f);
                e.currentTarget.value = '';
              }} />
            </label>
          </div>
        </div>
        {(clientPhotos.length > 0 || docs.length > 0) && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '-6px 0 14px', alignItems: 'center' }}>
            {clientPhotos.map((u) => <img key={u} src={u} alt="Foto anexada" title="Vai para a página" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />)}
            {docs.map((d) => (
              <span key={d.url} title={d.url} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, border: '1px solid var(--line)', borderRadius: 999, padding: '5px 10px' }}>
                📄 {d.name}
                <button className="btn ghost small" style={{ padding: '0 4px' }} onClick={() => setDocs((prev) => prev.filter((x) => x.url !== d.url))} title="Remover">×</button>
              </span>
            ))}
          </div>
        )}

        <div className="row2">
          <div className="field">
            <label>Objetivo</label>
            <select value={objective} onChange={(e) => setObjective(e.target.value)}>{OBJECTIVES.map((o) => <option key={o}>{o}</option>)}</select>
          </div>
          <div className="field">
            <label>Estilo</label>
            <select value={style} onChange={(e) => setStyle(e.target.value)}>{STYLES.map((s) => <option key={s}>{s}</option>)}</select>
          </div>
        </div>

        <label className="field" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={depth === 'rich'} onChange={(e) => setDepth(e.target.checked ? 'rich' : 'short')} />
          Página completa (8-12 secções com demonstração, passos e comparação — demora mais)
        </label>

        {mode === "studio" && (
          <button className="btn primary" onClick={() => void runStudio()} disabled={busy} style={{ marginTop: 12 }}>
            {busy ? `⏳ O Studio está a desenhar… ${clock}` : studioPages.length ? '✦ Outra versão (direção artística nova)' : '✦ Criar com o Studio'}
          </button>
        )}
        {mode === "rapido" && !plans && !interview && (
          <button className="btn primary" onClick={() => void analyze()} disabled={busy}>
            {busy ? `⏳ O agente está a criar… ${clock}` : '✨ Analisar o que é preciso'}
          </button>
        )}

        {error && <div className="error-box">{error}</div>}
        {busy && (
          <div className="agent-working" role="status">
            <span className="aw-dots"><i /><i /><i /></span>
            <div className="aw-text">
              <b>{progress || 'O agente está a trabalhar no teu briefing…'}</b>
              <small>{clock} · pode demorar 1-3 minutos — não feches esta janela</small>
            </div>
          </div>
        )}

        {interview && (
          <div className="interview-box" style={{ marginTop: 18 }}>
            <span className="ai-label">O AGENTE QUER VALIDAR CONTIGO</span>
            {interview.summary && <p className="intro" style={{ margin: '8px 0' }}>Percebi: <b>{interview.summary}</b></p>}
            <p className="intro" style={{ margin: '4px 0 10px' }}>Para não inventar nada, responde só ao que falta — podes saltar e ele cria com o que tem.</p>
            <div className="q-list">
              {interview.questions.map((q) => (
                <div className="q-item" key={q.key || q.question}>
                  <b>{q.question}</b>
                  {q.why && <small>{q.why}</small>}
                  {q.needs === 'photo' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <label className="btn small" style={{ cursor: 'pointer' }}>
                        {photoBusy ? '⏳ A enviar…' : '📎 Anexar fotos'}
                        <input type="file" accept="image/*" multiple hidden onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void uploadPhoto(f);
                          e.currentTarget.value = '';
                        }} />
                      </label>
                      {clientPhotos.map((u) => <img key={u} src={u} alt="Foto enviada" style={{ width: 46, height: 46, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />)}
                    </div>
                  ) : (
                    <input placeholder="A tua resposta (podes saltar)" value={answers[q.key] ?? ''} onChange={(e) => setAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))} />
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn primary" onClick={startFromInterview}>{busy ? `⏳ ${progress || 'A criar…'} ${clock}` : '✨ Criar com as minhas respostas'}</button>
              <button className="btn" onClick={() => { setInterview(null); void runAnalysis({}); }} disabled={busy}>Saltar, cria já</button>
            </div>
          </div>
        )}

        {studioPages.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <span className="ai-label">PÁGINAS DO STUDIO — CADA UMA NASCE DE UMA DIREÇÃO DIFERENTE</span>
            <div className="variant-pick">
              {studioPages.map((sp, i) => (
                <div key={i} className="variant-card on" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <StudioThumb html={sp.html} />
                  <b>Versão {i + 1}</b>
                  <button className="btn primary small" onClick={() => adoptStudio(i)}>Usar esta página</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {plans && plans.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <span className="ai-label">
              {busy && plans.length < VARIANT_HINTS.length ? `PROPOSTAS DO AGENTE (${plans.length}/${VARIANT_HINTS.length})…` : 'PROPOSTAS DO AGENTE — ESCOLHE UMA'}
            </span>
            <div className="variant-pick">
              {plans.map((p, i) => (
                <div
                  key={i}
                  role="button"
                  tabIndex={0}
                  className={`variant-card${i === variantIdx ? ' on' : ''}`}
                  onClick={() => setVariantIdx(i)}
                  onKeyDown={(e) => e.key === 'Enter' && setVariantIdx(i)}
                >
                  <span className="variant-prev" aria-hidden>
                    <LandingRender page={previewPages[i]} options={{ interactive: true }} />
                  </span>
                  <b>{['Montra', 'Autoridade', 'Direta'][i] ?? `Proposta ${i + 1}`}</b>
                  <small>{p.sections.length} secções · {p.cta}</small>
                  <span className="vdots">{p.brandColors.slice(0, 3).map((c) => <i key={c} style={{ background: c }} />)}</span>
                </div>
              ))}
              {busy && plans.length < VARIANT_HINTS.length && (
                <div className="variant-card pending">
                  <span className="variant-prev pending-prev">⏳</span>
                  <b>Proposta {plans.length + 1} — {clock}</b>
                  <small>{progress}</small>
                </div>
              )}
            </div>
          </div>
        )}

        {plan && (
          <PlanReview
            plan={plan}
            answers={answers}
            busy={busy}
            onAnswer={(key, value) => setAnswers((prev) => ({ ...prev, [key]: value }))}
            onRefine={refine}
            onCreate={create}
          />
        )}
      </div>
    </main>
  );
}
