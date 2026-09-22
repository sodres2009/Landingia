import { NextResponse } from 'next/server';
import { getActiveProvider } from '@/lib/ai';

/**
 * Endpoint único do agente: { action: 'plan' | 'rewrite' | 'section' }.
 * Toda a validação de input acontece aqui — o resto da app só conversa
 * com este route, nunca com um fornecedor de IA diretamente.
 */

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

function str(value: unknown, field: string, max = 8000): string | NextResponse {
  if (typeof value !== 'string' || !value.trim()) return badRequest(`Campo obrigatório: ${field}.`);
  if (value.length > max) return badRequest(`Campo demasiado longo: ${field}.`);
  return value.trim();
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return badRequest('Pedido sem JSON válido.');
  }

  const action = body.action;
  const provider = getActiveProvider();

  try {
    if (action === 'plan') {
      const description = str(body.description, 'description');
      if (description instanceof NextResponse) return description;
      const objective = typeof body.objective === 'string' ? body.objective : 'Captar leads';
      const style = typeof body.style === 'string' ? body.style : 'Moderno';
      const briefing = {
        description,
        objective,
        style,
        context: (body.context as never) ?? undefined,
        answers: (body.answers as Record<string, string>) ?? undefined,
        variantHint: typeof body.variantHint === 'string' ? body.variantHint : undefined,
      };
      // variants>1: o agente gera propostas lado a lado para o utilizador
      // escolher sem loops de edição. No motor local usa seeds; na IA externa
      // corre em série (o free tier bloqueia chamadas simultâneas) com ângulos
      // diferentes para as propostas não saírem gémeas.
      const variants = Math.min(Math.max(Number(body.variants ?? 1) || 1, 1), 4);
      if (variants > 1) {
        const hints = [
          'Abordagem montra: abre com o produto/oferta em destaque e prova visual.',
          'Abordagem autoridade: abre com a dor do cliente, mostra método e depois prova.',
          'Abordagem direta: página curta e assertiva, foco total em conversão.',
          'Abordagem história: conta a origem do negócio e termina em oferta.',
        ];
        const plans = [];
        for (let i = 0; i < variants; i++) {
          if (provider.name === 'local') {
            plans.push(await provider.plan({ ...briefing, seed: i + 1 }));
          } else {
            if (i > 0) await new Promise((r) => setTimeout(r, 1200));
            plans.push(await provider.plan({ ...briefing, variantHint: hints[i % hints.length] }));
          }
        }
        return NextResponse.json({ plans, engine: provider.name });
      }
      const plan = await provider.plan(briefing);
      return NextResponse.json({ ...plan, engine: provider.name });
    }

    if (action === 'rewrite') {
      const instruction = str(body.instruction, 'instruction');
      if (instruction instanceof NextResponse) return instruction;
      const current = typeof body.current === 'string' ? body.current : '';
      const text = await provider.rewrite({
        instruction,
        current,
        context: (body.context as never) ?? undefined,
      });
      return NextResponse.json({ source: provider.name === 'local' ? 'fallback' : 'ai', text });
    }

    if (action === 'section') {
      const description = str(body.description, 'description');
      if (description instanceof NextResponse) return description;
      const section = await provider.section({
        description,
        objective: typeof body.objective === 'string' ? body.objective : undefined,
        context: (body.context as never) ?? undefined,
      });
      return NextResponse.json({ source: provider.name === 'local' ? 'fallback' : 'ai', section });
    }

    if (action === 'image') {
      const instruction = str(body.instruction, 'instruction');
      if (instruction instanceof NextResponse) return instruction;
      const choice = await provider.image({
        instruction,
        objective: typeof body.objective === 'string' ? body.objective : undefined,
        context: (body.context as never) ?? undefined,
        exclude: Array.isArray(body.exclude) ? (body.exclude as unknown[]).map(String) : [],
      });
      return NextResponse.json(choice);
    }

    return badRequest('Ação inválida. Usa plan, rewrite, section ou image.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno da IA.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function GET() {
  return NextResponse.json({ provider: getActiveProvider().name });
}
