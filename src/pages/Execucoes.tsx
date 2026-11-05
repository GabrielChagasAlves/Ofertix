import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock3, Package, RefreshCw, Search, XCircle } from "lucide-react";
import { supabase } from "../lib/supabase";
import { EmptyState, formatDate, Metric, PageIntro, StatusPill } from "../components/OperationsUI";

type Run = { id: string; function_name: string; status: string; started_at: string; finished_at: string | null; duration_ms: number | null; products_processed: number | null; products_created: number | null; products_updated: number | null; errors_count: number | null; error_message: string | null; metrics: Record<string, unknown> | null };

function marketplaceName(name: string) {
  const source = name.toLowerCase();
  if (source.includes("shopee")) return "Shopee";
  if (source.includes("mercado") || source.includes("meli")) return "Mercado Livre";
  if (source.includes("publication")) return "Publicações";
  return "Ofertix";
}
function duration(ms: number | null) { return ms == null ? "—" : ms < 1000 ? ms + "ms" : Math.round(ms / 1000) + "s"; }

export function Execucoes() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [source, setSource] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const { data, error: requestError } = await supabase.from("automation_runs").select("id,function_name,status,started_at,finished_at,duration_ms,products_processed,products_created,products_updated,errors_count,error_message,metrics").order("started_at", { ascending: false }).limit(100);
    if (requestError) setError(requestError.message);
    setRuns(data ?? []); setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const sources = useMemo(() => Array.from(new Set(runs.map((run) => marketplaceName(run.function_name)))), [runs]);
  const visible = useMemo(() => runs.filter((run) => (source === "all" || marketplaceName(run.function_name) === source) && (!search.trim() || (run.function_name + " " + marketplaceName(run.function_name)).toLowerCase().includes(search.trim().toLowerCase()))), [runs, search, source]);
  const succeeded = runs.filter((run) => run.status === "succeeded").length;
  const failures = runs.filter((run) => run.status === "failed").length;

  return <div className="page ops-page">
    <PageIntro eyebrow="AUTOMAÇÕES" title="Execuções e histórico" description="Cada ciclo fica visível por origem, com resultado, itens tratados e erros que precisam de atenção." actions={<button className="ops-button ops-button-secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16} /> Atualizar</button>} />
    {error && <div className="ops-alert">{error}</div>}
    <section className="ops-metrics"><Metric icon={<Activity size={19} />} value={loading ? "…" : runs.length} label="Execuções recentes" detail="Histórico disponível" /><Metric icon={<CheckCircle2 size={19} />} value={loading ? "…" : succeeded} label="Concluídas" detail="Ciclos processados com sucesso" /><Metric icon={<AlertTriangle size={19} />} value={loading ? "…" : failures} label="Falhas" detail="Itens que exigem revisão" /><Metric icon={<Package size={19} />} value={loading ? "…" : runs.reduce((sum, run) => sum + (run.products_created ?? 0), 0)} label="Novos produtos" detail="No período exibido" /></section>
    <section className="ops-surface"><div className="ops-toolbar"><label className="ops-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por automação ou marketplace" /></label><label className="ops-select"><select value={source} onChange={(event) => setSource(event.target.value)}><option value="all">Todas as origens</option>{sources.map((item) => <option value={item} key={item}>{item}</option>)}</select></label></div>
      {loading ? <div className="ops-empty"><p>Carregando execuções…</p></div> : visible.length === 0 ? <EmptyState title="Nenhuma execução encontrada" detail="Os próximos ciclos automáticos aparecerão aqui." /> : <div className="ops-run-table">{visible.map((run) => <article className="ops-run-row" key={run.id}><div className="ops-run-title"><span className={"ops-run-dot " + run.status} /><div><strong>{marketplaceName(run.function_name)}</strong><small>{run.function_name} · {formatDate(run.started_at)}</small></div></div><StatusPill tone={run.status === "succeeded" ? "success" : run.status === "failed" ? "danger" : "warning"}>{run.status === "succeeded" ? "Concluída" : run.status === "failed" ? "Falhou" : "Em execução"}</StatusPill><span>{(run.products_created ?? 0) + (run.products_updated ?? 0)} produtos tratados</span><span><Clock3 size={14} /> {duration(run.duration_ms)}</span>{run.error_message ? <span className="ops-run-error"><XCircle size={14} /> {run.error_message}</span> : <span className="ops-run-ok">Sem erros</span>}</article>)}</div>}
    </section>
  </div>;
}