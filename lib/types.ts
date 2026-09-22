/** Modelo de domínio do Landing AI v3. */

export type Status = 'draft' | 'published' | 'paused';
export type DeviceMode = 'desktop' | 'tablet' | 'mobile';

export type ElementType =
  | 'text'
  | 'list'
  | 'image'
  | 'video'
  | 'button'
  | 'form'
  | 'scheduling'
  | 'modal'
  | 'testimonials'
  | 'faq'
  | 'pricing'
  | 'gallery'
  | 'map'
  | 'social'
  | 'stats'
  | 'marquee'
  | 'custom';

export interface BuilderElement {
  id: string;
  type: ElementType;
  content: Record<string, unknown>;
  style?: Record<string, unknown>;
}

export interface SectionStyle {
  background?: string;
  accent?: string;
  textColor?: string;
  theme?: string;
  effect?: string;
  layout?: string;
  backgroundImage?: string;
}

export interface BuilderSection {
  id: string;
  type: string;
  title: string;
  elements: BuilderElement[];
  hidden?: boolean;
  style?: SectionStyle;
}

export interface SocialLink {
  platform: string;
  url: string;
  label?: string;
}

/** Contexto de marca/produto que o agente IA preserva entre edições. */
export interface AiContext {
  brandSummary?: string;
  productSummary?: string;
  audience?: string;
  offer?: string;
  cta?: string;
  visualDirection?: string;
  brandColors?: string[];
  visualQueries?: string[];
  fileSummaries?: Array<{ name: string; type: string; summary?: string }>;
  answers?: Record<string, string>;
}

export interface LandingPage {
  id: string;
  name: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
  objective?: string;
  style?: string;
  logo?: { url: string; alt?: string };
  socialLinks?: SocialLink[];
  aiContext?: AiContext;
  sections: BuilderSection[];
  visits?: number;
  leads?: number;
  /** Slug da versão publicada no servidor (URL pública /p/<slug>). */
  publishedSlug?: string;
}

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  message?: string;
  status: 'Novo' | 'Contactado' | 'Em negociação' | 'Convertido';
  pageId?: string;
  pageName?: string;
  createdAt: string;
  consent?: boolean;
  notes?: string[];
}

export interface Booking {
  id: string;
  name: string;
  email: string;
  date: string;
  time: string;
  duration: number;
  status: 'Agendado' | 'Concluído' | 'Cancelado' | 'No-show';
  pageId?: string;
  createdAt: string;
}

/** Plano de página devolvido pelo motor de IA (ação `plan`). */
export interface AiPlanQuestion {
  key: string;
  question: string;
  why: string;
  placeholder: string;
}

export interface AiPlan {
  source: 'local' | 'provider';
  name: string;
  objective: string;
  audience: string;
  offer: string;
  cta: string;
  brandColors: string[];
  visualDirection: string;
  visualQueries: string[];
  brandSummary?: string;
  productSummary?: string;
  questions: AiPlanQuestion[];
  sections: Array<Omit<BuilderSection, 'id'> & { id?: string }>;
}
