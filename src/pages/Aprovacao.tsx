import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, CheckCircle2, Clock3, ExternalLink, Filter, Link2, PackageCheck, RefreshCw, Search, X, XCircle } from "lucide-react";
import { supabase } from "../lib/supabase";
import { EmptyState, formatCurrency, formatDate, MarketplaceTag, Metric, PageIntro, StatusPill } from "../components/OperationsUI";

type Offer = { id:string; product_id:string; title:string; affiliate_url:string|null; status:string; approval_status:"pending"|"approved"|"rejected"; approved_at:string|null; approved_by:string|null; rejected_at:string|null; rejected_by:string|null; rejection_reason:string|null; created_at:string };
type Product = { id:string; marketplace_id:string; title:string; brand:string|null; category:string|null; price:number|null; original_price:number|null; image_url:string|null; product_url:string|null; affiliate_url:string|null; active:boolean };
type Marketplace = { id:string; name:string; slug:string };
type AffiliateLink = { product_id:string; affiliate_url:string; status:string; updated_at:string };
type FilterStatus = "all"|"pending"|"approved"|"rejected";
const validUrl=(value:string|null|undefined)=>{try{const u=new URL(value||"");return u.protocol==="https:"||u.protocol==="http:";}catch{return false;}};
const labels:Record<string,string>={pending:"Aguardando aprovação",approved:"Aprovada",rejected:"Rejeitada"};

export function Aprovacao(){
 const [offers,setOffers]=useState<Offer[]>([]),[products,setProducts]=useState<Product[]>([]),[marketplaces,setMarketplaces]=useState<Marketplace[]>([]),[links,setLinks]=useState<AffiliateLink[]>([]);
 const [userId,setUserId]=useState(""),[userLabel,setUserLabel]=useState("Você"),[search,setSearch]=useState(""),[status,setStatus]=useState<FilterStatus>("pending"),[marketplace,setMarketplace]=useState("all"),[loading,setLoading]=useState(true),[busy,setBusy]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState(""),[selected,setSelected]=useState<string[]>([]);
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const all:Offer[]=[];
   for(let from=0;;from+=1000){const r=await supabase.from("offers").select("id,product_id,title,affiliate_url,status,approval_status,approved_at,approved_by,rejected_at,rejected_by,rejection_reason,created_at").order("created_at",{ascending:false}).range(from,from+999);if(r.error)throw r.error;all.push(...(r.data as Offer[]||[]));if(!r.data||r.data.length<1000)break;}
   const ids=[...new Set(all.map(x=>x.product_id))];
   const [p,m,l,u]=await Promise.all([
    ids.length?supabase.from("products").select("id,marketplace_id,title,brand,category,price,original_price,image_url,product_url,affiliate_url,active").in("id",ids):Promise.resolve({data:[],error:null}),
    supabase.from("marketplaces").select("id,name,slug").order("name"),
    ids.length?supabase.from("affiliate_links").select("product_id,affiliate_url,status,updated_at").in("product_id",ids).order("updated_at",{ascending:false}):Promise.resolve({data:[],error:null}),
    supabase.auth.getUser()
   ]);
   if(p.error)throw p.error;if(m.error)throw m.error;if(l.error)throw l.error;
   setOffers(all);setProducts((p.data||[]) as Product[]);setMarketplaces((m.data||[]) as Marketplace[]);setLinks((l.data||[]) as AffiliateLink[]);
   const usr=u.data.user;setUserId(usr?.id||"");setUserLabel((typeof usr?.user_metadata?.full_name==="string"&&usr.user_metadata.full_name)||usr?.email||"Você");
  }catch(e){setError(e instanceof Error?e.message:"Falha ao carregar aprovação.");}finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();},[load]);
 const pmap=useMemo(()=>new Map(products.map(p=>[p.id,p])),[products]),mmap=useMemo(()=>new Map(marketplaces.map(m=>[m.id,m])),[marketplaces]);
 const lmap=useMemo(()=>{const map=new Map<string,AffiliateLink[]>();links.forEach(l=>map.set(l.product_id,[...(map.get(l.product_id)||[]),l]));return map;},[links]);
 const readyLink=(o:Offer)=>{const p=pmap.get(o.product_id),ready=(lmap.get(o.product_id)||[]).filter(l=>l.status==="ready"&&validUrl(l.affiliate_url));return ready.find(l=>l.affiliate_url===o.affiliate_url)||ready.find(l=>l.affiliate_url===p?.affiliate_url)||ready[0];};
 const uniqueOffers=useMemo(()=>{const byProduct=new Map<string,Offer>();offers.forEach(o=>{const previous=byProduct.get(o.product_id);if(!previous||new Date(o.created_at).getTime()>new Date(previous.created_at).getTime())byProduct.set(o.product_id,o);});return [...byProduct.values()];},[offers]);
 const visible=useMemo(()=>uniqueOffers.filter(o=>{const p=pmap.get(o.product_id),m=p?mmap.get(p.marketplace_id):undefined,t=[o.title,p?.title,p?.brand,p?.category,m?.name].filter(Boolean).join(" ").toLowerCase();return(status==="all"||o.approval_status===status)&&(marketplace==="all"||p?.marketplace_id===marketplace)&&(!search.trim()||t.includes(search.trim().toLowerCase()));}),[uniqueOffers,pmap,mmap,status,marketplace,search]);
 const stats={total:uniqueOffers.length,pending:uniqueOffers.filter(o=>o.approval_status==="pending").length,approved:uniqueOffers.filter(o=>o.approval_status==="approved").length,rejected:uniqueOffers.filter(o=>o.approval_status==="rejected").length};
 const selectable=visible.filter(o=>o.approval_status==="pending");
 const allSelected=selectable.length>0&&selectable.every(o=>selected.includes(o.id));
 const toggleSelected=(id:string,checked:boolean)=>setSelected(current=>checked?[...new Set([...current,id])]:current.filter(x=>x!==id));
 const toggleAll=(checked:boolean)=>setSelected(current=>checked?[...new Set([...current,...selectable.map(o=>o.id)])]:current.filter(id=>!selectable.some(o=>o.id===id)));
 const bulkAct=async(next:"approved"|"rejected")=>{
  const targets=selectable.filter(o=>selected.includes(o.id));if(!targets.length)return;
  setBusy("bulk");setError("");setNotice("");let done=0;const failures:string[]=[];const now=new Date().toISOString();
  for(const o of targets){try{
   if(!pmap.get(o.product_id))throw new Error("Produto não encontrado");
   let update:Record<string,unknown>;
   if(next==="approved"){const link=readyLink(o);if(!link)throw new Error("Link de afiliado não está pronto");update={approval_status:"approved",status:"approved",affiliate_url:link.affiliate_url,approved_at:now,approved_by:userId||null,rejected_at:null,rejected_by:null,rejection_reason:null};}
   else update={approval_status:"rejected",status:"archived",rejected_at:now,rejected_by:userId||null,rejection_reason:"Rejeitado em lote na tela de Aprovação"};
   const r=await supabase.from("offers").update(update).eq("id",o.id).eq("approval_status","pending").select("id").maybeSingle();if(r.error)throw r.error;if(!r.data)throw new Error("Registro alterado em outra ação");done++;
  }catch(e){failures.push(`${o.title}: ${e instanceof Error?e.message:"falha"}`);}}
  setSelected([]);setBusy("");setNotice(`${done} oferta(s) ${next==="approved"?"aprovada(s) e liberada(s) para publicação":"rejeitada(s)"}.${failures.length?` ${failures.length} falha(s): ${failures.slice(0,3).join("; ")}`:""}`);await load();
 };
 const act=async(o:Offer,next:FilterStatus)=>{
  if(next==="all")return;setBusy(o.id);setError("");setNotice("");
  try{
   if(!pmap.get(o.product_id))throw new Error("Produto não encontrado.");
   const now=new Date().toISOString();let update:Record<string,unknown>;
   if(next==="approved"){const link=readyLink(o);if(!link)throw new Error("Link de afiliado não está registrado como pronto.");update={approval_status:"approved",status:"approved",affiliate_url:link.affiliate_url,approved_at:now,approved_by:userId||null,rejected_at:null,rejected_by:null,rejection_reason:null};}
   else if(next==="rejected")update={approval_status:"rejected",status:"archived",rejected_at:now,rejected_by:userId||null,rejection_reason:"Rejeitado manualmente na tela de Aprovação"};
   else update={approval_status:"pending",status:"draft",approved_at:null,approved_by:null,rejected_at:null,rejected_by:null,rejection_reason:null};
   const r=await supabase.from("offers").update(update).eq("id",o.id).eq("approval_status",o.approval_status).select("id").maybeSingle();if(r.error)throw r.error;if(!r.data)throw new Error("A oferta mudou em outra ação. Atualize e tente novamente.");
   setNotice(next==="approved"?"Oferta aprovada. Ela seguirá automaticamente para a fila de publicação do Telegram.":next==="rejected"?"Oferta rejeitada e bloqueada para publicação.":"Oferta voltou para aprovação pendente.");await load();
  }catch(e){setError(e instanceof Error?e.message:"Não foi possível atualizar.");}finally{setBusy("");}
 };
 const actor=(id:string|null)=>!id?"Usuário não identificado":id===userId?userLabel:"Usuário "+id.slice(0,8);
 return <div className="page ops-page approval-page">
  <PageIntro eyebrow="CONTROLE EDITORIAL" title="Aprovação de Ofertas" description="Revise os produtos com link de afiliado antes de liberar a publicação automática no Telegram." actions={<button className="ops-button ops-button-secondary" onClick={()=>void load()} disabled={loading}><RefreshCw size={16}/> Atualizar</button>}/>
  {error&&<div className="ops-alert">{error}</div>}{notice&&<div className="approval-notice"><CheckCircle2 size={16}/>{notice}</div>}
  <section className="ops-metrics">
   <Metric icon={<PackageCheck size={19}/>} value={loading?"…":stats.total} label="Com link de afiliado" detail="Ofertas registradas"/>
   <Metric icon={<Clock3 size={19}/>} value={loading?"…":stats.pending} label="Aguardando aprovação" detail="Não serão publicadas"/>
   <Metric icon={<CheckCircle2 size={19}/>} value={loading?"…":stats.approved} label="Aprovadas" detail="Liberadas para publicação"/>
   <Metric icon={<XCircle size={19}/>} value={loading?"…":stats.rejected} label="Rejeitadas" detail="Bloqueadas para publicação"/>
  </section>
  <section className="ops-surface">
   <div className="ops-toolbar approval-toolbar">
    <label className="ops-search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar produto, marca ou categoria"/></label>
    <label className="ops-select"><Filter size={15}/><select value={status} onChange={e=>setStatus(e.target.value as FilterStatus)}><option value="pending">Aguardando aprovação</option><option value="approved">Aprovadas</option><option value="rejected">Rejeitadas</option><option value="all">Todos os status</option></select></label>
    <label className="ops-select"><select value={marketplace} onChange={e=>setMarketplace(e.target.value)}><option value="all">Todos os marketplaces</option>{marketplaces.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
   </div>
   {!loading&&selectable.length>0&&<div className="approval-bulkbar"><label className="approval-select-all"><input type="checkbox" checked={allSelected} onChange={e=>toggleAll(e.target.checked)}/>Selecionar todos os pendentes visíveis</label><span>{selected.filter(id=>selectable.some(o=>o.id===id)).length} selecionada(s)</span><div><button className="approval-button approval-button-approve" disabled={!selected.some(id=>selectable.some(o=>o.id===id))||!!busy} onClick={()=>void bulkAct("approved")}><Check size={15}/>Aprovar selecionadas</button><button className="approval-button approval-button-reject" disabled={!selected.some(id=>selectable.some(o=>o.id===id))||!!busy} onClick={()=>void bulkAct("rejected")}><X size={15}/>Rejeitar selecionadas</button></div></div>}
   {loading?<div className="ops-empty"><p>Carregando ofertas com link de afiliado…</p></div>:visible.length===0?<EmptyState title="Nenhuma oferta encontrada" detail={status==="pending"?"Não há produtos aguardando aprovação com os filtros atuais.":"Ajuste os filtros para consultar o histórico."}/>:<div className="approval-list">{visible.map(o=>{
    const p=pmap.get(o.product_id),source=p?mmap.get(p.marketplace_id):undefined,link=readyLink(o),valid=!!link&&validUrl(link.affiliate_url),isBusy=busy===o.id,approved=o.approval_status==="approved",rejected=o.approval_status==="rejected";
    return <article className="approval-card" key={o.id}>{o.approval_status==="pending"&&<label className="approval-card-select" title="Selecionar oferta"><input type="checkbox" checked={selected.includes(o.id)} onChange={e=>toggleSelected(o.id,e.target.checked)}/></label>}
     <div className="approval-card-image">{p?.image_url?<img src={p.image_url} alt="" loading="lazy"/>:<PackageCheck size={24}/>}</div>
     <div className="approval-card-main">
      <div className="approval-card-meta">{source&&<MarketplaceTag name={source.name} slug={source.slug}/>}<StatusPill tone={approved?"success":rejected?"danger":"warning"}>{labels[o.approval_status]}</StatusPill>{p&&!p.active&&<StatusPill>Produto inativo no catálogo</StatusPill>}</div>
      <h2>{p?.title||o.title}</h2><p className="approval-card-subtitle">{[p?.brand,p?.category,p?.price!=null?formatCurrency(p.price):null].filter(Boolean).join(" · ")||"Detalhes indisponíveis"}</p>
      <div className="approval-card-links">{p?.product_url&&<a href={p.product_url} target="_blank" rel="noreferrer"><ExternalLink size={14}/>Produto original</a>}{valid&&<a href={link?.affiliate_url} target="_blank" rel="noreferrer"><Link2 size={14}/>Link de afiliado</a>}{p?.original_price!=null&&p.price!=null&&p.original_price>p.price&&<span className="approval-discount">-{Math.round((p.original_price-p.price)/p.original_price*100)}%</span>}{!valid&&<span className="approval-link-warning"><XCircle size={14}/>Link não validado</span>}</div>
      <div className="approval-card-audit">{approved?<span>Aprovada em {formatDate(o.approved_at)} por {actor(o.approved_by)}</span>:rejected?<span>Rejeitada em {formatDate(o.rejected_at)} por {actor(o.rejected_by)} · {o.rejection_reason||"Sem motivo informado"}</span>:<span>Recebida em {formatDate(o.created_at)}</span>}</div>
     </div>
     <div className="approval-card-actions">{o.approval_status==="pending"?<><button className="approval-button approval-button-approve" onClick={()=>void act(o,"approved")} disabled={isBusy||!valid}><Check size={16}/>{isBusy?"Salvando…":"Aprovar e publicar"}</button><button className="approval-button approval-button-reject" onClick={()=>void act(o,"rejected")} disabled={isBusy}><X size={16}/>Rejeitar</button></>:<button className="approval-button approval-button-secondary" onClick={()=>void act(o,"pending")} disabled={isBusy}><Clock3 size={16}/>Voltar para pendente</button>}</div>
    </article>;
   })}</div>}
  </section>
 </div>;
}
