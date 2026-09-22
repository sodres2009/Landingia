import type { AiContext, AiPlan, BuilderSection } from '../types';

/** Contrato único que todos os provedores de IA têm de cumprir. */

export interface PlanBriefing {
  description: string;
  objective: string;
  style: string;
  context?: AiContext;
  answers?: Record<string, string>;
  /** Variante determinística (arquitetura/paleta/imagens) no motor local. */
  seed?: number;
  /** Instrução de ângulo distinto quando o agente gera várias propostas. */
  variantHint?: string;
}

export interface RewriteRequest {
  instruction: string;
  current: string;
  context?: AiContext;
}

export interface SectionRequest {
  description: string;
  objective?: string;
  context?: AiContext;
}

export interface ImageRequest {
  /** Pedido em linguagem natural do utilizador ("quero uma equipa jovem num escritório"). */
  instruction: string;
  objective?: string;
  context?: AiContext;
  /** URLs já usadas na página — o agente não as repete. */
  exclude?: string[];
}

export interface ImageChoice {
  url: string;
  alt: string;
  /** `ai` = intenção interpretada pelo modelo; `local` = dicionário de keywords. */
  source: 'ai' | 'local';
}

export type AiSectionDraft = Omit<BuilderSection, 'id'>;

export interface AiProvider {
  /** Identificador mostrado na UI (`local`, `http`). */
  readonly name: string;
  /** Motivo da última degradação para o motor local (diagnóstico). */
  lastFallbackReason?: string;
  plan(briefing: PlanBriefing): Promise<AiPlan>;
  rewrite(request: RewriteRequest): Promise<string>;
  section(request: SectionRequest): Promise<AiSectionDraft>;
  image(request: ImageRequest): Promise<ImageChoice>;
}
