'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import LandingRender from '@/components/builder/LandingRender';
import PlanReview from '@/components/create/PlanReview';
import type { AiContext, AiPlan } from '@/lib/types';
import { createPageFromPlan, planToPage } from '@/lib/storage';
import { extractColors, readImageFile } from '@/lib/browser';

const OBJECTIVES = ['Captar leads', 'Vender produto/serviço', 'Marcar reuniões', 'Divulgar evento', 'Campanha', 'Outro'];
const STYLES = ['Moderno', 'Minimalista', 'Business', 'Elegante', 'Criativo', 'Tecnologia'];
const VARIANT_HINTS = [
  'Abordagem montra: abre com o produto/oferta em destaque e prova visual.',
  'Abordagem autoridade: abre com a dor do cliente, mostra método e depois prova.',
  'Abordagem direta: página curta e assertiva, foco total em conversão.',
];

/** Fluxo Criar: briefing → análise do agente → checklist → confirmação → Editor. */
export default function CreatePage() {
  const router = useRouter();
  const [description, setDescription] = useState('');
  const [objective, setObjective] = useState(OBJECTIVES[0]);
  const [style, setStyle] = useState(STYLES[0]);
  const [plans, setPlans] = useState<AiPlan[] | null>(null);
  const [variantIdx, setVariantIdx] = useState(0);
  const plan = plans ? plans[variantIdx] ?? plans[0] : null;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [brandColors, setBrandColors] = useState<string[]>([]);
  const [logo, setLogo] = useState<{ url: string; alt?: string } | undefined>();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const runRef = useRef(0);
  const [error, setError] = useState('');

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

  /**
   * Propostas em fila, uma por vez: o free tier da IA externa bloqueia
   * chamadas simultâneas (429). Cada proposta aparece assim que estiver
   * pronta — o utilizador vê progresso real em vez de um spinner cego.
   */
  async function runAnalysis(nextAnswers: Record<string, string>) {
    setError('');
    setBusy(true);
    setPlans([]);
    const run = ++runRef.current;
    try {
      const context: AiContext = { brandColors, answers: nextAnswers };
      const collected: AiPlan[] = [];
      for (let i = 0; i < VARIANT_HINTS.length; i++) {
        setProgress(i === 0 ? 'A montar a estratégia…' : `A escrever a proposta ${i + 1} de ${VARIANT_HINTS.length}…`);
        const res = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'plan', description, objective, style, context, answers: nextAnswers, variantHint: VARIANT_HINTS[i] }),
        });
        const data = (await res.json()) as Record<string, unknown>;
        if (!res.ok) throw new Error(String(data.error ?? 'Erro ao analisar o briefing.'));
        if (runRef.current !== run) return; // nova análise pedida entretanto
        collected.push(data as unknown as AiPlan);
        setPlans([...collected]);
        setVariantIdx(0);
      }
    } catch (e) {
      if (runRef.current === run) setError(e instanceof Error ? e.message : 'Não foi possível gerar a análise.');
    } finally {
      if (runRef.current === run) { setBusy(false); setProgress(''); }
    }
  }

  function analyze() {
    if (!description.trim() && !logo) {
      setError('Descreva o que quer criar ou carregue o logótipo da marca.');
      return;
    }
    setAnswers({});
    void runAnalysis({});
  }

  function refine() {
    const clean = Object.fromEntries(Object.entries(answers).filter(([, v]) => String(v).trim()));
    void runAnalysis(clean);
  }

  function create() {
    if (!plan) return;
    const clean = Object.fromEntries(Object.entries(answers).filter(([, v]) => String(v).trim()));
    const page = createPageFromPlan({ plan, style, logo, answers: clean });
    router.push(`/builder/${page.id}`);
  }

  // Mini-visualizações reais: cada proposta renderizada a sério, em escala.
  const previewPages = useMemo(() => (plans ?? []).map((p) => planToPage({ plan: p, style, logo })), [plans, style, logo]);

  return (
    <main className="shell create-wrap">
      <div className="create-card">
        <span className="spark">✦ AGENTE IA</span>
        <h1>Crie a sua Landing Page com IA</h1>
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
            <label>Objetivo</label>
            <select value={objective} onChange={(e) => setObjective(e.target.value)}>{OBJECTIVES.map((o) => <option key={o}>{o}</option>)}</select>
          </div>
          <div className="field">
            <label>Estilo</label>
            <select value={style} onChange={(e) => setStyle(e.target.value)}>{STYLES.map((s) => <option key={s}>{s}</option>)}</select>
          </div>
        </div>

        <button className="btn primary" onClick={analyze} disabled={busy}>
          {busy ? `⏳ ${progress || 'O agente está a analisar…'}` : '✨ Analisar o que é preciso'}
        </button>

        {error && <div className="error-box">{error}</div>}

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
                  <b>Proposta {plans.length + 1}</b>
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
