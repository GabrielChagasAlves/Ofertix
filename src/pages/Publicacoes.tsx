import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, Megaphone, RefreshCw, Search, Send, XCircle } from "lucide-react";
import { supabase } from "../lib/supabase";
import { EmptyState, formatDate, Metric, PageIntro, StatusPill } from "../components/OperationsUI";

type Publication = { id: string; offer_id: string; channel_id: string; status: string; attempts: number; published_at: string | null; error_message: string | null; created_at: string };
type Offer = { id: string; title: string | null; product_id: string; status: string };
type Product = { id: string; title: string; image_url: string | null; price: number | null };
type Channel = { id: string; name: string; type: string };

function tone(status: string) { return status === "published" ? "success" : status === "failed" ? "danger" : status === "cancelled" ? "neutral" : "warning" as const; }
function label(status: string) { return ({ pending: "Pendente", publishing: "Publicando", published: "Publicada", failed: "Falhou", cancelled: "Cancelada" } as Record<string,string>)[status] ?? status; }

export function Publicacoes() {
  const [publications, setPublications] = useState<Publication[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const [publicationResult, offerResult, productResult, channelResult] = await Promise.all([
      supabase.from("channel_publications").select("id,offer_id,channel_id,status,attempts,published_at,error_message,created_at").order("created_at", { ascending: false }).limit(150),
      supabase.from("offers").select("id,title,product_id,status"),
      supabase.from("products").select("id,title,image_url,price"),
      supabase.from("channels").select("id,name,type"),
    ]);
    const requestError = publicationResult.error || offerResult.error || productResult.error || channelResult.error;
    if (requestError) setError(requestError.message);
    setPublications(publicationResult.data ?? []); setOffers(offerResult.data ?? []); setProducts(productResult.data ?? []); setChannels(channelResult.data ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const offerById = useMemo(() => new Map(offers.map((item) => [item.id, item])), [offers]);
  const productById = useMemo(() => new Map(products.map((item) => [item.id, item])), [products]);
  const channelById = useMemo(() => new Map(channels.map((item) => [item.id, item])), [channels]);
  const visible = useMemo(() => publications.filter((publication) => {
    const offer = offerById.get(publication.offer_id); const product = offer ? productById.get(offer.product_id) : undefined;
    const text = [offer?.title, product?.title, channelById.get(publication.channel_id)?.name].filter(Boolean).join(" ").toLowerCase();
    return (status === "all" || publication.status === status) && (!search.trim() || text.includes(search.trim().toLowerCase()));
  }), [channelById, offerById, productById, publications, search, status]);

  return <div className="page ops-page">
    <PageIntro eyebrow="DISTRIBUIÇÃO" title="Publicações" description="Acompanhe a fila e o histórico de distribuição das ofertas em todos os canais." actions={<button className="ops-button ops-button-secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16} /> Atualizar</button>} />
    {error && <div className="ops-alert">{error}</div>}
    <section className="ops-metrics"><Metric icon={<Megaphone size={19} />} value={loading ? "…" : publications.length} label="Total no histórico" detail="Tentativas de distribuição" /><Metric icon={<CheckCircle2 size={19} />} value={loading ? "…" : publications.filter((item) => item.status === "published").length} label="Publicadas" detail="Entregues aos canais" /><Metric icon={<Clock3 size={19} />} value={loading ? "…" : publications.filter((item) => item.status === "pending" || item.status === "publishing").length} label="Na fila" detail="Aguardando processamento" /><Metric icon={<XCircle size={19} />} value={loading ? "…" : publications.filter((item) => item.status === "failed").length} label="Falhas" detail="Precisam de revisão" /></section>
    <section className="ops-surface"><div className="ops-toolbar"><label className="ops-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar oferta ou canal" /></label><label className="ops-select"><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Todos os status</option><option value="published">Publicadas</option><option value="pending">Pendentes</option><option value="publishing">Publicando</option><option value="failed">Falhas</option></select></label></div>
      {loading ? <div className="ops-empty"><p>Carregando histórico…</p></div> : visible.length === 0 ? <EmptyState title="Nenhuma publicação encontrada" detail="A fila e o histórico de distribuição aparecerão aqui." /> : <div className="ops-publication-grid">{visible.map((publication) => { const offer = offerById.get(publication.offer_id); const product = offer ? productById.get(offer.product_id) : undefined; const channel = channelById.get(publication.channel_id); return <article className="ops-publication-card" key={publication.id}><div className="ops-publication-image">{product?.image_url ? <img src={product.image_url} alt="" /> : <Send size={19} />}</div><div className="ops-publication-copy"><div><StatusPill tone={tone(publication.status)}>{label(publication.status)}</StatusPill><span>{channel?.name ?? "Canal removido"}</span></div><h2>{offer?.title || product?.title || "Oferta sem título"}</h2><p>{publication.published_at ? "Publicada em " + formatDate(publication.published_at) : "Criada em " + formatDate(publication.created_at)} · {publication.attempts} tentativa(s)</p>{publication.error_message && <small>{publication.error_message}</small>}</div></article>; })}</div>}
    </section>
  </div>;
}