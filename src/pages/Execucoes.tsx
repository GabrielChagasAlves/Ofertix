import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock3,
  Database,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import "./Execucoes.css";

type RunStatus = "running" | "succeeded" | "failed" | string;

type AutomationRun = {
  id: string;
  function_name: string | null;
  status: RunStatus | null;
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

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
};

const formatDuration = (value?: number | null) => {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  })} s`;
};

const statusLabel = (status?: string | null) => {
  switch (status) {
    case "succeeded":
      return "Concluída";
    case "failed":
      return "Falhou";
    case "running":
      return "Em andamento";
    default:
      return status || "Sem status";
  }
};

const statusClass = (status?: string | null) => {
  if (status === "succeeded") return "success";
  if (status === "failed") return "error";
  if (status === "running") return "running";
  return "neutral";
};

const automationLabel = (name?: string | null) => {
  if (!name) return "Automação";
  const labels: Record<string, string> = {
    "mercado-livre-sync": "Sincronização Mercado Livre",
    "ofertix-mercado-livre-sync": "Sincronização Mercado Livre",
    "availability-check": "Verificação de disponibilidade",
    "ofertix-availability-check": "Verificação de disponibilidade",
  };
  return labels[name] || name.replace(/[-_]/g, " ");
};

export function Execucoes() {
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const loadRuns = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError(null);

    const { data, error: queryError } = await supabase
      .from("automation_runs")
      .select(
        "id,function_name,status,started_at,finished_at,duration_ms,products_processed,products_created,products_updated,items_processed,errors_count,metrics,error_message",
      )
      .order("started_at", { ascending: false })
      .limit(100);

    if (queryError) {
      setError(queryError.message);
    } else {
      setRuns((data || []) as AutomationRun[]);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const filteredRuns = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return runs.filter((run) => {
      const matchesStatus =
        statusFilter === "all" || run.status === statusFilter;
      const haystack = [
        run.function_name || "",
        run.status || "",
        run.error_message || "",
      ]
        .join(" ")
        .toLowerCase();
      return matchesStatus && (!normalizedSearch || haystack.includes(normalizedSearch));
    });
  }, [runs, search, statusFilter]);

  const stats = useMemo(() => {
    const succeeded = runs.filter((run) => run.status === "succeeded").length;
    const failed = runs.filter((run) => run.status === "failed").length;
    const running = runs.filter((run) => run.status === "running").length;
    const latest = runs.find((run) => run.started_at)?.started_at || null;
    return { total: runs.length, succeeded, failed, running, latest };
  }, [runs]);

  const latestByAutomation = useMemo(() => {
    const latest: Record<string, AutomationRun> = {};
    for (const run of runs) {
      const name = run.function_name || "unknown";
      if (!latest[name]) latest[name] = run;
    }
    return latest;
  }, [runs]);

  const automationCards = [
    {
      key: "mercado-livre-sync",
      title: "Sincronização Mercado Livre",
      description: "Atualiza produtos e informações recebidas do Mercado Livre.",
      cadence: "A cada 30 minutos",
    },
    {
      key: "availability-check",
      title: "Verificação de disponibilidade",
      description: "Verifica a disponibilidade dos produtos monitorados.",
      cadence: "Agendamento automático",
    },
    {
      key: "product-rules",
      title: "Regras e ofertas",
      description: "Processamento de regras e correspondências de produtos.",
      cadence: "Conforme configuração",
    },
  ];

  const getLatestForCard = (key: string) => {
    const matches = Object.entries(latestByAutomation).filter(([name]) => {
      if (key === "mercado-livre-sync") return name.includes("mercado-livre-sync");
      if (key === "availability-check") return name.includes("availability");
      return name.includes("rule") || name.includes("offer");
    });
    return matches[0]?.[1];
  };

  return (
    <main className="exec-page">
      <header className="exec-header">
        <div>
          <div className="exec-eyebrow"><Activity size={15} /> CENTRAL DE AUTOMAÇÕES</div>
          <h1>Execuções</h1>
          <p>Acompanhe o funcionamento das rotinas automáticas do Ofertix.</p>
        </div>
        <button
          type="button"
          className="exec-button"
          onClick={() => void loadRuns(true)}
          disabled={loading || refreshing}
        >
          <RefreshCw size={16} className={refreshing ? "exec-spin" : ""} />
          {refreshing ? "Atualizando..." : "Atualizar"}
        </button>
      </header>

      <section className="exec-stats" aria-label="Resumo das execuções">
        <article className="exec-stat-card">
          <span className="exec-stat-icon"><Database size={19} /></span>
          <div><span className="exec-stat-label">Execuções carregadas</span><strong>{stats.total}</strong></div>
        </article>
        <article className="exec-stat-card">
          <span className="exec-stat-icon"><CheckCircle2 size={19} /></span>
          <div><span className="exec-stat-label">Concluídas</span><strong>{stats.succeeded}</strong></div>
        </article>
        <article className="exec-stat-card">
          <span className="exec-stat-icon"><XCircle size={19} /></span>
          <div><span className="exec-stat-label">Falhas</span><strong>{stats.failed}</strong></div>
        </article>
        <article className="exec-stat-card">
          <span className="exec-stat-icon"><Clock3 size={19} /></span>
          <div><span className="exec-stat-label">Em andamento</span><strong>{stats.running}</strong></div>
        </article>
      </section>

      <section className="exec-section">
        <div className="exec-section-heading">
          <div><h2>Rotinas automáticas</h2><p>Resumo da última execução registrada para cada rotina.</p></div>
        </div>
        <div className="exec-cron-grid">
          {automationCards.map((card) => {
            const latest = getLatestForCard(card.key);
            return (
              <article className="exec-cron-card" key={card.key}>
                <div className="exec-cron-card-top">
                  <span className="exec-cron-icon"><Activity size={18} /></span>
                  <span className={`exec-pill ${statusClass(latest?.status)}`}>
                    {latest ? statusLabel(latest.status) : "Sem histórico"}
                  </span>
                </div>
                <h3>{card.title}</h3>
                <p>{card.description}</p>
                <div className="exec-cron-meta"><Clock3 size={14} /> {card.cadence}</div>
                <div className="exec-cron-last">
                  <span>Última execução</span>
                  <strong>{formatDate(latest?.started_at)}</strong>
                </div>
                {latest?.error_message && (
                  <div className="exec-inline-error"><AlertCircle size={14} /> {latest.error_message}</div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="exec-section">
        <div className="exec-section-heading">
          <div><h2>Histórico de execuções</h2><p>Últimas 100 execuções registradas no banco de dados.</p></div>
          <span className="exec-history-count">{filteredRuns.length} registro(s)</span>
        </div>

        <div className="exec-toolbar">
          <label className="exec-search">
            <Search size={17} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar automação ou erro..."
            />
          </label>
          <select
            className="exec-filter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filtrar por status"
          >
            <option value="all">Todos os status</option>
            <option value="succeeded">Concluídas</option>
            <option value="failed">Falhas</option>
            <option value="running">Em andamento</option>
          </select>
        </div>

        {error && (
          <div className="exec-error-banner">
            <AlertCircle size={18} />
            <div><strong>Não foi possível carregar o histórico.</strong><p>{error}</p></div>
            <button type="button" onClick={() => void loadRuns(true)}>Tentar novamente</button>
          </div>
        )}

        <div className="exec-table-wrap">
          <table className="exec-table">
            <thead>
              <tr>
                <th>Automação</th>
                <th>Status</th>
                <th>Início</th>
                <th>Duração</th>
                <th>Processados</th>
                <th>Criados</th>
                <th>Atualizados</th>
                <th>Erros</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="exec-empty">Carregando execuções...</td></tr>
              ) : filteredRuns.length === 0 ? (
                <tr><td colSpan={8} className="exec-empty">Nenhuma execução encontrada para os filtros selecionados.</td></tr>
              ) : (
                filteredRuns.map((run) => (
                  <tr key={run.id}>
                    <td>
                      <strong>{automationLabel(run.function_name)}</strong>
                      {run.error_message && <span className="exec-row-error" title={run.error_message}>{run.error_message}</span>}
                    </td>
                    <td><span className={`exec-pill ${statusClass(run.status)}`}>{statusLabel(run.status)}</span></td>
                    <td>{formatDate(run.started_at)}</td>
                    <td>{formatDuration(run.duration_ms)}</td>
                    <td>{run.products_processed ?? run.items_processed ?? "—"}</td>
                    <td>{run.products_created ?? "—"}</td>
                    <td>{run.products_updated ?? "—"}</td>
                    <td>{run.errors_count ?? 0}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <footer className="exec-history-foot">
          <span>Última atualização: {formatDate(stats.latest)}</span>
          <span>Exibindo até 100 registros recentes</span>
        </footer>
      </section>
    </main>
  );
}

export default Execucoes;
