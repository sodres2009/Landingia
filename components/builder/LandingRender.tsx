'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { BuilderElement, BuilderSection, LandingPage } from '@/lib/types';

/**
 * Renderização de uma Landing Page (o "canvas").
 * Usado tanto no Builder (com seleção) como no Preview público (sem seleção).
 *
 * Cada secção escolhe um `layout` (style.layout). Layouts desconhecidos ou
 * ausentes caem no empilhamento clássico — páginas antigas nunca partem.
 */

export interface RenderOptions {
  interactive?: boolean;
  selectedElementId?: string | null;
  onSelectElement?: (sectionId: string, elementId: string) => void;
  onSubmitForm?: (sectionId: string, elementId: string, values: Record<string, string>) => Promise<string>;
  device?: 'desktop' | 'tablet' | 'mobile';
}

function textColorOf(section: BuilderSection): string | undefined {
  return section.style?.textColor;
}

function isDark(section: BuilderSection): boolean {
  const bg = section.style?.background ?? '';
  if (bg.startsWith('#') && bg.length >= 7) {
    const r = parseInt(bg.slice(1, 3), 16), g = parseInt(bg.slice(3, 5), 16), b = parseInt(bg.slice(5, 7), 16);
    return r * 0.299 + g * 0.587 + b * 0.114 < 120;
  }
  return false;
}

/** Texto com «…」 no início vira badge/eyebrow em vez de parágrafo. */
function eyebrowOf(lead: BuilderElement[]): string {
  const first = lead.find((e) => e.type === 'text');
  const text = String(first?.content.text ?? '');
  return text.startsWith('«') || text.startsWith('✦') ? text.replace(/[«»]/g, '') : '';
}

function avatarInitials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase() || '?';
}

function splitParagraphs(text: string): string[] {
  return text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
}

function TextBlock({ el }: { el: BuilderElement }) {
  const text = String(el.content.text ?? '');
  const level = String(el.content.level ?? 'body');
  if (level === 'heading') {
    const [first, ...rest] = splitParagraphs(text);
    return (
      <>
        <h1 className="lp-h1">{first}</h1>
        {rest.map((p, i) => <p key={i} className="lp-lead">{p}</p>)}
      </>
    );
  }
  if (level === 'title') return <h2>{text}</h2>;
  if (level === 'subtitle') return <h3>{text}</h3>;
  return <p>{text}</p>;
}

function ListBlock({ el }: { el: BuilderElement }) {
  const items = Array.isArray(el.content.items) ? (el.content.items as Array<Record<string, unknown> | string>) : [];
  return (
    <ul className="lp-list">
      {items.map((it, i) => {
        const icon = typeof it === 'string' ? '' : String(it.icon ?? '');
        return <li key={i}>{icon ? <span className="lp-list-ic">{icon}</span> : null}{typeof it === 'string' ? it : String(it.text ?? '')}</li>;
      })}
    </ul>
  );
}

function FormBlock({ el, onSubmit }: { el: BuilderElement; onSubmit?: (values: Record<string, string>) => Promise<string> }) {
  const fields = Array.isArray(el.content.fields) ? (el.content.fields as Array<Record<string, unknown>>) : [];
  const success = String(el.content.success ?? 'Obrigado!');
  return (
    <form className="lp-form" onSubmit={async (e) => {
      e.preventDefault();
      if (!onSubmit) return;
      const form = e.currentTarget;
      const data = new FormData(form);
      const values: Record<string, string> = {};
      data.forEach((v, k) => { values[k] = String(v); });
      const message = await onSubmit(values);
      form.replaceChildren();
      const ok = document.createElement('div');
      ok.className = 'lp-ok';
      ok.textContent = message;
      form.appendChild(ok);
    }}>
      <h3>{String(el.content.title ?? 'Contacto')}</h3>
      {fields.map((f, i) => {
        const name = String(f.label ?? `campo_${i}`).toLowerCase().replace(/\s+/g, '_');
        const type = String(f.type ?? 'text');
        return (
          <label className="lp-field" key={i}>
            {String(f.label ?? '')}{f.required ? ' *' : ''}
            {type === 'textarea'
              ? <textarea name={name} required={Boolean(f.required)} rows={3} />
              : <input name={name} type={type} required={Boolean(f.required)} />}
          </label>
        );
      })}
      {Boolean(el.content.consent) && (
        <label className="lp-consent"><input type="checkbox" name="consent" required /> Autorizo o contacto e o tratamento dos meus dados.</label>
      )}
      <button className="lp-btn" type="submit">{String(el.content.submit ?? 'Enviar')}</button>
    </form>
  );
}

function TestimonialsBlock({ el }: { el: BuilderElement }) {
  const items = Array.isArray(el.content.items) ? (el.content.items as Array<Record<string, unknown>>) : [];
  return (
    <div className="lp-cards">
      {items.map((t, i) => (
        <div className="lp-card lp-testimonial" key={i}>
          <div className="lp-stars">★★★★★</div>
          <p style={{ fontStyle: 'italic' }}>“{String(t.text ?? '')}”</p>
          <span className="lp-avatar">{avatarInitials(String(t.name ?? ''))}</span>
          <b style={{ fontSize: 13 }}>{String(t.name ?? '')}</b>
          <div style={{ fontSize: 11, opacity: 0.7 }}>{String(t.role ?? '')}</div>
        </div>
      ))}
    </div>
  );
}

function PricingBlock({ el }: { el: BuilderElement }) {
  const plans = Array.isArray(el.content.plans) ? (el.content.plans as Array<Record<string, unknown>>) : [];
  return (
    <div className="lp-cards">
      {plans.map((p, i) => (
        <div className="lp-plan" key={i}>
          <b style={{ fontSize: 13 }}>{String(p.name ?? '')}</b>
          <div className="price">{String(p.price ?? '')}</div>
          {Array.isArray(p.features) && (
            <ul style={{ listStyle: 'none', margin: '10px 0', fontSize: 12.5, display: 'grid', gap: 6 }}>
              {(p.features as unknown[]).map((f, j) => <li key={j}>✓ {String(f)}</li>)}
            </ul>
          )}
          {Boolean(p.cta) && <span className="lp-btn">{String(p.cta)}</span>}
        </div>
      ))}
    </div>
  );
}

function FaqBlock({ el }: { el: BuilderElement }) {
  const items = Array.isArray(el.content.items) ? (el.content.items as Array<Record<string, unknown>>) : [];
  return (
    <div className="lp-faq">
      {items.map((q, i) => (
        <details className="lp-faq-item" key={i} open={i === 0}>
          <summary>{String(q.q ?? '')}</summary>
          <span>{String(q.a ?? '')}</span>
        </details>
      ))}
    </div>
  );
}

function StatsBlock({ el }: { el: BuilderElement }) {
  const items = Array.isArray(el.content.items) ? (el.content.items as Array<Record<string, unknown> | string>) : [];
  return (
    <div className="lp-stats">
      {items.map((it, i) => {
        const value = typeof it === 'string' ? (it.match(/^[\d.,]+[+k%]?/) ?? ['—'])[0] : String(it.value ?? '—');
        const label = typeof it === 'string' ? it.replace(/^[\d.,]+[+k%]?\s*[—–-]?\s*/, '') : String(it.label ?? '');
        return (
          <div className="lp-stat" key={i}>
            <b className="lp-stat-n">{value}</b>
            <span>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function MarqueeBlock({ el }: { el: BuilderElement }) {
  const items = Array.isArray(el.content.items) ? (el.content.items as Array<Record<string, unknown> | string>) : [];
  const names = items.map((it) => (typeof it === 'string' ? it : String(it.name ?? it.text ?? ''))).filter(Boolean);
  const doubled = [...names, ...names];
  return (
    <div className="lp-marquee" aria-label="Marca parceira ou clientes">
      <div className="lp-marquee-track">
        {doubled.map((n, i) => <span key={i}>{n}</span>)}
      </div>
    </div>
  );
}

export function ElementView({ el, onSubmitForm }: { el: BuilderElement; onSubmitForm?: (values: Record<string, string>) => Promise<string> }) {
  switch (el.type) {
    case 'text': return <TextBlock el={el} />;
    case 'list': return <ListBlock el={el} />;
    case 'button': {
      const label = String(el.content.label ?? 'Botão');
      const href = String(el.content.url ?? '#');
      const variant = String(el.content.variant ?? 'primary');
      if (href.startsWith('#')) return <a className={`lp-btn${variant === 'secondary' ? ' secondary' : ''}`} href={href}>{label}</a>;
      return <a className={`lp-btn${variant === 'secondary' ? ' secondary' : ''}`} href={href} target="_blank" rel="noreferrer">{label}</a>;
    }
    case 'image': {
      const url = String(el.content.url ?? '');
      if (!url) return null;
      return <img className="lp-img" src={url} alt={String(el.content.alt ?? '')} style={{ maxHeight: el.content.maxHeight ? Number(el.content.maxHeight) : undefined }} />;
    }
    case 'video': {
      const url = String(el.content.url ?? '');
      if (!url) return null;
      return <iframe className="lp-video" src={url} title="Vídeo" allowFullScreen />;
    }
    case 'form': return <FormBlock el={el} onSubmit={onSubmitForm} />;
    case 'testimonials': return <TestimonialsBlock el={el} />;
    case 'pricing': return <PricingBlock el={el} />;
    case 'faq': return <FaqBlock el={el} />;
    case 'stats': return <StatsBlock el={el} />;
    case 'marquee': return <MarqueeBlock el={el} />;
    case 'gallery': {
      const images = Array.isArray(el.content.images) ? (el.content.images as Array<Record<string, unknown>>) : [];
      return (
        <div className="lp-cards">
          {images.map((g, i) => <img key={i} className="lp-img" src={String(g.url ?? '')} alt={String(g.alt ?? '')} style={{ margin: 0 }} />)}
        </div>
      );
    }
    case 'map': {
      const label = String(el.content.query ?? 'Portugal');
      return (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 32 }}>📍</div>
          <b>{label}</b>
        </div>
      );
    }
    case 'modal':
      return <div className="lp-card"><b>{String(el.content.title ?? 'Modal')}</b><p>{String(el.content.text ?? '')}</p></div>;
    case 'social': {
      const links = Array.isArray(el.content.links) ? (el.content.links as Array<Record<string, unknown>>) : [];
      return (
        <div className="lp-social">
          {links.map((l, i) => <a key={i} href={String(l.url ?? '#')} target="_blank" rel="noreferrer">{String(l.platform ?? '')}</a>)}
        </div>
      );
    }
    case 'scheduling':
      return <FormBlock el={{ ...el, type: 'form', content: { ...el.content, title: String(el.content.title ?? 'Marcar reunião'), fields: Array.isArray(el.content.fields) && (el.content.fields as unknown[]).length ? el.content.fields : [{ label: 'Nome', type: 'text', required: true }, { label: 'Email', type: 'email', required: true }, { label: 'Data pretendida', type: 'date', required: true }, { label: 'Hora preferida', type: 'time', required: false }], submit: String(el.content.submit ?? 'Confirmar agendamento') } }} onSubmit={onSubmitForm} />;
    default:
      return <p>{String(el.content.text ?? el.content.html ?? '')}</p>;
  }
}

/* ─────────── layouts por secção ─────────── */

type LayoutMode = 'stack' | 'split' | 'center' | 'fullbleed' | 'cards' | 'zigzag' | 'band' | 'formsplit' | 'stats' | 'marquee';

interface LayoutSpec { mode: LayoutMode; card?: boolean; skipLead?: boolean }

const LAYOUTS: Record<string, LayoutSpec> = {
  'hero-split': { mode: 'split' },
  'hero-center': { mode: 'center' },
  'hero-fullbleed': { mode: 'fullbleed' },
  'benefits-grid': { mode: 'cards', card: true },
  'benefits-zigzag': { mode: 'zigzag', skipLead: true },
  'proof-stats': { mode: 'stats' },
  'testimonials-cards': { mode: 'cards', card: true },
  'cta-band': { mode: 'band' },
  'form-split': { mode: 'formsplit' },
  'logo-marquee': { mode: 'marquee' },
};

/** Opções de layout mostradas no editor, agrupadas por tipo de secção. */
export const LAYOUT_OPTIONS: Record<string, string[]> = {
  hero: ['hero-split', 'hero-center', 'hero-fullbleed'],
  benefits: ['stack', 'benefits-grid', 'benefits-zigzag'],
  problem: ['stack', 'benefits-grid', 'benefits-zigzag'],
  features: ['stack', 'benefits-grid', 'benefits-zigzag'],
  social: ['stack', 'proof-stats', 'testimonials-cards', 'logo-marquee'],
  proof: ['stack', 'proof-stats', 'testimonials-cards', 'logo-marquee'],
  pricing: ['stack', 'testimonials-cards'],
  cta: ['stack', 'cta-band'],
  contact: ['stack', 'form-split'],
  form: ['stack', 'form-split'],
};

export function layoutsForType(type: string): string[] {
  return LAYOUT_OPTIONS[type] ?? ['stack'];
}

export function layoutLabel(layout: string | undefined, type: string): string {
  const l = layout && LAYOUTS[layout] ? layout : 'stack';
  const labels: Record<string, string> = {
    'hero-split': 'Hero dividido', 'hero-center': 'Hero centrado', 'hero-fullbleed': 'Hero imagem total',
    'benefits-grid': 'Grelha de cartões', 'benefits-zigzag': 'Zigue-zague', 'proof-stats': 'Números grandes',
    'testimonials-cards': 'Cartões de prova', 'cta-band': 'Faixa de CTA', 'form-split': 'Formulário dividido',
    'logo-marquee': 'Faixa de marcas', stack: 'Empilhado (clássico)',
  };
  return labels[l] ?? l;
}

const REDUCE_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Anima os blocos quando entram no ecrã (apenas fora do editor). */
function useReveal(active: boolean) {
  const [visible, setVisible] = useState<Set<string>>(() => new Set());
  const seen = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!active) return;
    if (window.matchMedia?.(REDUCE_MOTION_QUERY).matches) {
      setVisible(new Set(seen.current));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      const fresh = entries.filter((e) => e.isIntersecting).map((e) => e.target.getAttribute('data-reveal') ?? '');
      if (!fresh.length) return;
      fresh.forEach((id) => seen.current.add(id));
      setVisible(new Set(seen.current));
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    document.querySelectorAll('[data-reveal]').forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [active]);
  return visible;
}

function SectionView({ section, options, revealed }: { section: BuilderSection; options: RenderOptions; revealed: boolean }) {
  const dark = isDark(section);
  const bg = section.style?.background;
  const layout = section.style?.layout && LAYOUTS[section.style.layout] ? section.style.layout : 'stack';
  const spec: LayoutSpec = layout === 'stack' ? { mode: 'stack' } : LAYOUTS[layout];
  const interactive = Boolean(options.interactive);
  const elKey = (el: BuilderElement, extra?: string) => (
    <div
      key={el.id}
      data-el={el.id}
      className={interactive ? (options.selectedElementId === el.id ? 'el-selected' : 'el-hover') : undefined}
      onClick={interactive ? (e) => { e.stopPropagation(); options.onSelectElement?.(section.id, el.id); } : undefined}
    >
      <ElementView el={el} onSubmitForm={options.onSubmitForm ? (values) => options.onSubmitForm!(section.id, el.id, values) : undefined} />
      {extra}
    </div>
  );

  const imgs = section.elements.filter((e) => e.type === 'image' || e.type === 'gallery');
  const firstImg = section.elements.findIndex((e) => e.type === 'image' || e.type === 'gallery');
  const lead = firstImg < 0 ? section.elements : section.elements.slice(0, firstImg);
  const rest = firstImg < 0 ? [] : section.elements.slice(firstImg + 1).filter((e) => e.type !== 'image' && e.type !== 'gallery');
  const eyebrow = eyebrowOf(lead);
  const nonLead = spec.skipLead ? section.elements.filter((e) => !lead.includes(e)) : section.elements;
  const cardEls = nonLead.filter((e) => ['benefit', 'faq', 'form', 'list', 'pricing', 'testimonials', 'text', 'custom', 'stats', 'video', 'map', 'modal', 'scheduling', 'social'].includes(e.type));

  const submit = (el: BuilderElement) => (values: Record<string, string>) =>
    options.onSubmitForm ? options.onSubmitForm(section.id, el.id, values) : Promise.resolve('');

  let body: React.ReactNode;
  switch (spec.mode) {
    case 'split':
    case 'formsplit':
      body = (
        <div className={`lp-split${spec.mode === 'formsplit' ? ' lp-split--form' : ''}`}>
          <div className="lp-split-copy">{eyebrow && <p className="lp-eyebrow">✦ {eyebrow}</p>}{lead.map((el) => elKey(el))}</div>
          <div className="lp-split-media">
            {imgs.map((el) => elKey(el))}
            {spec.mode === 'split' && rest.map((el) => elKey(el))}
            {spec.mode === 'formsplit' && section.elements.filter((e) => e.type === 'form').length === 0 && lead.filter((e) => e.type === 'form').map((el) => elKey(el))}
          </div>
        </div>
      );
      break;
    case 'center':
      body = (
        <div className="lp-center">
          {eyebrow && <p className="lp-eyebrow">✦ {eyebrow}</p>}
          {lead.map((el) => elKey(el))}
          {imgs.map((el) => elKey(el))}
          {rest.map((el) => elKey(el))}
        </div>
      );
      break;
    case 'fullbleed':
      body = (
        <div className="lp-center lp-fullbleed-media">
          {imgs.map((el) => elKey(el))}
          {eyebrow && <p className="lp-eyebrow">✦ {eyebrow}</p>}
          {lead.filter((el) => el.type !== 'image').map((el) => elKey(el))}
          {rest.map((el) => elKey(el))}
        </div>
      );
      break;
    case 'cards':
      body = (
        <>
          {lead.map((el) => elKey(el))}
          <div className={`lp-layout-cards${spec.card ? ' lp-cards-auto' : ''}`}>
            {cardEls.length
              ? cardEls.map((el) => <div key={el.id} className="lp-card" onClick={interactive ? (e) => { e.stopPropagation(); options.onSelectElement?.(section.id, el.id); } : undefined}><ElementView el={el} onSubmitForm={submit(el)} /></div>)
              : section.elements.filter((e) => e.type !== 'image' && e.type !== 'gallery').map((el) => <div key={el.id} className="lp-card"><ElementView el={el} onSubmitForm={submit(el)} /></div>)}
          </div>
          {imgs.map((el) => elKey(el))}
        </>
      );
      break;
    case 'zigzag':
      body = (
        <>
          {lead.length > 0 && spec.skipLead === false && lead.map((el) => elKey(el))}
          <div className="lp-zigzag">
            {nonLead.map((el) => {
              const items = el.type === 'list' && Array.isArray(el.content.items)
                ? (el.content.items as Array<Record<string, unknown> | string>).map((it) => (typeof it === 'string' ? it : String(it.text ?? '')))
                : splitParagraphs(String(el.content.text ?? ''));
              return items.map((t, i) => (
                <div className={`lp-zigzag-row${(i + (el.type === 'list' ? 0 : 0)) % 2 ? ' flip' : ''}`} key={`${el.id}-${i}`}>
                  <div>{typeof t === 'string' ? <p>{t}</p> : <ElementView el={el} onSubmitForm={submit(el)} />}</div>
                  <div>{imgs[i % Math.max(imgs.length, 1)] ? (
                    <img className="lp-img" src={String((imgs[i % Math.max(imgs.length, 1)].content as Record<string, unknown>).url ?? '')} alt="" />
                  ) : null}</div>
                </div>
              ));
            })}
          </div>
        </>
      );
      break;
    case 'band':
      body = (
        <div className="lp-band">
          {section.elements.map((el) => elKey(el))}
        </div>
      );
      break;
    case 'stats':
      body = (
        <>
          {lead.map((el) => elKey(el))}
          {section.elements.filter((e) => e.type === 'stats').map((el) => elKey(el))}
          {section.elements.filter((e) => e.type !== 'stats' && e.type !== 'image' && e.type !== 'gallery' && !lead.includes(e)).map((el) => elKey(el))}
          {imgs.map((el) => elKey(el))}
        </>
      );
      break;
    case 'marquee':
      body = (
        <>
          {lead.map((el) => elKey(el))}
          {section.elements.filter((e) => e.type === 'marquee' || (e.type === 'list' && splitParagraphs(String(e.content.text ?? '')).length === 0)).map((el) => elKey(el))}
        </>
      );
      break;
    default:
      body = <>{section.elements.map((el) => elKey(el))}</>;
  }

  const accent = section.style?.accent;
  const style = {
    background: bg,
    color: textColorOf(section),
    ...(accent ? ({ '--lp-accent': accent } as CSSProperties) : {}),
  } as CSSProperties;

  return (
    <section
      data-reveal={section.id}
      data-section={section.id}
      className={`lp-section lp-sec--${section.type} lp-layout--${layout}${dark ? ' dark' : ''}${revealed ? ' is-visible' : ''}${options.selectedElementId === `section:${section.id}` ? ' sec-selected' : ''}`}
      style={style}
    >
      <div className="lp-inner">{body}</div>
    </section>
  );
}

export default function LandingRender({ page, options = {} }: { page: LandingPage; options?: RenderOptions }) {
  const revealActive = !options.interactive;
  const revealed = useReveal(revealActive);
  const visible = page.sections.filter((s) => !s.hidden);
  return (
    <div className="lp" style={{ '--lp-accent': page.aiContext?.brandColors?.[0] ?? '#6d5dfc' } as CSSProperties}>
      <div className="lp-nav">
        {page.logo?.url
          ? <img src={page.logo.url} alt={page.logo.alt ?? page.name} style={{ height: 30 }} />
          : <span className="lp-brand">{page.name.toUpperCase()}</span>}
        <span className="lp-btn" style={{ padding: '8px 16px', fontSize: 12 }}>{page.aiContext?.cta ?? 'Contacto'}</span>
      </div>
      {visible.map((s) => <SectionView key={s.id} section={s} options={options} revealed={revealed.has(s.id)} />)}
      {page.socialLinks && page.socialLinks.length > 0 && (
        <div className="lp-section" style={{ padding: '22px 36px', background: '#0f172a', color: '#fff' }}>
          <div className="lp-social">
            {page.socialLinks.map((l, i) => <a key={i} href={l.url} target="_blank" rel="noreferrer" style={{ borderColor: 'rgba(255,255,255,.25)', color: '#fff' }}>{l.platform}</a>)}
          </div>
        </div>
      )}
    </div>
  );
}
