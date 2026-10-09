import Link from 'next/link';
import TopNav from '@/components/TopNav';

/** Termos e política de privacidade — honestos sobre o que a plataforma faz
 *  com os dados (leads, páginas, visitas). Não é aconselhamento jurídico. */
export default function LegalPage() {
  return (
    <>
      <TopNav />
      <main className="shell" style={{ maxWidth: 760 }}>
        <div className="page-head">
          <div>
            <h1>Termos e privacidade</h1>
            <p>Última atualização: outubro de 2026.</p>
          </div>
        </div>

        <div className="create-card" style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 18 }}>1. O que é este serviço</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>
            O LandingAI cria e aloja páginas de destino (landing pages) geradas por IA. Cada conta
            pode criar páginas, publicá-las num link público e receber os formulários que os
            visitantes dessas páginas preenchem.
          </p>
        </div>

        <div className="create-card" style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 18 }}>2. A tua conta e o teu conteúdo</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>
            Guardamos o teu nome, email e senha (protegida por criptografia) para te dar acesso.
            As páginas que criares pertencem-te; nós apenas as armazenamos e servimos enquanto a
            conta estiver ativa. Podes apagar páginas e leads a qualquer momento no painel, e podes
            pedir o encerramento da conta — nesse caso removemos páginas, leads e estatísticas.
          </p>
        </div>

        <div className="create-card" style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 18 }}>3. Dados dos visitantes das tuas páginas</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>
            Quando alguém preenche um formulário numa página tua, os dados que essa pessoa
            introduziu (nome, contacto, mensagem, marcações) são guardados no nosso servidor e
            ficam visíveis apenas na tua conta — e em qualquer sistema que tu ligares por webhook
            ou API. Contamos também visitas anónimas às páginas publicadas (sem cookies de
            rastreamento nem perfis). <b>Tu és responsável</b> por informar os teus visitantes na
            tua página (por exemplo com a caixa de consentimento nos formulários) e por tratares os
            leads de acordo com a lei de proteção de dados aplicável.
          </p>
        </div>

        <div className="create-card" style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 18 }}>4. IA e terceiros</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>
            Para gerar as páginas enviamos o teu briefing e o texto das páginas a um fornecedor de
            modelos de linguagem; para as fotografias usamos o Pexels. Não uses o serviço para
            carregar dados sensíveis de terceiros (saúde, dados bancários, etc.) nos briefings.
          </p>
        </div>

        <div className="create-card" style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 18 }}>5. Limites do serviço</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>
            O serviço é fornecido «tal e qual», sem garantia de disponibilidade contínua. Podemos
            limitar pedidos por IP para proteger a plataforma. É proibido usar o serviço para
            conteúdo ilegal, fraudulento ou que viole direitos de terceiros; contas que o façam
            podem ser suspensas.
          </p>
        </div>

        <div className="create-card">
          <h2 style={{ fontSize: 18 }}>6. Contacto e alterações</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>
            Pedidos sobre dados (acesso, retificação, eliminação) podem ser feitos diretamente no
            painel ou através do contacto do operador desta instância. Se alterarmos estes termos,
            atualizamos esta página e a data acima. Este documento não é aconselhamento jurídico —
            se fores vender o serviço a clientes com dados de terceiros, revê-lo com um profissional.
          </p>
          <p style={{ marginTop: 12 }}><Link href="/" className="btn ghost small">← Voltar ao painel</Link></p>
        </div>
      </main>
    </>
  );
}
