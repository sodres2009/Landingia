'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { BuilderElement, BuilderSection, LandingPage } from '@/lib/types';
import { Icon, resolveIcon } from '@/lib/icons';

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
  /** Id da secção com formulário — CTAs sem link saltam para aqui. */
  formTargetId?: string | null;
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

/** Cor de texto segura para um fundo hex (regra de contraste — nunca branco sobre branco). */
function safeTextColor(bg: string | undefined): string | undefined {
  if (!bg || !bg.startsWith('#') || bg.length < 7) return undefined;
  const r = parseInt(bg.slice(1, 3), 16), g = parseInt(bg.slice(3, 5), 16), b = parseInt(bg.slice(5, 7), 16);
  const lum = r * 0.299 + g * 0.587 + b * 0.114;
  return lum < 120 ? '#f4f6fb' : '#101828';
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

/** Converte *palavra* em destaque de marca — o toque tipográfico do hero. */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*[^*\n]+\*)/g).filter((s) => s !== '');
  return (
    <>
      {parts.map((p, i) => (p.startsWith('*') && p.endsWith('*') && p.length > 2
        ? <em key={i} className="lp-hl">{p.slice(1, -1)}</em>
        : <span key={i}>{p}</span>))}
    </>
  );
}

function TextBlock({ el }: { el: BuilderElement }) {
  const text = String(el.content.text ?? '');
  const level = String(el.content.level ?? 'body');
  const icon = resolveIcon(el.content.icon);
  const caption = String(el.content.caption ?? '').trim();
  const chip = icon ? <span className="lp-el-icon"><Icon name={icon} size={22} /></span> : null;
  const cap = caption ? <span className="lp-caption">{caption}</span> : null;
  if (level === 'heading') {
    const [first, ...rest] = splitParagraphs(text);
    const xl = String(el.content.size ?? '') === 'xl' ? ' lp-h1--xl' : '';
    return (
      <>
        {chip}
        <h1 className={"lp-h1" + xl}><RichText text={first} /></h1>
        {rest.map((p, i) => <p key={i} className="lp-lead">{p}</p>)}
        {cap}
      </>
    );
  }
  if (level === 'title') return <>{chip}<h2><RichText text={text} /></h2>{cap}</>;
  if (level === 'subtitle') return <h3>{text}</h3>;
  return <p>{text}</p>;
}

function ListBlock({ el }: { el: BuilderElement }) {
  const items = Array.isArray(el.content.items) ? (el.content.items as Array<Record<string, unknown> | string>) : [];
  return (
    <ul className="lp-list">
      {items.map((it, i) => {
        const raw = typeof it === 'string' ? '' : String(it.icon ?? '');
        const named = resolveIcon(raw);
        return (
          <li key={i}>
            {named ? <span className="lp-list-ic"><Icon name={named} size={17} /></span>
              : raw ? <span className="lp-list-ic">{raw}</span> : null}
            {typeof it === 'string' ? it : String(it.text ?? '')}
          </li>
        );
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
          {Boolean(p.cta) && <a className="lp-btn" href="#formulario" onClick={scrollToForm}>{String(p.cta)}</a>}
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

function DemoBlock({ el }: { el: BuilderElement }) {
  const title = String(el.content.title ?? 'Painel');
  const items = Array.isArray(el.content.items) ? (el.content.items as Array<Record<string, unknown> | string>) : [];
  const stats = Array.isArray(el.content.stats) ? (el.content.stats as Array<Record<string, unknown>>) : [];
  // Demo viva: cenários {who,text,q} ganham chip «Experimente pedir» que revela a conversa.
  const [extra, setExtra] = useState<Array<{ who: 'me' | 'ai'; text: string }>>([]);
  const scenarios = items
    .filter((it) => typeof it === 'object' && String((it as Record<string, unknown>).q ?? ''))
    .map((it) => it as Record<string, unknown>);
  return (
    <div className="lp-win" role="img" aria-label={title}>
      <div className="lp-win-bar"><i /><i /><i /><span>{title}</span></div>
      {stats.length > 0 && (
        <div className="lp-win-stats">
          {stats.slice(0, 3).map((s, i) => (
            <div key={i}><b>{String(s.value ?? '')}</b><span>{String(s.label ?? '')}</span></div>
          ))}
        </div>
      )}
      {items.map((it, i) => {
        const who = typeof it === 'string' ? (i % 2 ? 'me' : 'ai') : String(it.who ?? 'ai');
        const text = typeof it === 'string' ? it : String(it.text ?? '');
        return <div className={`lp-msg lp-msg--${who === 'me' ? 'me' : 'ai'}`} key={i}>{text}</div>;
      })}
      {extra.map((m, i) => <div className={`lp-msg lp-msg--${m.who}`} key={`x${i}`}>{m.text}</div>)}
      {scenarios.length > 0 && (
        <div className="lp-win-try">
          {scenarios.map((sc, i) => (
            <button key={i} className="lp-try-chip" onClick={() => setExtra((x) => [...x, { who: 'me', text: String(sc.q) }, { who: 'ai', text: String(sc.text ?? '') }])}>
              Experimente pedir: «{String(sc.q)}»
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StepsBlock({ el }: { el: BuilderElement }) {
  const items = Array.isArray(el.content.items) ? (el.content.items as Array<Record<string, unknown> | string>) : [];
  return (
    <div className="lp-steps">
      {items.map((it, i) => {
        const title = typeof it === 'string' ? '' : String(it.title ?? '');
        const text = typeof it === 'string' ? it : String(it.text ?? '');
        const icon = typeof it === 'string' ? null : resolveIcon(it.icon);
        return (
          <div className="lp-step" key={i}>
            <b className="lp-step-n">{String(i + 1).padStart(2, '0')}</b>
            {icon && <span className="lp-el-icon"><Icon name={icon} size={20} /></span>}
            {title && <strong>{title}</strong>}
            <span>{text}</span>
          </div>
        );
      })}
    </div>
  );
}

function ComparisonBlock({ el }: { el: BuilderElement }) {
  const left = (el.content.left ?? {}) as Record<string, unknown>;
  const right = (el.content.right ?? {}) as Record<string, unknown>;
  const col = (side: Record<string, unknown>, good: boolean) => (
    <div className={`lp-cmp-col${good ? ' lp-cmp-col--good' : ''}`}>
      <b>{String(side.title ?? '')}</b>
      {(Array.isArray(side.items) ? (side.items as unknown[]) : []).map((t, i) => <span key={i}>{good ? '✓' : '✕'} {String(t)}</span>)}
    </div>
  );
  return (
    <div className="lp-cmp">
      {col(left, false)}
      {col(right, true)}
    </div>
  );
}

function QuoteBlock({ el }: { el: BuilderElement }) {
  return (
    <figure className="lp-quote">
      <blockquote>{String(el.content.text ?? '')}</blockquote>
      {Boolean(el.content.author) && <figcaption>{String(el.content.author)}{el.content.role ? ` · ${String(el.content.role)}` : ''}</figcaption>}
    </figure>
  );
}

/** Barras horizontais CSS — números reais do briefing, nunca inventados. */
function ChartBlock({ el }: { el: BuilderElement }) {
  const title = String(el.content.title ?? '').trim();
  const unit = String(el.content.unit ?? '').trim();
  const items = (Array.isArray(el.content.items) ? (el.content.items as Array<Record<string, unknown>>) : [])
    .map((it) => ({ label: String(it.label ?? ''), value: Number(it.value) }))
    .filter((it) => it.label && Number.isFinite(it.value));
  if (!items.length) return null;
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 1);
  return (
    <div className="lp-chart" role="img" aria-label={title || 'Gráfico de barras'}>
      {title && <b>{title}</b>}
      {items.map((it, i) => (
        <div className="lp-chart-row" key={i}>
          <span className="lp-chart-label">{it.label}</span>
          <span className="lp-chart-bar"><i style={{ width: `${Math.max(4, Math.round((Math.abs(it.value) / max) * 100))}%` }} /></span>
          <span className="lp-chart-val">{Number.isInteger(it.value) ? it.value : it.value.toFixed(1)}{unit}</span>
        </div>
      ))}
    </div>
  );
}

/** Rodapé rico: colunas de links + nota, com o ink do tema. */
function FooterBlock({ el, page }: { el: BuilderElement; page: LandingPage }) {
  const note = String(el.content.note ?? '').trim();
  const cols = (Array.isArray(el.content.cols) ? (el.content.cols as Array<Record<string, unknown>>) : [])
    .map((c) => ({ title: String(c.title ?? ''), items: (Array.isArray(c.items) ? (c.items as Array<Record<string, unknown>>) : []).map((x) => ({ label: String(x.label ?? ''), url: String(x.url ?? '') })) }))
    .filter((c) => c.title || c.items.length);
  return (
    <div className="lp-footer">
      <div className="lp-footer-brand">
        {page.logo?.url ? <img src={page.logo.url} alt={page.logo.alt ?? page.name} style={{ height: 28 }} /> : <b>{page.name}</b>}
        {note && <p>{note}</p>}
        {page.socialLinks && page.socialLinks.length > 0 && (
          <div className="lp-footer-social">
            {page.socialLinks.map((l, i) => <a key={i} href={l.url} target="_blank" rel="noreferrer">{l.platform}</a>)}
          </div>
        )}
      </div>
      {cols.map((c, i) => (
        <div className="lp-footer-col" key={i}>
          <b>{c.title}</b>
          {c.items.map((x, j) => <a key={j} href={x.url || '#'}>{x.label}</a>)}
        </div>
      ))}
    </div>
  );
}

/** Contagem decrescente ao segundo até à data limite de uma promoção/evento real. */
function CountdownBlock({ el }: { el: BuilderElement }) {
  const endMs = new Date(String(el.content.end ?? '')).getTime();
  const label = String(el.content.label ?? 'Termina em');
  const live = String(el.content.live ?? '⚡ A decorrer agora — última chamada!');
  const over = String(el.content.over ?? 'Terminou — fala connosco.');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (Number.isNaN(endMs)) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [endMs]);
  if (Number.isNaN(endMs)) return null;
  const diff = endMs - now;
  if (diff <= 0) return <div className="lp-cd lp-cd--over"><b>{over}</b></div>;
  const pad = (n: number) => String(n).padStart(2, '0');
  const cells = [
    [Math.floor(diff / 864e5), 'dias'],
    [Math.floor((diff % 864e5) / 36e5), 'horas'],
    [Math.floor((diff % 36e5) / 6e4), 'min'],
    [Math.floor((diff % 6e4) / 1e3), 'seg'],
  ] as const;
  return (
    <div className="lp-cd">
      <span className="lp-cd-label">{label}</span>
      <div className="lp-cd-cells">
        {cells.map(([v, l]) => <div className="lp-cd-cell" key={l}><b>{pad(v)}</b><i>{l}</i></div>)}
      </div>
      {diff < 2 * 864e5 && <span className="lp-cd-hot">{live}</span>}
    </div>
  );
}

export function ElementView({ el, onSubmitForm, page }: { el: BuilderElement; onSubmitForm?: (values: Record<string, string>) => Promise<string>; page?: LandingPage }) {
  switch (el.type) {
    case 'text': return <TextBlock el={el} />;
    case 'list': return <ListBlock el={el} />;
    case 'button': {
      const label = String(el.content.label ?? 'Botão');
      const href = String(el.content.url ?? '').trim();
      const variant = String(el.content.variant ?? 'primary');
      const cls = `lp-btn${variant === 'secondary' ? ' secondary' : ''}`;
      // CTA do agente: sem link, ou âncora que não existe na página → leva ao formulário.
      if (!href || href.startsWith('#')) {
        return (
          <a className={cls} href={href || '#formulario'} onClick={(e) => {
            e.preventDefault();
            const target = href && href.length > 1 ? document.getElementById(href.slice(1)) : null;
            const el = target ?? document.querySelector('.lp-form');
            if (!el) return;
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => (el.querySelector('input,textarea,select') as HTMLElement | null)?.focus({ preventScroll: true }), 450);
          }}>{label}</a>
        );
      }
      return <a className={cls} href={href} target="_blank" rel="noreferrer">{label}</a>;
    }
    case 'image': {
      const url = String(el.content.url ?? '');
      if (!url) return null;
      // Foto morta (URL partida/morta): esconde em vez de mostrar o alt como bloco preto.
      return <img className="lp-img" src={url} alt={String(el.content.alt ?? '')} onError={(e) => { e.currentTarget.style.display = 'none'; }} style={{ maxHeight: el.content.maxHeight ? Number(el.content.maxHeight) : undefined }} />;
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
    case 'demo': return <DemoBlock el={el} />;
    case 'steps': return <StepsBlock el={el} />;
    case 'comparison': return <ComparisonBlock el={el} />;
    case 'quote': return <QuoteBlock el={el} />;
    case 'chart': return <ChartBlock el={el} />;
    case 'footer': return page ? <FooterBlock el={el} page={page} /> : null;
    case 'gallery': {
      const images = Array.isArray(el.content.images) ? (el.content.images as Array<Record<string, unknown>>) : [];
      return (
        <div className="lp-cards">
          {images.map((g, i) => <img key={i} className="lp-img" src={String(g.url ?? '')} alt={String(g.alt ?? '')} onError={(e) => { e.currentTarget.style.display = 'none'; }} style={{ margin: 0 }} />)}
        </div>
      );
    }
    case 'map': {
      const q = String(el.content.query ?? 'Portugal');
      return (
        <div className="lp-map">
          <iframe title="Mapa" loading="lazy" referrerPolicy="no-referrer-when-downgrade"
            src={'https://www.google.com/maps?q=' + encodeURIComponent(q) + '&output=embed'} />
        </div>
      );
    }
    case 'countdown': return <CountdownBlock el={el} />;
    case 'float': {
      const digits = String(el.content.phone ?? '').replace(/\D/g, '');
      if (digits.length < 9) return null;
      const num = digits.startsWith('351') ? digits : '351' + digits.slice(-9);
      const msg = String(el.content.message ?? 'Olá! Quero saber mais.');
      return (
        <a className="lp-wa-float" href={'https://wa.me/' + num + '?text=' + encodeURIComponent(msg)} target="_blank" rel="noreferrer" aria-label="Falar no WhatsApp">
          <svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2Zm5.4 14.1c-.2.7-1.3 1.3-1.8 1.3-.5.1-1 .1-1.7-.1-.4-.1-.9-.3-1.6-.6-2.8-1.2-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.8s.7-2 .9-2.2c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.4.2.5.7 1.7.8 1.8.1.1.1.3 0 .4-.1.2-.1.3-.3.5l-.4.5c-.1.1-.3.3-.1.6.2.3.7 1.2 1.6 1.9 1.1.9 2 1.2 2.3 1.4.3.1.5.1.6-.1.2-.2.7-.8.9-1.1.2-.3.4-.2.6-.1l1.7.8c.3.1.5.2.5.3.1.1.1.7-.1 1.4Z" /></svg>
        </a>
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
  'bento': { mode: 'cards', card: true },
};

/** Opções de layout mostradas no editor, agrupadas por tipo de secção. */
export const LAYOUT_OPTIONS: Record<string, string[]> = {
  hero: ['hero-split', 'hero-center', 'hero-fullbleed'],
  benefits: ['stack', 'benefits-grid', 'benefits-zigzag', 'bento'],
  problem: ['stack', 'benefits-grid', 'benefits-zigzag', 'bento'],
  features: ['stack', 'benefits-grid', 'benefits-zigzag', 'bento'],
  social: ['stack', 'proof-stats', 'testimonials-cards', 'logo-marquee', 'bento'],
  proof: ['stack', 'proof-stats', 'testimonials-cards', 'logo-marquee', 'bento'],
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
    'logo-marquee': 'Faixa de marcas', 'bento': 'Grelha bento', stack: 'Empilhado (clássico)',
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

function SectionView({ section, options, revealed, page }: { section: BuilderSection; options: RenderOptions; revealed: boolean; page: LandingPage }) {
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
      <ElementView el={el} page={page} onSubmitForm={options.onSubmitForm ? (values) => options.onSubmitForm!(section.id, el.id, values) : undefined} />
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
          <div className={`lp-layout-cards${spec.card ? ' lp-cards-auto' : ''}`}>
            {section.elements.filter((e) => e.type !== 'image' && e.type !== 'gallery').map((el) => <div key={el.id} className="lp-card" onClick={interactive ? (e) => { e.stopPropagation(); options.onSelectElement?.(section.id, el.id); } : undefined}><ElementView el={el} onSubmitForm={submit(el)} /></div>)}
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
                    <img className="lp-img" src={String((imgs[i % Math.max(imgs.length, 1)].content as Record<string, unknown>).url ?? '')} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
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
          {section.elements.filter((e) => e.type === 'stats' && !lead.includes(e)).map((el) => elKey(el))}
          {section.elements.filter((e) => e.type !== 'stats' && e.type !== 'image' && e.type !== 'gallery' && !lead.includes(e)).map((el) => elKey(el))}
          {imgs.map((el) => elKey(el))}
        </>
      );
      break;
    case 'marquee':
      body = (
        <>
          {lead.map((el) => elKey(el))}
          {section.elements.filter((e) => !lead.includes(e) && (e.type === 'marquee' || (e.type === 'list' && splitParagraphs(String(e.content.text ?? '')).length === 0))).map((el) => elKey(el))}
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
      id={`sec-${section.id}`}
      data-reveal={section.id}
      data-section={section.id}
      className={`lp-section lp-sec--${section.type} lp-layout--${layout}${dark ? ' dark' : ''}${revealed ? ' is-visible' : ''}${options.selectedElementId === `section:${section.id}` ? ' sec-selected' : ''}`}
      style={style}
    >
      <div className="lp-inner">{body}</div>
    </section>
  );
}

/** Etiqueta curta do guia de navegação: usa o título da secção (limpo) ou o tipo. */
function sectionNavLabel(section: BuilderSection): string {
  const t = String(section.title ?? '').replace(/<[^>]+>/g, '').replace(/\*/g, '').trim();
  if (t) return t.length > 20 ? `${t.slice(0, 19)}…` : t;
  const BY_TYPE: Record<string, string> = {
    features: 'Vantagens', proof: 'Prova', testimonials: 'Testemunhos', pricing: 'Preços',
    faq: 'Perguntas', contact: 'Contacto', form: 'Contacto', cta: 'Oferta', gallery: 'Galeria',
    stats: 'Números', schedule: 'Agendar',
  };
  return BY_TYPE[section.type] ?? 'Secção';
}

function scrollToForm(e: { preventDefault: () => void }) {
  e.preventDefault();
  const form = document.querySelector('.lp-form');
  if (!form) return;
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => (form.querySelector('input,textarea,select') as HTMLElement | null)?.focus({ preventScroll: true }), 450);
}

/** Pares de fontes de lista fixa (sem web fonts — stacks de sistema). */
const LP_FONTS: Record<string, string> = {
  modern: '"Space Grotesk", ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif',
  editorial: '"Fraunces", Georgia, "Times New Roman", serif',
  humanist: '"Literata", "Segoe UI", Verdana, system-ui, sans-serif',
  mono: '"JetBrains Mono", "Cascadia Mono", Consolas, ui-monospace, monospace',
};

export default function LandingRender({ page, options = {} }: { page: LandingPage; options?: RenderOptions }) {
  const revealActive = !options.interactive;
  const revealed = useReveal(revealActive);
  const visible = page.sections.filter((s) => !s.hidden);
  const theme = page.theme;
  const fontCss = theme?.font ? LP_FONTS[theme.font] : undefined;
  const rootVars = {
    '--lp-accent': theme?.accent ?? page.aiContext?.brandColors?.[0] ?? '#6d5dfc',
    ...(theme ? {
      '--lp-bg': theme.bg,
      '--lp-ink': theme.ink,
      '--lp-accent2': theme.accent2 ?? theme.accent,
      '--lp-radius': `${theme.radius ?? 18}px`,
      ...(fontCss ? { '--lp-head': fontCss } : {}),
    } : {}),
  } as CSSProperties;
  return (
    <div className={`lp${theme?.mode === 'dark' ? ' dark' : ''}`} data-lp-mode={theme?.mode} data-lp-grad={theme?.gradient} style={rootVars}>
      <div className="lp-nav">
        {page.logo?.url
          ? <img src={page.logo.url} alt={page.logo.alt ?? page.name} style={{ height: 30 }} />
          : <span className="lp-brand">{page.name.toUpperCase()}</span>}
        {/* Guia como nas referências: liga as secções pela ordem e ainda dá CTA destacado. */}
        <nav className="lp-nav-links">
          {visible.filter((s) => s.type !== 'hero').slice(0, 5).map((s) => (
            <a key={s.id} href={`#sec-${s.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(`sec-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
              {sectionNavLabel(s)}
            </a>
          ))}
        </nav>
        <a className="lp-btn" style={{ padding: '8px 16px', fontSize: 12 }} href="#formulario" onClick={scrollToForm}>{page.aiContext?.cta ?? 'Contacto'}</a>
      </div>
      {visible.map((s) => <SectionView key={s.id} section={s} options={options} page={page} revealed={!revealActive || revealed.has(s.id)} />)}
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
