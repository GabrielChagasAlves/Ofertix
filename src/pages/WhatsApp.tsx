import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardCopy, ExternalLink, MessageCircle, RefreshCw, Send, ShieldAlert } from "lucide-react";
import { supabase } from "../lib/supabase";
import { EmptyState, Metric, PageIntro, StatusPill } from "../components/OperationsUI";

type Publication = {
  id: string; offer_id: string; channel_id: string; status: string;
  attempts: number; created_at: string; error_message: string | null;
};
type Offer = {
  id: string; title: string | null; message: string | null; affiliate_url: string | null;
  product_id: string; price_snapshot: number | null; original_price_snapshot: number | null;
  variation_label: string | null;
};
type Product = {
  id: string; title: string; description: string | null; brand: string | null;
  category: string | null; origin_country: string | null; price: number | null;
  original_price: number | null; discount_percent: number | null;
  origin_type: string; image_url: string | null;
};
type Channel = { id: string; name: string; identifier: string | null; active: boolean };

function money(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function clean(value: string | null | undefined) {
  return (value ?? "").replace(/<[^>]*>/g, " ").replace(/\\s+/g, " ").trim();
}
function buildPost(offer: Offer, product: Product) {
  const imported = product.origin_type === "imported";
  const title = clean(product.title || offer.title) || "Oferta";
  const price = offer.price_snapshot ?? product.price;
  const original = offer.original_price_snapshot ?? product.original_price;
  const lines = [
    imported ? "🌎 PRODUTO IMPORTADO" : "🔥 OFERTA EM DESTAQUE",
    "",
    "🛍️ " + title,
  ];
  if (product.brand) lines.push("🏷️ Marca: " + clean(product.brand));
  if (product.category) lines.push("📂 Categoria: " + clean(product.category));
  if (offer.variation_label) lines.push("📦 Opção: " + clean(offer.variation_label));
  const description = clean(product.description || offer.message);
  if (description && description.toLocaleLowerCase("pt-BR") !== title.toLocaleLowerCase("pt-BR")) {
    lines.push("", description.slice(0, 320));
  }
  if (original !== null && original !== undefined && price !== null && price !== undefined && Number(original) > Number(price)) {
    const discount = ((Number(original) - Number(price)) / Number(original)) * 100;
    lines.push("", "De: " + money(original), "🔥 Por: " + money(price), "🏷️ " + discount.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + "% OFF");
  } else if (price !== null && price !== undefined) {
    lines.push("", "💰 Preço: " + money(price));
  }
  if (imported) lines.push("", "🚚 Produto importado" + (product.origin_country ? " · Origem: " + clean(product.origin_country) : ""), "⚠️ Confira impostos, taxas e prazo no checkout.");
  if (offer.affiliate_url) lines.push("", "🛒 Confira a oferta:", offer.affiliate_url);
  lines.push("", "⚡ Preço e disponibilidade podem mudar. Confira as condições no anúncio.", "", "#Ofertix #Oferta");
  return lines.join("\n").slice(0, 4000);
}
function isChannelUrl(value: string | null) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "whatsapp.com" || url.hostname === "www.whatsapp.com");
  } catch { return false; }
}

export function WhatsApp() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true); setError(""); setNotice("");
    try {
      const channelResult = await supabase.from("channels")
        .select("id,name,identifier,active").eq("type", "whatsapp").order("created_at", { ascending: false });
      if (channelResult.error) throw channelResult.error;
      const activeChannels = (channelResult.data ?? []) as Channel[];
      setChannels(activeChannels);
      const ids = activeChannels.map((channel) => channel.id);
      if (!ids.length) {
        setPublications([]); setOffers([]); setProducts([]);
        return;
      }
      const [publicationResult, offerResult, productResult] = await Promise.all([
        supabase.from("channel_publications")
          .select("id,offer_id,channel_id,status,attempts,created_at,error_message")
          .in("channel_id", ids).in("status", ["pending", "failed"])
          .order("created_at", { ascending: true }).limit(100),
        supabase.from("offers")
          .select("id,title,message,affiliate_url,product_id,price_snapshot,original_price_snapshot,variation_label"),
        supabase.from("products")
          .select("id,title,description,brand,category,origin_country,price,original_price,discount_percent,origin_type,image_url"),
      ]);
      const requestError = publicationResult.error || offerResult.error || productResult.error;
      if (requestError) throw requestError;
      setPublications(publicationResult.data ?? []);
      setOffers((offerResult.data ?? []) as Offer[]);
      setProducts((productResult.data ?? []) as Product[]);
    } catch (err: any) {
      console.error("Erro ao carregar fila manual do WhatsApp:", err);
      setError(err?.message || "Não foi possível carregar a fila do WhatsApp.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadData(); }, [loadData]);

  const offerById = useMemo(() => new Map(offers.map((item) => [item.id, item])), [offers]);
  const productById = useMemo(() => new Map(products.map((item) => [item.id, item])), [products]);
  const channelById = useMemo(() => new Map(channels.map((item) => [item.id, item])), [channels]);
  const readyCount = publications.filter((item) => item.status === "pending").length;
  const failedCount = publications.filter((item) => item.status === "failed").length;

  async function copyPost(publication: Publication) {
    const offer = offerById.get(publication.offer_id);
    const product = offer ? productById.get(offer.product_id) : undefined;
    if (!offer || !product) { setError("Não foi possível localizar a oferta ou o produto desta publicação."); return; }
    try {
      await navigator.clipboard.writeText(buildPost(offer, product));
      setNotice("Texto copiado. Abra o Canal do WhatsApp, cole a publicação e envie manualmente.");
      setError("");
    } catch {
      setError("O navegador bloqueou a cópia. Selecione e copie o texto da prévia manualmente.");
    }
  }

  async function confirmPublished(publication: Publication) {
    const confirmed = window.confirm("Confirma que esta oferta já foi publicada manualmente no Canal do WhatsApp?");
    if (!confirmed) return;
    setBusyId(publication.id); setError(""); setNotice("");
    const { error: updateError } = await supabase.from("channel_publications").update({
      status: "published",
      published_at: new Date().toISOString(),
      error_message: "Publicação confirmada manualmente no Canal do WhatsApp pelo painel Ofertix. Sem confirmação automática da Meta.",
      next_retry_at: null,
      updated_at: new Date().toISOString(),
    }).eq("id", publication.id).in("status", ["pending", "failed"]);
    if (updateError) setError(updateError.message);
    else { setNotice("Publicação registrada no histórico como confirmada manualmente."); await loadData(); }
    setBusyId(null);
  }

  return <div className="page ops-page">
    <PageIntro eyebrow="DISTRIBUIÇÃO MANUAL" title="Canal do WhatsApp" description="Prepare as ofertas aprovadas, copie o conteúdo e publique manualmente no Canal do Ofertix." actions={<button className="ops-button ops-button-secondary" onClick={() => void loadData()} disabled={loading}><RefreshCw size={16} /> Atualizar fila</button>} />
    <div className="ops-alert" role="note"><ShieldAlert size={17} /> A Meta não disponibiliza endpoint oficial para publicar em Canais do WhatsApp. Por segurança, o Ofertix não automatiza sessões, QR Code ou WhatsApp Web. O envio é manual; o registro abaixo só muda para publicada após sua confirmação.</div>
    {error && <div className="ops-alert">{error}</div>}
    {notice && <div className="ops-alert" role="status">{notice}</div>}
    <section className="ops-metrics">
      <Metric icon={<MessageCircle size={19} />} value={loading ? "…" : channels.length} label="Canais cadastrados" detail="Destinos WhatsApp" />
      <Metric icon={<Send size={19} />} value={loading ? "…" : readyCount} label="Aguardando publicação" detail="Prontos para copiar" />
      <Metric icon={<ShieldAlert size={19} />} value={loading ? "…" : failedCount} label="Com falha" detail="Exigem conferência" />
      <Metric icon={<CheckCircle2 size={19} />} value="Manual" label="Modo de envio" detail="Confirmação pelo operador" />
    </section>
    <section className="ops-surface">
      <div className="ops-section-head"><div><p className="ops-eyebrow">DESTINOS CONFIGURADOS</p><h2>Canais públicos</h2></div></div>
      {channels.length === 0 && !loading ? <EmptyState title="Nenhum canal WhatsApp cadastrado" detail="Acesse Canais de publicação e cadastre um destino do tipo WhatsApp. Deixe a publicação automática desativada." /> :
        <div className="ops-channel-grid">{channels.map((channel) => <article className="ops-channel-card" key={channel.id}><div className="ops-channel-icon"><MessageCircle size={18} /></div><div className="ops-channel-copy"><div><StatusPill tone={channel.active ? "success" : "neutral"}>{channel.active ? "Ativo" : "Pausado"}</StatusPill><StatusPill tone="warning">Publicação manual</StatusPill></div><h2>{channel.name}</h2><p>{channel.identifier || "Cadastre a URL pública do canal no campo Identificador."}</p></div>{isChannelUrl(channel.identifier) && <a className="ops-button ops-button-secondary" href={channel.identifier!} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Abrir canal</a>}</article>)}</div>}
    </section>
    <section className="ops-surface">
      <div className="ops-section-head"><div><p className="ops-eyebrow">FILA DE CONTEÚDO</p><h2>Ofertas para publicar</h2><p>Copie o texto, publique no aplicativo WhatsApp e depois confirme aqui.</p></div><span className="ops-count">{publications.length} item(ns)</span></div>
      {loading ? <div className="ops-empty"><p>Carregando fila…</p></div> : publications.length === 0 ? <EmptyState title="Nenhuma oferta aguardando publicação" detail="Quando uma oferta aprovada entrar na fila para um canal WhatsApp ativo, ela aparecerá aqui." /> :
        <div className="ops-publication-grid">{publications.map((publication) => {
          const offer = offerById.get(publication.offer_id);
          const product = offer ? productById.get(offer.product_id) : undefined;
          const channel = channelById.get(publication.channel_id);
          const post = offer && product ? buildPost(offer, product) : "";
          return <article className="ops-publication-card" key={publication.id}>
            <div className="ops-publication-image">{product?.image_url ? <img src={product.image_url} alt="" /> : <MessageCircle size={19} />}</div>
            <div className="ops-publication-copy">
              <div><StatusPill tone={publication.status === "failed" ? "danger" : "warning"}>{publication.status === "failed" ? "Falha anterior" : "Aguardando publicação"}</StatusPill><span>{channel?.name ?? "Canal removido"}</span></div>
              <h2>{product?.title || offer?.title || "Oferta sem título"}</h2>
              <p>{money(offer?.price_snapshot ?? product?.price)} · {publication.attempts} tentativa(s)</p>
              {publication.error_message && <small>{publication.error_message}</small>}
              {!offer || !product ? <small>Oferta ou produto não encontrado. Revise o cadastro antes de publicar.</small> :
                <details><summary>Prévia do texto</summary><pre style={{ whiteSpace: "pre-wrap", font: "inherit", marginTop: 12 }}>{post}</pre></details>}
              <div className="ops-form-actions">
                <button className="ops-button ops-button-secondary" onClick={() => void copyPost(publication)} disabled={!offer || !product}><ClipboardCopy size={16} /> Copiar texto</button>
                <button className="ops-button ops-button-primary" onClick={() => void confirmPublished(publication)} disabled={busyId === publication.id || !offer || !product}><CheckCircle2 size={16} /> {busyId === publication.id ? "Registrando…" : "Já publiquei"}</button>
              </div>
            </div>
          </article>;
        })}</div>}
    </section>
  </div>;
}
