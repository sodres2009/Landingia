'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api, API_URL } from '@/lib/api';
import type { LandingPage } from '@/lib/types';

type ChatMsg = { r: 'user' | 'agent'; t: string };

/** Editor das páginas Studio: preview a cheio + CONVERSA com o assistente —
 *  histórico guardado por página, estado («a pensar…»), resumo do que fez, e
 *  perguntas quando não percebe. 📷 coloca fotos reais; clique no preview
 *  aponta o alvo da edição. */
export default function StudioPanel({ page, onSave }: { page: LandingPage; onSave: (page: LandingPage) => void }) {
  const [ask, setAsk] = useState('');
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [selected, setSelected] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Conversa por página — sobrevive a trocar de ecrã (localStorage).
  const chatKey = `la_chat_${page.id}`;
  const [msgs, setMsgs] = useState<ChatMsg[]>(() => {
    try { return JSON.parse(localStorage.getItem(chatKey) || '[]') as ChatMsg[]; } catch { return []; }
  });
  const chatRef = useRef<HTMLDivElement>(null);
  const loadedKey = useRef(chatKey); // só guardamos depois de o histórico desta chave estar carregado
  useEffect(() => {
    if (loadedKey.current !== chatKey) return; // troca de página: esperar o load abaixo
    try { localStorage.setItem(chatKey, JSON.stringify(msgs.slice(-40))); } catch { /* privado */ }
    const el = chatRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatKey, msgs]);
  const firstId = useRef(page.id);
  useEffect(() => {
    // só carrega ao MUDAR de página — a primeira montagem mantém o histórico do useState
    if (firstId.current === page.id) return;
    firstId.current = page.id;
    try { setMsgs(JSON.parse(localStorage.getItem(`la_chat_${page.id}`) || '[]') as ChatMsg[]); } catch { setMsgs([]); }
    loadedKey.current = `la_chat_${page.id}`;
  }, [page.id]);

  // O iframe desenha SEMPRE à largura real do dispositivo (1280 / 390) e é
  // escalado para caber no painel — nunca é o design que se esmaga.
  const W = device === 'mobile' ? 390 : 1280;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ w: W, h: 800 });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setFit({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = Math.min(1, fit.w / W);

  // Clique no preview → o elemento escolhido (via postMessage do script que
  // injetamos só aqui em baixo) vira alvo da próxima instrução do assistente.
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const d = e.data as { studio?: string; desc?: string } | undefined;
      if (d && d.studio === 'select') setSelected(String(d.desc ?? '').slice(0, 90));
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  // Runtime fresco do servidor: melhorias (float dedupe, overflow guard) valem
  // também para páginas gravadas antes — o preview nunca mostra JS velho.
  const [runtime, setRuntime] = useState('');
  useEffect(() => {
    void fetch(`${API_URL}/agent/design/runtime`).then((r) => (r.ok ? r.text() : '')).then(setRuntime).catch(() => undefined);
  }, []);
  const previewHtml = useMemo(() => {
    let base = (page.html ?? '').replace(/<style data-studio[^>]*>[\s\S]*?<\/style>/g, '').replace(/<script data-studio[\s\S]*?<\/script>/g, '');
    if (runtime && base) base = /<\/body>/i.test(base) ? base.replace(/<\/body>/i, runtime + '</body>') : base + runtime;
    // O formulário do preview envia a sério quando a página já tem link público
    // (metas lp-api/lp-slug, como na página publicada); sem publicação é ensaio
    // honesto — o runtime mostra «nada foi enviado» em vez de um falso «Recebido».
    const metas = page.publishedSlug
      ? `<meta name="lp-api" content="${API_URL}"><meta name="lp-slug" content="${page.publishedSlug}">`
      : '<meta name="lp-preview" content="1">';
    base = /<head(\s[^>]*)?>/i.test(base) ? base.replace(/<head(\s[^>]*)?>/i, (m) => m + metas) : metas + base;
    // Só no editor: click-to-select. Não vive no runtime publicado.
    const pick = '<script data-pick>(function(){var s=null;document.addEventListener(\'click\',function(e){e.preventDefault();e.stopPropagation();var el=e.target;if(el===document.documentElement||el===document.body)return;if(s)s.style.outline=\'\';s=el;el.style.outline=\'3px solid #6d5dfc\';el.style.outlineOffset=\'-3px\';var d=(el.getAttribute&&el.getAttribute(\'alt\'))||\'\';if(!d){var t=(el.innerText||el.textContent||\'\').trim().replace(/\\s+/g,\' \').slice(0,80);d=(el.tagName||\'\').toLowerCase()+(t?\': \'+t:\'\');}parent.postMessage({studio:\'select\',desc:d},\'*\');},true);})();</script>';
    return /<\/body>/i.test(base) ? base.replace(/<\/body>/i, pick + '</body>') : base + pick;
  }, [page.html, runtime, page.publishedSlug]);

  const briefing = (page.aiContext?.answers as Record<string, string> | undefined)?.__briefing ?? page.name ?? '';

  /** Foto real do cliente sobe para o servidor; fica colada até ser usada. */
  async function addPhoto(file: File | undefined) {
    if (!file) return;
    setPhotoBusy(true);
    try {
      const { url } = await api.uploadPhoto(file);
      setPhotos((prev) => (prev.includes(url) ? prev : [...prev, url]));
    } catch (e) {
      setMsgs((m) => [...m, { r: 'agent', t: '✗ ' + (e instanceof Error ? e.message : 'Não foi possível enviar a foto.') }]);
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function send() {
    const instruction = ask.trim();
    if (!instruction || busy || !page.html) return;
    setAsk('');
    setBusy(true);
    setStage('a enviar…');
    setMsgs((m) => [...m, { r: 'user', t: instruction }]);
    let full = instruction;
    if (selected) full += `\nALVO ESCOLHIDO PELO UTILIZADOR (clicou nele na página): «${selected}» — edita APENAS esse elemento e preserva o resto.`;
    if (photos.length) full += `\nFOTOS REAIS DO CLIENTE (usa como src em <img>, nesta ordem, com alt descritivo): ${photos.join(' ')}`;
    try {
      const r = await api.designEdit(page.html, full, briefing, (s) => setStage(s));
      if (r.ask) {
        setMsgs((m) => [...m, { r: 'agent', t: '❓ ' + r.ask }]);
      } else {
        onSave({ ...page, html: r.html, phone: r.phone ?? page.phone });
        const fallback = 'Feito ✓ — ' + (instruction.length > 60 ? instruction.slice(0, 60) + '…' : instruction) + '.';
        setMsgs((m) => [...m, { r: 'agent', t: r.summary ? '✓ ' + r.summary : fallback }]);
        setSelected('');
      }
    } catch (e) {
      let msg = e instanceof Error ? e.message : 'Não consegui editar a página.';
      if (/failed to fetch|network\s*error|load failed|err_/i.test(msg)) {
        msg = 'Não consegui ligar ao assistente — carrega a página com Ctrl+F5 e tenta outra vez (versão antiga aberta).';
      }
      setMsgs((m) => [...m, { r: 'agent', t: '✗ ' + msg }]);
    } finally {
      setBusy(false);
      setStage('');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
        <button className="btn small" onClick={() => setDevice('desktop')}>🖥 Desktop</button>
        <button className="btn small" onClick={() => setDevice('mobile')}>📱 Telemóvel</button>
        <span style={{ fontSize: 12, color: '#8b96b3' }}>desenhado a {W}px{scale < 1 ? ` · pré-visualização a ${Math.round(scale * 100)}%` : ''}</span>
      </div>
      <div ref={wrapRef} style={{ flex: 1, overflow: 'auto', borderRadius: 14, border: '1px solid var(--line)', background: '#0b0f1c', position: 'relative', minHeight: '55vh' }}>
        <div style={{ position: 'absolute', top: 0, left: '50%', transform: device === 'mobile' ? 'translateX(-50%)' : undefined }}>
          <iframe
            title="Pré-visualização Studio"
            srcDoc={previewHtml}
            sandbox="allow-scripts"
            style={{ width: W, height: Math.ceil(fit.h / scale), border: 0, display: 'block', background: '#fff', transform: `scale(${scale})`, transformOrigin: 'top left' }}
          />
        </div>
      </div>
      <div ref={chatRef} style={{ maxHeight: 150, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, padding: '2px 2px' }}>
        {msgs.length === 0 && !busy && (
          <span style={{ fontSize: 12, color: '#8b96b3' }}>Conversa com o assistente: pede para mudar, ele conta o que fez — e se não perceber, pergunta.</span>
        )}
        {msgs.map((m, i) => (
          <div key={i} style={{ alignSelf: m.r === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%', fontSize: 12.5, padding: '6px 10px', borderRadius: 10, background: m.r === 'user' ? 'rgba(109,93,252,.18)' : 'rgba(255,255,255,.06)', color: m.t.startsWith('✗') ? '#e5484d' : 'var(--fg, #e6e9f2)' }}>
            {m.t}
          </div>
        ))}
        {busy && <div style={{ fontSize: 12, color: '#7c6bff' }}>⏳ {stage || 'A trabalhar…'}</div>}
      </div>
      {(selected || photos.length > 0) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {selected && (
            <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, border: '1px solid #6d5dfc', color: '#b9b0ff' }}>
              🎯 {selected} <button className="btn ghost small" style={{ padding: '0 4px' }} onClick={() => setSelected('')} title="Tirar o alvo">✕</button>
            </span>
          )}
          {photos.map((u) => (
            <span key={u} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '3px 8px', borderRadius: 8, border: '1px solid var(--line)' }}>
              <img src={u} alt="foto do cliente" style={{ width: 26, height: 26, objectFit: 'cover', borderRadius: 5 }} />
              <button className="btn ghost small" style={{ padding: '0 4px' }} onClick={() => setPhotos((p) => p.filter((x) => x !== u))} title="Tirar esta foto">✕</button>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void addPhoto(e.target.files?.[0])} />
        <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy || photoBusy} title="Enviar foto real para o agente colocar na página">
          {photoBusy ? '⏳' : '📷 Foto'}
        </button>
        <input
          placeholder="✨ Pede ao assistente: «reduz a letra que está cortada», «troca a foto», «adiciona preços»…"
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void send()}
          disabled={busy}
          style={{ flex: 1 }}
        />
        <button className="btn primary" onClick={() => void send()} disabled={busy || (!ask.trim() && !selected && photos.length === 0)}>
          {busy ? '⏳ A editar…' : 'Editar'}
        </button>
      </div>
    </div>
  );
}
