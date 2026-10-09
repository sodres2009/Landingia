'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { LandingPage } from '@/lib/types';
import { api } from '@/lib/api';

/** Lista dedicada do dashboard: só páginas publicadas, com o link inteiro à vista
 *  para copiar num clique — o sítio onde se vem buscar o link de partilha. */
export default function PublishedLinks({ pages }: { pages: LandingPage[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [results, setResults] = useState<{ slug: string; rows: Array<{ platform: string; ok: boolean; detail: string }> } | null>(null);
  if (!pages.length) return null;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  function copy(slug: string) {
    void navigator.clipboard.writeText(`${origin}/p/${slug}`).then(() => {
      setCopied(slug);
      setTimeout(() => setCopied(null), 1800);
    }).catch(() => undefined);
  }

  /** Partilha direta: WhatsApp/Facebook/LinkedIn abrem com o link pronto a enviar;
   *  Instagram não aceita link externo — copia e abre a app para colar. */
  function share(slug: string, via: 'wa' | 'fb' | 'ig' | 'li') {
    const url = `${origin}/p/${slug}`;
    const text = 'Dá uma vista a esta página';
    if (via === 'wa') window.open(`https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`, '_blank', 'noopener');
    else if (via === 'fb') window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank', 'noopener');
    else if (via === 'li') window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, '_blank', 'noopener');
    else {
      void navigator.clipboard.writeText(url).catch(() => undefined);
      window.open('https://www.instagram.com/', '_blank', 'noopener');
      setCopied(slug);
      setTimeout(() => setCopied(null), 2500);
    }
  }

  /** Publicação direta: o servidor posta nas redes ligadas e diz o resultado de cada uma. */
  async function publishNow(slug: string) {
    setBusySlug(slug);
    setResults(null);
    try {
      const d = await api.socialPublish(slug, `${origin}/p/${slug}`);
      setResults({ slug, rows: d.results });
    } catch (e) {
      setResults({ slug, rows: [{ platform: '?', ok: false, detail: e instanceof Error ? e.message : 'Falha ao publicar.' }] });
    } finally {
      setBusySlug(null);
    }
  }

  return (
    <div id="publicadas" style={{ marginBottom: 22, scrollMarginTop: 110 }}>
      <span className="ai-label">PÁGINAS PUBLICADAS — COPIA E PARTILHA</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        {pages.map((p) => (
          <div key={p.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: '1px solid var(--line)', borderRadius: 12, background: 'var(--panel2, rgba(255,255,255,.03))', flexWrap: 'wrap' }}>
              <b style={{ fontSize: 13, minWidth: 130 }}>{p.name}</b>
              <a href={`/p/${p.publishedSlug}`} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: '#8b96b3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                {origin}/p/{p.publishedSlug}
              </a>
              <a className="btn ghost small" href={`/p/${p.publishedSlug}`} target="_blank" rel="noreferrer">🌐 Abrir</a>
              <button className="btn ghost small" onClick={() => copy(String(p.publishedSlug))} title="Copiar o link">
                {copied === p.publishedSlug ? '✓ Copiado' : '⧉ Copiar'}
              </button>
              <button className="btn ghost small" onClick={() => share(String(p.publishedSlug), 'wa')} title="Partilhar no WhatsApp">💬 WhatsApp</button>
              <button className="btn ghost small" onClick={() => share(String(p.publishedSlug), 'fb')} title="Partilhar no Facebook">📘 Facebook</button>
              <button className="btn ghost small" onClick={() => share(String(p.publishedSlug), 'li')} title="Partilhar no LinkedIn">💼 LinkedIn</button>
              <button className="btn ghost small" onClick={() => share(String(p.publishedSlug), 'ig')} title="Copia o link e abre o Instagram (cola na descrição/story)">📸 Instagram</button>
              <button className="btn primary small" disabled={busySlug === String(p.publishedSlug)} onClick={() => void publishNow(String(p.publishedSlug))} title="Publica nas redes ligadas nas Definições">
                {busySlug === String(p.publishedSlug) ? '⏳ A publicar…' : '🚀 Publicar direto'}
              </button>
              <Link href={`/builder/${p.id}`} className="btn ghost small">Editar</Link>
            </div>
            {results && results.slug === p.publishedSlug && (
              <div style={{ fontSize: 12, padding: '6px 14px', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {results.rows.map((r) => (
                  <span key={r.platform} style={{ color: r.ok ? 'var(--ok, #46a758)' : 'var(--err, #e5484d)' }}>
                    {r.ok ? '✓' : '✕'} {r.platform}: {r.ok ? 'publicado' : r.detail}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
