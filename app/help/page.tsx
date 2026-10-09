'use client';

import Link from 'next/link';
import TopNav from '@/components/TopNav';

type QA = { q: string; a: string };

const GUIA = [
  { t: '1. Descreve o negócio', d: 'Em «Nova página» escreve o briefing: o que vendes, a quem, cidade e objetivo (leads, marcações, WhatsApp). Cola o link do site ou página de Facebook — o agente lê o site e as fotos reais aparecem na página.' },
  { t: '2. O agente desenha', d: 'Tens dois geradores: o Rápido monta a página a partir de blocos estruturados; o Studio desenha HTML livre com assinatura visual diferente a cada tentativa. Podes gerar várias e escolher.' },
  { t: '3. Ajusta no editor', d: 'No Studio conversas com o assistente: escreve o queres mudar, ou clica num elemento da página para apontar o alvo, e envia. 📷 anexa fotos tuas para ele usar.' },
  { t: '4. Publica', d: 'Publicar dá-te um link público real (partilhável no WhatsApp, Instagram, anúncios). Enquanto não publicas, o formulário é ensaio: não envia leads a ninguém.' },
];

const PEDIDOS = [
  '「Muda o título para destacar que a primeira aula é grátis」',
  '「Põe este botão a abrir o WhatsApp」 (depois de clicares no botão na página)',
  '「Tira a secção das perguntas frequentes」',
  '「Põe as fotos que mandei na galeria, não nas fotos genéricas」',
  '「Faz a página em tons de azul-marinho, mais sóbria」',
  '「Adiciona uma faixa com o número de telefone bem visível」',
];

const FAQ: QA[] = [
  { q: 'Para onde vão os leads do formulário?', a: 'Ficam guardados no servidor e vês todos no módulo Leads (nome, telefone, respostas). O contador por página aparece na dashboard. Em cada lead há um botão WhatsApp que abre a conversa com o cliente já apresentada — nada é enviado sem clicares. Se configurares um webhook, cada lead é ainda enviado para o teu CRM em segundos.' },
  { q: 'O formulário do editor envia a sério?', a: 'Só depois de publicares. Em rascunho o formulário mostra «Ensaio — nada foi enviado» de propósito: um visitante não existe ainda, e não há caixa de entrada à espera.' },
  { q: 'Porque é que o agente não usa o meu número de telefone?', a: 'Só usa números que constem do briefing ou do teu site — nunca inventa. Se não viu o número, escreve-o no briefing com contexto (ex.: «WhatsApp: 912 345 678») e pede-lhe para o pôr no botão. Funciona com números de qualquer país (+351, +258, …).' },
  { q: 'As fotos são reais ou genéricas?', a: 'Damos prioridade às fotos do teu site (o agente visita-o e recolhe-as) e às que anexares com 📷. As genéricas só aparecem onde não há foto tua — e podes pedir para as trocar.' },
  { q: 'Como funcionam as marcações?', a: 'Pede ao assistente para adicionar marcação de horário; o visitante escolhe data e hora, e o pedido fica registado no módulo Bookings com os contactos.' },
  { q: 'Posso publicar mais do que uma página?', a: 'Sim — cada conta publica várias páginas, cada uma com o seu link e os seus leads. Despublicar tira o link do ar e apaga o webhook associado.' },
  { q: 'Mudei uma coisa e quero voltar atrás?', a: 'Descreve ao assistente o que queres recuperar («volta ao título anterior») — ele edita a partir da versão atual. Guarda versões importantes despublicando e voltando a publicar.' },
];

/** Ajuda real: guia do fluxo, exemplos de pedidos e FAQ — sem placeholders. */
export default function HelpPage() {
  return (
    <>
      <TopNav />
      <main className="shell">
        <div className="page-head">
          <div>
            <h1>💡 Ajuda</h1>
            <p>Do briefing ao link publicado — e as respostas às perguntas mais comuns.</p>
          </div>
          <Link href="/create" className="btn">Criar página →</Link>
        </div>

        <div className="create-card" style={{ marginBottom: 18 }}>
          <span className="spark">GUIA RÁPIDO</span>
          <h2 style={{ fontSize: 18, margin: '10px 0 14px' }}>Briefing → agente → publicar</h2>
          <div style={{ display: 'grid', gap: 14 }}>
            {GUIA.map((g) => (
              <div key={g.t}>
                <b style={{ fontSize: 14 }}>{g.t}</b>
                <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4, lineHeight: 1.55 }}>{g.d}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="create-card" style={{ marginBottom: 18 }}>
          <span className="spark">ASSISTENTE IA</span>
          <h2 style={{ fontSize: 18, margin: '10px 0 14px' }}>Exemplos de pedidos</h2>
          <ul style={{ listStyle: 'none', display: 'grid', gap: 8 }}>
            {PEDIDOS.map((p, i) => <li key={i} style={{ fontSize: 13, color: 'var(--muted)' }}>{p}</li>)}
          </ul>
          <p style={{ fontSize: 12.5, color: 'var(--dim)', marginTop: 12 }}>
            Dica: clica num elemento da página antes de enviar — o assistente edita exatamente aquele, sem tocar no resto.
          </p>
        </div>

        <div className="create-card">
          <span className="spark">FAQ</span>
          <h2 style={{ fontSize: 18, margin: '10px 0 14px' }}>Formulários, leads e marcações</h2>
          <div style={{ display: 'grid', gap: 16 }}>
            {FAQ.map((f) => (
              <div key={f.q}>
                <b style={{ fontSize: 13.5 }}>{f.q}</b>
                <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4, lineHeight: 1.55 }}>{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
