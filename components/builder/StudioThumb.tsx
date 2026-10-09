'use client';

import { useEffect, useRef, useState } from 'react';

/** Miniatura de uma página Studio: desenhada à largura real de telemóvel (390px)
 *  e reduzida para caber no cartão — o design nunca é esmagado pelo contentor.
 *  Sem JS (sandbox vazio): serve só para escolher a versão. */
export default function StudioThumb({ html, height = 280 }: { html: string; height?: number }) {
  const W = 390;
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(W);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setW(el.clientWidth || W);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = Math.min(1, w / W);
  const clean = html.replace(/<script data-studio[\s\S]*?<\/script>/g, '');
  return (
    <div ref={ref} style={{ position: 'relative', overflow: 'hidden', height, borderRadius: 10, background: '#fff', pointerEvents: 'none' }}>
      <iframe
        title="Pré-visualização Studio"
        sandbox=""
        srcDoc={clean}
        style={{ width: W, height: Math.ceil(height / scale), border: 0, display: 'block', background: '#fff', transform: `scale(${scale})`, transformOrigin: 'top left' }}
      />
    </div>
  );
}
