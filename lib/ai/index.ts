import { httpProvider } from './http';
import { localProvider } from './local';
import type { AiProvider } from './types';

export type { AiProvider, PlanBriefing, RewriteRequest, SectionRequest, AiSectionDraft } from './types';

/**
 * escolhe o provedor ativo por variáveis de ambiente.
 * Sem configuração, o motor local é sempre o default — a app nunca depende
 * de um fornecedor externo para funcionar.
 */
export function getActiveProvider(): AiProvider {
  if ((process.env.AI_PROVIDER ?? 'local').trim().toLowerCase() === 'http' && process.env.AI_BASE_URL) {
    return httpProvider;
  }
  return localProvider;
}
