import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowRight, CheckCircle2, Link2, Package, RefreshCw, Send } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { formatDate, MarketplaceTag, Metric, PageIntro, StatusPill } from "../components/OperationsUI";

type Marketplace = { id: string; name: string; slug: string };
type Product = { marketplace_id: string; affiliate_url: string | null };
type Run = { id: string; function_name: string; status: string; started_at: string; finished_at: string | null; products_created: number | null; products_updated: number | null };

function sourceForRun(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.includes("shopee")) return "Shopee";
  if (normalized.includes("mercado") || normalized.includes("meli")) return "Mercado Livre";
  if (normalized.includes("publication")) return "Publicações";
  return "Automação";
}

export function Dashboard() {
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [publicationQueue, setPublicationQueue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const [marketplaceResult, productResult, runResult, publicationResult] = await Promise.all([
      supabase.from("marketplaces").select("id,name,slug").eq("active", true).order("name"),
      supabase.from("products").select("marketplace_id,affiliate_url").eq("active", true),
      supabase.from("automation_runs").select("id,function_name,status,started_at,finished_at,products_created,products_updated").order("started_at", { ascending: false }).limit(12),
      supabase.from("channel_publications").select("id", { count: "exact", head: true }).in("status", ["pending", "publishing"]),
    ]);
    const requestError = marketplaceResult.error || productResult.error || runResult.error || publicationResult.error;
    if (requestError) setError(requestError.message);
    setMarketplaces(marketplaceResult.data ?? []); setProducts(productResult.data ?? []); setRuns(runResult.data ?? []); setPublicationQueue(publicationResult.count ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  const totals = useMemo(() => ({ products: products.length, pendingLinks: products.filter((product) => !product.affiliate_url).length }), [products]);
  const productsByMarketplace = useMemo(() => products.reduce<Map<string, number>>((map, product) => map.set(product.marketplace_id, (map.get(product.marketplace_id) ?? 0) + 1), new Map()), [products]);

  return <div className="page ops-page">
    <PageIntro eyebrow="CENTRAL DE OPERAÇÃO" title="Visão geral da operação" description="Acompanhe a origem dos produtos, o tratamento das regras e a próxima etapa da distribuição." actions={<button className="ops-button ops-button-secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16} /> Atualizar dados</button>} />
    {error && <div className="ops-alert">{error}</div>}
    <section className="ops-metrics">
      <Metric icon={<Package size={19} />} value={loading ? "…" : totals.products} label="Produtos ativos" detail="Catálogo em operação" />
      <Metric icon={<Link2 size={19} />} value={loading ? "…" : totals.pendingLinks} label="Links pendentes" detail="Aguardam associação de afiliado" />
      <Metric icon={<Send size={19} />} value={loading ? "…" : publicationQueue} label="Fila de publicação" detail="Ofertas prontas para distribuição" />
      <Metric icon={<CheckCircle2 size={19} />} value={loading ? "…" : marketplaces.length} label="Marketplaces ativos" detail="Dados separados por origem" />
    </section>
    <section className="ops-dashboard-grid">
      <article className="ops-surface"><div className="ops-section-head"><div><p className="ops-eyebrow">POR MARKETPLACE</p><h2>Catálogo separado</h2></div><Link to="/marketplaces">Integrações <ArrowRight size={15} /></Link></div><div className="ops-marketplace-list">{marketplaces.map((marketplace) => <div className="ops-marketplace-row" key={marketplace.id}><MarketplaceTag name={marketplace.name} slug={marketplace.slug} /><strong>{productsByMarketplace.get(marketplace.id) ?? 0}</strong><span>produtos ativos</span><Link to={"/produtos"}>Ver catálogo</Link></div>)}</div></article>
      <article className="ops-surface"><div className="ops-section-head"><div><p className="ops-eyebrow">AUTOMAÇÕES</p><h2>Atividade recente</h2></div><Link to="/execucoes">Ver todas <ArrowRight size={15} /></Link></div><div className="ops-activity-list">{runs.slice(0, 6).map((run) => <div className="ops-activity-row" key={run.id}><span className={"ops-run-dot " + run.status} /><div><strong>{sourceForRun(run.function_name)}</strong><small>{formatDate(run.finished_at || run.started_at)}</small></div><StatusPill tone={run.status === "succeeded" ? "success" : run.status === "failed" ? "danger" : "warning"}>{run.status === "succeeded" ? "Concluída" : run.status === "failed" ? "Falhou" : "Em andamento"}</StatusPill></div>)}</div></article>
    </section>
    <section className="ops-next-steps"><Activity size={19} /><div><strong>Fluxo atual</strong><span>Integração → regras → links de afiliado → aprovação → publicação</span></div><Link to="/links-afiliado">Tratar links <ArrowRight size={15} /></Link></section>
  </div>;
}