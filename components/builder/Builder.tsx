'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import AiPanel, { type AgentAction, type AgentRequest } from './AiPanel';
import StudioPanel from './StudioPanel';
import PublicLinkChip from './PublicLinkChip';
import DesignModal, { type DesignPreset } from './DesignModal';
import ElementInspector, { newElement } from './ElementInspector';
import LandingRender, { layoutsForType, layoutLabel } from './LandingRender';
import SocialModal from './SocialModal';
import { api } from '@/lib/api';
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
  // O agente espera segundos pela IA antes de aplicar; a página pode ter mudado
  // nesse entretanto. Toda a escrita do agente parte do page MAIS recente (ref),
  // nunca do fecho antigo — senão o commit não encontra o alvo e não faz nada.
  const pageRef = useRef(page);
  pageRef.current = page;

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
    const cur = pageRef.current;
    const sec = cur.sections.find((s) => s.id === sectionId);
    // Sem este guard o map não calha em nada e o chat dava ✓ sem nada ter mudado.
    if (!sec || !sec.elements.some((e) => e.id === elementId)) {
      throw new Error('O alvo já não está na página — repete o pedido e eu tento outra vez.');
    }
    commit({
      ...cur,
      sections: cur.sections.map((s) => s.id !== sectionId ? s : { ...s, elements: s.elements.map((e) => e.id !== elementId ? e : { ...e, content }) }),
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

  /** Ordem da página nas mãos do utilizador: ↑ ↓ secção a secção, ou ⤒ direto ao topo. */
  function moveSection(sectionId: string, dir: -1 | 1 | 'top') {
    const i = page.sections.findIndex((s) => s.id === sectionId);
    if (i < 0) return;
    const arr = [...page.sections];
    const [sec] = arr.splice(i, 1);
    const j = dir === 'top' ? 0 : dir === -1 ? Math.max(0, i - 1) : Math.min(arr.length, i + 1);
    if (j === i && dir !== 'top') return;
    arr.splice(j, 0, sec);
    commit({ ...page, sections: arr });
  }

  /** Foto do cliente → elemento image no fim da secção selecionada. */
  async function addPhoto(sectionId: string, file: File | undefined) {
    if (!file) return;
    try {
      const { url } = await api.uploadPhoto(file);
      const el = newElement('image');
      el.content = { url, alt: file.name.replace(/\.[a-z]+$/i, '') };
      commit({
        ...page,
        sections: page.sections.map((s) => s.id !== sectionId ? s : { ...s, elements: [...s.elements, el] }),
      });
      setSelected({ sectionId, elementId: el.id });
      flash('Foto adicionada à secção — arrasta-a com ↑ ↓ ou edita no inspector.');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Falha ao adicionar a foto.');
    }
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

  /** Secção alvo por tipo (com sinónimos que o agente usa). */
  function findSection(type?: string | null) {
    if (!type) return null;
    const aliases: Record<string, string[]> = {
      hero: ['hero'], benefits: ['benefits', 'features', 'problem'], problem: ['problem', 'benefits'],
      social: ['social', 'proof'], proof: ['proof', 'social'], cta: ['cta'],
      form: ['form', 'contact'], contact: ['contact', 'form'], faq: ['faq'], pricing: ['pricing'],
      schedule: ['schedule', 'scheduling', 'form'], gallery: ['gallery'], video: ['video'],
    };
    const wanted = aliases[type] ?? [type];
    return page.sections.find((s) => wanted.includes(s.type)) ?? null;
  }

  function firstTextElement(sec: LandingPage['sections'][number]) {
    return sec.elements.find((e) => e.type === 'text' && e.content.level === 'heading')
      ?? sec.elements.find((e) => e.type === 'text') ?? sec.elements.find((e) => e.type === 'button') ?? null;
  }

  async function runAgent(request: AgentRequest): Promise<AgentAction | string> {
    setBusy(true);
    try {
      if (request.kind === 'remove_section') {
        if (request.sectionType === 'hero') throw new Error('A secção hero é essencial — não removo a base da página.');
        const sec = findSection(request.sectionType);
        if (!sec) throw new Error('Não encontrei essa secção na página.');
        commit({ ...page, sections: page.sections.filter((s) => s.id !== sec.id) });
        setSelected(null);
        return `Removi a secção «${sec.title || sec.type}».`;
      }

      if (request.kind === 'move_section') {
        const sec = findSection(request.sectionType);
        if (!sec) throw new Error('Não encontrei essa secção na página.');
        const rest = page.sections.filter((s) => s.id !== sec.id);
        commit({ ...page, sections: request.position === 'top' ? [sec, ...rest] : [...rest, sec] });
        return `Movi «${sec.title || sec.type}» para ${request.position === 'top' ? 'o topo' : 'o fim'} da página.`;
      }

      if (request.kind === 'add_field') {
        // Campo novo no formulário existente (ex.: «mete um campo de telefone»).
        const cur = pageRef.current;
        const sec = findSection('form') ?? cur.sections.find((s) => s.elements.some((e) => e.type === 'form' || e.type === 'scheduling'));
        const formEl = sec?.elements.find((e) => e.type === 'form' || e.type === 'scheduling');
        if (!sec || !formEl) throw new Error('Não há formulário na página — pede-me primeiro para adicionar uma secção de contacto.');
        const label = ((request.text ?? '').trim() || (request.instruction.length <= 40 ? request.instruction.trim() : 'Novo campo')).slice(0, 60);
        const low = label.toLowerCase();
        if (/telem|telemovel|telemóvel|telefone|contacto|whatsapp|n[uú]mero|numero|tel\b/.test(low)) {
          const fields = Array.isArray(formEl.content.fields) ? (formEl.content.fields as Array<Record<string, unknown>>) : [];
          if (fields.some((f) => /tel|telefone|contacto/i.test(String(f.label ?? '')))) return 'O formulário já tem campo de telefone.';
          updateElementContent(sec.id, formEl.id, { ...formEl.content, fields: [...fields, { label: 'Número de telemóvel', type: 'tel', required: false }] });
          return 'Adicionei o campo «Número de telemóvel» ao formulário.';
        }
        const fields = Array.isArray(formEl.content.fields) ? (formEl.content.fields as Array<Record<string, unknown>>) : [];
        if (fields.some((f) => String(f.label ?? '').toLowerCase() === low)) return `O campo «${label}» já existe no formulário.`;
        const type = /mail/.test(low) ? 'email' : /morada|endere[cç]o/.test(low) ? 'text' : 'text';
        updateElementContent(sec.id, formEl.id, { ...formEl.content, fields: [...fields, { label, type, required: false }] });
        return `Adicionei o campo «${label}» ao formulário.`;
      }

      if (request.kind === 'style') {
        // «diminui/aumenta a letra» — muda o nível do texto, palavras intactas.
        const cur = pageRef.current;
        const selSec = cur.sections.find((s) => s.id === selected?.sectionId) ?? null;
        const selEl = selSec?.elements.find((e) => e.id === selected?.elementId) ?? null;
        const sec = findSection(request.sectionType) ?? selSec ?? cur.sections[0];
        const target = (selEl && selEl.type === 'text' ? selEl : null) ?? (sec ? firstTextElement(sec) : null);
        if (!target || target.type !== 'text') throw new Error('Não encontrei texto para mudar o tamanho — clica primeiro no texto no canvas.');
        const low = ((request.text ?? '') + ' ' + request.instruction).toLowerCase();
        const smaller = /smaller|diminu|menor|mais pequeno|pequen|reduz|encolh/.test(low);
        const larger = /larger|aument|maior|mais grande|enorme/.test(low);
        if (smaller === larger) throw new Error('Diz-me se queres a letra mais pequena ou maior.');
        const ladder = ['body', 'subtitle', 'title', 'heading'];
        const idx = ladder.indexOf(String(target.content.level ?? 'body'));
        const next = ladder[Math.min(ladder.length - 1, Math.max(0, idx + (larger ? 1 : -1)))];
        if (next === ladder[idx] && idx === (larger ? ladder.length - 1 : 0)) {
          return larger ? 'Este texto já está no tamanho máximo.' : 'Este texto já está no tamanho mínimo.';
        }
        updateElementContent(sec!.id, target.id, { ...target.content, level: next });
        return larger ? 'Aumentei o tamanho da letra — o texto não mudou.' : 'Diminuí o tamanho da letra — o texto não mudou.';
      }

      if (request.kind === 'change_background') {
        // «melhora o fundo» → tema novo decidido pelo agente; conteúdo palavra a palavra intacto.
        const cur = pageRef.current;
        const { theme } = await api.theme({
          instruction: request.instruction,
          context: [cur.aiContext?.productSummary, cur.aiContext?.audience].filter(Boolean).join(' · ') || cur.objective || null,
          current: cur.theme ?? null,
        });
        commit({ ...pageRef.current, theme: theme as unknown as LandingPage['theme'] });
        return 'Dei um visual novo à página — o conteúdo não mudou uma vírgula.';
      }

      if (request.kind === 'image') {
        // Alvo: só elementos image/gallery são alvos — escrever url no content de um
        // TEXTO era o bug do «✓ feito mas nada mudou na página» (25-09).
        // Seleção (se for imagem) → imagem da secção pedida → 1ª imagem; senão bloco novo.
        const cur = pageRef.current; // a IA demorou segundos — escrevemos sobre o estado atual
        const isImg = (e: { type: string }) => e.type === 'image' || e.type === 'gallery';
        const selectedSec = cur.sections.find((s) => s.id === selected?.sectionId) ?? null;
        const selectedEl = selectedSec?.elements.find((e) => e.id === selected?.elementId) ?? null;
        const fallbackSec = findSection(request.sectionType) ?? selectedSec;
        let target: BuilderElement | null = (selectedEl && isImg(selectedEl) ? selectedEl : null)
          ?? (fallbackSec?.elements.find(isImg) ?? null);
        let sectionId = fallbackSec?.id ?? null;
        if (!target) {
          for (const s of cur.sections) {
            const found = s.elements.find(isImg);
            if (found) { target = found; sectionId = s.id; break; }
          }
        } else {
          sectionId = cur.sections.find((s) => s.elements.some((e) => e.id === target!.id))?.id ?? sectionId;
        }
        sectionId = cur.sections.some((s) => s.id === sectionId) ? sectionId : cur.sections[0]?.id ?? null;
        if (!sectionId) throw new Error('Página sem secções.');
        const photo = await api.image({ instruction: request.instruction, objective: page.objective, context: page.aiContext, exclude: usedImages(), previous: target ? String(target.content.alt ?? target.content.title ?? '') || null : null });
        if (!photo.url) throw new Error('Falha na pesquisa de imagem.');
        if (!target) {
          const live = pageRef.current;
          const dest = live.sections.find((s) => s.id === sectionId);
          if (!dest) throw new Error('A página mudou entretanto — repete o pedido.');
          commit({
            ...live,
            sections: live.sections.map((s) => s.id === sectionId
              ? { ...s, elements: [...s.elements, { id: uid(), type: 'image' as const, content: { url: photo.url, alt: photo.alt || s.title } }] }
              : s),
          });
          return { imageUrl: photo.url };
        }
        if (target.type === 'gallery') {
          const gallery = Array.isArray(target.content.images) ? (target.content.images as Array<Record<string, unknown>>) : [];
          updateElementContent(sectionId, target.id, { ...target.content, images: [{ url: photo.url, alt: photo.alt ?? '' }, ...gallery] });
        } else {
          updateElementContent(sectionId, target.id, { ...target.content, url: photo.url, alt: photo.alt ?? page.aiContext?.productSummary ?? 'Imagem da página' });
        }
        return { imageUrl: photo.url };
      }

      if (request.kind === 'rewrite') {
        // Só texto/botão aceitam reescrita — escrever num form/stats era mais um ✓ mentiroso.
        const cur = pageRef.current;
        const selectedSec = cur.sections.find((s) => s.id === selected?.sectionId) ?? null;
        const selectedEl = selectedSec?.elements.find((e) => e.id === selected?.elementId) ?? null;
        const textish = selectedEl && (selectedEl.type === 'text' || selectedEl.type === 'button') ? selectedEl : null;
        const fallbackSec = findSection(request.sectionType) ?? selectedSec ?? cur.sections[0];
        // «muda o CTA/botão» mira o BOTÃO, não o título — era o bug do «CTA não muda» (26-09).
        const wantsButton = /\bcta\b|bot[ãa]o|but[ãa]o|enviar|submit|pedir|marcar|reservar|contacta/i.test(request.instruction);
        const target = textish ?? (fallbackSec
          ? ((wantsButton ? fallbackSec.elements.find((e) => e.type === 'button') : null) ?? firstTextElement(fallbackSec))
          : null);
        const sectionId = target
          ? cur.sections.find((s) => s.elements.some((e) => e.id === target.id))?.id ?? null
          : fallbackSec?.id ?? null;
        if (!target || !sectionId) throw new Error('Não encontrei o texto alvo na página.');
        // Texto ditado pelo utilizador aplica-se direto; melhoria criativa passa pela IA.
        const text = request.text?.trim() || (await api.rewrite({ instruction: request.instruction, current: String(target.content.text ?? target.content.label ?? ''), context: page.aiContext })).text;
        if (!text) throw new Error('Falha na reescrita.');
        const key = target.type === 'button' ? 'label' : 'text';
        updateElementContent(sectionId, target.id, { ...target.content, [key]: text });
        return { text };
      }

      if (request.kind === 'section') {
        const { section: draft } = await api.section({ description: request.sectionType ? `${request.instruction} (secção de tipo ${request.sectionType})` : request.instruction, objective: page.objective, context: page.aiContext });
        if (!draft) throw new Error('Falha ao criar a secção.');
        const section = {
          id: uid(), type: draft.type, title: draft.title,
          style: draft.style as LandingPage['sections'][number]['style'],
          elements: (draft.elements ?? []).map((e) => ({ id: uid(), type: e.type as BuilderElement['type'], content: (e.content ?? {}) as Record<string, unknown> })),
        };
        commit({ ...pageRef.current, sections: [...pageRef.current.sections.slice(0, -1), section, ...pageRef.current.sections.slice(-1)] });
        return { sectionDraft: draft as unknown as AgentAction['sectionDraft'] };
      }

      // recreate: nova composição pelo backend com ângulo diferente — o plano
      // vem com estrutura, layouts, cores e copy decididos de raiz (não é
      // o mesmo template com outra cor).
      const plan = await api.plan({
        description: `${page.aiContext?.productSummary ?? page.name}. ${page.aiContext?.offer ?? ''} Recriar com outra estrutura, ordem das secções e imagens diferentes, ${request.instruction}`,
        objective: page.objective ?? 'Captar leads',
        style: 'Moderno',
        context: page.aiContext,
        variantHint: `Ângulo e visual DIFERENTES da versão atual: ${page.theme?.mode === 'dark' ? 'passa para tema CLARO com paleta distinta' : 'passa para tema ESCURO com paleta distinta'}; noutra abertura e ordem de secções; troca os layouts das secções repetidas; convida um bloco novo (demo, steps, comparison, quote ou bento) que a versão atual não tenha.`,
      });
      if (!Array.isArray(plan.sections) || plan.sections.length === 0) throw new Error('Falha ao recriar.');
      const sections = (plan.sections as LandingPage['sections']).map((s, i) => ({
        ...s,
        id: uid(),
        elements: (s.elements ?? []).map((e) => ({ ...e, id: uid() })),
      }));
      commit({
        ...pageRef.current,
        sections,
        ...(plan.theme ? { theme: plan.theme as unknown as LandingPage['theme'] } : {}),
        ...(plan.brandColors?.length ? { aiContext: { ...(pageRef.current.aiContext ?? {}), brandColors: plan.brandColors } } : {}),
      });
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
      // o slug pode não estar no localStorage (página criada noutro dispositivo) —
      // se faltar, procura-se na lista de publicadas pelo id da página.
      let slug = page.publishedSlug;
      try {
        if (!slug) slug = (await api.publishedList()).pages.find((p) => p.pageId === page.id)?.slug;
        if (slug) await api.unpublish(slug);
      } catch (error) {
        flash(error instanceof Error ? `Falha ao despublicar: ${error.message}` : 'Falha ao despublicar.');
        return; // não marcamos como rascunho se o servidor continua a servir a página
      }
      const next = { ...page, status: 'draft' as const };
      commit(next, false); onSave(next); flash('Página despublicada');
      return;
    }
    setBusy(true);
    try {
      const slug = page.publishedSlug
        ?? `${page.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'pagina'}-${page.id.slice(-4)}`;
      const next = { ...page, status: 'published' as const, publishedSlug: slug };
      await api.publish(slug, next);
      commit(next, false); onSave(next);
      flash(`Publicada ✓ abre em qualquer dispositivo: /p/${slug}`);
    } catch (error) {
      flash(error instanceof Error ? `Falha ao publicar: ${error.message}` : 'Falha ao publicar.');
    } finally {
      setBusy(false);
    }
  }

  // Páginas Studio: HTML livre — o editor é preview vivo + chat do assistente (design/edit).
  if (page.kind === "studio" && page.html) {
    return (
      <div className="editor">
        <header className="topbar">
          <Link href="/" className="logo"><span className="mark">✦</span><b>Landing<em>AI</em></b></Link>
          <div className="page-name" style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
            <input
              value={page.name}
              onChange={(e) => commit({ ...page, name: e.target.value }, false)}
              style={{ background: "transparent", border: 0, outline: 0, color: "var(--txt)", fontWeight: 700, fontSize: 13, width: 220 }}
            />
            <small style={{ fontSize: 10.5, color: "var(--dim)" }}>{savedAt ? `guardado ${savedAt}` : "rascunho"}</small>
          </div>
          <div className="spacer" />
          <Link href={`/preview/${page.id}`} className="btn ghost">👁 Pré-visualizar</Link>
          {status === "published" && page.publishedSlug && (
            <PublicLinkChip slug={page.publishedSlug} compact />
          )}
          <button className="btn primary" disabled={busy} onClick={() => void togglePublish()}>
            {busy ? "A publicar…" : status === "published" ? "Despublicar" : "⚡ Publicar"}
          </button>
        </header>
        <div style={{ minHeight: 0, display: 'block', padding: 14, overflow: 'hidden' }}>
          <StudioPanel page={page} onSave={(p) => { setPage(p); onSave(p); }} />
        </div>
      </div>
    );
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
          <PublicLinkChip slug={page.publishedSlug} compact />
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
                <span className="ai-label" style={{ marginRight: 4 }}>ORDEM</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn ghost small" title="Mover secção para cima" onClick={() => moveSection(selectedSection.id, -1)}>↑</button>
                  <button className="btn ghost small" title="Mover secção para baixo" onClick={() => moveSection(selectedSection.id, 1)}>↓</button>
                  <button className="btn ghost small" title="Mover para o começo da página" onClick={() => moveSection(selectedSection.id, 'top')}>⤒ Topo</button>
                </div>
                <span className="ai-label" style={{ marginRight: 4 }}>LAYOUT</span>
                <div className="layout-picker">
                  {layoutsForType(selectedSection.type).map((l) => (
                    <button key={l} className={(selectedSection.style?.layout ?? 'stack') === l ? 'on' : ''} onClick={() => setSectionLayout(selectedSection.id, l)}>
                      {layoutLabel(l, selectedSection.type)}
                    </button>
                  ))}
                </div>
                <label className="btn small" style={{ cursor: 'pointer' }}>
                  🖼 Adicionar foto
                  <input type="file" accept="image/*" hidden onChange={(e) => {
                    void addPhoto(selectedSection.id, e.target.files?.[0]);
                    e.currentTarget.value = '';
                  }} />
                </label>
                <button className="btn danger small" onClick={() => removeSection(selectedSection.id)}>Remover secção “{selectedSection.title}”</button>
              </div>
            )}
          </div>
        </main>

        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {selectedSection && selectedElement && (
            <div className="inspector-col" style={{ minHeight: 0, overflowY: 'auto', background: 'var(--bg2)', borderLeft: '1px solid var(--line)' }}>
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

      {/* Assistente: barra fixa em baixo — clica e a conversa sobe. */}
      <AiPanelWrapper page={page} selected={selectedElement} busy={busy} onRun={runAgent} />

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
