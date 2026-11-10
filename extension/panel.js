(() => {
  const cfg=window.OFERTIX_CONFIG||{}, URL=String(cfg.supabaseUrl||"").replace(/\/$/,""), KEY=String(cfg.publishableKey||"");
  const STORE="ofertix_extension_session_v1", $=id=>document.getElementById(id), view=$("view");
  let session=readSession(),user=null,access=null,offers=[],products=[],marketplaces=[],categories=[],links=[],variations=[],statusFilter="pending",searchTerm="",page=1,busy=false,notice="",error="";
  function readSession(){try{return JSON.parse(localStorage.getItem(STORE)||"null")}catch{return null}}
  function saveSession(v){session=v;if(v)localStorage.setItem(STORE,JSON.stringify(v));else localStorage.removeItem(STORE)}
  function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
  function validUrl(v){try{const u=new URL(v||"");return u.protocol==="https:"||u.protocol==="http:"}catch{return false}}
  function money(v){if(v==null||v==="")return "Preço indisponível";return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(v))}
  function permitted(k){if(access?.role==="admin")return true;const a=k.split(".");return access?.permissions?.[a[0]]?.[a[1]]===true}
  function hdr(){return {"apikey":KEY,"Authorization":"Bearer "+(session?.access_token||KEY),"Content-Type":"application/json"}}
  async function auth(path,body){const r=await fetch(URL+"/auth/v1/"+path,{method:"POST",headers:{"apikey":KEY,"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.msg||d.message||d.error_description||"Falha na autenticação.");return d}
  async function ensure(){if(!session?.access_token)throw new Error("Faça login para continuar.");if(Date.now()<Number(session.expires_at||0)-60000)return;const fresh=await auth("token?grant_type=refresh_token",{refresh_token:session.refresh_token});saveSession({...fresh,expires_at:Date.now()+Number(fresh.expires_in||3600)*1000})}
  async function api(path,opts={}){await ensure();const r=await fetch(URL+"/rest/v1/"+path,{method:opts.method||"GET",headers:{...hdr(),...(opts.body?{"Prefer":"return=representation"}:{})},body:opts.body?JSON.stringify(opts.body):undefined});const raw=await r.text();let d=null;try{d=raw?JSON.parse(raw):null}catch{d=raw}if(!r.ok)throw new Error(d?.message||d?.hint||d?.details||d?.error||("Supabase HTTP "+r.status));return d}
  function footer(t){$("footer-status").textContent=t}
  function login(message){$("logout").hidden=true;view.innerHTML='<form class="login" id="login-form"><h2>Entre no Ofertix</h2><p>Use seu usuário do painel Ofertix. A extensão respeita as permissões cadastradas no sistema.</p>'+(message?'<div class="alert">'+esc(message)+'</div>':'')+'<div class="field"><label for="email">E-mail</label><input id="email" name="email" type="email" autocomplete="username" required></div><div class="field"><label for="password">Senha</label><input id="password" name="password" type="password" autocomplete="current-password" required></div><button class="primary full" type="submit">Entrar</button></form>';
    $("login-form").addEventListener("submit",async e=>{e.preventDefault();const b=e.currentTarget.querySelector("button");b.disabled=true;b.textContent="Entrando…";try{const d=await auth("token?grant_type=password",{email:$("email").value.trim(),password:$("password").value});saveSession({...d,expires_at:Date.now()+Number(d.expires_in||3600)*1000});await load()}catch(x){login(x.message||"Não foi possível entrar.")}});footer("Aguardando autenticação")}
  function mapProducts(){return new Map(products.map(p=>[p.id,p]))}
  function mapMarkets(){return new Map(marketplaces.map(m=>[m.id,m]))}
  function mapCats(){return new Map(categories.map(c=>[c.id,c]))}
  function productLinks(id){return links.filter(l=>l.product_id===id)}
  function ready(o){const p=mapProducts().get(o.product_id),a=productLinks(o.product_id).filter(l=>l.status==="ready"&&validUrl(l.affiliate_url));return a.find(l=>l.affiliate_url===o.affiliate_url)||a.find(l=>l.affiliate_url===p?.affiliate_url)||a[0]||null}
  function visible(){const pm=mapProducts(),mm=mapMarkets(),cm=mapCats();return offers.filter(o=>{if(statusFilter!=="all"&&o.approval_status!==statusFilter)return false;if(!searchTerm)return true;const p=pm.get(o.product_id),m=p?mm.get(p.marketplace_id):null,c=p?cm.get(p.commercial_category_id):null;return [o.title,p?.title,p?.brand,m?.name,c?.name].filter(Boolean).join(" ").toLowerCase().includes(searchTerm.toLowerCase())})}
  async function load(){
    if(!URL||!KEY){fail("Configuração do Supabase ausente em extension/config.js.");return}
    if(!session?.access_token){login();return}
    footer("Validando sessão…");
    try{
      await ensure();const ur=await fetch(URL+"/auth/v1/user",{headers:hdr()});if(!ur.ok){saveSession(null);login("Sua sessão expirou. Entre novamente.");return}user=await ur.json();
      access=await api("rpc/get_my_access",{method:"POST",body:{}});if(!access?.is_active){saveSession(null);login("Usuário inativo. Solicite liberação ao administrador.");return}
      if(!permitted("screen.approval")){view.innerHTML='<div class="empty">Seu usuário não possui permissão para acessar Aprovação de Ofertas.</div>';footer("Acesso restrito");return}
      footer("Carregando ofertas…");const all=[];
      for(let off=0;;off+=1000){const b=await api("offers?select=id,product_id,title,affiliate_url,status,approval_status,approved_at,approved_by,rejected_at,rejected_by,rejection_reason,product_variation_id,price_snapshot,original_price_snapshot,variation_label,created_at&order=created_at.desc&limit=1000&offset="+off);all.push(...(b||[]));if(!b||b.length<1000)break}
      const by=new Map();for(const o of all){const old=by.get(o.product_id);if(!old||new Date(o.created_at)>new Date(old.created_at))by.set(o.product_id,o)}offers=[...by.values()];
      const ids=[...new Set(offers.map(o=>o.product_id))],batches=[];for(let i=0;i<ids.length;i+=80)batches.push(ids.slice(i,i+80));
      const [p,m,c,l,v]=await Promise.all([
        Promise.all(batches.map(a=>api("products?select=id,marketplace_id,title,brand,category,commercial_category_id,commercial_category_source,origin_type,origin_type_source,price,original_price,image_url,product_url,affiliate_url,active&id=in.("+a.join(",")+")"))),
        api("marketplaces?select=id,name,slug&order=name"),
        api("offer_categories?select=id,name,slug,active,priority&active=eq.true&order=priority"),
        Promise.all(batches.map(a=>api("affiliate_links?select=product_id,affiliate_url,status,updated_at&product_id=in.("+a.join(",")+")&order=updated_at.desc"))),
        Promise.all(batches.map(a=>api("product_variations?select=id,product_id,external_variation_id,name,unit_quantity,price,original_price,currency,is_default,active&active=eq.true&product_id=in.("+a.join(",")+")&order=price.asc")))
      ]);
      products=p.flat();marketplaces=m||[];categories=c||[];links=l.flat();variations=v.flat();error="";notice="";page=1;render();footer("Conectado como "+(user.email||"usuário"));$("logout").hidden=false;
    }catch(x){fail(x.message||"Não foi possível carregar as aprovações.")}
  }
  function fail(msg){error=msg;view.innerHTML='<div class="alert">'+esc(msg)+'</div><button id="retry" class="primary full">Tentar novamente</button>';$("retry").addEventListener("click",load);footer("Falha ao carregar")}
  function render(){
    const pm=mapProducts(),mm=mapMarkets(),cm=mapCats(),itemsAll=visible(),pending=offers.filter(o=>o.approval_status==="pending").length,approved=offers.filter(o=>o.approval_status==="approved").length,rejected=offers.filter(o=>o.approval_status==="rejected").length,pages=Math.max(1,Math.ceil(itemsAll.length/15));
    page=Math.min(page,pages);const items=itemsAll.slice((page-1)*15,page*15);
    let html=(error?'<div class="alert">'+esc(error)+'</div>':'')+(notice?'<div class="notice">'+esc(notice)+'</div>':'');
    html+='<div class="metrics"><div class="metric"><strong>'+pending+'</strong><span>Aguardando</span></div><div class="metric"><strong>'+approved+'</strong><span>Aprovadas</span></div><div class="metric"><strong>'+rejected+'</strong><span>Rejeitadas</span></div></div>';
    html+='<div class="toolbar"><input id="search" placeholder="Buscar produto, marca…" value="'+esc(searchTerm)+'"><select id="status"><option value="pending" '+(statusFilter==="pending"?"selected":"")+'>Pendentes</option><option value="approved" '+(statusFilter==="approved"?"selected":"")+'>Aprovadas</option><option value="rejected" '+(statusFilter==="rejected"?"selected":"")+'>Rejeitadas</option><option value="all" '+(statusFilter==="all"?"selected":"")+'>Todas</option></select></div><div class="section-head"><strong>Ofertas</strong><span>'+itemsAll.length+' registro(s)</span></div>';
    if(!items.length)html+='<div class="empty">Nenhuma oferta encontrada com os filtros atuais.</div>';
    items.forEach(o=>{
      const p=pm.get(o.product_id),m=p?mm.get(p.marketplace_id):null,c=p?cm.get(p.commercial_category_id):null,link=ready(o),vs=variations.filter(v=>v.product_id===o.product_id),origin=p?.origin_type||"unknown",price=o.price_snapshot??p?.price;
      let catOpts='<option value="">Sem categoria</option>'+categories.map(cat=>'<option value="'+esc(cat.id)+'" '+(cat.id===p?.commercial_category_id?"selected":"")+'>'+esc(cat.name)+'</option>').join("");
      let varOpts='<option value="">Manter opção atual</option>'+vs.map(v=>'<option value="'+esc(v.id)+'" '+(v.id===o.product_variation_id?"selected":"")+'>'+esc(v.name)+' — '+money(v.price)+'</option>').join("");
      html+='<article class="offer"><h3 class="offer-title">'+esc(o.title||p?.title||"Produto sem título")+'</h3><div class="meta">'+esc(m?.name||"Marketplace")+' · '+esc(p?.brand||"Marca não informada")+'</div><div class="price">'+money(price)+'</div>';
      html+='<div class="fields-grid"><div class="mini-field"><label>Categoria comercial</label><select data-category="'+esc(p?.id||"")+'" '+(!p?"disabled":"")+'>'+catOpts+'</select></div><div class="mini-field"><label>Origem do produto</label><select data-origin="'+esc(p?.id||"")+'" '+(!p?"disabled":"")+'><option value="unknown" '+(origin==="unknown"?"selected":"")+'>Não identificada</option><option value="national" '+(origin==="national"?"selected":"")+'>Nacional</option><option value="imported" '+(origin==="imported"?"selected":"")+'>Importado</option></select></div></div>';
      if(vs.length)html+='<div class="mini-field" style="margin-top:9px"><label>Variação / opção</label><select data-variation="'+esc(o.id)+'">'+varOpts+'</select></div>';
      html+='<div class="links">'+(validUrl(p?.product_url)?'<a href="'+esc(p.product_url)+'" target="_blank" rel="noopener noreferrer">↗ Produto original</a>':'<span class="link-muted">Link original indisponível</span>')+(link?'<a href="'+esc(link.affiliate_url)+'" target="_blank" rel="noopener noreferrer">↗ Link de afiliado</a>':'<span class="link-muted">Afiliado não está pronto</span>')+'</div>';
      if(o.approval_status==="pending")html+='<div class="actions"><button class="action approve" data-approve="'+esc(o.id)+'" '+(!link||busy?"disabled":"")+'>✓ Aprovar</button><button class="action reject" data-reject="'+esc(o.id)+'" '+(busy?"disabled":"")+' >✕ Rejeitar</button></div>';
      else html+='<div class="muted">Status: '+(o.approval_status==="approved"?"Aprovada":"Rejeitada")+'</div>';
      if(o.approval_status==="pending"&&!link)html+='<div class="error-inline">A aprovação está bloqueada: não existe link de afiliado válido com status pronto.</div>';
      html+='</article>';
    });
    html+='<div class="pagination"><button id="prev" '+(page<=1?"disabled":"")+' >← Anterior</button><span>Página '+page+' de '+pages+'</span><button id="next" '+(page>=pages?"disabled":"")+' >Próxima →</button></div>';view.innerHTML=html;
    $("search").addEventListener("input",e=>{searchTerm=e.target.value;page=1;renderKeepSearch()});$("status").addEventListener("change",e=>{statusFilter=e.target.value;page=1;render()});
    $("prev").addEventListener("click",()=>{page=Math.max(1,page-1);render()});$("next").addEventListener("click",()=>{page++;render()});
    view.querySelectorAll("[data-category]").forEach(el=>el.addEventListener("change",()=>saveCategory(el.dataset.category,el.value)));
    view.querySelectorAll("[data-origin]").forEach(el=>el.addEventListener("change",()=>saveOrigin(el.dataset.origin,el.value)));
    view.querySelectorAll("[data-variation]").forEach(el=>el.addEventListener("change",()=>saveVariation(el.dataset.variation,el.value)));
    view.querySelectorAll("[data-approve]").forEach(el=>el.addEventListener("click",()=>act(el.dataset.approve,"approved")));
    view.querySelectorAll("[data-reject]").forEach(el=>el.addEventListener("click",()=>act(el.dataset.reject,"rejected")));
  }
  function renderKeepSearch(){const e=$("search"),pos=e.selectionStart;render();const n=$("search");n.focus();n.setSelectionRange(pos,pos)}
  async function saveCategory(id,value){if(!id)return;busy=true;render();try{await api("products?id=eq."+encodeURIComponent(id),{method:"PATCH",body:{commercial_category_id:value||null,commercial_category_source:"manual",commercial_category_set_at:new Date().toISOString()}});products=products.map(p=>p.id===id?{...p,commercial_category_id:value||null,commercial_category_source:"manual"}:p);notice="Categoria manual salva; sincronizações futuras preservarão essa escolha.";error=""}catch(x){error="Não foi possível salvar a categoria: "+x.message}finally{busy=false;render()}}
  async function saveOrigin(id,value){if(!id)return;busy=true;render();try{await api("products?id=eq."+encodeURIComponent(id),{method:"PATCH",body:{origin_type:value,origin_type_source:"manual",origin_source:"manual_override",origin_country:null}});products=products.map(p=>p.id===id?{...p,origin_type:value,origin_type_source:"manual"}:p);notice="Origem manual salva; sincronizações futuras preservarão essa escolha.";error=""}catch(x){error="Não foi possível salvar a origem: "+x.message}finally{busy=false;render()}}
  async function saveVariation(oid,vid){if(!vid)return;const o=offers.find(x=>x.id===oid),v=variations.find(x=>x.id===vid);if(!o||!v)return;busy=true;render();try{const b={product_variation_id:v.id,price_snapshot:v.price,original_price_snapshot:v.original_price,variation_label:v.name};await api("offers?id=eq."+encodeURIComponent(oid),{method:"PATCH",body:b});offers=offers.map(x=>x.id===oid?{...x,...b}:x);notice="Variação e preço salvos para esta oferta.";error=""}catch(x){error="Não foi possível salvar a variação: "+x.message}finally{busy=false;render()}}
  async function act(id,next){const o=offers.find(x=>x.id===id);if(!o||busy)return;const p=mapProducts().get(o.product_id);if(!p){error="Produto não encontrado.";render();return}const now=new Date().toISOString();let b;if(next==="approved"){const l=ready(o);if(!l){error="Link de afiliado não está registrado como pronto.";render();return}b={approval_status:"approved",status:"approved",affiliate_url:l.affiliate_url,approved_at:now,approved_by:user?.id||null,rejected_at:null,rejected_by:null,rejection_reason:null}}else b={approval_status:"rejected",status:"archived",rejected_at:now,rejected_by:user?.id||null,rejection_reason:"Rejeitado manualmente na extensão Ofertix"};busy=true;render();try{const d=await api("offers?id=eq."+encodeURIComponent(id)+"&approval_status=eq.pending",{method:"PATCH",body:b});if(!Array.isArray(d)||!d.length)throw new Error("A oferta foi alterada em outra ação. Atualize e tente novamente.");offers=offers.map(x=>x.id===id?{...x,...b}:x);notice=next==="approved"?"Oferta aprovada e liberada para a fila de publicação.":"Oferta rejeitada e bloqueada para publicação.";error=""}catch(x){error="Não foi possível atualizar a oferta: "+x.message}finally{busy=false;render()}}
  $("minimize").addEventListener("click",()=>parent.postMessage({type:"OFERTIX_MINIMIZE"},"*"));
  $("refresh").addEventListener("click",()=>{if(session?.access_token)load();else login()});
  $("logout").addEventListener("click",()=>{saveSession(null);user=null;access=null;login("Você saiu da conta.")});
  load();
})();