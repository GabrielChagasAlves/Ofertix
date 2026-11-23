import { useCallback, useEffect, useState } from "react";
import { Activity, ArrowRight, CheckCircle2, Link2, Package, RefreshCw, Send, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { formatDate, MarketplaceTag, Metric, PageIntro, StatusPill } from "../components/OperationsUI";

type Marketplace = { id: string; name: string; slug: string };
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
  const [productTotal, setProductTotal] = useState(0);
  const [pendingLinks, setPendingLinks] = useState(0);
  const [productsByMarketplace, setProductsByMarketplace] = useState<Map<string, number>>(() => new Map());
  const [runs, setRuns] = useState<Run[]>([]);
  const [publicationQueue, setPublicationQueue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [marketplaceResult, runResult, publicationResult] = await Promise.all([
        supabase.from("marketplaces").select("id,name,slug").eq("active", true).order("name"),
        supabase.from("automation_runs").select("id,function_name,status,started_at,finished_at,products_created,products_updated").gte("started_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()).order("started_at", { ascending: false }).limit(500),
        supabase.from("channel_publications").select("id", { count: "exact", head: true }).in("status", ["pending", "publishing"]),
      ]);
      if (marketplaceResult.error) throw marketplaceResult.error;
      if (runResult.error) throw runResult.error;
      if (publicationResult.error) throw publicationResult.error;

      const activeMarketplaces = marketplaceResult.data ?? [];
      const counts = await Promise.all(activeMarketplaces.map(async (marketplace) => {
        const [totalResult, pendingResult] = await Promise.all([
          supabase.from("products").select("id", { count: "exact", head: true }).eq("active", true).eq("marketplace_id", marketplace.id),
          supabase.from("products").select("id", { count: "exact", head: true }).eq("active", true).eq("marketplace_id", marketplace.id).or("affiliate_url.is.null,affiliate_url.eq."),
        ]);
        if (totalResult.error) throw totalResult.error;
        if (pendingResult.error) throw pendingResult.error;
        return { id: marketplace.id, total: totalResult.count ?? 0, pending: pendingResult.count ?? 0 };
      }));

      setMarketplaces(activeMarketplaces);
      setProductTotal(counts.reduce((sum, item) => sum + item.total, 0));
      setPendingLinks(counts.reduce((sum, item) => sum + item.pending, 0));
      setProductsByMarketplace(new Map(counts.map((item) => [item.id, item.total])));
      setRuns(runResult.data ?? []);
      setPublicationQueue(publicationResult.count ?? 0);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar o painel.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const marketplacePalette = ["#2ddc91", "#4ea1ff", "#a78bfa", "#f6ad55", "#38c6d9", "#f472b6"];
  const marketplaceData = marketplaces.map((marketplace, index) => ({
    ...marketplace,
    total: productsByMarketplace.get(marketplace.id) ?? 0,
    color: marketplacePalette[index % marketplacePalette.length],
  }));
  const marketplaceTotal = marketplaceData.reduce((sum, item) => sum + item.total, 0);
  let donutOffset = 0;
  const donutStops = marketplaceData.map((item) => {
    const start = donutOffset;
    const share = marketplaceTotal > 0 ? (item.total / marketplaceTotal) * 100 : 0;
    donutOffset += share;
    return `${item.color} ${start}% ${donutOffset}%`;
  });
  const donutBackground = marketplaceTotal > 0
    ? `conic-gradient(${donutStops.join(", ")})`
    : "conic-gradient(#26384a 0% 100%)";
  const dailyRuns = Array.from({ length: 7 }, (_, index) => {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - (6 - index));
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);
    const dayRuns = runs.filter((run) => {
      const started = new Date(run.started_at).getTime();
      return started >= day.getTime() && started < nextDay.getTime();
    });
    return {
      label: day.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""),
      succeeded: dayRuns.filter((run) => run.status === "succeeded").length,
      failed: dayRuns.filter((run) => run.status === "failed").length,
      other: dayRuns.filter((run) => run.status !== "succeeded" && run.status !== "failed").length,
      total: dayRuns.length,
    };
  });
  const maxDailyRuns = Math.max(1, ...dailyRuns.map((day) => day.total));
  const successRuns = runs.filter((run) => run.status === "succeeded").length;
  const failedRuns = runs.filter((run) => run.status === "failed").length;
  const otherRuns = runs.length - successRuns - failedRuns;

  return <div className="page ops-page">
    <PageIntro eyebrow="CENTRAL DE OPERAÇÃO" title="Visão geral da operação" description="Acompanhe a origem dos produtos, o tratamento das regras e a próxima etapa da distribuição." actions={<button className="ops-button ops-button-secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16} /> Atualizar dados</button>} />
    {error && <div className="ops-alert">{error}</div>}
    <section className="ops-metrics">
      <Metric icon={<Package size={19} />} value={loading ? "…" : productTotal} label="Produtos ativos" detail="Catálogo em operação" />
      <Metric icon={<Link2 size={19} />} value={loading ? "…" : pendingLinks} label="Links pendentes" detail="Aguardam associação de afiliado" />
      <Metric icon={<Send size={19} />} value={loading ? "…" : publicationQueue} label="Fila de publicação" detail="Ofertas prontas para distribuição" />
      <Metric icon={<CheckCircle2 size={19} />} value={loading ? "…" : marketplaces.length} label="Marketplaces ativos" detail="Dados separados por origem" />
    </section>
    <section className="ops-dashboard-charts">
      <article className="ops-surface ops-chart-card ops-catalog-chart">
        <div className="ops-section-head"><div><p className="ops-eyebrow">DISTRIBUIÇÃO DO CATÁLOGO</p><h2>Produtos por marketplace</h2><span className="ops-chart-subtitle">Participação dos produtos ativos por origem</span></div><Link to="/marketplaces">Integrações <ArrowRight size={15} /></Link></div>
        <div className="ops-donut-layout">
          <div className="ops-donut" style={{ background: donutBackground }} role="img" aria-label={`Distribuição de ${marketplaceTotal} produtos ativos por marketplace`}><div className="ops-donut-hole"><strong>{marketplaceTotal.toLocaleString("pt-BR")}</strong><span>produtos ativos</span></div></div>
          <div className="ops-donut-legend">{marketplaceData.map((item) => <div className="ops-legend-row" key={item.id}><span className="ops-legend-dot" style={{ background: item.color }} /><span>{item.name}</span><strong>{item.total.toLocaleString("pt-BR")}</strong><small>{marketplaceTotal ? `${Math.round(item.total / marketplaceTotal * 100)}%` : "0%"}</small></div>)}</div>
        </div>
      </article>
      <article className="ops-surface ops-chart-card ops-automation-chart">
        <div className="ops-section-head"><div><p className="ops-eyebrow">AUTOMAÇÕES · 7 DIAS</p><h2>Volume de execuções</h2><span className="ops-chart-subtitle">Registros de automação por dia e resultado</span></div><Link to="/execucoes">Ver histórico <ArrowRight size={15} /></Link></div>
        <div className="ops-chart-summary"><strong>{runs.length.toLocaleString("pt-BR")}</strong><span>execuções registradas no período</span></div>
        <div className="ops-bar-chart" role="img" aria-label="Gráfico de execuções diárias, separadas por resultado">
          {dailyRuns.map((day) => <div className="ops-bar-column" key={day.label}>
            <div className="ops-bar-stack" title={`${day.label}: ${day.succeeded} concluídas, ${day.failed} falhas, ${day.other} outras`}>
              <div className="ops-bar-fill" style={{ height: `${day.total ? Math.max(3, day.succeeded / maxDailyRuns * 100) : 0}%` }} />
              <div className="ops-bar-failed" style={{ height: `${day.failed / maxDailyRuns * 100}%` }} />
              <div className="ops-bar-other" style={{ height: `${day.other / maxDailyRuns * 100}%` }} />
            </div><span>{day.label}</span><small>{day.total}</small>
          </div>)}
        </div>
        <div className="ops-chart-legend"><span><i className="success" />Concluídas {successRuns}</span><span><i className="failed" />Falhas {failedRuns}</span><span><i className="other" />Outras {otherRuns}</span></div>
      </article>
    </section>
    <section className="ops-dashboard-grid">
      <article className="ops-surface"><div className="ops-section-head"><div><p className="ops-eyebrow">POR MARKETPLACE</p><h2>Detalhamento do catálogo</h2></div><Link to="/marketplaces">Integrações <ArrowRight size={15} /></Link></div><div className="ops-marketplace-list">{marketplaceData.map((marketplace) => <div className="ops-marketplace-row" key={marketplace.id}><MarketplaceTag name={marketplace.name} slug={marketplace.slug} /><strong>{marketplace.total}</strong><span>produtos ativos</span><Link to={"/produtos"}>Ver catálogo</Link></div>)}</div></article>
      <article className="ops-surface"><div className="ops-section-head"><div><p className="ops-eyebrow">AUTOMAÇÕES</p><h2>Atividade recente</h2></div><Link to="/execucoes">Ver todas <ArrowRight size={15} /></Link></div><div className="ops-activity-list">{runs.slice(0, 6).map((run) => <div className="ops-activity-row" key={run.id}><span className={"ops-run-dot " + run.status} /><div><strong>{sourceForRun(run.function_name)}</strong><small>{formatDate(run.finished_at || run.started_at)}</small></div><StatusPill tone={run.status === "succeeded" ? "success" : run.status === "failed" ? "danger" : "warning"}>{run.status === "succeeded" ? "Concluída" : run.status === "failed" ? "Falhou" : "Em andamento"}</StatusPill></div>)}</div></article>
    </section>
    <section className="ops-next-steps"><Activity size={19} /><div><strong>Fluxo atual</strong><span>Integração → regras → links de afiliado → aprovação → publicação</span></div><Link to="/links-afiliado">Tratar links <ArrowRight size={15} /></Link></section>
  </div>;
}
