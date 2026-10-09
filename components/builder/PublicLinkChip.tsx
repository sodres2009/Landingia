'use client';

import { useState } from 'react';

/** Chip do link público de uma página publicada: URL visível + botão copiar.
 *  Usado no editor (ambos os modos) e no cartão do dashboard. */
export default function PublicLinkChip({ slug, compact = false }: { slug: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== 'undefined' ? `${window.location.origin}/p/${slug}` : `/p/${slug}`;

  function copy() {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => undefined);
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} title={url}>
      {!compact && (
        <a href={`/p/${slug}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#8b96b3', textDecoration: 'underline', textUnderlineOffset: 3, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {url}
        </a>
      )}
      <a className="btn ghost small" href={`/p/${slug}`} target="_blank" rel="noreferrer" title="Abrir a página">🌐 Abrir</a>
      <button className="btn ghost small" onClick={copy} title="Copiar o link para partilhar">
        {copied ? '✓ Copiado' : '⧉ Copiar link'}
      </button>
    </span>
  );
}
