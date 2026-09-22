'use client';

import type { AiPlan } from '@/lib/types';

/**
 * Revisão do plano: análise da IA + checklist do que falta + estrutura
 * sugerida. As perguntas são opcionais — o utilizador pode avançar sempre.
 */
export default function PlanReview({
  plan,
  answers,
  busy,
  onAnswer,
  onRefine,
  onCreate,
}: {
  plan: AiPlan;
  answers: Record<string, string>;
  busy: boolean;
  onAnswer: (key: string, value: string) => void;
  onRefine: () => void;
  onCreate: () => void;
}) {
  const questions = plan.questions ?? [];
  return (
    <div className="plan">
      <div className="plan-head">
        <div>
          <span className="ai-label">ANÁLISE DO AGENTE</span>
          <h2>{plan.name}</h2>
        </div>
        <span className={`badge ${plan.source === 'local' ? 'draft' : 'published'}`}>
          {plan.source === 'local' ? 'MOTOR LOCAL' : 'IA EXTERNA'}
        </span>
      </div>

      <div className="plan-facts">
        <div><b>OBJETIVO</b><span>{plan.objective}</span></div>
        <div><b>PÚBLICO</b><span>{plan.audience}</span></div>
        <div><b>CTA</b><span>{plan.cta}</span></div>
      </div>

      <span className="ai-label">CHECKLIST DE INFORMAÇÃO</span>
      {questions.length === 0 ? (
        <div className="note" style={{ marginTop: 10 }}>✓ Informação suficiente para montar a página. Pode avançar para o Editor.</div>
      ) : (
        <>
          <p className="intro" style={{ margin: '8px 0' }}>O agente encontrou pontos que melhoram a página. Responda ao que souber — pode deixar campos em branco.</p>
          <div className="q-list">
            {questions.map((q) => (
              <div className="q-item" key={q.key}>
                <b>{q.question}</b>
                <small>{q.why}</small>
                <input value={answers[q.key] ?? ''} placeholder={q.placeholder} onChange={(e) => onAnswer(q.key, e.target.value)} />
              </div>
            ))}
          </div>
          <button className="btn ghost" onClick={onRefine} disabled={busy}>
            {busy ? '⏳ O agente está a atualizar…' : '🧠 Atualizar plano com as respostas'}
          </button>
        </>
      )}

      <h3 style={{ margin: '18px 0 6px', fontSize: 14 }}>Estrutura sugerida</h3>
      <div className="sug-list">
        {plan.sections.map((s, i) => (
          <div key={i}><b>{i + 1}.</b> {s.title}</div>
        ))}
      </div>

      <button className="btn primary" onClick={onCreate}>🚀 Criar esta Landing Page no Editor</button>
    </div>
  );
}
