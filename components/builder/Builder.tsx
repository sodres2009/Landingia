'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import AiPanel, { type AgentAction, type AgentRequest } from './AiPanel';
import DesignModal, { type DesignPreset } from './DesignModal';
import ElementInspector, { newElement } from './ElementInspector';
import LandingRender, { layoutsForType, layoutLabel } from './LandingRender';
import SocialModal from './SocialModal';
import { pickImage } from '@/lib/ai/images';
import { extractColors, readImageFile } from '@/lib/browser';
import { uid } from '@/lib/storage';
import type { BuilderElement, DeviceMode, LandingPage, SocialLink } from '@/lib/types';

/**
 * Builder: orquestrador do editor. Mantém o estado da página (com undo e
 * auto-save), a seleção, e executa as ações do agente IA no documento real.
 */

const UNDO_LIMIT = 20;

export default function Builder({ page: initialPage, onSave }: { page: LandingPage; onSave: (page: LandingPage) => void }) {
  const [page, setPage] = useState<LandingPage>(initialPage);
  const [device, setDevice] = useState<DeviceMode>('desktop');
  const [selected, setSelected] = useState<{ sectionId: string; elementId: string } | null>(null);
  const [history, setHistory] = useState<LandingPage[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showDesign, setShowDesign] = useState(false);
  const [showSocial, setShowSocial] = useState(false);
  const [toast, setToast] = useState('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRender = useRef(true);

  /* auto-save com debounce */
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      onSave(page);
      setSavedAt(new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }));
    }, 800);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [page, onSave]);

  const commit = useCallback((next: LandingPage, recordHistory = true) => {
    if (recordHistory) setHistory((h) => [...h.slice(-UNDO_LIMIT + 1), page]);
    setPage(next);
  }, [page]);

  function undo() {
    setHistory((h) => {
      if (!h.length) return h;
      setPage(h[h.length - 1]);
      return h.slice(0, -1);
    });
  }

  const selectedSection = page.sections.find((s) => s.id === selected?.sectionId) ?? null;
  const selectedElement = selectedSection?.elements.find((e) => e.id === selected?.elementId) ?? null;

  function updateElementContent(sectionId: string, elementId: string, content: Record<string, unknown>) {
    commit({
      ...page,
      sections: page.sections.map((s) => s.id !== sectionId ? s : { ...s, elements: s.elements.map((e) => e.id !== elementId ? e : { ...e, content }) }),
    });
  }

  function removeElement(sectionId: string, elementId: string) {
    commit({
      ...page,
      sections: page.sections
        .map((s) => s.id !== sectionId ? s : { ...s, elements: s.elements.filter((e) => e.id !== elementId) })
        .filter((s) => s.elements.length > 0),
    });
    setSelected(null);
  }

  function addElement(sectionId: string, type: BuilderElement['type']) {
    const el = newElement(type);
    commit({
      ...page,
      sections: page.sections.map((s) => s.id !== sectionId ? s : { ...s, elements: [...s.elements, el] }),
    });
    setSelected({ sectionId, elementId: el.id });
  }

  function moveElement(sectionId: string, elementId: string, dir: -1 | 1) {
    commit({
      ...page,
      sections: page.sections.map((s) => {
        if (s.id !== sectionId) return s;
        const i = s.elements.findIndex((e) => e.id === elementId);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= s.elements.length) return s;
        const els = [...s.elements];
        [els[i], els[j]] = [els[j], els[i]];
        return { ...s, elements: els };
      }),
    });
  }

  function removeSection(sectionId: string) {
    if (page.sections.length <= 1) return;
    if (!window.confirm('Remover esta secção?')) return;
    commit({ ...page, sections: page.sections.filter((s) => s.id !== sectionId) });
    setSelected(null);
  }

  function toggleSection(sectionId: string) {
    commit({ ...page, sections: page.sections.map((s) => s.id === sectionId ? { ...s, hidden: !s.hidden } : s) }, false);
  }

  function setSectionLayout(sectionId: string, layout: string) {
    commit({
      ...page,
      sections: page.sections.map((s) => s.id === sectionId ? { ...s, style: { ...s.style, layout: layout === 'stack' ? undefined : layout } } : s),
    });
  }

  function applyPreset(preset: DesignPreset, scope: 'all' | 'current') {
    const target = selected?.sectionId;
    commit({
      ...page,
      sections: page.sections.map((s) => (scope === 'all' || s.id === target) ? { ...s, style: { ...s.style, ...preset.style } } : s),
    });
  }

  async function uploadLogo(file: File | undefined) {
    if (!file) return;
    try {
      const url = await readImageFile(file);
      const colors = await extractColors(url);
      commit({
        ...page,
        logo: { url, alt: 'Logótipo' },
        aiContext: { ...page.aiContext, brandColors: colors.length ? colors : page.aiContext?.brandColors },
      });
      flash('Logótipo carregado — cores da marca extraídas.');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Falha ao carregar o logótipo.');
    }
  }

  function flash(text: string) {
    setToast(text);
    setTimeout(() => setToast(''), 2600);
  }

  function usedImages(): string[] {
    const urls: string[] = [];
    page.sections.forEach((s) => s.elements.forEach((e) => {
      if (typeof e.content.url === 'string' && e.content.url.startsWith('http')) urls.push(e.content.url);
      if (Array.isArray(e.content.images)) (e.content.images as Array<Record<string, unknown>>).forEach((g) => { if (typeof g.url === 'string') urls.push(g.url); });
    }));
    return urls;
  }

  /* ─────────── ações do agente ─────────── */

  async function runAgent(request: AgentRequest): Promise<AgentAction | string> {
    setBusy(true);
    try {
      if (request.kind === 'image') {
        const target = request.target as BuilderElement;
        // O agente lê a intenção em linguagem natural e decide as tags de
        // pesquisa — o dicionário PT→EN fica só como rede de segurança.
        const res = await fetch('/api/ai', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'image', instruction: request.instruction, objective: page.objective, context: page.aiContext, exclude: usedImages() }),
        });
        const data = (await res.json()) as { url?: string; alt?: string; source?: string; error?: string };
        if (!res.ok || !data.url) throw new Error(data.error ?? 'Falha na pesquisa de imagem.');
        if (target.type === 'gallery') {
          const images = Array.isArray(target.content.images) ? (target.content.images as Array<Record<string, unknown>>) : [];
          updateElementContent(selected!.sectionId, target.id, { ...target.content, images: [{ url: data.url, alt: data.alt ?? '' }, ...images] });
        } else {
          updateElementContent(selected!.sectionId, target.id, { ...target.content, url: data.url, alt: data.alt ?? page.aiContext?.productSummary ?? 'Imagem da página' });
        }
        return { imageUrl: data.url };
      }

      if (request.kind === 'rewrite') {
        const target = request.target as BuilderElement;
        const current = String(target.content.text ?? target.content.label ?? '');
        const res = await fetch('/api/ai', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'rewrite', instruction: request.instruction, current, context: page.aiContext }),
        });
        const data = (await res.json()) as { text?: string; error?: string };
        if (!res.ok || !data.text) throw new Error(data.error ?? 'Falha na reescrita.');
        const key = target.type === 'button' ? 'label' : 'text';
        updateElementContent(selected!.sectionId, target.id, { ...target.content, [key]: data.text });
        return { text: data.text };
      }

      if (request.kind === 'section') {
        const res = await fetch('/api/ai', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'section', description: request.instruction, objective: page.objective, context: page.aiContext }),
        });
        const data = (await res.json()) as { section?: AgentAction['sectionDraft']; error?: string };
        if (!res.ok || !data.section) throw new Error(data.error ?? 'Falha ao criar a secção.');
        const draft = data.section;
        const section = {
          id: uid(), type: draft.type, title: draft.title,
          style: draft.style as LandingPage['sections'][number]['style'],
          elements: draft.elements.map((e) => ({ id: uid(), type: e.type as BuilderElement['type'], content: e.content })),
        };
        commit({ ...page, sections: [...page.sections.slice(0, -1), section, ...page.sections.slice(-1)] });
        return { sectionDraft: draft };
      }

      // recreate: nova composição, mesmas informações reais, imagens diferentes
      const res = await fetch('/api/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'plan',
          description: `${page.aiContext?.productSummary ?? page.name}. ${page.aiContext?.offer ?? ''} Recriar com layout e imagens diferentes, ${request.instruction}`,
          objective: page.objective ?? 'Captar leads',
          style: 'Moderno',
          context: page.aiContext,
        }),
      });
      const plan = (await res.json()) as Record<string, unknown>;
      if (!res.ok || !Array.isArray(plan.sections)) throw new Error(String(plan.error ?? 'Falha ao recriar.'));
      const exclude = usedImages();
      const sections = (plan.sections as LandingPage['sections']).map((s, i) => ({
        ...s,
        id: uid(),
        style: i % 2 === 0 ? { ...s.style, background: '#0e1830', accent: '#5d54d8' } : { ...s.style, background: '#f5f7fb' },
        elements: (s.elements ?? []).map((e) => ({
          ...e, id: uid(),
          content: e.type === 'image'
            ? { ...e.content, url: pickImage(`${page.objective} ${request.instruction}`, exclude, i) }
            : e.content,
        })),
      }));
      commit({ ...page, sections });
      setSelected(null);
      return 'Página recriada com nova composição — produto e informações preservados.';
    } finally {
      setBusy(false);
    }
  }

  /* ─────────── UI ─────────── */

  const status = page.status;

  /** Publica no servidor (URL pública real) ou despublica, conforme o estado. */
  async function togglePublish() {
    if (status === 'published') {
      if (page.publishedSlug) {
        try {
          await fetch('/api/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'unpublish', slug: page.publishedSlug }) });
        } catch {
          // offline: a URL deixa de servir assim que o servidor responder.
        }
      }
      const next = { ...page, status: 'draft' as const };
      commit(next, false); onSave(next); flash('Página despublicada');
      return;
    }
    setBusy(true);
    try {
      const slug = page.publishedSlug
        ?? `${page.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'pagina'}-${page.id.slice(-4)}`;
      const res = await fetch('/api/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'publish', slug, page }) });
      if (!res.ok) throw new Error(String((await res.json() as { error?: string }).error ?? 'Falha ao publicar.'));
      const next = { ...page, status: 'published' as const, publishedSlug: slug };
      commit(next, false); onSave(next);
      flash(`Publicada ✓ abre em qualquer dispositivo: /p/${slug}`);
    } catch (error) {
      flash(error instanceof Error ? `Falha ao publicar: ${error.message}` : 'Falha ao publicar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="editor">
      <header className="topbar">
        <Link href="/" className="logo"><span className="mark">✦</span><b>Landing<em>AI</em></b></Link>
        <div className="page-name" style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
          <input
            value={page.name}
            onChange={(e) => commit({ ...page, name: e.target.value }, false)}
            style={{ background: 'transparent', border: 0, outline: 0, color: 'var(--txt)', fontWeight: 700, fontSize: 13, width: 220 }}
          />
          <small style={{ fontSize: 10.5, color: 'var(--dim)' }}>{savedAt ? `guardado ${savedAt}` : 'rascunho'}</small>
        </div>
        <div className="spacer" />
        <button className="btn ghost small" onClick={undo} disabled={!history.length} title="Ctrl+Z">↶ Desfazer</button>
        <div className="devices">
          <button className={device === 'desktop' ? 'on' : ''} onClick={() => setDevice('desktop')}>🖥</button>
          <button className={device === 'tablet' ? 'on' : ''} onClick={() => setDevice('tablet')}>▢</button>
          <button className={device === 'mobile' ? 'on' : ''} onClick={() => setDevice('mobile')}>▯</button>
        </div>
        <Link href={`/preview/${page.id}`} className="btn ghost">👁 Pré-visualizar</Link>
        {status === 'published' && page.publishedSlug && (
          <a className="btn ghost" href={`/p/${page.publishedSlug}`} target="_blank" rel="noreferrer" title="Abrir a URL pública">🌐 {page.publishedSlug}</a>
        )}
        <button className="btn primary" disabled={busy} onClick={() => void togglePublish()}>
          {busy ? 'A publicar…' : status === 'published' ? 'Despublicar' : '⚡ Publicar'}
        </button>
      </header>

      <div className="editor-body">
        <aside className="rail">
          <div className="grp">SECÇÕES</div>
          {page.sections.map((s) => (
            <div key={s.id} style={{ position: 'relative' }}>
              <button className="tool" onClick={() => { setSelected({ sectionId: s.id, elementId: s.elements[0].id }); }}>
                <span className="ic">▣</span><span className="lbl">{s.title}</span>
              </button>
              <span
                onClick={() => toggleSection(s.id)}
                title={s.hidden ? 'Mostrar' : 'Ocultar'}
                style={{ position: 'absolute', right: 8, top: 12, cursor: 'pointer', fontSize: 11, opacity: s.hidden ? 0.35 : 0.8 }}
              >{s.hidden ? '🚫' : '👁'}</span>
            </div>
          ))}
          <div className="grp">EDITOR</div>
          <button className="tool" onClick={() => setShowDesign(true)}><span className="ic">🎨</span><span className="lbl">Design</span></button>
          <button className="tool upload-btn"><span className="ic">🏷</span><span className="lbl">Logótipo</span>
            <input type="file" accept="image/*" onChange={(e) => void uploadLogo(e.target.files?.[0])} />
          </button>
          <button className="tool" onClick={() => setShowSocial(true)}><span className="ic">↗</span><span className="lbl">Redes Sociais</span></button>
          <div className="grp">PÁGINA</div>
          <Link href="/" className="tool"><span className="ic">⚙</span><span className="lbl">Sair para o Dashboard</span></Link>
          <div className="help">
            <b>💡 Precisas de ajuda?</b>
            <p>Diz-me o que queres fazer e eu faço a alteração.</p>
          </div>
        </aside>

        <main className="canvas" onClick={() => setSelected(null)}>
          <div className={`frame-wrap ${device}`}>
            <div className="frame">
              <LandingRender
                page={page}
                options={{
                  interactive: true,
                  selectedElementId: selected?.elementId ?? null,
                  onSelectElement: (sectionId, elementId) => setSelected({ sectionId, elementId }),
                }}
              />
            </div>
            {selectedSection && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', margin: '12px 0', flexWrap: 'wrap' }}>
                <span className="ai-label" style={{ marginRight: 4 }}>LAYOUT</span>
                <div className="layout-picker">
                  {layoutsForType(selectedSection.type).map((l) => (
                    <button key={l} className={(selectedSection.style?.layout ?? 'stack') === l ? 'on' : ''} onClick={() => setSectionLayout(selectedSection.id, l)}>
                      {layoutLabel(l, selectedSection.type)}
                    </button>
                  ))}
                </div>
                <button className="btn danger small" onClick={() => removeSection(selectedSection.id)}>Remover secção “{selectedSection.title}”</button>
              </div>
            )}
          </div>
        </main>

        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
            <AiPanelWrapper page={page} selected={selectedElement} busy={busy} onRun={runAgent} />
          </div>
          {selectedSection && selectedElement && (
            <div style={{ maxHeight: '45%', overflowY: 'auto', background: 'var(--bg2)', borderLeft: '1px solid var(--line)' }}>
              <ElementInspector
                section={selectedSection}
                element={selectedElement}
                onChange={(content) => updateElementContent(selectedSection.id, selectedElement.id, content)}
                onRemove={() => removeElement(selectedSection.id, selectedElement.id)}
                onAdd={(type) => addElement(selectedSection.id, type)}
                onMoveElement={(dir) => moveElement(selectedSection.id, selectedElement.id, dir)}
              />
            </div>
          )}
        </div>
      </div>

      {showDesign && <DesignModal onClose={() => setShowDesign(false)} onApply={applyPreset} />}
      {showSocial && (
        <SocialModal
          links={page.socialLinks ?? []}
          onSave={(links: SocialLink[]) => commit({ ...page, socialLinks: links })}
          onClose={() => setShowSocial(false)}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function AiPanelWrapper(props: React.ComponentProps<typeof AiPanel>) {
  return <AiPanel {...props} />;
}
