'use client';

import { useState } from 'react';
import type { SocialLink } from '@/lib/types';

/** Editor de redes sociais da página (rodapé público). */

const PLATFORMS = ['Instagram', 'Facebook', 'LinkedIn', 'X', 'YouTube', 'TikTok', 'WhatsApp'];

export default function SocialModal({ links, onSave, onClose }: { links: SocialLink[]; onSave: (links: SocialLink[]) => void; onClose: () => void }) {
  const [rows, setRows] = useState<SocialLink[]>(links.length ? links : []);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ width: 'min(560px,100%)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3>↗ Redes Sociais</h3>
            <p className="sub">Aparecem no rodapé da página pública.</p>
          </div>
          <button className="close" onClick={onClose}>×</button>
        </div>
        {rows.map((r, i) => (
          <div className="social-row" key={i}>
            <select value={r.platform} onChange={(e) => setRows(rows.map((x, j) => (i === j ? { ...x, platform: e.target.value } : x)))}>
              {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
            </select>
            <input placeholder="https://…" value={r.url} onChange={(e) => setRows(rows.map((x, j) => (i === j ? { ...x, url: e.target.value } : x)))} />
            <button className="btn danger small" onClick={() => setRows(rows.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <button className="btn ghost small" onClick={() => setRows([...rows, { platform: 'Instagram', url: '' }])}>+ rede social</button>
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <button className="btn primary" onClick={() => { onSave(rows.filter((r) => r.url.trim())); onClose(); }}>Guardar</button>
          <button className="btn ghost" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
