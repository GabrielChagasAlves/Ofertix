import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, ImagePlus, Instagram, Loader2, RefreshCw, Send, XCircle } from "lucide-react";
import { supabase } from "../lib/supabase";
import { createInstagramDraft, submitInstagramDraftForApproval, type SocialMediaPost } from "../lib/social-media-posts";

const statusLabels: Record<string,string> = { draft: "Rascunho", pending_approval: "Aguardando aprovação", approved: "Aprovada", scheduled: "Agendada", published: "Publicada", rejected: "Rejeitada", failed: "Falha" };

export function InstagramPublisher() {
  const [posts,setPosts] = useState<SocialMediaPost[]>([]);
  const [caption,setCaption] = useState("");
  const [file,setFile] = useState<File|null>(null);
  const [preview,setPreview] = useState("");
  const [loading,setLoading] = useState(false);
  const [refreshing,setRefreshing] = useState(false);
  const [message,setMessage] = useState("");
  const [error,setError] = useState("");

  const load = async () => {
    setRefreshing(true);
    const {data,error} = await supabase.from("social_media_posts").select("*").eq("network","instagram").order("created_at",{ascending:false}).limit(50);
    if(error) setError(error.message); else setPosts((data ?? []) as SocialMediaPost[]);
    setRefreshing(false);
  };
  useEffect(()=>{ void load(); },[]);
  useEffect(()=>{ if(!file){setPreview("");return;} const url=URL.createObjectURL(file);setPreview(url);return ()=>URL.revokeObjectURL(url); },[file]);

  const saveDraft = async () => {
    setError("");setMessage("");
    if(!file || !caption.trim()){setError("Selecione a arte e preencha a legenda.");return;}
    setLoading(true);
    try { await createInstagramDraft({image:file,caption});setCaption("");setFile(null);setMessage("Rascunho salvo. A arte já está armazenada no Supabase.");await load(); }
    catch(e){setError(e instanceof Error?e.message:"Não foi possível salvar o rascunho.");}
    finally{setLoading(false);}
  };
  const submit = async (post:SocialMediaPost) => {
    setError("");setMessage("");setLoading(true);
    try { await submitInstagramDraftForApproval(post.id);setMessage("Publicação enviada para aprovação.");await load(); }
    catch(e){setError(e instanceof Error?e.message:"Não foi possível enviar para aprovação.");}
    finally{setLoading(false);}
  };

  return <section className="ops-surface instagram-publisher">
    <header className="instagram-publisher-heading"><div><span className="instagram-eyebrow"><Instagram size={14}/> INSTAGRAM</span><h2>Central de publicações</h2><p>Prepare a arte e a legenda, salve como rascunho e envie para aprovação antes de qualquer agendamento.</p></div><button type="button" className="ops-button ops-button-secondary" onClick={()=>void load()} disabled={refreshing}><RefreshCw size={15}/> Atualizar</button></header>
    {error && <div className="ops-alert">{error}</div>}{message && <div className="instagram-success"><CheckCircle2 size={16}/>{message}</div>}
    <div className="instagram-compose">
      <div className="instagram-upload-area">
        <label htmlFor="instagram-art-file" className="instagram-upload-label">{preview?<img src={preview} alt="Prévia da arte"/>:<><ImagePlus size={28}/><strong>Selecionar arte</strong><span>PNG, JPG ou WebP · até 10 MB</span></>}</label>
        <input id="instagram-art-file" type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>setFile(e.target.files?.[0]??null)}/>
        {file && <button type="button" className="instagram-clear-file" onClick={()=>setFile(null)}>Remover imagem</button>}
      </div>
      <div className="instagram-caption-area"><label htmlFor="instagram-caption">Legenda da publicação</label><textarea id="instagram-caption" value={caption} onChange={e=>setCaption(e.target.value)} maxLength={2200} placeholder="Escreva a legenda, chamada para ação e hashtags..."/><small>{caption.length}/2.200 caracteres</small><button type="button" className="ops-button ops-button-primary" onClick={()=>void saveDraft()} disabled={loading || !file || !caption.trim()}>{loading?<Loader2 size={15} className="spin"/>:<CheckCircle2 size={15}/>} Salvar rascunho</button></div>
    </div>
    <div className="instagram-posts-heading"><h3>Publicações recentes</h3><span>{posts.length} registro(s)</span></div>
    {posts.length===0?<div className="instagram-empty"><Instagram size={22}/><strong>Nenhuma publicação criada</strong><span>Os rascunhos e os envios para aprovação aparecerão aqui.</span></div>:<div className="instagram-post-list">{posts.map(post=><article className="instagram-post-row" key={post.id}><img src={post.media_url} alt="Arte da publicação"/><div className="instagram-post-info"><span className={"instagram-status status-"+post.status}>{statusLabels[post.status]??post.status}</span><p>{post.caption}</p><small>{new Date(post.created_at).toLocaleString("pt-BR")}</small>{post.error_message&&<small className="instagram-error">{post.error_message}</small>}</div><div className="instagram-post-actions">{post.status==="draft"&&<button type="button" className="ops-button ops-button-primary" onClick={()=>void submit(post)} disabled={loading}><Send size={14}/> Enviar para aprovação</button>}{post.status==="pending_approval"&&<span className="instagram-waiting"><Clock3 size={14}/> Aguardando aprovação</span>}{post.status==="published"&&<CheckCircle2 size={17} />}{post.status==="rejected"&&<XCircle size={17}/>}</div></article>)}</div>}
    <p className="instagram-disclaimer">Por segurança, salvar ou enviar para aprovação não publica no Instagram. O agendamento via Metricool será habilitado após configurar uma credencial de servidor.</p>
  </section>;
}
