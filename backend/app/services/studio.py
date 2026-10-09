"""Studio — o segundo gerador: cada página é HTML escrito de raiz para AQUELE briefing.

Diferença para o gerador estruturado (plan): não há tipos de elemento nem ordem
obrigatória de secções — o modelo é o diretor de arte e compõe livremente. O que
NÃO se pode confiar ao modelo fica aqui, no servidor:

  sanitize_html  — remove scripts/iframes/event handlers (o modelo não escreve JS;
                   o dinamismo vem do runtime injetado)
  inject_runtime — JS nosso: countdown, float WhatsApp garantido, mapa validado,
                   marquee, form→lead
  validate_kit   — telefone do briefing ⇒ WhatsApp presente; countdown só com
                   data do briefing; NIF/IBAN fora; tamanho máx
  digest         — resumo visual (paleta/fonte/hero) para o mecanismo
                   anti-repetição entre páginas do mesmo dono
"""
import re
import unicodedata
from typing import Optional

# ─────────────────────────── contrato do modelo ───────────────────────────────

DESIGN_CONTRACT = (
    "CONTRATO DO OUTPUT (Studio): devolves APENAS um documento HTML completo, começando em <!doctype html>.\n"
    "- UM ficheiro: <style> no <head> com todo o CSS (zero ficheiros externos; @import do Google Fonts é o único externo permitido).\n"
    "- PROIBIDO: <script>, on*= inline, javascript:, <iframe> (o mapa é injetado por nós), links que saiam da página, comentários HTML.\n"
    "- Copy em PT-PT real e específica do briefing; NOMES, LOCAIS e MARCAS EXATAMENTE como o cliente os escreveu.\n"
    "- ESTRUTURA LIVRE: decide tu a ordem, o ritmo e a composição das secções para ESTE briefing — é a tua direção de arte, ninguém te impõe template.\n"
    "- Dinamismo por data attrs (o resto é feito pelo nosso runtime):\n"
    '  <div data-countdown="YYYY-MM-DDTHH:MM" data-label="Falta pouco" data-over="Terminou"></div>\n'
    "  <div data-marquee> itens separados por dois-pontos · ou tags filhas </div>\n"
    '  <form data-lead data-success="Recebido! Entramos em contacto."> com inputs normais (name+label) e botão submit\n'
    '  <a data-wa="9XXXXXXXX"> — link WhatsApp com os 9 dígitos do cliente\n'
    '  REVEALS DE SCROLL: usa class="reveal" no fade-up de scroll (o nosso runtime anima e mostra ao scroll). PROIBIDO qualquer outro estado inicial invisível (opacity:0, visibility:hidden, transform off-screen em CSS) — as páginas não têm JS teu; sem o runtime o conteúdo fica invisível para sempre.\n'
    '  <div data-map="morada, cidade, Portugal"></div> — ONDE HOUVER local/morada/sede, a secção TEM de levar este attr no contentor (nós injetamos o Google Maps lá dentro). PROIBIDO desenhar mapas falsos, pins decorativos ou cartões cinza a imitar um mapa: ou data-map real, ou nada.\n'
    '  SITE do briefing: links/botões «ver site / saiba mais / ver viaturas» apontam para esse URL com target=_blank. PROIBIDO CTA morto (botão/div sem href nem destino): ou → secção, ou → site.\n'
    "- Se o briefing tem telefone, ele tem de aparecer VISÍVEL exatamente como escrito, pelo menos uma vez.\n"
    "- Sem telefone no briefing: NUNCA inventes números nem links wa.me/tel: — usa só o formulário de contacto e o CTA «Pedir informações».\n"
    "- NÃO desenhes botões flutuantes nem elements position:fixed/absolute — o botão WhatsApp é acrescentado por nós; para um CTA de contacto usa <a data-wa=\"9XXXXXXXX\">.\n"
    "- Nada pode ultrapassar a largura do ecrã: só percentages, max-width:100%, box-sizing:border-box; sem widths fixas >360px fora de media queries.\n- Nenhum texto pode ficar CORTADO: títulos com font-size:clamp(...) e overflow-wrap:anywhere; se o texto não cabe, REDUZ a letra — nunca deixes palavras a meio ou cortadas pelo contentor.\n"
    "- A página tem de ser COMPLETA e limitada: entre 4 e 8 secções no total (hero incluído) — hero, contexto/oferta, provas/números, contacto e rodapé. Nunca entregar só o topo da página.\n"
    "- Máximo 8 secções. Densidade vem de conteúdo rico dentro delas, não de empilhar blocos.\n"
    "- Design de nível prémio: tipografia com hierarquia forte, espaçamento generoso, fundos com profundidade (gradientes/luz), pormenores que fazem a página valer dinheiro. Mobile-first: nada parte aos 390px.\n"
    "- IMAGENS: NUNCA inventes URLs de fotos (ficam em branco). Se <img>, usa só https://picsum.photos/seed/<palavra-do-briefing>/1200/700 (funciona sempre) ou fotos que o cliente forneceu. Na dúvida, desenha com gradientes CSS, SVG e padrões — nunca <img> partido nem espaço reservado vazio.\n"
    "- SEM espaços mortos: padding vertical das secções 64-88px no máximo; proibido <div> só de ar, min-height enorme sem conteúdo, ou secção com mais fundo vazio que conteúdo.\n"
    "- HERDA DO CLIENTE: se receberes CORES REAIS DO SITE ou MEMÓRIA DE ESTILO, são o teu ponto de partida — evolui a identidade, não copies servilmente nem deitas fora.\n"
    "- Se receberes ANTI-REPETIÇÃO, a tua paleta/fonte/hero TÊM de ser visivelmente diferentes das listadas, salvo pedido explícito de continuidade.\n"
)

# Marcas de sincronização — o teste pytest exige-as nos 3 prompts (plan/intent/design)
SYNC_MARKERS = ["PLAYBOOK DE CONVERSÃO", "NOMES", "HERDA DO CLIENTE"]

# Sementes de direção artística: uma por variante — páginas da mesma criação
# nunca nascem gémeas.
ART_SEEDS = [
    "cartaz editorial: título tipográfico gigante, uma cor saturada em campo de contraste, números em faixa",
    "dark spotlight: fundo quase preto com luz direcional sobre o produto/oferta, dourado ou neon como acento único",
    "split tipográfico: metade da tela texto, metade imagem/gravura, serif de caractere forte, ritmo assimétrico",
    "brutal lite: blocos de cor chapada, bordas vivas, tipografia pesada com energia de streetwear",
    "glassy suave: superfícies translúcidas sobre gradiente suave, cantos largos, micro-sombras, respiração máxima",
]


def art_seed(i: int) -> str:
    return ART_SEEDS[i % len(ART_SEEDS)]


# ─────────────────────────── sanitização ──────────────────────────────────────

_COMMENT = re.compile(r"(?s)<!--.*?-->")
_SCRIPT = re.compile(r"(?is)<\s*script\b[^>]*>.*?<\s*/\s*script\s*>|<\s*script\b[^>]*/?>")
_IFRAME = re.compile(r"(?is)<\s*iframe\b[^>]*>.*?<\s*/\s*iframe\s*>|<\s*iframe\b[^>]*/?>")
_EVENT = re.compile(r"(?is)\s+on[a-z-]+\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+)")
_JS_URL = re.compile(r"(?i)\s(?:href|src|action)\s*=\s*(?:\"|')?\s*javascript:[^\"'>\s]*(?:\"|')?")
_FRAME = re.compile(r"(?is)<\s*/?\s*(object|embed)\b[^>]*>")
_META_REFRESH = re.compile(r"(?is)<\s*meta[^>]+http-equiv\s*=\s*[\"']?refresh[\"']?[^>]*>")


def sanitize_html(html: str) -> str:
    """HTML do modelo → documento seguro: sem JS, sem iframes, sem forms soltos."""
    html = re.sub(r"(?i)^\s*<\?xml[^>]*>", "", html.strip())
    html = _COMMENT.sub(" ", html)
    html = _SCRIPT.sub(" ", html)
    html = _IFRAME.sub(" ", html)
    html = _META_REFRESH.sub(" ", html)
    html = _EVENT.sub("", html)
    html = _JS_URL.sub("", html)
    html = _FRAME.sub(" ", html)

    # forms sem o marcador data-lead não podem enviar: viram div
    def _form(m: re.Match) -> str:
        tag = m.group(0)
        if "data-lead" in tag:
            return tag
        # sem o marcador: não pode enviar nem apontar para fora — vira div limpo
        return "</div>" if tag.lstrip().lower().startswith("</") else "<div>"

    html = re.sub(r"(?is)<\s*/?\s*form\b[^>]*>", _form, html)

    # style inline: só declarações propriedades:valor inertes
    def _style(m: re.Match) -> str:
        keep = []
        for decl in m.group(1).split(";"):
            prop = decl.split(":", 1)[0].strip().lower()
            if re.fullmatch(r"[a-z-]+", prop) and prop not in ("behavior", "expression"):
                keep.append(decl)
        return ' style="' + ";".join(keep) + '"' if keep else ""

    html = re.sub(r"(?i)style=\"([^\"]*)\"", _style, html)
    html = re.sub(r"(?i)\s(?:srcdoc|allow|sandbox|formaction)\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+)", "", html)
    return html.strip()


# ─────────────────────────── runtime injetado ─────────────────────────────────

RUNTIME = """<style data-studio>
.lp-wa-float{position:fixed;right:18px;bottom:18px;z-index:99;width:58px;height:58px;border-radius:50%;background:#25d366;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(0,0,0,.35)}
.lp-wa-float svg{width:32px;height:32px;fill:#fff}
.lp-map-wrap{border-radius:18px;overflow:hidden;min-height:340px}
.lp-map-wrap iframe{width:100%;height:340px;border:0;display:block}
.lp-cd b{font-variant-numeric:tabular-nums}
[data-lead] .lp-ok{padding:14px;border-radius:12px;font-weight:700}
</style>
<script data-studio>
(function(){
var api=document.querySelector('meta[name=lp-api]');var slug=document.querySelector('meta[name=lp-slug]');
document.querySelectorAll('[data-countdown]').forEach(function(el){
var end=new Date(el.getAttribute('data-countdown'));
if(isNaN(end.getTime()))return;
var lab=el.getAttribute('data-label')||'Termina em';var over=el.getAttribute('data-over')||'Terminou';
var slots=[],all=el.querySelectorAll('*');
for(var k=0;k<all.length;k++){var n=all[k];if(!n.children.length&&/^\\s*[-\u2013\u2014]{1,2}\\s*$|^\\s*0{1,2}\\s*$/.test(n.textContent))slots.push(n);}
function unitOf(n){var p=n.parentElement;while(p&&p!==el){var t=(p.textContent||'').toLowerCase();var hit=['dia','hora','min','seg'].filter(function(w){return t.indexOf(w)>=0;});if(hit.length===1)return hit[0];if(hit.length>1)return null;p=p.parentElement;}return null;}
var byUnit={};
slots.forEach(function(n,i){var u=unitOf(n)||'';if(u&&!byUnit[u])byUnit[u]=n;else if(slots.length===4){var w=['dia','hora','min','seg'][i];if(!byUnit[w])byUnit[w]=n;}});
function pad(n){return String(n).padStart(2,'0');}
function tick(){var d=end-Date.now();
if(d<=0){el.textContent=over;return;}
var s=Math.floor(d/1000),dd=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60),ss=s%60;
if(slots.length){if(byUnit.dia)byUnit.dia.textContent=String(dd);if(byUnit.hora)byUnit.hora.textContent=pad(h);if(byUnit.min)byUnit.min.textContent=pad(m);if(byUnit.seg)byUnit.seg.textContent=pad(ss);}
else el.innerHTML=lab+' <b>'+dd+'d '+pad(h)+'h '+pad(m)+'m '+pad(ss)+'s</b>';
setTimeout(tick,1000);}tick();});
var wa=document.querySelector('meta[name=lp-wa]');
// o numero verificado do briefing manda em TODOS os links: o modelo inventa
// wa.me/+224... sem origem — sem isto, o botao WhatsApp abre chat inexistente.
var good=(wa&&wa.content?wa.content.replace(/\\D/g,''): '');
if(good.length>8){document.querySelectorAll('a[href*="wa.me"],a[data-wa],a[href^="tel:"]').forEach(function(a){var h=a.getAttribute('href')||'';if(h.indexOf('tel:')===0){a.href='tel:+'+good;}else{a.href='https://wa.me/'+good+'?text='+encodeURIComponent('Ola! Vim da pagina e quero saber mais.');a.target='_blank';a.rel='noreferrer';}});}

function waBtn(num){var a=document.createElement('a');a.className='lp-wa-float';
a.href='https://wa.me/'+num+'?text='+encodeURIComponent('Ola! Vim da pagina e quero saber mais.');
a.target='_blank';a.rel='noreferrer';a.setAttribute('aria-label','Falar no WhatsApp');
a.innerHTML='<svg viewBox="0 0 32 32"><path d="M16 3a13 13 0 0 0-11 20l-2 7 7.2-2A13 13 0 1 0 16 3zm0 2.4a10.6 10.6 0 1 1-5.4 19.7l-.5-.3-4.2 1.2 1.2-4-.3-.6A10.6 10.6 0 0 1 16 5.4z"/></svg>';
document.body.appendChild(a);}
var temWa=!!document.querySelector('a[href*="wa.me"],a[data-wa],a[href^="tel:"]');
if(wa&&wa.content&&wa.content.length>8&&!temWa)waBtn(wa.content);
document.querySelectorAll('[data-map]').forEach(function(el){
var q=el.getAttribute('data-map')||'';if(!q)return;
var w=document.createElement('div');w.className='lp-map-wrap';
var f=document.createElement('iframe');f.loading='lazy';f.referrerPolicy='no-referrer-when-downgrade';
var g='https://www.google.com/maps?q='+encodeURIComponent(q);
f.src=g+'&output=embed';
var lk=document.createElement('a');lk.href=g;lk.target='_blank';lk.rel='noopener';lk.textContent='↗ Abrir no Google Maps';lk.style.cssText='display:block;padding:10px 14px;font:600 13px system-ui;text-align:center;text-decoration:none';
w.appendChild(f);w.appendChild(lk);el.appendChild(w);});
var rev=document.querySelectorAll('.reveal,[class*="reveal"]');
if(rev.length){
var rshow=function(el){el.style.opacity='1';el.style.visibility='visible';el.style.transform='none';};
if('IntersectionObserver' in window){
var rio=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){rshow(e.target);rio.unobserve(e.target);}});},{threshold:.08});
Array.prototype.forEach.call(rev,function(el){rio.observe(el);});
setTimeout(function(){Array.prototype.forEach.call(rev,function(el){if(getComputedStyle(el).opacity==='0')rshow(el);});},2500);
}else{Array.prototype.forEach.call(rev,rshow);}
}
document.querySelectorAll('[data-marquee]').forEach(function(el){
var items=el.children.length?Array.prototype.map.call(el.children,function(c){return c.outerHTML;}):el.textContent.split(/\\s{2,}|·/).filter(function(t){return t.trim();}).map(function(t){return '<span>'+t.trim()+'</span>';});
if(!items.length)return;var line=items.concat(items).join('');
el.innerHTML='<div class="lp-mq"><div>'+line+'</div><div>'+line+'</div></div>';
if(!document.getElementById('lp-mq-css')){var st=document.createElement('style');st.id='lp-mq-css';
st.textContent='.lp-mq{display:flex;overflow:hidden;gap:48px}[data-marquee] .lp-mq>div{display:flex;gap:48px;flex:0 0 auto;white-space:nowrap;animation:lp-mq 26s linear infinite}@keyframes lp-mq{to{transform:translateX(-100%)}}';
document.head.appendChild(st);}});
// liga o que o modelo deixou morto: CTAs sem alvo, data-wa sem href, tel: cru
function goForm(){var f=document.querySelector('form');if(f){f.scrollIntoView({behavior:'smooth',block:'center'});var i=f.querySelector('input,select,textarea');if(i)setTimeout(function(){i.focus({preventScroll:true});},450);}else{var w=document.querySelector('a[href^=\"https://wa.me/\"],a[data-wa]');if(w)w.click();}}
document.querySelectorAll('form:not([data-lead])').forEach(function(f){f.setAttribute('data-lead','');if(!f.getAttribute('data-success'))f.setAttribute('data-success','Recebido! Entramos em contacto.');});
document.querySelectorAll('a[data-wa]').forEach(function(a){var h=a.getAttribute('href');if(!h||h==='#'){var d=(a.getAttribute('data-wa')||'').replace(/\\D/g,'');if(d.length===9)d='351'+d;if(d.length>8){a.href='https://wa.me/'+d+'?text='+encodeURIComponent('Ola! Vim da pagina e quero saber mais.');a.target='_blank';a.rel='noreferrer';}}});
document.querySelectorAll('a[href^=\\"tel:\\"]').forEach(function(a){var d=a.getAttribute('href').replace(/\\D/g,'');if(d.length===9&&d[0]==='9')a.href='tel:+351'+d;});
document.querySelectorAll('a[href=\"#\"]').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();goForm();});});
document.querySelectorAll('button,a.btn,[class*="btn"]:not(a),[class*="cta"]:not(a)').forEach(function(el){if(el.tagName==='BUTTON'&&el.type==='submit')return;if(el.closest&&el.closest('form'))return;if(el.querySelector&&el.querySelector('form,input,select,textarea'))return;if(el.classList&&el.classList.contains('lp-wa-float'))return;var h=el.getAttribute?el.getAttribute('href'):null;if(h&&h!=='#')return;if(el.onclick)return;el.style.cursor='pointer';el.addEventListener('click',function(ev){var t=ev.target;if(t&&t.closest&&t.closest('input,select,textarea,button,a,label,form,[contenteditable]'))return;goForm();});});
document.querySelectorAll('a[href^="/"],a[data-go]').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();var h=(a.getAttribute('href')||'').slice(1);if(h){var el=document.getElementById(h);if(el){el.scrollIntoView({behavior:'smooth',block:'start'});return;}}goForm();});});
document.querySelectorAll('form[data-lead]').forEach(function(f){
f.addEventListener('submit',function(ev){
ev.preventDefault();
var data={};new FormData(f).forEach(function(v,k){data[k]=String(v).slice(0,500);});
var btn=f.querySelector('button,[type=submit]');if(btn)btn.disabled=true;
var msg=f.getAttribute('data-success')||'Recebido! Entramos em contacto.';
var done=function(ok){f.innerHTML='<div class="lp-ok">'+(ok?msg:'Algo se passou — testa outra vez ou usa o WhatsApp.')+'</div>';};
// CTA dentro do form: submeter vazio nao e' falha e' pedido para preencher —
var keys=Object.keys(data);if(!keys.length){var i0=f.querySelector('input,select,textarea');if(i0){ev.stopImmediatePropagation();i0.focus({preventScroll:false});i0.scrollIntoView({behavior:'smooth',block:'center'});return;}}
if(api&&slug&&api.content&&slug.content){
fetch(api.content+'/published/'+slug.content+'/lead',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)}).then(function(r){done(r.ok);}).catch(function(){done(false);});}
else{var prev=document.querySelector('meta[name=lp-preview]');if(prev){f.innerHTML='<div class="lp-ok">Ensaio — nada foi enviado. Publica a página para receberes os leads no painel.</div>';}else done(false);}});});
})();
</script>"""


def inject_runtime(html: str, wa_full: Optional[str], api_origin: str = "", slug: str = "") -> str:
    """Runtime nosso SEMPRE em último: o modelo não escreve JS, nós sim."""
    head_extra = ""
    if wa_full:
        head_extra += f'<meta name="lp-wa" content="{wa_full}">'
    if api_origin:
        head_extra += f'<meta name="lp-api" content="{api_origin}">'
    if slug:
        head_extra += f'<meta name="lp-slug" content="{slug}">'
    # previews estreitos (iframe do editor): sem scroll horizontal
    if "overflow-x" not in html[:20000].lower():
        html = re.sub(r"(?i)<head(\s[^>]*)?>",
                    lambda m: m.group(0) + "<style data-studio-ovf>html,body{overflow-x:hidden;max-width:100vw}</style>", html, count=1)
    if head_extra:
        m = re.search(r"(?i)<head(\s[^>]*)?>", html)
        html = (html[: m.end()] + head_extra + html[m.end():]) if m else head_extra + html
    if re.search(r"(?i)</body>", html):
        html = re.sub(r"(?i)</body>", lambda m: RUNTIME + "</body>", html, count=1)
    else:
        html = html + RUNTIME
    return html


# ─────────────────────────── kit de contacto ──────────────────────────────────

def _fold(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if not unicodedata.combining(c))


_PHONE_CTX = re.compile(r"whatsapp|tel|tlf|contact|chama|liga|n[úu]mero|m[óo]vel|celular|wa\b")


def find_phone(briefing_text: str) -> Optional[str]:
    """Telefone real do briefing → dígitos internacionais, ou None.

    Aceita qualquer país quando escrito com «+» (clientes de Moçambique deram
    +258 84… e o filtro antigo, só PT, apagava-lhes o número verdadeiro).
    Sem «+»: 9 dígitos 9xx com contexto → PT; 82-87 com contexto → MZ.
    Um NIF/matrícula solto sem contexto nem «+» continua a não contar.
    """
    t = briefing_text or ""
    for m in re.finditer(r"\+\d[\d\s().\-]{6,16}\d", t):
        d = re.sub(r"\D", "", m.group(0))
        if 8 <= len(d) <= 15:
            return d
    m = re.search(r"(?i)wa\.me/(\d{8,15})", t)
    if m:
        return m.group(1)
    for m in re.finditer(r"(?<!\d)\d[\d\s.\-]{7,13}\d(?!\d)", t):
        d = re.sub(r"\D", "", m.group(0))
        near = t[max(0, m.start() - 30):m.start()].lower()
        if len(d) == 12 and (d.startswith("351") or d.startswith("258")):
            if d[3] in "89" or _PHONE_CTX.search(near):
                return d
        if len(d) == 9 and _PHONE_CTX.search(near):
            if d[0] == "9" and d[1] in "0123567":
                return "351" + d
            if d[0] == "8" and d[1] in "234567":
                return "258" + d
    return None


_PHONE_TEXT = re.compile(r"\+\d[\d\s().\-]{6,16}\d|\b\d{3}[ \u00a0]\d{3}[ \u00a0]\d{3}\b")


def scrub_phones(html: str, briefing_text: str) -> str:
    """Purga telefone inventado — a alucinação mais perigosa (alguém liga a um estranho).

    Número verificado no briefing → substitui todos os números diferentes pelo real.
    Sem número no briefing → desliga links tel:/wa.me e troca números por «—».
    """
    real = find_phone(briefing_text)
    digits = re.sub(r"\D", "", real or "")
    if digits and len(digits) == 9:
        digits = "351" + digits
    disp = ("+" + digits[:3] + " " + digits[3:6] + " " + digits[6:9] + " " + digits[9:]) if digits else ""

    def _text(m: re.Match) -> str:
        d = re.sub(r"\D", "", m.group(0))
        if digits and (d == digits or d == digits[-9:]):
            return m.group(0)  # já é o número certo (texto ou href tel: acabado de por)
        return disp or "\u2014"

    # links primeiro (wa.me e tel:), depois o texto visível
    def _wa(m: re.Match) -> str:
        return ('https://wa.me/' + digits + '?text=' + 'Ola!%20Vim%20da%20pagina') if digits else "#"

    html = re.sub(r"https?://wa\.me/\+?[\d/\-()\s]+", _wa, html)

    def _tel_clean(m: re.Match) -> str:
        # o href fica limpo (sem espaços); o texto visível é tratado por _text
        return 'href="tel:+' + digits + '"' if digits else 'href="#"'

    html = re.sub("""(?i)href=["']tel:[+\\d\\s().\\-]+["']""", _tel_clean, html)

    def _data_wa(m: re.Match) -> str:
        # o runtime constrói wa.me a partir deste attr — número inventado aqui é
        # spam a um estranho; sem nº verificado o botão fica desligado.
        d = re.sub(r"\D", "", m.group(1))
        if digits and d not in (digits, digits[-9:]):
            return 'data-wa="' + digits + '"'
        if digits:
            return m.group(0)
        return 'data-wa=""' if d else m.group(0)

    html = re.sub(r'data-wa="([^"]*)"', _data_wa, html)
    return _PHONE_TEXT.sub(_text, html)


def map_query_fix(html: str, briefing_text: str) -> str:
    """data-map sem cidade/Portugal perde-se no Google: completa-o com o briefing."""

    def fix(m: re.Match) -> str:
        q = m.group(1).strip()
        if not q or "portugal" in _fold(q):
            return m.group(0)
        cidade = ""
        zc = re.search(r"\b\d{4}\s+([A-ZÀ-Ú][\wÀ-ÿ-]{1,29})", briefing_text)  # «3810 Aveiro»
        if zc:
            cidade = zc.group(1).strip(" ,.")[:40]
        if not cidade:
            zp = re.search(r"\b\d{4}[- ]\d{3}\b", briefing_text)  # só o código postal
            if zp:
                cidade = zp.group(0)
        if not cidade:
            zn = re.search(r"(?i)(?:em|na|no)\s+([A-ZÀ-Ú][\wÀ-ÿ-]{1,29})", briefing_text)
            if zn:
                cidade = zn.group(1).strip(" ,.")[:40]
        if cidade and _fold(cidade.split()[-1]) not in _fold(q):
            q += ", " + cidade
        return f'data-map="{q[:130]}, Portugal"'

    return scrub_phones(re.sub(r"(?i)data-map=\"([^\"]*)\"", fix, html), briefing_text)


_FISCAL = re.compile(r"(?i)\b(nif|nº?\s*contribuinte|iban)\b[\s:]*[\d][\d\s.\-]{0,18}")
# do lado do briefing é mais largo: «o nosso NIF é 987…» tem palavras pelo meio
_FISCAL_GIVEN = re.compile(r"(?i)\b(nif|n[ºo]?\s*contribuinte|iban)\b.{0,12}?[0-9]")
_MONTHS = "(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez|\\d{1,2})"
_MONTH_NAMES = ("jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez")


def validate_kit(html: str, briefing_text: str) -> list[str]:
    """Erros de kit que o modelo cometeu — a rota decide regenerar ou rejeitar.

    Nota anti-automata: validar o CORPO sem o nosso runtime — o JS menciona
    lp-wa/wa.me/data-countdown e leria-se como conteúdo real da página.
    """
    errs: list[str] = []
    body = strip_runtime(html)
    phone = find_phone(briefing_text)
    has_wa = (bool(re.search(r"""name=["']lp-wa["'] content=["']\d{9,12}""", body))
              or "wa.me" in body.lower()
              or bool(re.search(r"""data-wa=["']\d{9}["']""", body))
              or bool(re.search("""href=["']tel:""", body, re.I)))
    if phone and not has_wa:
        errs.append("o briefing deu telefone e a página não tem WhatsApp/contacto visível")
    fold = _fold(briefing_text)
    for m in re.finditer(r"""(?i)data-countdown=["'](\d{4})-(\d{2})-(\d{2})""", body):
        dia = str(int(m.group(3)))  # «09» no HTML, «9 de maio» no briefing
        mes_idx = int(m.group(2)) - 1
        mes = _MONTH_NAMES[mes_idx] if 0 <= mes_idx < 12 else ""
        tem_dia = bool(re.search(rf"(?<!\d){dia}\D{{0,8}}{_MONTHS}", fold))
        tem_mes = bool(mes) and (mes in fold or bool(re.search(rf"(?<!\d)0?{mes_idx + 1}(?!\d)", fold)))
        if not (tem_dia and tem_mes):
            errs.append(f"countdown com data ({m.group(1)}-{m.group(2)}-{m.group(3)}) que não está no briefing — nunca inventes prazos")
    if _FISCAL.search(body) and not _FISCAL_GIVEN.search(briefing_text):
        errs.append("NIF/IBAN inventado na página")
    if re.search(r"(?i)<\s*script\b", body):
        errs.append("HTML contém <script> não injetado")
    if len(html) > 240_000:
        errs.append("página HTML demasiado grande")
    return errs


def digest(html: str) -> dict:
    """Resumo visual para anti-repetição: paleta dominante, fonte, tom do hero."""
    colors = re.findall(r"#([0-9a-fA-F]{6})\b", html)
    counts: dict[str, int] = {}
    for c in colors:
        counts[c.lower()] = counts.get(c.lower(), 0) + 1
    top = [c for c, _ in sorted(counts.items(), key=lambda kv: -kv[1])[:6]]
    fonts = re.findall(r"(?i)font-family\s*:\s*['\"]?([A-Za-z][A-Za-z ]{2,23})", html)
    h1 = re.search(r"(?is)<h1[^>]*>(.*?)</h1>", html)
    hero = re.sub(r"<[^>]+>", " ", h1.group(1)).strip()[:90] if h1 else ""
    dark = 0
    for c, n in counts.items():
        r, g, b = int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)
        if (r + g + b) / 3 < 80:
            dark += n
    return {"palette": top, "font": (fonts[0].strip() if fonts else ""),
            "hero": hero, "mode": "dark" if dark and dark * 2 > len(colors) else "light"}



def design_system() -> str:
    """System do Studio: diretor de arte + playbook comum + contrato HTML."""
    from .. import prompts  # mesmo módulo do plan — fonte única das regras
    intro = (
        "És um DIRETOR DE ARTE e engenheiro front-end de elite, em PT-PT. Cada página que "
        "escreves é desenhada de raiz para AQUELE briefing — nunca um template. Não preenches "
        "formulários de secções: decides tu a estrutura, a paleta, a tipografia e o ritmo. "
        "Rejeitas a primeira ideia óbvia. NOMES E LOCAIS SÃO PALAVRAS DO CLIENTE: usa-os "
        "exatamente como ele os escreveu, sem inventar topónimos."
    )
    return intro + "\n\n" + prompts.LANDING_PLAYBOOK + "\n\n" + DESIGN_CONTRACT


def anti_repeat_block(digests: list[dict]) -> str:
    """ANTI-REPETIÇÃO: as últimas vistas do dono — o que não podes repetir."""
    if not digests:
        return ""
    linhas = []
    for d in digests:
        cores = ", ".join(d.get("palette", [])[:4])
        linhas.append(
            f"- paleta {cores} | fonte {d.get('font', '')} | modo {d.get('mode', '')} | hero «{d.get('hero', '')[:60]}»"
        )
    return ("\nANTI-REPETIÇÃO (vistas do dono, já usadas):\n" + "\n".join(linhas) +
            "\nA tua paleta, fonte e composição do hero TÊM de ser visivelmente "
            "diferentes destas (mesma família só se o briefing pedir continuidade).")


def design_user(briefing: str, objective: str, style: str, strategy: str,
                site: str, memory: str, history: str, seed: str, date_rule: str) -> str:
    """User do design: briefing + tudo o que o plan recebe, em texto livre."""
    partes = [f"BRIEFING: {briefing}", f"OBJETIVO: {objective}", f"ESTILO: {style}"]
    for extra in (strategy, site, memory, history,
                  (f"DIREÇÃO ARTÍSTICA DESTA VERSÃO: {seed}" if seed else ""), date_rule):
        if extra:
            partes.append(extra)
    return "\n\n" + "\n\n".join(partes)


_RUNTIME_STYLE = re.compile(r"(?is)<style data-studio[^>]*>.*?</style>")
_RUNTIME_SCRIPT = re.compile(r"(?is)<script data-studio>.*?</script>")
_RUNTIME_META = re.compile(r"(?is)<meta name=\"lp-(wa|api|slug)\"[^>]*>")
_GALLERY = re.compile(r"(?is)<section[^>]*data-studio-gal[^>]*>.*?</section>")


def inject_gallery(html: str, urls: list[str]) -> str:
    """Galeria com as fotos REAIS do site do cliente que a página não usou.

    Fotos do cliente nunca ficam de fora: se o desenho não lhes deu sítio,
    o servidor desenha a secção — neutra, adaptada às cores CSS da página.
    Marcada data-studio: o strip_runtime remove-a e recria-a em edições.
    """
    urls = [u for u in urls if str(u).startswith(("http", "/"))][:8]
    if not urls:
        return html
    figs = "".join(
        f'<figure class="lp-gal-item"><img src="{u}" alt="Foto do nosso espaço" loading="lazy"></figure>'
        for u in urls)
    sec = ('<section data-studio-gal style="padding:56px 6vw">'
           '<h2 style="margin:0 0 20px;font-size:clamp(22px,3.4vw,34px)">As nossas fotos</h2>'
           '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px">'
           f'{figs}</div>'
           '<style data-studio-gal>.lp-gal-item{margin:0}.lp-gal-item img{width:100%;height:220px;'
           'object-fit:cover;border-radius:12px;display:block}</style></section>')
    m_footer = re.search(r"(?is)<footer\b", html)
    if m_footer:
        return html[:m_footer.start()] + sec + html[m_footer.start():]
    if re.search(r"(?i)</body>", html):
        return re.sub(r"(?i)</body>", sec + "</body>", html, count=1)
    return html + sec


def strip_runtime(html: str) -> str:
    """Remove o nosso runtime injetado — para editar/regenerar sem duplicar."""
    html = _RUNTIME_STYLE.sub("", html)
    html = _RUNTIME_SCRIPT.sub("", html)
    html = _RUNTIME_META.sub("", html)
    html = _GALLERY.sub("", html)
    return html


def extract_html(raw: str) -> str:
    """Resposta do modelo → documento HTML puro (lida com fences e prefixos)."""
    raw = raw.strip()
    raw = re.sub(r"(?is)^```(?:html)?\s*|```$", "", raw).strip()
    i_doctype = raw.lower().find("<!doctype")
    i_html = raw.lower().find("<html")
    start = min(x for x in (i_doctype, i_html, len(raw)) if x >= 0)
    if start >= len(raw):
        raise ValueError("a resposta não contém HTML")
    end = raw.lower().rfind("</html>")
    return raw[start:end + 7] if end > start else raw[start:]
