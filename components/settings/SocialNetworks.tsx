'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Status = Record<string, { connected: boolean; label: string }>;

const NETWORKS = [
  { key: 'facebook', icon: '📘', name: 'Facebook', hint: 'Token de Página (Graph API). Obtém um token de longa duração no Business Tools → System User ou no Graph API Explorer com a Página selecionada.' },
  { key: 'instagram', icon: '📸', name: 'Instagram', hint: 'Conta Business/Creator ligada a uma Página do Facebook. Usa o mesmo token de Página + o ID numérico da conta Instagram.' },
  { key: 'linkedin', icon: '💼', name: 'LinkedIn', hint: 'Token de membro com a autorização «Share on LinkedIn» (w_member_social). Gera um token no teu LinkedIn Developer App (OAuth 2.0).' },
] as const;

/** Canal de redes sociais: ligar por token (validado na plataforma) e ver o estado. */
export default function SocialNetworks() {
  const [status, setStatus] = useState<Status | null>(null);
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [igId, setIgId] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const refresh = useCallback(() => {
    void api.socialStatus().then((d) => setStatus(d.platforms)).catch(() => undefined);
  }, []);
  useEffect(refresh, [refresh]);

  async function connect(platform: string) {
    const token = (tokens[platform] ?? '').trim();
    if (!token) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      const r = await api.socialConnect(platform, token, platform === 'instagram' ? igId : undefined);
      setMsg(`Ligado${r.label ? ` — ${r.label}` : ''}.`);
      setTokens((t) => ({ ...t, [platform]: '' }));
      setOpen(null);
      refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não foi possível ligar.');
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(platform: string) {
    setErr('');
    try { await api.socialDisconnect(platform); refresh(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Falha ao desligar.'); }
  }

  return (
    <div className="create-card" style={{ marginTop: 14 }}>
      <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>Redes sociais — publicar direto</h3>
      <p style={{ color: 'var(--dim)', fontSize: 12, margin: '0 0 10px' }}>
        Liga as tuas contas com um token de acesso teu — validamos na própria plataforma antes de guardar
        (o token fica no servidor e nunca volta a ser mostrado). Depois, nas páginas publicadas, um clique
        publica o link no Facebook, no Instagram e no LinkedIn.
      </p>
      {NETWORKS.map((n) => {
        const st = status?.[n.key];
        return (
          <div key={n.key} style={{ borderTop: '1px solid var(--line)', padding: '10px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{n.icon}</span>
              <b style={{ fontSize: 13, flex: 1 }}>{n.name}</b>
              {st?.connected
                ? <><span style={{ fontSize: 12, color: 'var(--ok, #46a758)' }}>● ligado{st.label ? ` · ${st.label}` : ''}</span>
                    <button className="btn ghost small" onClick={() => void disconnect(n.key)}>Desligar</button></>
                : <><span style={{ fontSize: 12, color: 'var(--dim)' }}>● por ligar</span>
                    <button className="btn small" onClick={() => setOpen(open === n.key ? null : n.key)}>{open === n.key ? 'Fechar' : 'Ligar'}</button></>}
            </div>
            {open === n.key && !st?.connected && (
              <div style={{ marginTop: 8 }}>
                <p style={{ fontSize: 11.5, color: 'var(--dim)', margin: '0 0 6px' }}>{n.hint}</p>
                <input type="password" placeholder={n.key === 'linkedin' ? 'token de membro (Bearer…)' : 'token de Página (EAA…)'} value={tokens[n.key] ?? ''}
                  onChange={(e) => setTokens((t) => ({ ...t, [n.key]: e.target.value }))} style={{ width: '100%', marginBottom: 6 }} />
                {n.key === 'instagram' && (
                  <input placeholder="ID da conta Instagram Business (números)" value={igId} onChange={(e) => setIgId(e.target.value)} style={{ width: '100%', marginBottom: 6 }} />
                )}
                <button className="btn primary small" disabled={busy || !(tokens[n.key] ?? '').trim()} onClick={() => void connect(n.key)}>
                  {busy ? '⏳ A validar…' : 'Validar e ligar'}
                </button>
              </div>
            )}
          </div>
        );
      })}
      {msg && <p style={{ color: 'var(--ok, #46a758)', fontSize: 12 }}>{msg}</p>}
      {err && <p style={{ color: 'var(--err, #e5484d)', fontSize: 12 }}>{err}</p>}
    </div>
  );
}
