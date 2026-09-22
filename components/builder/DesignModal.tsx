'use client';

import { useState } from 'react';
import type { BuilderSection } from '@/lib/types';

/** Presets de design aplicados por secção (tema, efeito, layout). */

export interface DesignPreset {
  id: string;
  name: string;
  desc: string;
  style: Partial<BuilderSection['style']>;
}

export const PRESETS: DesignPreset[] = [
  { id: 'aurora', name: 'Aurora', desc: 'Gradiente azul/violeta', style: { theme: 'aurora', background: '#0e1830', accent: '#5d54d8' } },
  { id: 'glass', name: 'Glass', desc: 'Vidro fumado, tons frios', style: { theme: 'glass', background: '#0c2a3a', accent: '#5ab5c9' } },
  { id: 'cinematic', name: 'Cinemático', desc: 'Escuro dramático', style: { theme: 'cinematic', background: '#111827', accent: '#6848a5' } },
  { id: 'mesh', name: 'Mesh', desc: 'Gradientes multicor', style: { theme: 'mesh', background: '#17223a', accent: '#78d8d0' } },
  { id: 'editorial', name: 'Editorial', desc: 'Claro com corte forte', style: { theme: 'editorial', background: '#f6f1e8', accent: '#1d2432' } },
  { id: 'gradient', name: 'Gradiente', desc: 'Roxo intenso', style: { theme: 'gradient', background: '#4e45c7', accent: '#d26cff' } },
  { id: 'soft', name: 'Soft', desc: 'Neutro e leve', style: { theme: 'soft', background: '#f6f8fc', accent: '#7b879d' } },
  { id: 'image', name: 'Imagem', desc: 'Fundo com fotografia', style: { theme: 'image', background: '#0c1423', accent: '#4f7cff' } },
];

export default function DesignModal({ onClose, onApply }: { onClose: () => void; onApply: (preset: DesignPreset, scope: 'all' | 'current') => void }) {
  const [scope, setScope] = useState<'all' | 'current'>('all');
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3>🎨 Design</h3>
            <p className="sub">Aplica um preset visual às secções. Podes também pedir ao Assistente IA para recriar a página noutro estilo.</p>
          </div>
          <button className="close" onClick={onClose}>×</button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
          <button className={`chip${scope === 'all' ? ' on' : ''}`} style={scope === 'all' ? { borderColor: 'var(--violet)' } : undefined} onClick={() => setScope('all')}>Todas as secções</button>
          <button className={`chip${scope === 'current' ? ' on' : ''}`} style={scope === 'current' ? { borderColor: 'var(--violet)' } : undefined} onClick={() => setScope('current')}>Só a secção atual</button>
        </div>
        <div className="design-grid">
          {PRESETS.map((p) => (
            <button key={p.id} className={`design-card d-${p.id}`} onClick={() => { onApply(p, scope); onClose(); }}>
              <span className="design-prev"><i /><i /><i /></span>
              <strong>{p.name}</strong>
              <small>{p.desc}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
