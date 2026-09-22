import ModulePage from '@/components/ModulePage';

export default function HelpPage() {
  return (
    <ModulePage
      title="Ajuda"
      icon="💡"
      points={[
        'Guia rápido: briefing → agente → publicar',
        'Exemplos de pedidos ao Assistente IA',
        'FAQ sobre formulários, leads e agendamentos',
      ]}
    />
  );
}
