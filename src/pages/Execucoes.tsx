import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, CheckCircle2, Clock3, Package, RefreshCw,
  Search, XCircle, ChevronDown, ChevronUp, ExternalLink, Filter,
  CircleDashed, Timer, ListChecks, Ban, RotateCw,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { EmptyState, formatDate, Metric, PageIntro, StatusPill } from "../components/OperationsUI";

type Run = {
  id: string; function_name: string; status: string; started_at: string;
  finished_at: string | null; duration_ms: number | null;
  products_processed: number | null; products_created: number | null;
  products_updated: number | null; items_processed?: number | null;
  errors_count: number | null; error_message: string | null;
  metrics: Record<string, unknown> | null;
};
type RunItem = {
  id: string; run_id: string; function_name: string; item_type: string;
  item_id: string | null; external_id: string | null; title: string | null;
  status: string; action: string | null; message: string | null;
  details: Record<string, unknown> | null; created_at: string;
};

function routineName(name: string) {
  const labels: Record<string, string> = {
    "mercado-livre-product-discovery": "Descoberta de produtos · Mercado Livre",
    "mercado-livre-availability": "Verificação de disponibilidade · Mercado Livre",
    "n8n-product-refresh": "Atualização de preços · Mercado Livre",
    "product-price-refresh-scheduler": "Agendador de preços · Mercado Livre",
    "shopee-sync": "Integração · Shopee",
    "publication-worker": "Publicações",
  };
  return labels[name] ?? name.replaceAll("-", " ");
}
function marketplaceName(name: string) {
  const source = name.toLowerCase();
  if (source.includes("shopee")) return "Shopee";
  if (source.includes("mercado") || source.includes("meli") || source.includes("product-refresh") || source.includes("n8n-product")) return "Mercado Livre";
  if (source.includes("publication")) return "Canais";
  return "Ofertix";
}
function duration(ms: number | null) {
  if (ms == null) return "Em andamento";
  if (ms < 1000) return ms + " ms";
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? seconds + " s" : Math.floor(seconds / 60) + " min " + (seconds % 60) + " s";
}
function metric(metrics: Record<string, unknown> | null, key: string) {
  const value = metrics?.[key];
  return typeof value === "number" ? value : null;
}
function displayStatus(run: Run) {
  if (run.status === "running") return { label: "Em andamento", tone: "warning" as const };
  if (run.status === "failed") return { label: "Falhou", tone: "danger" as const };
  if ((run.errors_count ?? 0) > 0) return { label: "Concluída com ressalvas", tone: "warning" as const };
  return { label: "Concluída", tone: "success" as const };
}
function itemStatus(status: string) {
  const value = status.toLowerCase();
  if (["failed", "error", "rejected"].includes(value)) return "danger";
  if (["skipped", "ignored", "pending", "warning"].includes(value)) return "warning";
  if (["published", "created", "updated", "succeeded", "success", "available", "integrated"].includes(value)) return "success";
  return "neutral";
}
function statusLabel(status: string) {
  const labels: Record<string, string> = {
    failed: "Falhou", error: "Erro", rejected: "Rejeitado", skipped: "Ignorado",
    ignored: "Ignorado", pending: "Pendente", warning: "Atenção",
    published: "Publicado", created: "Integrado", updated: "Atualizado",
    succeeded: "Sucesso", success: "Sucesso", available: "Disponível",
    unavailable: "Indisponível", integrated: "Integrado",
  };
  return labels[status.toLowerCase()] ?? status;
}
function asText(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
function detailEntries(metrics: Record<string, unknown> | null) {
  if (!metrics) return [] as Array<[string, string | number]>;
  const labels: Record<string, string> = {
    items_seen: "Anúncios encontrados", unique_items: "Itens únicos",
    products_created: "Produtos integrados", products_updated: "Produtos atualizados",
    listings_upserted: "Anúncios vinculados", terms_selected: "Termos pesquisados",
    terms_succeeded: "Termos concluídos", terms_failed: "Termos com falha",
    available: "Disponíveis", unavailable: "Indisponíveis", errors: "Erros",
    rowsReceived: "Registros recebidos", rowsValid: "Registros válidos",
    rowsRejectedByRules: "Rejeitados pelas regras", listingsUpserted: "Anúncios integrados",
    pricesRefreshed: "Preços atualizados", published: "Publicados", failed: "Falhas",
    queued: "Na fila", skipped: "Ignorados", eligible_offers: "Ofertas elegíveis",
    telegram_processed: "Itens avaliados", affiliateLinksCreated: "Links de afiliado criados",
    affiliateLinkErrors: "Erros de links de afiliado", ruleMatchesCreated: "Regras associadas",
  };
  return Object.entries(metrics)
    .filter(([key, value]) => labels[key] && (typeof value === "number" || typeof value === "string"))
    .map(([key, value]) => [labels[key], value as string | number] as [string, string | number]);
}

export function Execucoes() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [source, setSource] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [period, setPeriod] = useState("24h");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [itemsByRun, setItemsByRun] = useState<Record<string, RunItem[]>>({});
  const [loadingItems, setLoadingItems] = useState<string | null>(null);
  const [itemsError, setItemsError] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true); setError("");
    let query = supabase.from("automation_runs")
      .select("id,function_name,status,started_at,finished_at,duration_ms,products_processed,products_created,products_updated,items_processed,errors_count,error_message,metrics")
      .order("started_at", { ascending: false }).limit(150);
    if (period !== "all") {
      const hours = period === "24h" ? 24 : period === "7d" ? 168 : 720;
      query = query.gte("started_at", new Date(Date.now() - hours * 3600000).toISOString());
    }
    const { data, error: requestError } = await query;
    if (requestError) setError(requestError.message);
    setRuns((data ?? []) as Run[]);
    setLoading(false);
  }, [period]);
  useEffect(() => { void load(); }, [load]);

  const openDetails = async (run: Run) => {
    if (expanded === run.id) { setExpanded(null); return; }
    setExpanded(run.id);
    if (itemsByRun[run.id]) return;
    setLoadingItems(run.id);
    setItemsError((old) => ({ ...old, [run.id]: "" }));
    const { data, error: requestError } = await supabase.from("automation_run_items")
      .select("id,run_id,function_name,item_type,item_id,external_id,title,status,action,message,details,created_at")
      .eq("run_id", run.id).order("created_at", { ascending: true }).limit(500);
    if (requestError) setItemsError((old) => ({ ...old, [run.id]: requestError.message }));
    setItemsByRun((old) => ({ ...old, [run.id]: (data ?? []) as RunItem[] }));
    setLoadingItems(null);
  };

  const sources = useMemo(() => Array.from(new Set(runs.map((run) => marketplaceName(run.function_name))), [runs]);
  const visible = useMemo(() => runs.filter((run) => {
    const sourceOk = source === "all" || marketplaceName(run.function_name) === source;
    const status = displayStatus(run);
    const statusOk = statusFilter === "all" || (statusFilter === "success" ? status.tone === "success" : statusFilter === "warning" ? status.tone === "warning" : status.tone === "danger");
    const searchOk = !search.trim() || (run.function_name + " " + routineName(run.function_name)).toLowerCase().includes(search.trim().toLowerCase());
    return sourceOk && statusOk && searchOk;
  }), [runs, search, source, statusFilter]);
  const succeeded = runs.filter((run) => displayStatus(run).tone === "success").length;
  const failures = runs.filter((run) => displayStatus(run).tone === "danger").length;
  const warnings = runs.filter((run) => displayStatus(run).tone === "warning").length;
  const created = runs.reduce((sum, run) => sum + (run.products_created ?? metric(run.metrics, "products_created") ?? metric(run.metrics, "productsCreated") ?? 0), 0);
  const updated = runs.reduce((sum, run) => sum + (run.products_updated ?? metric(run.metrics, "products_updated") ?? metric(run.metrics, "productsUpdated") ?? 0), 0);

  return <div className="page ops-page executions-page">
    <PageIntro eyebrow="AUTOMAÇÕES" title="Execuções e histórico" description="Acompanhe cada rotina, os itens processados e o motivo individual de cada falha." actions={<button className="ops-button ops-button-secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16} /> Atualizar</button>} />
    {error && <div className="ops-alert">{error}</div>}
    <section className="ops-metrics">
      <Metric icon={<Activity size={19} />} value={loading ? "…" : runs.length} label="Execuções" detail="No período selecionado" />
      <Metric icon={<CheckCircle2 size={19} />} value={loading ? "…" : succeeded} label="Concluídas" detail="Sem falhas registradas" />
      <Metric icon={<AlertTriangle size={19} />} value={loading ? "…" : warnings + failures} label="Com ocorrências" detail={failures + " falhas · " + warnings + " parciais"} />
      <Metric icon={<Package size={19} />} value={loading ? "…" : created + updated} label="Produtos tratados" detail={created + " integrados · " + updated + " atualizados"} />
    </section>
    <section className="ops-surface">
      <div className="ops-toolbar executions-toolbar">
        <label className="ops-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar rotina ou marketplace" /></label>
        <label className="ops-select"><Filter size={15} /><select value={source} onChange={(event) => setSource(event.target.value)}><option value="all">Todas as origens</option>{sources.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
        <label className="ops-select"><select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="24h">Últimas 24 horas</option><option value="7d">Últimos 7 dias</option><option value="30d">Últimos 30 dias</option><option value="all">Todo o histórico</option></select></label>
        <label className="ops-select"><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Todos os resultados</option><option value="success">Concluídas</option><option value="warning">Com ressalvas</option><option value="danger">Falhas</option></select></label>
      </div>
      {loading ? <div className="ops-empty"><p>Carregando execuções…</p></div> : visible.length === 0 ? <EmptyState title="Nenhuma execução encontrada" detail="Ajuste os filtros ou aguarde o próximo ciclo automático." /> :
        <div className="execution-card-list">{visible.map((run) => {
          const state = displayStatus(run);
          const metrics = run.metrics ?? {};
          const entries = detailEntries(metrics);
          const items = itemsByRun[run.id] ?? [];
          const itemErrors = items.filter((item) => ["failed", "error", "rejected"].includes(item.status.toLowerCase())).length;
          return <article className={"execution-card " + (expanded === run.id ? "is-expanded" : "")} key={run.id}>
            <button className="execution-card-toggle" type="button" onClick={() => void openDetails(run)} aria-expanded={expanded === run.id}>
              <span className={"execution-status-icon " + state.tone}>{state.tone === "success" ? <CheckCircle2 size={19} /> : state.tone === "danger" ? <XCircle size={19} /> : run.status === "running" ? <CircleDashed size={19} /> : <AlertTriangle size={19} />}</span>
              <span className="execution-card-heading"><strong>{routineName(run.function_name)}</strong><small>{run.function_name} · {formatDate(run.started_at)}</small></span>
              <span className="execution-card-state"><StatusPill tone={state.tone}>{state.label}</StatusPill></span>
              <span className="execution-card-duration"><Timer size={15} />{duration(run.duration_ms)}</span>
              <span className="execution-card-chevron">{expanded === run.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</span>
            </button>
            <div className="execution-card-summary">
              <span><Package size={14} /> {run.products_processed ?? run.items_processed ?? metric(metrics, "items_seen") ?? metric(metrics, "rowsReceived") ?? 0} processados</span>
              <span><CheckCircle2 size={14} /> {run.products_created ?? metric(metrics, "products_created") ?? metric(metrics, "productsCreated") ?? metric(metrics, "published") ?? 0} integrados/publicados</span>
              <span><RotateCw size={14} /> {run.products_updated ?? metric(metrics, "products_updated") ?? metric(metrics, "productsUpdated") ?? metric(metrics, "pricesRefreshed") ?? 0} atualizados</span>
              <span className={((run.errors_count ?? 0) > 0 ? "has-errors" : "")}><AlertTriangle size={14} /> {run.errors_count ?? 0} erros</span>
            </div>
            {expanded === run.id && <div className="execution-detail-panel">
              <div className="execution-detail-heading"><div><h3>Resumo desta execução</h3><p>Início: {formatDate(run.started_at)}{run.finished_at ? " · Término: " + formatDate(run.finished_at) : " · Ainda em andamento"}</p></div><span className="execution-detail-id">ID {run.id.slice(0, 8)}</span></div>
              {entries.length > 0 && <div className="execution-metric-grid">{entries.map(([label, value]) => <div className="execution-metric" key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>}
              {run.error_message && <div className="execution-global-error"><XCircle size={16} /><div><strong>Erro da execução</strong><p>{run.error_message}</p></div></div>}
              <div className="execution-items-heading"><div><ListChecks size={17} /><h3>Itens desta execução</h3></div><span>{items.length} detalhados{itemErrors ? " · " + itemErrors + " com erro" : ""}</span></div>
              {loadingItems === run.id ? <div className="execution-items-empty">Carregando detalhes dos itens…</div> :
                itemsError[run.id] ? <div className="execution-global-error"><XCircle size={16} /><p>{itemsError[run.id]}</p></div> :
                items.length === 0 ? <div className="execution-items-empty"><Ban size={17} /><span>Esta execução ainda não possui registros individuais. Os detalhes serão exibidos nas rotinas instrumentadas a partir da implantação.</span></div> :
                <div className="execution-items-list">{items.map((item) => <div className="execution-item" key={item.id}>
                  <span className={"execution-item-dot " + itemStatus(item.status)} />
                  <div className="execution-item-main"><div className="execution-item-title"><strong>{item.title || item.external_id || item.item_id || "Item sem identificação"}</strong><StatusPill tone={itemStatus(item.status) as "success" | "danger" | "warning" | "neutral"}>{statusLabel(item.status)}</StatusPill></div>
                    <small>{[item.item_type, item.external_id, item.action].filter(Boolean).join(" · ")}</small>
                    {item.message && <p className={itemStatus(item.status) === "danger" ? "execution-item-error" : ""}>{item.message}</p>}
                    {item.details && Object.keys(item.details).length > 0 && <details className="execution-item-extra"><summary>Dados técnicos</summary><pre>{JSON.stringify(item.details, null, 2)}</pre></details>}
                  </div>
                  {item.external_id && <a className="execution-item-link" href={"https://www.google.com/search?q=" + encodeURIComponent(item.external_id)} target="_blank" rel="noreferrer" aria-label="Pesquisar identificador"><ExternalLink size={14} /></a>}
                </div>)}</div>}
            </div>}
          </article>;
        })}</div>}
    </section>
  </div>;
}
