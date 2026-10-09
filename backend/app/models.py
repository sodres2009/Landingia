"""Schemas Pydantic — o contrato entre frontend, BD e agente.

A validação da saída do LLM acontece aqui (substitui o extractJson/reparação
de JSON partido do JS): se o modelo não cumprir o schema, re-pedimos.
"""
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator

# ─────────────────────────── página ───────────────────────────

LAYOUTS = {
    "stack", "hero-split", "hero-center", "hero-fullbleed", "benefits-grid",
    "benefits-zigzag", "proof-stats", "testimonials-cards", "logo-marquee",
    "form-split", "cta-band", "bento",
}
ELEMENT_TYPES = {
    "text", "list", "button", "image", "video", "stats", "marquee", "form",
    "scheduling", "testimonials", "faq", "pricing", "gallery", "map", "modal",
    "countdown", "float",
    "social", "demo", "steps", "comparison", "quote", "chart", "footer", "custom",
}


class SectionStyle(BaseModel):
    background: Optional[str] = None
    accent: Optional[str] = None
    layout: Optional[str] = None


class Section(BaseModel):
    """Secção do builder — content fica solto (dict) mas o tipo é validado."""
    id: str = ""
    type: str = "custom"
    title: str = ""
    style: SectionStyle = Field(default_factory=SectionStyle)
    hidden: Optional[bool] = None
    elements: list[dict[str, Any]] = Field(default_factory=list)

    @field_validator("style", mode="before")
    @classmethod
    def _style_dict(cls, v: Any) -> Any:
        return v if isinstance(v, dict) else {}

    def normalized(self) -> "Section":
        """Garante tipos de elemento conhecidos e layout válido (anti-lixo do LLM)."""
        els = []
        for el in self.elements:
            if not isinstance(el, dict) or el.get("type") not in ELEMENT_TYPES:
                continue
            content = el.get("content") if isinstance(el.get("content"), dict) else {}
            els.append({"id": str(el.get("id") or ""), "type": el["type"], "content": content})
        self.elements = els
        if self.style.layout not in LAYOUTS:
            self.style.layout = None
        return self


class AiContext(BaseModel):
    brandSummary: Optional[str] = None
    productSummary: Optional[str] = None
    audience: Optional[str] = None
    offer: Optional[str] = None
    cta: Optional[str] = None
    tone: Optional[str] = None
    brandColors: list[str] = Field(default_factory=list)
    visualDirection: Optional[str] = None
    visualQueries: list[str] = Field(default_factory=list)
    contentSources: list[str] = Field(default_factory=list)


class Page(BaseModel):
    id: str
    name: str
    status: Literal["draft", "published", "paused"] = "draft"
    objective: Optional[str] = None
    slug: Optional[str] = None
    logo: Optional[dict[str, Any]] = None
    aiContext: Optional[AiContext] = None
    theme: Optional[dict[str, Any]] = None  # PageTheme do frontend (light/dark, cores, fonte…)
    sections: list[Section] = Field(default_factory=list)
    # Studio (segundo gerador): página de HTML livre, sem secções estruturadas
    kind: Literal["builder", "studio"] = "builder"
    html: Optional[str] = None
    phone: Optional[str] = None  # WhatsApp 351... derivado do briefing
    publishedSlug: Optional[str] = None  # o link público tem de sobreviver ao save/list
    createdAt: Optional[str] = None  # sem isto o dashboard mostra «1970» (Date(0))
    updatedAt: Optional[str] = None


# ─────────────────────────── agente ───────────────────────────


class Question(BaseModel):
    key: str = ""
    question: str
    why: str = ""
    placeholder: str = "Escreva a resposta"


class PlanOut(BaseModel):
    """O que /agent/plan devolve: plano completo pronto para o builder."""
    source: str = "provider"
    name: str
    objective: str = ""
    audience: str = ""
    offer: str = ""
    cta: str = "COMEÇAR AGORA"
    brandColors: list[str] = Field(default_factory=list)
    visualDirection: str = ""
    visualQueries: list[str] = Field(default_factory=list)
    brandSummary: Optional[str] = None
    productSummary: Optional[str] = None
    theme: Optional[dict[str, Any]] = None  # tema de página decidido pelo agente (validado em agents)
    questions: list[Question] = Field(default_factory=list)
    sections: list[Section] = Field(default_factory=list)


class Briefing(BaseModel):
    description: str = Field(min_length=3, max_length=20000)
    objective: str = "Captar leads"
    style: str = "Moderno"
    depth: Literal["short", "rich"] = "short"  # rich = página completa (8-12 secções)
    context: Optional[AiContext] = None
    answers: Optional[dict[str, str]] = None
    variantHint: Optional[str] = None


class InterviewQuestion(BaseModel):
    key: str = ""
    question: str
    why: str = ""
    needs: Literal["text", "photo"] = "text"


class InterviewOut(BaseModel):
    """Primeiro passo do agente: o que percebeu + o que não pode inventar."""
    summary: str = ""
    questions: list[InterviewQuestion] = Field(default_factory=list)


class RewriteIn(BaseModel):
    instruction: str = Field(min_length=2, max_length=2000)
    current: str = ""
    context: Optional[AiContext] = None


class SectionIn(BaseModel):
    description: str = Field(min_length=3, max_length=2000)
    objective: Optional[str] = None
    context: Optional[AiContext] = None


class ImageIn(BaseModel):
    instruction: str = Field(min_length=2, max_length=2000)
    objective: Optional[str] = None
    context: Optional[AiContext] = None
    exclude: list[str] = Field(default_factory=list)
    previous: Optional[str] = None  # alt/descrição da imagem que vai ser substituída


class ImageOut(BaseModel):
    url: str
    alt: str
    source: Literal["pexels", "curated", "ai"]


class ThemeIn(BaseModel):
    """«melhora o fundo» → tema novo para a página toda, sem tocar no conteúdo."""
    instruction: str = Field(min_length=2, max_length=2000)
    context: Optional[str] = None
    current: Optional[dict] = None


class IntentIn(BaseModel):
    """Pedido de chat do editor + estado da página, para decidir a ação."""
    instruction: str = Field(min_length=2, max_length=2000)
    selection: Optional[str] = None  # "text|hero: título principal" etc.
    context: Optional[str] = None    # resumo do negócio (productSummary/offer)
    sections: list[dict[str, Any]] = Field(default_factory=list)  # [{type,title,excerpt}]
    history: list[dict[str, str]] = Field(default_factory=list)   # [{role,user|bot,text}] mais recente


class IntentAction(BaseModel):
    """Uma ação do pedido — intent pode devolver várias (「muda o título E mete telefone」)."""
    kind: Literal["rewrite", "image", "section", "remove_section", "move_section", "add_field", "recreate", "change_background", "style", "ask"]
    section_type: Optional[str] = None
    text: Optional[str] = None
    position: Optional[str] = None
    reply: str = ""


class IntentOut(IntentAction):
    actions: list[IntentAction] = Field(default_factory=list)  # passos 2..N do mesmo pedido


# ─────────────────────────── dados ───────────────────────────


class LeadIn(BaseModel):
    slug: str
    sectionId: str = ""
    elementId: str = ""
    values: dict[str, str] = Field(default_factory=dict)


class PublishIn(BaseModel):
    slug: str
    page: Page


class DesignEditIn(BaseModel):
    html: str = Field(min_length=200, max_length=400_000)
    instruction: str = Field(min_length=2, max_length=2000)
    briefing: str = Field(default="", max_length=20000)  # negócio/contactos; acompanha o limite do Briefing
