import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertCircle, CalendarDays, Check, Circle, Clock3, MoreVertical,
  Package, Play, RefreshCw, Search, Tag, Timer, XCircle, Zap, ChevronRight,
  Trash2, CheckCircle2
} from "lucide-react";
import { supabase } from "../lib/supabase";
import "./Execucoes.css";

type Run = {
  id: string;
  function_name: string | null;
  status: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  products_processed: number | null;
  products_created: number | null;
  products_updated: number | null;
  items_processed: number | null;
  errors_count: number | null;
  metrics: Record<string, unknown> | null;
  error_message: string | null;
};

const fmtDate = (value?: string | null) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }).format(d);
};
const fmtTime = (value?: string | null) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(d);
};
const fmtDuration = (ms?: number | null) => {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
};
const label = (name?: string | null) => {
  const key = (name || "").toLowerCase();
  if (key.includes("mercado-livre-sync") || key.includes("mercado livre")) return "Sincronização Mercado Livre";
  if (key.includes("availability")) return "Verificação de disponibilidade";
  if (key.includes("publication")) return "Processamento de publicação";
  if (key.includes("rule") || key.includes("offer")) return "Regras e ofertas";
  return name ? name.replace(/[-_]/g, " ") : "Automação";
};
const statusText = (status?: string | null) => status === "succeeded" ? "Concluída" : status === "failed" ? "Falhou" : status === "running" ? "Em andamento" : status || "Sem status";
const statusCss = (status?: string | null) => status === "succeeded" ? "done" : status === "failed" ? "failed" : status === "running" ? "running" : "neutral";

export function Execucoes() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("24h");
  const [showAll, setShowAll] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [logCleared, setLogCleared] = useState(false);

  const load = useCallback(async (quiet = false) => {
    quiet ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      const { data, error: queryError } = await supabase
        .from("automation_runs")
        .select("id,function_name,status,started_at,finished_at,duration_ms,products_processed,products_created,products_updated,items_processed,errors_count,metrics,error_message")
        .order("started_at", { ascending: false })
        .limit(100);
      if (queryError) throw queryError;
      setRuns((data || []) as Run[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar os dados.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const inRange = useMemo(() => {
    if (filter === "all") return runs;
    const hours = filter === "1h" ? 1 : filter === "7d" ? 168 : 24;
    const cutoff = Date.now() - hours * 3600000;
    return runs.filter(r => r.started_at && new Date(r.started_at).getTime() >= cutoff);
  }, [runs, filter]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = inRange.filter(r => !q || `${label(r.function_name)} ${r.function_name || ""} ${r.status || ""} ${r.error_message || ""}`.toLowerCase().includes(q));
    return showAll ? rows : rows.slice(0, 6);
  }, [inRange, search, showAll]);

  const stats = useMemo(() => {
    const succeeded = inRange.filter(r => r.status === "succeeded");
    const failed = inRange.filter(r => r.status === "failed");
    const completed = inRange.filter(r => r.status === "succeeded" || r.status === "failed");
    const totalMs = completed.reduce((sum, r) => sum + (r.duration_ms || 0), 0);
    const avg = completed.length ? totalMs / completed.length : null;
    const products = inRange.reduce((sum, r) => sum + (r.products_processed ?? r.items_processed ?? 0), 0);
    const created = inRange.reduce((sum, r) => sum + (r.products_created ?? 0), 0);
    return { total: inRange.length, succeeded: succeeded.length, failed: failed.length, running: inRange.filter(r => r.status === "running").length, avg, products, created };
  }, [inRange]);

  const active = inRange.find(r => r.status === "running");
  const latestLogs = useMemo(() => {
    return [...inRange].slice(0, 8).map(r => ({
      id: r.id, time: fmtTime(r.started_at), title: `${label(r.function_name)} — ${statusText(r.status)}`,
      detail: r.error_message || (r.products_processed != null ? `${r.products_processed} item(ns) processado(s)` : "Execução registrada"),
      status: r.status || "unknown"
    }));
  }, [inRange]);

  const stages = [
    { number: "1", title: "Sincronização", subtitle: "Mercado Livre", icon: Package },
    { number: "2", title: "Verificação", subtitle: "Disponibilidade", icon: CheckCircle2 },
    { number: "3", title: "Regras e ofertas", subtitle: "Elegibilidade", icon: Tag },
    { number: "4", title: "Publicações", subtitle: "Processamento", icon: Zap },
  ];

  return (
    <main className="exec-draft">
      <header className="draft-page-head">
        <div>
          <div className="draft-kicker"><Activity size={15} /> CENTRAL DE AUTOMAÇÕES</div>
          <h1>Execuções</h1>
          <p>Acompanhe em tempo real as execuções do Ofertix no Mercado Livre</p>
        </div>
        <div className="draft-head-actions">
          <div className="draft-online"><i /><span><strong>Sistema Online</strong><small>Estado observado no histórico</small></span></div>
          <label className="draft-range"><CalendarDays size={16} /><select value={filter} onChange={e => setFilter(e.target.value)} aria-label="Período do histórico">
            <option value="1h">Última hora</option><option value="24h">Últimas 24 horas</option><option value="7d">Últimos 7 dias</option><option value="all">Todos os registros</option>
          </select></label>
          <button className="draft-refresh" onClick={() => void load(true)} disabled={loading || refreshing}><RefreshCw size={15} className={refreshing ? "draft-spin" : ""} /> {refreshing ? "Atualizando" : "Atualizar"}</button>
        </div>
      </header>

      {error && <div className="draft-error"><AlertCircle size={17} /><span><strong>Falha ao consultar o histórico.</strong> {error}</span><button onClick={() => void load(true)}>Tentar novamente</button></div>}

      <section className="draft-kpis">
        <article className="draft-kpi"><span className="draft-kpi-icon emerald"><Play size={22} fill="currentColor" /></span><div><small>Total de Execuções</small><strong>{loading ? "—" : stats.total.toLocaleString("pt-BR")}</strong><em>execuções no período selecionado</em></div></article>
        <article className="draft-kpi"><span className="draft-kpi-icon blue"><Package size={22} /></span><div><small>Produtos Encontrados</small><strong>{loading ? "—" : stats.products.toLocaleString("pt-BR")}</strong><em>conforme registros disponíveis</em></div></article>
        <article className="draft-kpi"><span className="draft-kpi-icon violet"><Tag size={22} /></span><div><small>Oportunidades Salvas</small><strong>{loading ? "—" : stats.created.toLocaleString("pt-BR")}</strong><em>conforme registros disponíveis</em></div></article>
        <article className="draft-kpi"><span className="draft-kpi-icon orange"><Timer size={22} /></span><div><small>Tempo Médio</small><strong>{loading || stats.avg == null ? "—" : fmtDuration(stats.avg)}</strong><em>execuções finalizadas</em></div></article>
      </section>

      <section className="draft-live-panel">
        <div className="draft-live-head">
          <div className="draft-live-title"><span className={`draft-live-badge ${active ? "is-running" : ""}`}><i /> {active ? "AO VIVO" : "SEM EXECUÇÃO ATIVA"}</span><div><h2>{active ? "Execução em andamento" : "Fluxo de automações"}</h2><p>{active ? label(active.function_name) : "Visão do processamento a partir das execuções registradas"}</p></div></div>
          <div className="draft-live-controls">
            <div className="draft-elapsed"><small>{active ? `Iniciada às ${fmtTime(active.started_at)}` : "Última execução registrada"}</small><strong>{active ? fmtDuration(Date.now() - new Date(active.started_at || Date.now()).getTime()) : fmtDate(inRange[0]?.started_at)}</strong></div>
            <button className="draft-force" disabled aria-label="Forçar execução indisponível até a integração do backend"><Zap size={15} /> Forçar Execução</button>
            <button className="draft-cancel" disabled aria-label="Cancelar execução indisponível até a integração do backend"><Circle size={14} /> Cancelar</button>
          </div>
        </div>

        <div className="draft-stage-flow">
          {stages.map((stage, index) => {
            const Icon = stage.icon;
            const latestForStage = inRange.find(r => {
              const n = (r.function_name || "").toLowerCase();
              return index === 0 ? n.includes("mercado-livre-sync") : index === 1 ? n.includes("availability") : index === 2 ? n.includes("rule") || n.includes("offer") : n.includes("publication");
            });
            const stageStatus = latestForStage?.status;
            return <div className={`draft-stage-wrap ${index === 0 && active ? "current" : ""}`} key={stage.number}>
              <article className={`draft-stage ${index === 0 && active ? "current" : ""}`}>
                <div className="draft-stage-top"><span className={`draft-stage-number stage-${index + 1}`}><Icon size={17} /></span><div><strong>{stage.title}</strong><small>{stage.subtitle}</small></div></div>
                <p>{latestForStage ? statusText(stageStatus) : "Aguardando registro"}</p>
                <div className="draft-stage-progress"><span style={{ width: latestForStage?.status === "succeeded" ? "100%" : latestForStage?.status === "running" ? "55%" : "0%" }} /></div>
                <div className="draft-stage-foot"><span>{latestForStage ? fmtDate(latestForStage.started_at) : "Sem execução registrada"}</span><b>{latestForStage?.status === "succeeded" ? "100%" : latestForStage?.status === "running" ? "55%" : "—"}</b></div>
              </article>
              {index < stages.length - 1 && <ChevronRight className="draft-stage-arrow" size={25} />}
            </div>;
          })}
        </div>

        <div className="draft-live-metrics">
          <div><span className="draft-metric-icon blue"><Search size={22} /></span><section><strong>{stats.products.toLocaleString("pt-BR")}</strong><small>Produtos processados</small></section></div>
          <div><span className="draft-metric-icon green"><Check size={22} /></span><section><strong>{stats.created.toLocaleString("pt-BR")}</strong><small>Oportunidades salvas</small></section></div>
          <div><span className="draft-metric-icon red"><XCircle size={22} /></span><section><strong>{inRange.reduce((sum, r) => sum + (r.errors_count ?? 0), 0).toLocaleString("pt-BR")}</strong><small>Filtradas por regras / erros</small></section></div>
          <div><span className="draft-metric-icon violet"><Clock3 size={22} /></span><section><strong>{active ? fmtDuration(Date.now() - new Date(active.started_at || Date.now()).getTime()) : (stats.avg == null ? "—" : fmtDuration(stats.avg))}</strong><small>{active ? "Tempo decorrido" : "Tempo médio"}</small></section></div>
        </div>
      </section>

      <div className="draft-bottom-grid">
        <section className="draft-panel">
          <div className="draft-panel-head"><div><h2>Últimas Execuções</h2><p>Histórico das execuções realizadas</p></div><button className="draft-view-all" onClick={() => setShowAll(v => !v)}><ChevronRight size={16} /> {showAll ? "Mostrar menos" : "Ver todas"}</button></div>
          <label className="draft-search"><Search size={15} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar execução ou erro..." /></label>
          <div className="draft-history-wrap"><table className="draft-history"><thead><tr><th>Início</th><th>Duração</th><th>Status</th><th>Produtos</th><th>Oportunidades</th><th>Categoria inicial</th><th>Ações</th></tr></thead>
            <tbody>{loading ? <tr><td colSpan={7} className="draft-empty">Carregando execuções...</td></tr> : visible.length === 0 ? <tr><td colSpan={7} className="draft-empty">Nenhuma execução encontrada neste período.</td></tr> : visible.map(r => <tr key={r.id}>
              <td><strong>{r.started_at ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(r.started_at)) : "—"}</strong></td>
              <td>{fmtDuration(r.duration_ms)}</td><td><span className={`draft-status ${statusCss(r.status)}`}>{statusText(r.status)}</span></td>
              <td>{r.products_processed ?? r.items_processed ?? "—"}</td><td>{r.products_created ?? "—"}</td><td>{label(r.function_name)}</td>
              <td className="draft-action-cell"><button aria-label="Ver mensagem da execução" onClick={() => setMenuId(menuId === r.id ? null : r.id)}><MoreVertical size={17} /></button>{menuId === r.id && <div className="draft-row-popover"><strong>Detalhes</strong><span>{r.error_message || `ID: ${r.id}`}</span><small>Finalizada: {fmtDate(r.finished_at)}</small></div>}</td>
            </tr>)}</tbody></table></div>
          <footer className="draft-panel-foot"><span>{visible.length} de {inRange.length} execução(ões)</span><span>Atualizado: {fmtDate(inRange[0]?.started_at)}</span></footer>
        </section>

        <section className="draft-panel draft-log-panel">
          <div className="draft-panel-head"><div><h2>Log da Execução</h2><p>Eventos registrados no histórico</p></div><button className="draft-clear-log" onClick={() => setLogCleared(true)}><Trash2 size={14} /> Limpar</button></div>
          {logCleared ? <div className="draft-log-empty">A lista foi limpa apenas nesta visualização. Atualize a página para voltar a exibir os registros.</div> : latestLogs.length === 0 ? <div className="draft-log-empty">Os eventos aparecerão aqui quando existirem execuções registradas.</div> : <div className="draft-timeline">{latestLogs.map((log) => <div className="draft-log-item" key={log.id}><span className={`draft-log-dot dot-${statusCss(log.status)}`} /><time>{log.time}</time><div><strong>{log.title}</strong><p>{log.detail}</p></div></div>)}</div>}
        </section>
      </div>
    </main>
  );
}

export default Execucoes;
