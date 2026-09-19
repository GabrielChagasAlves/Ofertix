import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  RefreshCw,
  AlertCircle,
  Activity,
  Database,
  Search,
  XCircle,
} from "lucide-react";

import { supabase } from "../lib/supabase";

type RunStatus =
  | "running"
  | "succeeded"
  | "failed";

type AutomationRun = {
  id: string;
  function_name: string;
  status: RunStatus;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  products_processed: number | null;
  products_created: number | null;
  products_updated: number | null;
  items_processed: number | null;
  errors_count: number | null;
  metrics: Record<string, any> | null;
  error_message: string | null;
};

type Filter = "all" | RunStatus;

const FUNCTION_LABELS: Record<string, string> = {
  "mercado-livre-sync":
    "Mercado Livre — Sincronização",
  "mercado-livre-availability":
    "Mercado Livre — Disponibilidade",
};

const FUNCTION_DESCRIPTIONS: Record<
  string,
  string
> = {
  "mercado-livre-sync":
    "Busca produtos e publicações no Mercado Livre.",
  "mercado-livre-availability":
    "Valida a disponibilidade dos produtos já sincronizados.",
};

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

function formatDuration(value: number | null) {
  if (value === null || value === undefined) {
    return "—";
  }

  if (value < 1000) {
    return `${value} ms`;
  }

  return `${(value / 1000).toFixed(2)} s`;
}

function getFunctionLabel(
  functionName: string
) {
  return (
    FUNCTION_LABELS[functionName] ||
    functionName
  );
}

function getFunctionDescription(
  functionName: string
) {
  return (
    FUNCTION_DESCRIPTIONS[functionName] ||
    "Execução de automação do Ofertix."
  );
}

function getStatusLabel(
  status: RunStatus
) {
  switch (status) {
    case "succeeded":
      return "Sucesso";

    case "failed":
      return "Falhou";

    case "running":
      return "Executando";

    default:
      return status;
  }
}

function getStatusClass(
  status: RunStatus
) {
  switch (status) {
    case "succeeded":
      return "ready";

    case "failed":
      return "invalid";

    case "running":
      return "pending";

    default:
      return "without";
  }
}

function getStatusIcon(
  status: RunStatus
) {
  switch (status) {
    case "succeeded":
      return <CheckCircle2 size={14} />;

    case "failed":
      return <XCircle size={14} />;

    case "running":
      return <Clock3 size={14} />;

    default:
      return <AlertCircle size={14} />;
  }
}

function getLastRun(
  runs: AutomationRun[],
  functionName: string
) {
  return runs.find(
    (run) =>
      run.function_name === functionName
  );
}

export function Execucoes() {
  const [runs, setRuns] = useState<
    AutomationRun[]
  >([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [search, setSearch] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState<Filter>("all");

  const loadRuns = useCallback(
    async (silent = false) => {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);

      const { data, error } =
        await supabase
          .from("automation_runs")
          .select(`
            id,
            function_name,
            status,
            started_at,
            finished_at,
            duration_ms,
            products_processed,
            products_created,
            products_updated,
            items_processed,
            errors_count,
            metrics,
            error_message
          `)
          .order("started_at", {
            ascending: false,
          })
          .limit(100);

      if (error) {
        console.error(
          "Erro ao carregar execuções:",
          error
        );

        setError(
          "Não foi possível carregar o histórico das automações."
        );
      } else {
        setRuns(
          (data ?? []) as AutomationRun[]
        );
      }

      setLoading(false);
      setRefreshing(false);
    },
    []
  );

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  const filteredRuns = useMemo(() => {
    const normalizedSearch =
      search.trim().toLowerCase();

    return runs.filter((run) => {
      const matchesStatus =
        statusFilter === "all" ||
        run.status === statusFilter;

      if (!matchesStatus) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return (
        getFunctionLabel(
          run.function_name
        )
          .toLowerCase()
          .includes(normalizedSearch) ||
        run.function_name
          .toLowerCase()
          .includes(normalizedSearch) ||
        run.error_message
          ?.toLowerCase()
          .includes(normalizedSearch)
      );
    });
  }, [runs, search, statusFilter]);

  const statistics = useMemo(() => {
    return {
      total: runs.length,

      success: runs.filter(
        (run) =>
          run.status === "succeeded"
      ).length,

      failed: runs.filter(
        (run) =>
          run.status === "failed"
      ).length,

      running: runs.filter(
        (run) =>
          run.status === "running"
      ).length,
    };
  }, [runs]);

  const lastSync = getLastRun(
    runs,
    "mercado-livre-sync"
  );

  const lastAvailability = getLastRun(
    runs,
    "mercado-livre-availability"
  );

  if (loading) {
    return (
      <section className="page">
        <div className="page-header">
          <div>
            <p className="eyebrow">
              AUTOMAÇÕES
            </p>

            <h1>Execuções</h1>

            <p>
              Acompanhe o funcionamento das
              integrações automáticas.
            </p>
          </div>
        </div>

        <div className="settings-empty">
          <RefreshCw size={24} />

          Carregando histórico...
        </div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">
            AUTOMAÇÕES
          </p>

          <h1>Execuções</h1>

          <p>
            Acompanhe as últimas execuções
            das integrações e descubra se o
            processamento realmente terminou.
          </p>
        </div>

        <button
          type="button"
          className="text-button"
          onClick={() =>
            loadRuns(true)
          }
          disabled={refreshing}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "7px",
            padding: "8px 12px",
            border: "1px solid #202734",
            borderRadius: "8px",
          }}
        >
          <RefreshCw
            size={15}
            style={{
              animation: refreshing
                ? "spin 1s linear infinite"
                : undefined,
            }}
          />

          Atualizar
        </button>
      </div>

      {error && (
        <div
          style={{
            marginBottom: "16px",
            padding: "12px 14px",
            borderRadius: "8px",
            background: "#2a1820",
            border: "1px solid #5a2735",
            color: "#fca5a5",
            fontSize: "12px",
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(210px, 1fr))",
          gap: "12px",
          marginBottom: "18px",
        }}
      >
        <div className="stat-card">
          <div className="stat-icon">
            <Activity size={19} />
          </div>

          <div>
            <div className="stat-label">
              Execuções
            </div>

            <div className="stat-value">
              {statistics.total}
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <CheckCircle2 size={19} />
          </div>

          <div>
            <div className="stat-label">
              Sucesso
            </div>

            <div className="stat-value">
              {statistics.success}
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <XCircle size={19} />
          </div>

          <div>
            <div className="stat-label">
              Falhas
            </div>

            <div className="stat-value">
              {statistics.failed}
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <Clock3 size={19} />
          </div>

          <div>
            <div className="stat-label">
              Em execução
            </div>

            <div className="stat-value">
              {statistics.running}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "12px",
          marginBottom: "18px",
        }}
      >
        {[
          {
            title:
              "Mercado Livre — Sincronização",
            run: lastSync,
            cadence:
              "Executa a cada hora.",
          },
          {
            title:
              "Mercado Livre — Disponibilidade",
            run: lastAvailability,
            cadence:
              "Executa 15 minutos após cada hora.",
          },
        ].map((item) => {
          const run = item.run;

          return (
            <div
              key={item.title}
              className="page-card"
              style={{
                padding: "18px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "12px",
                }}
              >
                <div className="stat-icon">
                  <Database size={19} />
                </div>

                <div
                  style={{
                    flex: 1,
                  }}
                >
                  <strong
                    style={{
                      color: "#e8edf5",
                      fontSize: "13px",
                    }}
                  >
                    {item.title}
                  </strong>

                  <p
                    style={{
                      margin:
                        "5px 0 10px",
                      color: "#687386",
                      fontSize: "11px",
                    }}
                  >
                    {item.cadence}
                  </p>

                  {run ? (
                    <>
                      <span
                        className={`status-badge status-${getStatusClass(
                          run.status
                        )}`}
                        style={{
                          display:
                            "inline-flex",
                          alignItems:
                            "center",
                          gap: "5px",
                        }}
                      >
                        {getStatusIcon(
                          run.status
                        )}

                        {getStatusLabel(
                          run.status
                        )}
                      </span>

                      <div
                        style={{
                          display:
                            "grid",
                          gridTemplateColumns:
                            "1fr 1fr",
                          gap: "8px",
                          marginTop:
                            "12px",
                        }}
                      >
                        <div>
                          <div className="stat-label">
                            Início
                          </div>

                          <div
                            style={{
                              color:
                                "#e8edf5",
                              fontSize:
                                "11px",
                              marginTop:
                                "3px",
                            }}
                          >
                            {formatDate(
                              run.started_at
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="stat-label">
                            Duração
                          </div>

                          <div
                            style={{
                              color:
                                "#e8edf5",
                              fontSize:
                                "11px",
                              marginTop:
                                "3px",
                            }}
                          >
                            {formatDuration(
                              run.duration_ms
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <span
                      className="status-badge status-without"
                    >
                      Nenhuma execução registrada
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="page-card">
        <div
          style={{
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
            marginBottom: "16px",
          }}
        >
          <div
            className="search-box"
            style={{
              flex: 1,
              minWidth: "220px",
            }}
          >
            <Search size={17} />

            <input
              type="text"
              placeholder="Buscar automação..."
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
            />
          </div>

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value as Filter
              )
            }
          >
            <option value="all">
              Todos os status
            </option>

            <option value="succeeded">
              Sucesso
            </option>

            <option value="failed">
              Falhas
            </option>

            <option value="running">
              Em execução
            </option>
          </select>
        </div>

        {filteredRuns.length === 0 ? (
          <div className="empty-state">
            <Activity size={28} />

            <h3>
              Nenhuma execução encontrada
            </h3>

            <p>
              As próximas execuções das
              automações aparecerão aqui.
            </p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Automação</th>
                  <th>Status</th>
                  <th>Início</th>
                  <th>Duração</th>
                  <th>Produtos</th>
                  <th>Itens</th>
                  <th>Erros</th>
                  <th>Resultado</th>
                </tr>
              </thead>

              <tbody>
                {filteredRuns.map(
                  (run) => (
                    <tr key={run.id}>
                      <td>
                        <div>
                          <strong>
                            {getFunctionLabel(
                              run.function_name
                            )}
                          </strong>

                          <span
                            style={{
                              display:
                                "block",
                              marginTop:
                                "3px",
                              color:
                                "#687386",
                              fontSize:
                                "10px",
                            }}
                          >
                            {getFunctionDescription(
                              run.function_name
                            )}
                          </span>
                        </div>
                      </td>

                      <td>
                        <span
                          className={`status-badge status-${getStatusClass(
                            run.status
                          )}`}
                          style={{
                            display:
                              "inline-flex",
                            alignItems:
                              "center",
                            gap: "5px",
                          }}
                        >
                          {getStatusIcon(
                            run.status
                          )}

                          {getStatusLabel(
                            run.status
                          )}
                        </span>
                      </td>

                      <td>
                        {formatDate(
                          run.started_at
                        )}
                      </td>

                      <td>
                        {formatDuration(
                          run.duration_ms
                        )}
                      </td>

                      <td>
                        {run.products_processed ??
                          "—"}
                      </td>

                      <td>
                        {run.items_processed ??
                          "—"}
                      </td>

                      <td>
                        {run.errors_count ??
                          0}
                      </td>

                      <td>
                        {run.status ===
                        "failed" ? (
                          <span
                            style={{
                              color:
                                "#fca5a5",
                              fontSize:
                                "11px",
                              maxWidth:
                                "280px",
                              display:
                                "block",
                            }}
                          >
                            {run.error_message ||
                              "Erro não informado."}
                          </span>
                        ) : (
                          <span
                            style={{
                              color:
                                "#687386",
                              fontSize:
                                "11px",
                            }}
                          >
                            {run.metrics
                              ?.offers_created !==
                            undefined
                              ? `Ofertas criadas: ${run.metrics.offers_created}`
                              : run.metrics
                                    ?.available !==
                                  undefined
                                ? `Disponíveis: ${run.metrics.available} • Indisponíveis: ${run.metrics.unavailable ?? 0}`
                                : "Processamento concluído"}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}