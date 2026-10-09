'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import TopNav from '@/components/TopNav';
import SocialNetworks from '@/components/settings/SocialNetworks';
import { getSettings, saveSettings, type Settings } from '@/lib/storage';
import { api, tokenStore, type ApiPublishedRow, type ApiUser } from '@/lib/api';

/** Chip de chave/webhook com valor revelado uma vez (clicar para copiar). */
function SecretChip({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <code
      title="Clicar para copiar"
      style={{ cursor: 'pointer', wordBreak: 'break-all', background: 'rgba(255,255,255,.07)', padding: '6px 8px', borderRadius: 6, display: 'block', fontSize: 12 }}
      onClick={() => { void navigator.clipboard?.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
    >
      {copied ? '✓ copiada' : value}
    </code>
  );
}

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const [provider, setProvider] = useState('local');
  const [user, setUser] = useState<ApiUser | null>(null);

  /* API do CRM */
  type ApiKey = { id: string; label: string; prefix: string; created_at: string };
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  /* webhook por página */
  type Hook = { slug: string; url: string; createdAt: string };
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [pages, setPages] = useState<ApiPublishedRow[]>([]);
  const [hookSlug, setHookSlug] = useState('');
  const [hookUrl, setHookUrl] = useState('');
  const [hookSecret, setHookSecret] = useState<string | null>(null);

  /* palavra-passe */
  const [pwOld, setPwOld] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwOk, setPwOk] = useState(false);

  const reload = useCallback(() => {
    void api.apiKeysList().then((d) => setKeys(d.keys)).catch(() => undefined);
    void api.webhooksList().then((d) => setHooks(d.webhooks)).catch(() => undefined);
    void api.publishedList().then((d) => { setPages(d.pages); if (!hookSlug && d.pages[0]) setHookSlug(d.pages[0].slug); }).catch(() => undefined);
  }, [hookSlug]);

  useEffect(() => {
    setS(getSettings());
    void api.health().then((h) => setProvider(h.llm ? 'fastapi' : 'local')).catch(() => setProvider('offline'));
    if (tokenStore.get()) {
      void api.me().then((d) => { setUser(d.user); reload(); }).catch(() => tokenStore.clear());
    }
  }, [reload]);

  if (!s) return null;

  const createKey = async () => {
    setBusy(true); setErr('');
    try {
      const d = await api.apiKeyCreate(label || 'chave');
      setNewKey(d.token); setLabel(''); reload();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const removeKey = async (id: string) => {
    try { await api.apiKeyDelete(id); reload(); } catch (e) { setErr((e as Error).message); }
  };
  const saveHook = async () => {
    setBusy(true); setErr('');
    try {
      const d = await api.webhookSet(hookSlug, hookUrl);
      setHookSecret(d.secret); reload();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const removeHook = async (slug: string) => {
    try { await api.webhookDelete(slug); reload(); } catch (e) { setErr((e as Error).message); }
  };
  const changePw = async () => {
    setPwMsg(''); setPwOk(false); setBusy(true);
    try {
      await api.changePassword({ oldPassword: pwOld, newPassword: pwNew });
      setPwOk(true); setPwMsg('Palavra-passe alterada. Usa a nova no próximo login.');
      setPwOld(''); setPwNew('');
    } catch (e) { setPwMsg((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <>
      <TopNav />
      <main className="shell" style={{ maxWidth: 640 }}>
        <div className="page-head"><div><h1>Definições</h1><p>Configuração da conta e do motor de IA.</p></div></div>
        <div className="create-card">
          <div className="field"><label>Empresa</label><input value={s.company} onChange={(e) => setS({ ...s, company: e.target.value })} /></div>
          <div className="field"><label>Marca</label><input value={s.brand} onChange={(e) => setS({ ...s, brand: e.target.value })} /></div>
          <div className="field">
            <label>Motor de IA ativo</label>
            <input readOnly value={provider === 'local' ? 'Motor local (sem chaves)' : `Provider externo (${provider})`} />
            <small style={{ color: 'var(--dim)', fontSize: 11 }}>Para ligar um provider externo define AI_PROVIDER=http e AI_BASE_URL no .env.local.</small>
          </div>
          <button className="btn primary" onClick={() => { saveSettings(s); setSaved(true); setTimeout(() => setSaved(false), 2000); }}>Guardar</button>
          {saved && <span style={{ marginLeft: 10, color: 'var(--ok)', fontSize: 12 }}>✓ Guardado</span>}
        </div>

        {user && (
          <div className="create-card" style={{ marginTop: 14 }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>Palavra-passe — {user.email}</h3>
            <div className="field"><label>Palavra-passe atual</label><input type="password" autoComplete="current-password" value={pwOld} onChange={(e) => setPwOld(e.target.value)} /></div>
            <div className="field"><label>Nova palavra-passe (mín. 8 caracteres)</label><input type="password" autoComplete="new-password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} /></div>
            <button className="btn primary" disabled={busy || !pwOld || pwNew.length < 8} onClick={() => void changePw()}>Mudar palavra-passe</button>
            {pwMsg && <p style={{ color: pwOk ? 'var(--ok)' : 'var(--err, #e5484d)', fontSize: 12, marginTop: 8 }}>{pwMsg}</p>}
          </div>
        )}

        <div className="page-head" style={{ marginTop: 28 }}><div><h2>API do CRM / ERP</h2><p style={{ color: 'var(--dim)' }}>Puxa os leads para o teu sistema ou recebe-os por webhook assinado.</p></div></div>

        {!tokenStore.get() || !user ? (
          <div className="create-card"><p style={{ fontSize: 13 }}>Entra na tua conta para gerir chaves e webhooks. <Link href="/login" style={{ color: 'var(--accent)' }}>Entrar →</Link></p></div>
        ) : (
          <>
            <div className="create-card">
              <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>Chaves de API</h3>
              <p style={{ color: 'var(--dim)', fontSize: 12, margin: '0 0 10px' }}>
                Usa a chave no header <code>X-API-Key</code> contra <code>GET /crm/v1/leads?slug=&amp;since=</code> e <code>GET /crm/v1/pages</code>. Cada lead tem o formato <code>{'{{slug, page, sectionId, elementId, values, createdAt}}'}</code>. A chave só aparece uma vez — guarda-a agora.
              </p>
              {keys.map((k) => (
                <div key={k.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, fontSize: 13 }}>
                  <span style={{ flex: 1 }}><b>{k.label}</b> <span style={{ color: 'var(--dim)' }}>· {k.prefix}… · {k.created_at.slice(0, 10)}</span></span>
                  <button className="btn" style={{ fontSize: 12 }} onClick={() => void removeKey(k.id)}>Revogar</button>
                </div>
              ))}
              {newKey && <div style={{ margin: '8px 0' }}><SecretChip value={newKey} /></div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input placeholder="nome da chave (ex.: CRM da empresa)" value={label} onChange={(e) => setLabel(e.target.value)} style={{ flex: 1 }} />
                <button className="btn primary" disabled={busy} onClick={() => void createKey()}>Criar chave</button>
              </div>
            </div>

            <div className="create-card" style={{ marginTop: 14 }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>Webhook por página</h3>
              <p style={{ color: 'var(--dim)', fontSize: 12, margin: '0 0 10px' }}>
                A cada lead novo enviamos <code>POST</code> JSON com o header <code>X-Landing-Signature: sha256=hmac(sha256, body, secret)</code>. 2 retries automáticos; falhar nunca bloqueia o formulário (o lead fica sempre no pull).
              </p>
              {hooks.map((h) => (
                <div key={h.slug} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, fontSize: 13 }}>
                  <span style={{ flex: 1, wordBreak: 'break-all' }}><b>{h.slug}</b> → {h.url}</span>
                  <button className="btn" style={{ fontSize: 12 }} onClick={() => void removeHook(h.slug)}>Remover</button>
                </div>
              ))}
              {hookSecret && (
                <div style={{ margin: '8px 0' }}>
                  <p style={{ fontSize: 12, color: 'var(--ok)', margin: '0 0 6px' }}>Secret gerado — copia agora, não volta a aparecer:</p>
                  <SecretChip value={hookSecret} />
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <select value={hookSlug} onChange={(e) => setHookSlug(e.target.value)} style={{ minWidth: 160 }}>
                  {pages.length === 0 && <option value="">(sem páginas publicadas)</option>}
                  {pages.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
                </select>
                <input placeholder="https://teu-crm.exemplo.com/landing/webhook" value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
                <button className="btn primary" disabled={busy || !hookSlug || !hookUrl} onClick={() => void saveHook()}>Guardar webhook</button>
              </div>
              {err && <p style={{ color: 'var(--err, #e5484d)', fontSize: 12 }}>{err}</p>}
            </div>

            <div className="page-head" style={{ marginTop: 28 }}><div><h2>Redes sociais</h2><p style={{ color: 'var(--dim)' }}>Publica as tuas páginas direto no Facebook, Instagram e LinkedIn.</p></div></div>
            <SocialNetworks />
          </>
        )}
      </main>
    </>
  );
}
