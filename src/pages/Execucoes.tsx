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
  Zap,
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
  const seconds = value / 1000;
  if (seconds < 60) {
    return `${seconds.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes} min ${remainingSeconds} s`;
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
      return status || "Sem histórico";
  }
};

const statusClass = (status?: string | null) => {
  if (status === "succeeded") return "ready";
  if (status === "failed") return "failed";
  if (status === "running") return "running";
  return "";
};

const automationLabel = (name?: string | null) => {
  if (!name) return "Automação";
  const labels: Record<string, string> = {
    "mercado-livre-sync": "Sincronização Mercado Livre",
    "ofertix-mercado-livre-sync": "Sincronização Mercado Livre",
    "availability-check": "Verificação de disponibilidade",
    "ofertix-availability-check": "Verificação de disponibilidade",
    "product-rules": "Processamento de regras e ofertas",
  };
  return labels[name] || name.replace(/[-_]/g, " ");
};

type AutomationCard = {
  key: string;
  title: string;
  description: string;
  schedule: string;
  iconColor: "purple" | "blue" | "green";
  matches: (name: string) => boolean;
};

const automationCards: AutomationCard[] = [
  {
    key: "mercado-livre-sync",
    title: "Sincronização Mercado Livre",
    description: "Busca e sincroniza produtos do Mercado Livre com o catálogo Ofertix.",
    schedule: "A cada 30 minutos",
    iconColor: "purple",
    matches: (name) => name.includes("mercado-livre-sync"),
  },
  {
    key: "availability-check",
    title: "Verificação de disponibilidade",
    description: "Acompanha a disponibilidade dos produtos já registrados no sistema.",
    schedule: "Agendamento automático",
    iconColor: "blue",
    matches: (name) => name.includes("availability"),
  },
  {
    key: "product-rules",
    title: "Regras e ofertas",
    description: "Processa correspondências entre produtos e regras de ofertas.",
    schedule: "Conforme configuração",
    iconColor: "green",
    matches: (name) => name.includes("rule") || name.includes("offer"),
  },
];

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

    try {
      const { data, error: queryError } = await supabase
        .from("automation_runs")
        .select(
          "id,function_name,status,started_at,finished_at,duration_ms,products_processed,products_created,products_updated,items_processed,errors_count,metrics,error_message",
        )
        .order("started_at", { ascending: false })
        .limit(100);

      if (queryError) throw queryError;
      setRuns((data || []) as AutomationRun[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado ao consultar o histórico.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const filteredRuns = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return runs.filter((run) => {
      const matchesStatus = statusFilter === "all" || run.status === statusFilter;
      const searchable = [
        automationLabel(run.function_name),
        run.function_name || "",
        run.status || "",
        run.error_message || "",
      ].join(" ").toLocaleLowerCase("pt-BR");
      return matchesStatus && (!query || searchable.includes(query));
    });
  }, [runs, search, statusFilter]);

  const stats = useMemo(() => {
    const succeeded = runs.filter((run) => run.status === "succeeded").length;
    const failed = runs.filter((run) => run.status === "failed").length;
    const running = runs.filter((run) => run.status === "running").length;
    const latest = runs.find((run) => run.started_at)?.started_at || null;
    return { total: runs.length, succeeded, failed, running, latest };
  }, [runs]);

  const latestForCard = (card: AutomationCard) =>
    runs.find((run) => card.matches((run.function_name || "").toLowerCase()));

  return (
    <main className="exec-page">
      <header className="exec-header">
        <div>
          <div className="exec-eyebrow"><Activity size={15} /> CENTRAL DE AUTOMAÇÕES</div>
          <h1>Execuções</h1>
          <p>Acompanhe as rotinas automáticas, confira os resultados e investigue falhas.</p>
        </div>
        <button
          type="button"
          className="exec-button"
          onClick={() => void loadRuns(true)}
          disabled={loading || refreshing}
        >
          <RefreshCw size={16} className={refreshing ? "exec-spin" : ""} />
          {refreshing ? "Atualizando..." : "Atualizar dados"}
        </button>
      </header>

      {error && (
        <div className="exec-notice error" role="alert">
          <AlertCircle size={18} />
          <span><strong>Não foi possível carregar as execuções.</strong><br />{error}</span>
          <button type="button" aria-label="Fechar aviso" onClick={() => setError(null)}>×</button>
        </div>
      )}

      <section className="exec-stats" aria-label="Resumo das execuções">
        <article className="exec-stat-card">
          <span className="exec-stat-icon purple"><Database size={19} /></span>
          <div><small>Total carregado</small><strong>{loading ? "—" : stats.total}</strong><span>Últimos 100 registros</span></div>
        </article>
        <article className="exec-stat-card">
          <span className="exec-stat-icon green"><CheckCircle2 size={19} /></span>
          <div><small>Concluídas</small><strong>{loading ? "—" : stats.succeeded}</strong><span>Execuções bem-sucedidas</span></div>
        </article>
        <article className="exec-stat-card">
          <span className="exec-stat-icon red"><XCircle size={19} /></span>
          <div><small>Falhas</small><strong>{loading ? "—" : stats.failed}</strong><span>Precisam de atenção</span></div>
        </article>
        <article className="exec-stat-card">
          <span className="exec-stat-icon blue"><Clock3 size={19} /></span>
          <div><small>Em andamento</small><strong>{loading ? "—" : stats.running}</strong><span>Execuções registradas como ativas</span></div>
        </article>
      </section>

      <section className="exec-section">
        <div className="exec-section-heading">
          <div>
            <h2>Rotinas automáticas</h2>
            <p>Estado baseado no histórico registrado no Supabase.</p>
          </div>
          <span className="exec-live"><i /> Atualização manual disponível</span>
        </div>

        <div className="exec-cron-grid">
          {automationCards.map((card) => {
            const latest = latestForCard(card);
            return (
              <article className="exec-cron-card" key={card.key}>
                <div className="exec-cron-top">
                  <span className={`exec-cron-icon ${card.iconColor}`}><Zap size={18} /></span>
                  <span className={`exec-pill ${statusClass(latest?.status)}`}>
                    {latest ? statusLabel(latest.status) : "Sem histórico"}
                  </span>
                </div>
                <h3>{card.title}</h3>
                <p>{card.description}</p>
                <div className="exec-cron-schedule"><Clock3 size={14} /> {card.schedule}</div>
                <div className="exec-cron-last">
                  <span>Última execução registrada</span>
                  <strong>{formatDate(latest?.started_at)}</strong>
                </div>
                {latest?.error_message && (
                  <div className="exec-notice error">
                    <AlertCircle size={15} />
                    <span>{latest.error_message}</span>
                  </div>
                )}
                <button
                  type="button"
                  className="exec-button exec-button-force"
                  disabled
                  title="A execução manual ainda não está conectada a uma função segura no backend."
                >
                  <Zap size={15} /> Forçar execução
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="exec-section">
        <div className="exec-section-heading">
          <div>
            <h2>Histórico de execuções</h2>
            <p>Consulte início, duração, resultado, volume processado e erros de cada rotina.</p>
          </div>
          <span className="exec-live"><Database size={14} /> Dados reais do Supabase</span>
        </div>

        <div className="exec-section-heading">
          <label className="exec-filter" style={{ flex: 1, maxWidth: 420 }}>
            <Search size={15} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar automação ou mensagem de erro..."
              aria-label="Buscar no histórico"
              style={{ border: 0, outline: 0, background: "transparent", width: "100%", minWidth: 100, font: "inherit" }}
            />
          </label>
          <label className="exec-filter">
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filtrar por status">
              <option value="all">Todos</option>
              <option value="succeeded">Concluídas</option>
              <option value="failed">Falhas</option>
              <option value="running">Em andamento</option>
            </select>
          </label>
        </div>

        <div className="exec-table-wrap">
          <table className="exec-table">
            <thead>
              <tr>
                <th>Tipo de execução</th>
                <th>Resultado</th>
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
                <tr><td colSpan={8} className="exec-empty">Carregando histórico...</td></tr>
              ) : filteredRuns.length === 0 ? (
                <tr><td colSpan={8} className="exec-empty">
                  {runs.length === 0
                    ? "Ainda não há execuções registradas na tabela automation_runs."
                    : "Nenhuma execução corresponde aos filtros selecionados."}
                </td></tr>
              ) : (
                filteredRuns.map((run) => (
                  <tr key={run.id}>
                    <td>
                      <strong>{automationLabel(run.function_name)}</strong>
                      {run.error_message && <small className="exec-error-cell" title={run.error_message}>{run.error_message}</small>}
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
          <span><Clock3 size={13} /> Última execução registrada: <strong>{formatDate(stats.latest)}</strong></span>
          <span>Mostrando {filteredRuns.length} de {runs.length} registros carregados</span>
        </footer>
      </section>
    </main>
  );
}

export default Execucoes;
