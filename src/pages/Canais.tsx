import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Edit3, Globe2, MessageCircle, Plus, RefreshCw, Save, Send, Trash2, X, Info } from "lucide-react";
import { supabase } from "../lib/supabase";
import { EmptyState, Metric, PageIntro, StatusPill } from "../components/OperationsUI";

type ChannelType = "facebook" | "instagram" | "tiktok" | "telegram" | "whatsapp";
type Category = { id: string; name: string };
type Channel = { id: string; name: string; type: ChannelType; category_id: string | null; identifier: string | null; active: boolean; auto_publish: boolean };
type ChannelForm = { name: string; type: ChannelType; category_id: string; identifier: string; active: boolean; auto_publish: boolean };
const blank: ChannelForm = { name: "", type: "telegram", category_id: "", identifier: "", active: true, auto_publish: false };
const labels: Record<ChannelType, string> = { telegram: "Telegram", whatsapp: "WhatsApp", instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok" };
function Icon({ type }: { type: ChannelType }) { const Component = type === "whatsapp" ? MessageCircle : type === "telegram" ? Send : Globe2; return <Component size={18} />; }

export function Canais() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<ChannelForm>(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const [channelResult, categoryResult] = await Promise.all([
      supabase.from("channels").select("id,name,type,category_id,identifier,active,auto_publish").order("created_at", { ascending: false }),
      supabase.from("offer_categories").select("id,name").eq("active", true).order("name"),
    ]);
    const requestError = channelResult.error || categoryResult.error;
    if (requestError) setError(requestError.message);
    setChannels((channelResult.data ?? []) as Channel[]); setCategories(categoryResult.data ?? []); setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);
  const reset = () => { setForm(blank); setEditing(null); setShowForm(false); };
  const edit = (channel: Channel) => { setEditing(channel.id); setForm({ name: channel.name, type: channel.type, category_id: channel.category_id ?? "", identifier: channel.identifier ?? "", active: channel.active, auto_publish: channel.type === "whatsapp" ? false : channel.auto_publish }); setShowForm(true); };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!form.name.trim()) { setError("Informe o nome do canal."); return; }
    setSaving(true); setError("");
    const payload = { name: form.name.trim(), type: form.type, category_id: form.category_id || null, identifier: form.identifier.trim() || null, active: form.active, auto_publish: form.type === "whatsapp" ? false : form.auto_publish };
    const request = editing ? supabase.from("channels").update(payload).eq("id", editing) : supabase.from("channels").insert(payload);
    const { error: requestError } = await request;
    if (requestError) setError(requestError.message); else { reset(); await load(); }
    setSaving(false);
  };
  const toggle = async (channel: Channel, field: "active" | "auto_publish") => {
    if (channel.type === "whatsapp" && field === "auto_publish") return;
    const { error: requestError } = await supabase.from("channels").update({ [field]: !channel[field] }).eq("id", channel.id);
    if (requestError) setError(requestError.message); else await load();
  };
  const remove = async (channel: Channel) => { if (!window.confirm("Remover o canal " + channel.name + "?")) return; const { error: requestError } = await supabase.from("channels").delete().eq("id", channel.id); if (requestError) setError(requestError.message); else await load(); };

  return <div className="page ops-page">
    <PageIntro eyebrow="DISTRIBUIÇÃO" title="Canais de publicação" description="Configure os destinos da operação e escolha quais canais podem receber ofertas automaticamente." actions={<><button className="ops-button ops-button-secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16} /> Atualizar</button><button className="ops-button ops-button-primary" onClick={() => { reset(); setShowForm(true); }}><Plus size={16} /> Novo canal</button></>} />
    {error && <div className="ops-alert">{error}</div>}
    <section className="ops-metrics"><Metric icon={<Send size={19} />} value={loading ? "…" : channels.length} label="Canais configurados" detail="Destinos cadastrados" /><Metric icon={<Globe2 size={19} />} value={loading ? "…" : channels.filter((channel) => channel.active).length} label="Canais ativos" detail="Disponíveis para operação" /><Metric icon={<Save size={19} />} value={loading ? "…" : channels.filter((channel) => channel.auto_publish).length} label="Automáticos" detail="Recebem ofertas automaticamente" /><Metric icon={<MessageCircle size={19} />} value={loading ? "…" : new Set(channels.map((channel) => channel.type)).size} label="Tipos em uso" detail="Diversificação dos canais" /></section>
    {channels.some((channel) => channel.type === "whatsapp") && <div className="ops-alert"><Info size={17} /> Canais públicos do WhatsApp não possuem endpoint de publicação na API oficial da Meta. O Ofertix mantém esses destinos em modo manual: prepara o conteúdo, permite copiar e registra a confirmação após o envio pelo aplicativo.</div>}
    {showForm && <section className="ops-surface ops-channel-form"><div className="ops-section-head"><div><p className="ops-eyebrow">{editing ? "EDIÇÃO" : "NOVO DESTINO"}</p><h2>{editing ? "Editar canal" : "Cadastrar canal"}</h2></div><button className="ops-icon-action" onClick={reset} aria-label="Fechar formulário"><X size={16} /></button></div><form onSubmit={save} className="ops-form-grid"><label>Nome do canal<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ex.: Ofertix no Telegram" /></label><label>Tipo<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as ChannelType, auto_publish: event.target.value === "whatsapp" ? false : form.auto_publish })}>{Object.entries(labels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label><label>Identificador<input value={form.identifier} onChange={(event) => setForm({ ...form, identifier: event.target.value })} placeholder={form.type === "whatsapp" ? "URL pública: https://whatsapp.com/channel/..." : "@canal ou identificador"} /></label><label>Categoria<select value={form.category_id} onChange={(event) => setForm({ ...form, category_id: event.target.value })}><option value="">Todas as categorias</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label><label className="ops-form-toggle"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Canal ativo</label><label className="ops-form-toggle"><input type="checkbox" checked={form.type === "whatsapp" ? false : form.auto_publish} disabled={form.type === "whatsapp"} onChange={(event) => setForm({ ...form, auto_publish: event.target.checked })} /> {form.type === "whatsapp" ? "Publicação manual obrigatória" : "Publicação automática"}</label>{form.type === "whatsapp" && <p className="ops-form-hint">A API oficial da Meta não publica em Canais do WhatsApp. Cadastre a URL pública do canal para facilitar a abertura durante a operação manual.</p>}<div className="ops-form-actions"><button type="button" className="ops-button ops-button-secondary" onClick={reset}>Cancelar</button><button type="submit" className="ops-button ops-button-primary" disabled={saving}><Save size={16} /> {saving ? "Salvando…" : "Salvar canal"}</button></div></form></section>}
    <section className="ops-channel-grid">{loading ? <div className="ops-surface"><p>Carregando canais…</p></div> : channels.length === 0 ? <EmptyState title="Nenhum canal configurado" detail="Crie um destino para começar a distribuir ofertas." /> : channels.map((channel) => <article className="ops-channel-card" key={channel.id}><div className="ops-channel-icon"><Icon type={channel.type} /></div><div className="ops-channel-copy"><div><StatusPill tone={channel.active ? "success" : "neutral"}>{channel.active ? "Ativo" : "Pausado"}</StatusPill><StatusPill tone={channel.type === "whatsapp" ? "warning" : channel.auto_publish ? "warning" : "neutral"}>{channel.type === "whatsapp" ? "Manual (Meta)" : channel.auto_publish ? "Automático" : "Manual"}</StatusPill></div><h2>{channel.name}</h2><p>{labels[channel.type]} · {channel.identifier || "Sem identificador"}</p><small>{channel.category_id ? categoryById.get(channel.category_id) ?? "Categoria removida" : "Todas as categorias"}</small></div><div className="ops-channel-actions"><button className="ops-icon-action" onClick={() => void toggle(channel, "active")} aria-label="Alternar canal ativo"><Globe2 size={15} /></button><button className="ops-icon-action" onClick={() => void toggle(channel, "auto_publish")} disabled={channel.type === "whatsapp"} title={channel.type === "whatsapp" ? "Publicação manual obrigatória pela API oficial" : "Alternar publicação automática"} aria-label="Alternar publicação automática"><Send size={15} /></button><button className="ops-icon-action" onClick={() => edit(channel)} aria-label="Editar canal"><Edit3 size={15} /></button><button className="ops-icon-action ops-danger" onClick={() => void remove(channel)} aria-label="Remover canal"><Trash2 size={15} /></button></div></article>)}</section>
  </div>;
}
