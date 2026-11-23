import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, CheckCircle2, Package, RefreshCw,
  Search, XCircle, ChevronDown, ChevronUp, ExternalLink, Filter,
  CircleDashed, Timer, ListChecks, Ban, RotateCw, Play, Clock3,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import "./Execucoes.css";
import { EmptyState, formatDate, Metric, PageIntro, StatusPill } from "../components/OperationsUI";

type Cron = { jobid: number; jobname: string; schedule: string; active: boolean };
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

type CronMeta = { title: string; description: string; group: "Mercado Livre" | "Publicação" | "Shopee" | "Ofertix"; functionName: string; frequency: string; };
const cronMeta: Record<string, CronMeta> = {
  "ofertix-duplicate-cleanup-every-5-minutes": {
    title: "Limpeza de produtos duplicados",
    description: "A cada cinco minutos identifica grupos duplicados e mantém somente o produto de menor preço.",
    group: "Ofertix", functionName: "duplicate-cleanup", frequency: "A cada 5 minutos",
  },
  "ofertix-offer-auto-classifier": {
    title: "Aprovação automática de ofertas",
    description: "Avalia ofertas elegíveis e aplica as regras automáticas de aprovação.",
    group: "Ofertix", functionName: "offer-auto-classifier", frequency: "A cada hora · minuto 40",
  },
  "ofertix-mercado-livre-availability": {
    title: "Verificar disponibilidade",
    description: "Reconsulta anúncios ativos do Mercado Livre, atualiza o status de disponibilidade e alimenta o histórico e a fila de revisão.",
    group: "Mercado Livre", functionName: "mercado-livre-availability", frequency: "A cada hora · minuto 15",
  },
  "ofertix-mercado-livre-sync": {
    title: "Descobrir e integrar produtos",
    description: "Pesquisa os termos configurados, coleta anúncios e integra produtos e vínculos de publicação ao Ofertix.",
    group: "Mercado Livre", functionName: "mercado-livre-product-discovery", frequency: "A cada 3 horas · ciclo principal",
  },
  "ofertix-mercado-livre-sync-offset": {
    title: "Descobrir e integrar produtos",
    description: "Executa a mesma rotina de descoberta em horário alternado para distribuir a carga entre os ciclos.",
    group: "Mercado Livre", functionName: "mercado-livre-product-discovery", frequency: "A cada 3 horas · ciclo alternado",
  },
  "ofertix-product-price-refresh": {
    title: "Atualizar preços",
    description: "Consulta os anúncios vinculados e atualiza os preços dos produtos. O lote efetivo é limitado a até 10 produtos por execução.",
    group: "Mercado Livre", functionName: "product-price-refresh-scheduler", frequency: "A cada 15 minutos",
  },
  "ofertix-publication-worker": {
    title: "Publicar ofertas · legado",
    description: "Worker de publicação de ofertas aprovadas e agendadas nos canais ativos. Este agendamento está pausado; a execução manual continua disponível.",
    group: "Publicação", functionName: "publication-worker", frequency: "A cada 10 minutos · pausado",
  },
  "ofertix-publication-worker-every-30-minutes": {
    title: "Processar fila de publicações",
    description: "Busca ofertas prontas para publicação e processa os envios aos canais configurados, respeitando as regras de cada canal.",
    group: "Publicação", functionName: "publication-worker", frequency: "A cada 3 horas · ciclo principal",
  },
  "ofertix-publication-worker-offset-every-90-minutes": {
    title: "Processar fila de publicações",
    description: "Executa o mesmo worker em horário alternado para dar continuidade ao processamento da fila.",
    group: "Publicação", functionName: "publication-worker", frequency: "A cada 3 horas · ciclo alternado",
  },
  "ofertix-shopee-sync": {
    title: "Sincronizar catálogo Shopee",
    description: "Consulta os feeds de produtos da Shopee, importa os registros disponíveis e atualiza a base de produtos integrada.",
    group: "Shopee", functionName: "shopee-sync", frequency: "A cada 3 horas · ciclo principal",
  },
  "ofertix-shopee-sync-offset": {
    title: "Sincronizar catálogo Shopee",
    description: "Executa a mesma sincronização em horário alternado para distribuir as consultas aos feeds.",
    group: "Shopee", functionName: "shopee-sync", frequency: "A cada 3 horas · ciclo alternado",
  },
};
function cronInfo(name: string): CronMeta {
  return cronMeta[name] ?? { title: name.replaceAll("-", " "), description: "Rotina agendada do Ofertix.", group: "Mercado Livre", functionName: name, frequency: "Ver agendamento" };
}
function cronSchedule(name: string) {
  const info = cronInfo(name);
  return info.frequency;
}
async function edgeFunctionError(error: unknown): Promise<string> {
  const context = (error as { context?: Response } | null)?.context;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json() as Record<string, unknown>;
      const primary = String(body.error ?? body.message ?? "A função recusou a solicitação.");
      const details = body.details ? " — " + String(body.details) : "";
      const status = body.upstream_status ? " (HTTP " + body.upstream_status + ")" : "";
      return primary + status + details;
    } catch {
      const raw = await context.clone().text().catch(() => "");
      if (raw) return raw.slice(0, 1200);
    }
  }
  return error instanceof Error ? error.message : "Falha ao comunicar com a Edge Function.";
}
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
  if (source.includes("mercado") || source.includes("meli") || source.includes("product-refresh") || source.includes("product-price") || source.includes("n8n-product")) return "Mercado Livre";
  if (source.includes("publication")) return "Canais";\n  if (source.includes("duplicate") || source.includes("classifier")) return "Ofertix";
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
  const [crons, setCrons] = useState<Cron[]>([]);
  const [loadingCrons, setLoadingCrons] = useState(true);
  const [cronError, setCronError] = useState("");
  const [runningCron, setRunningCron] = useState<number | null>(null);
  const [cronFeedback, setCronFeedback] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
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

  const loadCrons = useCallback(async () => {
    setLoadingCrons(true); setCronError("");
    const { data, error: requestError } = await supabase.functions.invoke("automation-control", { body: { action: "list_crons" } });
    if (requestError || data?.success === false) setCronError(requestError?.message || data?.error || "Não foi possível carregar os crons.");
    setCrons((data?.crons ?? []) as Cron[]);
    setLoadingCrons(false);
  }, []);
  useEffect(() => { void loadCrons(); }, [loadCrons]);

  const runCron = async (cron: Cron) => {
    if (runningCron !== null) return;
    setRunningCron(cron.jobid); setCronFeedback(null);
    const { data, error: requestError } = await supabase.functions.invoke("automation-control", { body: { action: "run_cron", job_name: cron.jobname } });
    if (requestError || data?.success === false) {
      const detail = requestError ? await edgeFunctionError(requestError) : String(data?.error ?? "Falha ao solicitar execução.");
      setCronFeedback({ type: "error", message: detail });
    } else {
      setCronFeedback({ type: "success", message: data?.message || "A rotina respondeu com sucesso. Confira os detalhes no histórico." });
      await load();
    }
    setRunningCron(null);
  };

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

  const sources = useMemo(() => Array.from(new Set(runs.map((run) => marketplaceName(run.function_name)))), [runs]);
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
  const completedRuns = runs.filter((run) => run.status !== "running");
  const successRate = completedRuns.length ? Math.round((succeeded / completedRuns.length) * 100) : 0;
  const durations = runs.map((run) => run.duration_ms).filter((value): value is number => value != null && value >= 0);
  const averageDuration = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
  const activeCrons = crons.filter((cron) => cron.active).length;
  const chartBuckets = useMemo(() => {
    const count = period === "24h" ? 12 : 7;
    const span = period === "24h" ? 2 * 3600000 : period === "7d" ? 24 * 3600000 : period === "30d" ? 4 * 24 * 3600000 : 7 * 24 * 3600000;
    const now = Date.now();
    return Array.from({ length: count }, (_, index) => {
      const end = now - (count - index - 1) * span;
      const start = end - span;
      const bucketRuns = runs.filter((run) => {
        const time = new Date(run.started_at).getTime();
        return time >= start && time < end;
      });
      return { label: period === "24h" ? new Date(start).toLocaleTimeString("pt-BR", { hour: "2-digit" }) : new Date(start).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), total: bucketRuns.length, success: bucketRuns.filter((run) => displayStatus(run).tone === "success").length, errors: bucketRuns.filter((run) => displayStatus(run).tone === "danger").length };
    });
  }, [runs, period]);
  const chartMax = Math.max(1, ...chartBuckets.map((bucket) => bucket.total));

  return <div className="page ops-page executions-page">
    <PageIntro eyebrow="AUTOMAÇÕES" title="Execuções e histórico" description="Acompanhe cada rotina, os itens processados e o motivo individual de cada falha." actions={<button className="ops-button ops-button-secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16} /> Atualizar</button>} />
    {error && <div className="ops-alert">{error}</div>}
    <section className="cron-console">
      <div className="cron-console-heading">
        <div><span className="cron-eyebrow">CENTRAL DE AUTOMAÇÕES</span><h2>Rotinas agendadas</h2><p>Entenda o que cada processo faz e execute apenas o que precisa.</p></div>
        <div className="cron-console-tools"><span className="cron-total">{crons.length} rotinas</span><button className="ops-button ops-button-secondary" onClick={() => { void loadCrons(); void load(); }} disabled={loadingCrons}><RefreshCw size={14} /> Atualizar</button></div>
      </div>
      {cronError && <div className="ops-alert">{cronError}</div>}
      {cronFeedback && <div className={"cron-feedback " + cronFeedback.type}><span>{cronFeedback.message}</span><button type="button" onClick={() => setCronFeedback(null)} aria-label="Fechar">×</button></div>}
      {loadingCrons ? <div className="ops-empty"><p>Carregando rotinas…</p></div> : crons.length === 0 ? <EmptyState title="Nenhuma rotina encontrada" detail="Não foram encontrados agendamentos do Ofertix." /> :
        <div className="cron-groups">
          {(["Ofertix", "Mercado Livre", "Publicação", "Shopee"] as const).map((group) => {
            const groupCrons = crons.filter((cron) => cronInfo(cron.jobname).group === group);
            if (!groupCrons.length) return null;
            return <section className="cron-group" key={group}>
              <div className="cron-group-heading"><div><h3>{group}</h3><span>{groupCrons.length} {groupCrons.length === 1 ? "rotina" : "rotinas"}</span></div></div>
              <div className="cron-list">{groupCrons.map((cron) => {
                const info = cronInfo(cron.jobname);
                const latest = runs.find((run) => run.function_name === info.functionName);
                const latestStatus = latest ? displayStatus(latest) : null;
                return <article className={"cron-row " + (!cron.active ? "is-paused" : "")} key={cron.jobid}>
                  <div className="cron-row-main"><div className="cron-row-title"><strong>{info.title}</strong><StatusPill tone={cron.active ? "success" : "neutral"}>{cron.active ? "Ativo" : "Pausado"}</StatusPill></div>
                    <p>{info.description}</p>
                    <div className="cron-row-meta"><span><Clock3 size={13}/>{cronSchedule(cron.jobname)}</span><code>{cron.schedule}</code>
                      {latest && <span className="cron-last-run">Última: {formatDate(latest.started_at)} · <b className={latestStatus?.tone}>{latestStatus?.label}</b></span>}
                    </div>
                  </div>
                  <div className="cron-row-action"><button className="cron-run-compact" type="button" onClick={() => void runCron(cron)} disabled={runningCron !== null} title={"Executar " + info.title}>
                    {runningCron === cron.jobid ? <RefreshCw size={14} className="spin" /> : <Play size={14} />}
                    {runningCron === cron.jobid ? "Executando…" : "Executar"}
                  </button></div>
                </article>;
              })}</div>
            </section>;
          })}
        </div>}
    </section>
    <section className="ops-metrics">
      <Metric icon={<Activity size={19} />} value={loading ? "…" : runs.length} label="Execuções" detail="No período selecionado" />
      <Metric icon={<CheckCircle2 size={19} />} value={loading ? "…" : succeeded} label="Concluídas" detail="Sem falhas registradas" />
      <Metric icon={<AlertTriangle size={19} />} value={loading ? "…" : warnings + failures} label="Com ocorrências" detail={failures + " falhas · " + warnings + " parciais"} />
      <Metric icon={<Package size={19} />} value={loading ? "…" : created + updated} label="Produtos tratados" detail={created + " integrados · " + updated + " atualizados"} />
    </section>
    <section className="execution-analytics">
      <div className="execution-analytics-heading"><div><span className="cron-eyebrow">VISÃO OPERACIONAL</span><h2>Saúde das automações</h2><p>Volume, estabilidade e duração das rotinas no período selecionado.</p></div><span className="execution-period-tag">{period === "24h" ? "Últimas 24 horas" : period === "7d" ? "Últimos 7 dias" : period === "30d" ? "Últimos 30 dias" : "Histórico carregado"}</span></div>
      <div className="execution-health-grid">
        <article className="execution-health-card"><span>Taxa de sucesso</span><strong>{loading ? "…" : successRate + "%"}</strong><div className="execution-health-track"><i style={{ width: successRate + "%" }} /></div><small>{succeeded} execuções concluídas sem falhas</small></article>
        <article className="execution-health-card"><span>Duração média</span><strong>{loading ? "…" : duration(averageDuration)}</strong><small>Baseado em {durations.length} execuções com duração registrada</small></article>
        <article className="execution-health-card"><span>Agendamentos ativos</span><strong>{loadingCrons ? "…" : activeCrons + " / " + crons.length}</strong><small>{crons.length - activeCrons} pausados ou inativos</small></article>
        <article className="execution-health-card"><span>Rotinas com falha</span><strong>{loading ? "…" : failures}</strong><small>Execuções com status de falha no período</small></article>
      </div>
      <div className="execution-charts-grid">
        <article className="execution-chart-card"><div className="execution-chart-title"><div><h3>Volume de execuções</h3><p>Distribuição por intervalo</p></div><span>{runs.length} registros</span></div>
          <div className="execution-bar-chart" role="img" aria-label="Gráfico de volume de execuções por intervalo">{chartBuckets.map((bucket, index) => <div className="execution-bar-column" key={index}><div className="execution-bar-stack"><i className="success" style={{ height: (bucket.success / chartMax * 100) + "%" }} /><i className="failed" style={{ height: (bucket.errors / chartMax * 100) + "%" }} /><i className="other" style={{ height: (Math.max(0, bucket.total - bucket.success - bucket.errors) / chartMax * 100) + "%" }} /></div><small>{bucket.label}</small></div>)}</div>
          <div className="execution-chart-legend"><span><i className="success"/>Concluídas</span><span><i className="failed"/>Falhas</span><span><i className="other"/>Em andamento/ressalvas</span></div>
        </article>
        <article className="execution-chart-card"><div className="execution-chart-title"><div><h3>Resultado das execuções</h3><p>Composição do período</p></div></div>
          <div className="execution-outcome"><div className="execution-donut" style={{ background: "conic-gradient(#16a34a 0 " + (runs.length ? succeeded / runs.length * 100 : 0) + "%, #dc2626 " + (runs.length ? succeeded / runs.length * 100 : 0) + "% " + (runs.length ? (succeeded + failures) / runs.length * 100 : 0) + "%, #d97706 " + (runs.length ? (succeeded + failures) / runs.length * 100 : 0) + "% 100%)" }}><div><strong>{runs.length}</strong><small>execuções</small></div></div>
            <div className="execution-outcome-legend"><span><i className="success"/><b>{succeeded}</b>Concluídas</span><span><i className="failed"/><b>{failures}</b>Falhas</span><span><i className="warning"/><b>{warnings}</b>Ressalvas/em andamento</span></div></div>
        </article>
      </div>
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
