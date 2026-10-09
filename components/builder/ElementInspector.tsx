'use client';

import { useState } from 'react';
import { uid } from '@/lib/storage';
import { api } from '@/lib/api';
import type { BuilderElement, BuilderSection, ElementType } from '@/lib/types';

/**
 * Inspector: edição do elemento selecionado e adição/remoção de elementos.
 * Cada tipo de elemento conhece os seus próprios campos — sem formulários
 * genéricos que escondem o que está a ser editado.
 */

const TYPE_LABELS: Record<ElementType, string> = {
  text: 'Texto', list: 'Lista', button: 'Botão', image: 'Imagem', video: 'Vídeo', form: 'Formulário',
  scheduling: 'Agendamento', modal: 'Modal', testimonials: 'Testemunhos', faq: 'FAQ',
  pricing: 'Preços', gallery: 'Galeria', map: 'Mapa', social: 'Redes', stats: 'Números', marquee: 'Marcas', countdown: 'Contagem decrescente', float: 'Botão WhatsApp',
  demo: 'Demonstração', steps: 'Passos', comparison: 'Comparação', quote: 'Citação',
  chart: 'Gráfico', footer: 'Rodapé', custom: 'Custom',
};

export function newElement(type: ElementType): BuilderElement {
  const content: Record<string, unknown> = {
    text: { text: 'Novo texto', level: 'body' },
    list: { items: [{ icon: '✓', text: 'Primeiro ponto' }, { icon: '✓', text: 'Segundo ponto' }] },
    stats: { items: [{ value: '10+', label: 'clientes satisfeitos' }, { value: '98%', label: 'recomendam' }, { value: '24h', label: 'resposta média' }] },
    marquee: { items: ['Marca A', 'Marca B', 'Marca C', 'Marca D'] },
    button: { label: 'Clique aqui', url: '#', variant: 'primary' },
    image: { url: '', alt: '' },
    video: { url: '' },
    form: { title: 'Formulário', fields: [{ label: 'Nome', type: 'text', required: true }, { label: 'Email', type: 'email', required: true }], submit: 'ENVIAR', success: 'Obrigado!', consent: true },
    scheduling: { title: 'Marcar reunião', fields: [], submit: 'Confirmar', success: 'Ficou agendado!' },
    modal: { title: 'Modal', text: 'Conteúdo do modal.' },
    testimonials: { items: [{ name: 'Nome', role: 'Empresa', text: 'Testemunho real.' }] },
    faq: { items: [{ q: 'Pergunta?', a: 'Resposta.' }] },
    pricing: { plans: [{ name: 'Plano', price: '€0', features: ['Funcionalidade'] }] },
    gallery: { images: [{ url: '', alt: '' }] },
    map: { query: 'Lisboa, Portugal' },
    social: { links: [] },
    demo: { title: 'Painel', items: [{ who: 'ai', text: 'O que precisas hoje?' }, { who: 'me', text: 'Quero fechar três orçamentos até sexta.' }, { who: 'ai', text: 'Feito — aqui estão os teus números.' }], stats: [{ value: '12', label: 'propostas ativas' }, { value: '4,9★', label: 'satisfação' }, { value: '-38%', label: 'tempo perdido' }] },
    steps: { items: [{ title: 'Fala connosco', text: 'Descreves o que precisas, sem formulários intermináveis.' }, { title: 'Recebes a proposta', text: 'Orçamento claro em 24 horas, sem surpresas.' }, { title: 'Está resolvido', text: 'Tratamos de tudo e acompanhamos até ao fim.' }] },
    comparison: { left: { title: 'Sem nós', items: ['Horas perdidas em burocracia', 'Respostas em dias', 'Erros que custam dinheiro'] }, right: { title: 'Com nós', items: ['Tudo tratado num só sítio', 'Resposta em minutos', 'Acompanhamento com provas'] } },
    quote: { text: 'Desde que trabalhámos com eles, fechamos o dobro dos negócios no mesmo tempo.', author: 'Nome do cliente', role: 'Cargo, Empresa' },
    chart: { title: 'Uso por equipa', items: [{ label: 'Equipa A', value: 10 }, { label: 'Equipa B', value: 6 }], unit: '' },
    footer: { cols: [{ title: 'Produto', items: [{ label: 'Funcionalidades', url: '#funcionalidades' }] }], note: 'Feito com atenção ao detalhe.' },
    custom: { text: '' },
  };
  return { id: uid(), type, content: content[type] as Record<string, unknown> };
}

function Input({ label, value, onChange, area }: { label: string; value: string; onChange: (v: string) => void; area?: boolean }) {
  return (
    <div className="field">
      <label>{label}</label>
      {area
        ? <textarea style={{ minHeight: 60 }} value={value} onChange={(e) => onChange(e.target.value)} />
        : <input value={value} onChange={(e) => onChange(e.target.value)} />}
    </div>
  );
}

export default function ElementInspector({
  section,
  element,
  onChange,
  onRemove,
  onAdd,
  onMoveElement,
}: {
  section: BuilderSection;
  element: BuilderElement;
  onChange: (patch: Record<string, unknown>) => void;
  onRemove: () => void;
  onAdd: (type: ElementType) => void;
  onMoveElement: (dir: -1 | 1) => void;
}) {
  const c = element.content;
  const set = (key: string) => (v: string) => onChange({ ...c, [key]: v });

  const fields = Array.isArray(c.fields) ? (c.fields as Array<Record<string, unknown>>) : [];

  function setField(i: number, key: string, value: string | boolean) {
    const next = fields.map((f, j) => (i === j ? { ...f, [key]: value } : f));
    onChange({ ...c, fields: next });
  }

  return (
    <div className="inspector">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4>✎ {TYPE_LABELS[element.type].toUpperCase()}</h4>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn ghost small" onClick={() => onMoveElement(-1)} title="Subir">↑</button>
          <button className="btn ghost small" onClick={() => onMoveElement(1)} title="Descer">↓</button>
          <button className="btn danger small" onClick={onRemove}>×</button>
        </div>
      </div>

      {element.type === 'text' && (
        <>
          <Input label="Texto" value={String(c.text ?? '')} onChange={set('text')} area />
          <div className="field">
            <label>Nível</label>
            <select value={String(c.level ?? 'body')} onChange={(e) => onChange({ ...c, level: e.target.value })}>
              <option value="heading">Título principal</option>
              <option value="title">Título</option>
              <option value="subtitle">Subtítulo</option>
              <option value="body">Corpo</option>
            </select>
          </div>
        </>
      )}

      {(element.type === 'button' || element.type === 'modal') && (
        <>
          <Input label={element.type === 'button' ? 'Etiqueta' : 'Título'} value={String(c.label ?? c.title ?? '')} onChange={set(element.type === 'button' ? 'label' : 'title')} />
          {element.type === 'button' && <Input label="Link (URL ou #form)" value={String(c.url ?? '')} onChange={set('url')} />}
          {element.type === 'modal' && <Input label="Texto" value={String(c.text ?? '')} onChange={set('text')} area />}
        </>
      )}

      {element.type === 'image' && (
        <>
          <Input label="URL da imagem" value={String(c.url ?? '')} onChange={set('url')} />
          <PhotoUpload onPicked={(url, alt) => onChange({ ...c, url, alt: alt || String(c.alt ?? '') })} />
          <Input label="Descrição (alt)" value={String(c.alt ?? '')} onChange={set('alt')} />
          <p className="intro" style={{ margin: 0 }}>💡 Para trocar a imagem por outra adequada, use o Assistente IA à direita.</p>
        </>
      )}

      {element.type === 'video' && <Input label="URL de embed (YouTube etc.)" value={String(c.url ?? '')} onChange={set('url')} />}

      {element.type === 'map' && <Input label="Localização" value={String(c.query ?? '')} onChange={set('query')} />}

      {(element.type === 'form' || element.type === 'scheduling') && (
        <>
          <Input label="Título" value={String(c.title ?? '')} onChange={set('title')} />
          <Input label="Texto do botão" value={String(c.submit ?? '')} onChange={set('submit')} />
          <Input label="Mensagem de sucesso" value={String(c.success ?? '')} onChange={set('success')} />
          <label style={{ display: 'flex', gap: 8, fontSize: 12, alignItems: 'center', marginBottom: 10 }}>
            <input type="checkbox" checked={Boolean(c.consent)} onChange={(e) => onChange({ ...c, consent: e.target.checked })} />
            Campos de nome, email, empresa e telefone (fixos neste MVP)
          </label>
          <span className="ai-label">CAMPOS</span>
          {fields.map((f, i) => (
            <div className="social-row" key={i} style={{ gridTemplateColumns: '1fr 90px auto' }}>
              <input value={String(f.label ?? '')} onChange={(e) => setField(i, 'label', e.target.value)} />
              <select value={String(f.type ?? 'text')} onChange={(e) => setField(i, 'type', e.target.value)}>
                <option value="text">Texto</option><option value="email">Email</option>
                <option value="tel">Telefone</option><option value="date">Data</option>
                <option value="time">Hora</option><option value="textarea">Área</option>
              </select>
              <button className="btn danger small" onClick={() => onChange({ ...c, fields: fields.filter((_, j) => j !== i) })}>×</button>
            </div>
          ))}
          <button className="btn ghost small" onClick={() => onChange({ ...c, fields: [...fields, { label: 'Novo campo', type: 'text', required: false }] })}>+ campo</button>
        </>
      )}

      {element.type === 'faq' && (
        <>
          {((c.items ?? []) as Array<Record<string, unknown>>).map((q, i) => (
            <div key={i} style={{ marginBottom: 10, border: '1px solid var(--line)', borderRadius: 10, padding: 10 }}>
              <Input label="Pergunta" value={String(q.q ?? '')} onChange={(v) => onChange({ ...c, items: (c.items as unknown[]).map((x, j) => (i === j ? { ...(x as object), q: v } : x)) })} />
              <Input label="Resposta" value={String(q.a ?? '')} area onChange={(v) => onChange({ ...c, items: (c.items as unknown[]).map((x, j) => (i === j ? { ...(x as object), a: v } : x)) })} />
            </div>
          ))}
          <button className="btn ghost small" onClick={() => onChange({ ...c, items: [...((c.items ?? []) as unknown[]), { q: 'Nova pergunta?', a: 'Resposta.' }] })}>+ pergunta</button>
        </>
      )}

      {element.type === 'testimonials' && (
        <>
          {((c.items ?? []) as Array<Record<string, unknown>>).map((t, i) => (
            <div key={i} style={{ marginBottom: 10, border: '1px solid var(--line)', borderRadius: 10, padding: 10 }}>
              <Input label="Nome" value={String(t.name ?? '')} onChange={(v) => onChange({ ...c, items: (c.items as unknown[]).map((x, j) => (i === j ? { ...(x as object), name: v } : x)) })} />
              <Input label="Cargo/Empresa" value={String(t.role ?? '')} onChange={(v) => onChange({ ...c, items: (c.items as unknown[]).map((x, j) => (i === j ? { ...(x as object), role: v } : x)) })} />
              <Input label="Testemunho" value={String(t.text ?? '')} area onChange={(v) => onChange({ ...c, items: (c.items as unknown[]).map((x, j) => (i === j ? { ...(x as object), text: v } : x)) })} />
            </div>
          ))}
          <button className="btn ghost small" onClick={() => onChange({ ...c, items: [...((c.items ?? []) as unknown[]), { name: 'Nome', role: 'Empresa', text: 'Testemunho.' }] })}>+ testemunho</button>
        </>
      )}

      {element.type === 'pricing' && (
        <>
          {((c.plans ?? []) as Array<Record<string, unknown>>).map((p, i) => (
            <div key={i} style={{ marginBottom: 10, border: '1px solid var(--line)', borderRadius: 10, padding: 10 }}>
              <Input label="Nome do plano" value={String(p.name ?? '')} onChange={(v) => onChange({ ...c, plans: (c.plans as unknown[]).map((x, j) => (i === j ? { ...(x as object), name: v } : x)) })} />
              <Input label="Preço" value={String(p.price ?? '')} onChange={(v) => onChange({ ...c, plans: (c.plans as unknown[]).map((x, j) => (i === j ? { ...(x as object), price: v } : x)) })} />
              <Input label="Funcionalidades (uma por linha)" value={((p.features ?? []) as unknown[]).map(String).join('\n')} area
                onChange={(v) => onChange({ ...c, plans: (c.plans as unknown[]).map((x, j) => (i === j ? { ...(x as object), features: v.split('\n').filter(Boolean) } : x)) })} />
            </div>
          ))}
          <button className="btn ghost small" onClick={() => onChange({ ...c, plans: [...((c.plans ?? []) as unknown[]), { name: 'Novo plano', price: '€0', features: [] }] })}>+ plano</button>
        </>
      )}

      {element.type === 'gallery' && (
        <>
          {((c.images ?? []) as Array<Record<string, unknown>>).map((g, i) => (
            <div className="social-row" key={i} style={{ gridTemplateColumns: '1fr auto' }}>
              <input value={String(g.url ?? '')} placeholder="URL da imagem" onChange={(e) => onChange({ ...c, images: (c.images as unknown[]).map((x, j) => (i === j ? { ...(x as object), url: e.target.value } : x)) })} style={{ background: 'var(--bg2)', border: '1px solid var(--line)', borderRadius: 9, padding: '9px 11px', fontSize: 12.5, color: 'var(--txt)' }} />
              <button className="btn danger small" onClick={() => onChange({ ...c, images: (c.images as unknown[]).filter((_, j) => j !== i) })}>×</button>
            </div>
          ))}
          <button className="btn ghost small" onClick={() => onChange({ ...c, images: [...((c.images ?? []) as unknown[]), { url: '', alt: '' }] })}>+ imagem</button>
        </>
      )}

      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
        <span className="ai-label">ADICIONAR À SECÇÃO “{section.title}”</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
          {(['text', 'list', 'button', 'image', 'video', 'stats', 'marquee', 'demo', 'steps', 'comparison', 'quote', 'chart', 'footer', 'form', 'scheduling', 'testimonials', 'faq', 'pricing', 'gallery', 'map', 'modal', 'social', 'custom'] as ElementType[]).map((t) => (
            <button key={t} className="chip" onClick={() => onAdd(t)}>{TYPE_LABELS[t]}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Botão «usar uma foto minha» — envia para o servidor e preenche a imagem. */
function PhotoUpload({ onPicked }: { onPicked: (url: string, alt?: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="field" style={{ gap: 6 }}>
      <label>Usar uma foto do teu produto/espaço</label>
      <label className="btn small" style={{ cursor: 'pointer', alignSelf: 'flex-start' }}>
        {busy ? '⏳ A enviar…' : '📎 Enviar foto'}
        <input
          type="file"
          accept="image/*"
          hidden
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.currentTarget.value = '';
            if (!f) return;
            setBusy(true);
            setError('');
            api.uploadPhoto(f)
              .then(({ url }) => onPicked(url, f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ')))
              .catch((err) => setError(err instanceof Error ? err.message : 'Falha ao enviar.'))
              .finally(() => setBusy(false));
          }}
        />
      </label>
      {error && <small style={{ color: '#f87171' }}>{error}</small>}
    </div>
  );
}
