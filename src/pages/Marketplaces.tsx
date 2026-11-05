import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowRight, CheckCircle2, Clock3, Package, RefreshCw, Settings2, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { EmptyState, formatDate, MarketplaceTag, Metric, PageIntro, StatusPill } from "../components/OperationsUI";

type Marketplace = { id: string; name: string; slug: string; active: boolean };
type Run = { id: string; function_name: string; status: string; started_at: string; finished_at: string | null; products_created: number | null; products_updated: number | null; metrics: Record<string, unknown> | null };

function isRunForMarketplace(run: Run, slug: string) {
  const name = run.function_name.toLowerCase();
  return slug === "shopee" ? name.includes("shopee") : name.includes("mercado") || name.includes("meli");
}

export function Marketplaces() {
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [products, setProducts] = useState<{ marketplace_id: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const [marketplaceResult, runResult, productResult] = await Promise.all([
      supabase.from("marketplaces").select("id,name,slug,active").order("name"),
      supabase.from("automation_runs").select("id,function_name,status,started_at,finished_at,products_created,products_updated,metrics").order("started_at", { ascending: false }).limit(40),
      supabase.from("products").select("marketplace_id").eq("active", true),
    ]);
    const requestError = marketplaceResult.error || runResult.error || productResult.error;
    if (requestError) setError(requestError.message);
    setMarketplaces(marketplaceResult.data ?? []); setRuns(runResult.data ?? []); setProducts(productResult.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  const productsByMarketplace = useMemo(() => products.reduce<Map<string, number>>((map, product) => map.set(product.marketplace_id, (map.get(product.marketplace_id) ?? 0) + 1), new Map()), [products]);
  const connected = marketplaces.filter((item) => item.active).length;

  return <div className="page ops-page">
    <PageIntro eyebrow="INTEGRAÇÕES" title="Marketplaces conectados" description="Acompanhe cada origem de produtos, sem misturar dados ou regras entre marketplaces." actions={<button className="ops-button ops-button-secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16} /> Atualizar</button>} />
    {error && <div className="ops-alert">{error}</div>}
    <section className="ops-metrics">
      <Metric icon={<CheckCircle2 size={19} />} value={loading ? "…" : connected} label="Integrações ativas" detail="Marketplaces habilitados" />
      <Metric icon={<Package size={19} />} value={loading ? "…" : products.length} label="Produtos ativos" detail="Catálogo separado por origem" />
      <Metric icon={<Activity size={19} />} value={loading ? "…" : runs.filter((run) => run.status === "succeeded").length} label="Execuções recentes" detail="Histórico de automações" />
      <Metric icon={<ShieldCheck size={19} />} value="Regras" label="Controle de entrada" detail="Somente itens qualificados" />
    </section>
    <section className="ops-integration-grid">
      {loading ? <div className="ops-surface"><p>Carregando integrações…</p></div> : marketplaces.map((marketplace) => {
        const lastRun = runs.find((run) => isRunForMarketplace(run, marketplace.slug));
        const shopee = marketplace.slug === "shopee";
        return <article className="ops-integration-card" key={marketplace.id}>
          <div className="ops-card-head"><MarketplaceTag name={marketplace.name} slug={marketplace.slug} /><StatusPill tone={marketplace.active ? "success" : "neutral"}>{marketplace.active ? "Ativa" : "Pausada"}</StatusPill></div>
          <h2>{marketplace.name}</h2>
          <p>{shopee ? "Leitura automática do feed de afiliados a cada 30 minutos, com regras, termos e faixa de preço aplicados antes da importação." : "Integração preservada com operação e credenciais próprias, separada da Shopee."}</p>
          <div className="ops-integration-stats"><span><Package size={15} /> {productsByMarketplace.get(marketplace.id) ?? 0} produtos ativos</span><span><Clock3 size={15} /> {lastRun ? "Última execução: " + formatDate(lastRun.finished_at || lastRun.started_at) : "Sem execução registrada"}</span></div>
          {lastRun && <div className="ops-run-summary"><StatusPill tone={lastRun.status === "succeeded" ? "success" : lastRun.status === "failed" ? "danger" : "warning"}>{lastRun.status === "succeeded" ? "Operando" : lastRun.status}</StatusPill><span>{(lastRun.products_created ?? 0) + (lastRun.products_updated ?? 0)} itens tratados no último ciclo</span></div>}
          <div className="ops-card-footer"><Link to="/execucoes">Ver execuções <ArrowRight size={15} /></Link><Link to="/regras">Ver regras <Settings2 size={15} /></Link></div>
        </article>;
      })}
    </section>
    {!loading && marketplaces.length === 0 && <EmptyState title="Nenhum marketplace cadastrado" detail="As integrações aparecerão aqui quando forem habilitadas." />}
  </div>;
}