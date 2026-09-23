import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Link2,
  Package,
  PlayCircle,
  RefreshCw,
  Send,
  Settings2,
  Tags,
  TrendingUp,
  XCircle,
} from "lucide-react";

import { supabase } from "../lib/supabase";

interface Product {
  id: string;
  title: string;
  price: number | null;
  original_price: number | null;
  discount_percent: number | null;
  image_url: string | null;
  product_url: string | null;
  active: boolean;
  marketplace_id: string;
  created_at: string;
}

interface Marketplace {
  id: string;
  name: string;
}

interface OfferRule {
  id: string;
  name: string;
  category: string | null;
  active: boolean;
  marketplace_id: string | null;
}

interface AutomationRun {
  id: string;
  function_name: string;
  status: "running" | "succeeded" | "failed";
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  products_processed: number | null;
  products_created: number | null;
  products_updated: number | null;
  items_processed: number | null;
  errors_count: number | null;
  metrics: Record<string, unknown> | null;
  error_message: string | null;
}

interface DashboardCounts {
  products: number;
  pendingAffiliate: number;
  pendingApproval: number;
  publicationQueue: number;
}

interface RuleProductCount {
  ruleId: string;
  count: number;
}

const initialCounts: DashboardCounts = {
  products: 0,
  pendingAffiliate: 0,
  pendingApproval: 0,
  publicationQueue: 0,
};

function formatCurrency(value: number | null) {
  if (value === null) return "-";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatRelativeDate(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  const now = new Date();

  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;

  const hours = Math.floor(minutes / 60);

  if (hours < 24) return `há ${hours}h`;

  const days = Math.floor(hours / 24);

  return `há ${days}d`;
}

function getFunctionLabel(functionName: string) {
  if (functionName === "mercado-livre-sync") {
    return "Mercado Livre Sync";
  }

  if (functionName === "mercado-livre-availability") {
    return "Disponibilidade";
  }

  return functionName;
}

function getStatusLabel(status: AutomationRun["status"]) {
  if (status === "succeeded") return "Concluído";
  if (status === "failed") return "Falhou";
  return "Executando";
}

function getNextRunText() {
  const now = new Date();

  const nextHour = new Date(now);
  nextHour.setMinutes(0, 0, 0);

  if (now.getMinutes() >= 15) {
    nextHour.setHours(nextHour.getHours() + 1);
  }

  const syncTime = nextHour;

  const availabilityTime = new Date(syncTime);
  availabilityTime.setMinutes(15);

  const diffSync = Math.max(
    0,
    Math.round((syncTime.getTime() - now.getTime()) / 60000)
  );

  const diffAvailability = Math.max(
    0,
    Math.round(
      (availabilityTime.getTime() - now.getTime()) / 60000
    )
  );

  if (diffSync <= diffAvailability) {
    if (diffSync === 0) return "Sincronização agora";
    if (diffSync === 1) return "Sincronização em 1 min";
    return `Sincronização em ${diffSync} min`;
  }

  if (diffAvailability === 0) {
    return "Disponibilidade agora";
  }

  if (diffAvailability === 1) {
    return "Disponibilidade em 1 min";
  }

  return `Disponibilidade em ${diffAvailability} min`;
}

export function Dashboard() {
  const [counts, setCounts] =
    useState<DashboardCounts>(initialCounts);

  const [products, setProducts] = useState<Product[]>([]);
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]);
  const [rules, setRules] = useState<OfferRule[]>([]);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [ruleCounts, setRuleCounts] = useState<RuleProductCount[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadDashboard(showRefresh = false) {
    if (showRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const [
        productsResult,
        pendingAffiliateResult,
        pendingApprovalResult,
        publicationQueueResult,
        recentProductsResult,
        marketplacesResult,
        rulesResult,
        runsResult,
        matchesResult,
      ] = await Promise.all([
        supabase
          .from("products")
          .select("*", { count: "exact", head: true }),

        supabase
          .from("product_rule_matches")
          .select("*", {
            count: "exact",
            head: true,
          })
          .eq("status", "pending_affiliate"),

        supabase
          .from("offers")
          .select("*", {
            count: "exact",
            head: true,
          })
          .eq("status", "draft")
          .not("affiliate_url", "is", null),

        supabase
          .from("offers")
          .select("*", {
            count: "exact",
            head: true,
          })
          .in("status", ["approved", "scheduled"]),

        supabase
          .from("products")
          .select(
            "id,title,price,original_price,discount_percent,image_url,product_url,active,marketplace_id,created_at"
          )
          .order("created_at", { ascending: false })
          .limit(6),

        supabase
          .from("marketplaces")
          .select("id,name")
          .eq("active", true)
          .order("name"),

        supabase
          .from("offer_rules")
          .select(
            "id,name,category,active,marketplace_id"
          )
          .eq("active", true)
          .order("created_at", {
            ascending: true,
          }),

        supabase
          .from("automation_runs")
          .select(
            "id,function_name,status,started_at,finished_at,duration_ms,products_processed,products_created,products_updated,items_processed,errors_count,metrics,error_message"
          )
          .order("started_at", {
            ascending: false,
          })
          .limit(8),

        supabase
          .from("product_rule_matches")
          .select("rule_id,product_id")
          .eq("status", "matched"),
      ]);

      const results = [
        productsResult,
        pendingAffiliateResult,
        pendingApprovalResult,
        publicationQueueResult,
        recentProductsResult,
        marketplacesResult,
        rulesResult,
        runsResult,
        matchesResult,
      ];

      const firstError = results.find(
        (result) => result.error
      )?.error;

      if (firstError) {
        throw firstError;
      }

      setCounts({
        products: productsResult.count ?? 0,
        pendingAffiliate:
          pendingAffiliateResult.count ?? 0,
        pendingApproval:
          pendingApprovalResult.count ?? 0,
        publicationQueue:
          publicationQueueResult.count ?? 0,
      });

      setProducts(
        (recentProductsResult.data ??
          []) as Product[]
      );

      setMarketplaces(
        (marketplacesResult.data ??
          []) as Marketplace[]
      );

      setRules(
        (rulesResult.data ?? []) as OfferRule[]
      );

      setRuns(
        (runsResult.data ??
          []) as AutomationRun[]
      );

      const groupedMatches = new Map<string, Set<string>>();

      for (const match of matchesResult.data ?? []) {
        if (!groupedMatches.has(match.rule_id)) {
          groupedMatches.set(
            match.rule_id,
            new Set<string>()
          );
        }

        groupedMatches
          .get(match.rule_id)!
          .add(match.product_id);
      }

      setRuleCounts(
        Array.from(groupedMatches.entries()).map(
          ([ruleId, productIds]) => ({
            ruleId,
            count: productIds.size,
          })
        )
      );
    } catch (err) {
      console.error(
        "Erro ao carregar dashboard:",
        err
      );

      setError(
        "Não foi possível carregar todos os dados do dashboard."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  const latestSync = useMemo(() => {
    return runs.find(
      (run) =>
        run.function_name ===
        "mercado-livre-sync"
    );
  }, [runs]);

  const latestAvailability = useMemo(() => {
    return runs.find(
      (run) =>
        run.function_name ===
        "mercado-livre-availability"
    );
  }, [runs]);

  const automationOperational =
    latestSync?.status === "succeeded";

  const latestSyncMetrics =
    latestSync?.metrics ?? {};

  const catalogFound =
    typeof latestSyncMetrics.catalog_found ===
    "number"
      ? latestSyncMetrics.catalog_found
      : null;

  const productsCreated =
    latestSync?.products_created ?? null;

  const ruleProductCount = (ruleId: string) => {
    return (
      ruleCounts.find(
        (item) => item.ruleId === ruleId
      )?.count ?? 0
    );
  };

  const statsCards = [
    {
      title: "Produtos encontrados",
      value: counts.products,
      description:
        "Produtos disponíveis no catálogo do Ofertix.",
      icon: Package,
    },
    {
      title: "Links pendentes",
      value: counts.pendingAffiliate,
      description:
        "Produtos aguardando associação de afiliado.",
      icon: Link2,
    },
    {
      title: "Aprovação pendente",
      value: counts.pendingApproval,
      description:
        "Ofertas com link aguardando aprovação.",
      icon: AlertCircle,
    },
    {
      title: "Fila de publicação",
      value: counts.publicationQueue,
      description:
        "Ofertas aprovadas aguardando publicação.",
      icon: Send,
    },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">
            CENTRAL DE OPERAÇÃO
          </p>

          <h1>Dashboard</h1>

          <p className="page-description">
            Acompanhe o funcionamento do Ofertix e o
            fluxo automático de ofertas.
          </p>
        </div>

        <button
          className="secondary-button"
          onClick={() => loadDashboard(true)}
          disabled={refreshing}
        >
          <RefreshCw
            size={16}
            className={
              refreshing
                ? "spin"
                : undefined
            }
          />

          {refreshing
            ? "Atualizando..."
            : "Atualizar"}
        </button>
      </div>

      {error && (
        <div
          style={{
            marginBottom: "18px",
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

      {/* STATUS DA AUTOMAÇÃO */}
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Status da automação</h2>

            <p>
              Monitoramento das rotinas automáticas
              do Ofertix.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "7px",
              color: automationOperational
                ? "#86efac"
                : "#fbbf24",
              fontSize: "12px",
              fontWeight: 700,
            }}
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background:
                  automationOperational
                    ? "#4ade80"
                    : "#fbbf24",
                boxShadow:
                  automationOperational
                    ? "0 0 10px rgba(74,222,128,.45)"
                    : "0 0 10px rgba(251,191,36,.35)",
              }}
            />

            {loading
              ? "Verificando..."
              : automationOperational
              ? "Mercado Livre operando"
              : "Verificar automação"}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(3, minmax(0, 1fr))",
            gap: "12px",
          }}
        >
          <div className="dashboard-info-card">
            <div className="dashboard-info-icon">
              <RefreshCw size={17} />
            </div>

            <div>
              <div className="dashboard-info-label">
                Última sincronização
              </div>

              <div className="dashboard-info-value">
                {loading
                  ? "..."
                  : latestSync
                  ? formatRelativeDate(
                      latestSync.started_at
                    )
                  : "Nenhuma execução"}
              </div>

              {latestSync && (
                <div className="dashboard-info-description">
                  {formatDate(
                    latestSync.started_at
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="dashboard-info-card">
            <div className="dashboard-info-icon">
              <Activity size={17} />
            </div>

            <div>
              <div className="dashboard-info-label">
                Última disponibilidade
              </div>

              <div className="dashboard-info-value">
                {loading
                  ? "..."
                  : latestAvailability
                  ? formatRelativeDate(
                      latestAvailability.started_at
                    )
                  : "Nenhuma execução"}
              </div>

              {latestAvailability && (
                <div className="dashboard-info-description">
                  {formatDate(
                    latestAvailability.started_at
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="dashboard-info-card">
            <div className="dashboard-info-icon">
              <Clock3 size={17} />
            </div>

            <div>
              <div className="dashboard-info-label">
                Próxima execução
              </div>

              <div className="dashboard-info-value">
                {getNextRunText()}
              </div>

              <div className="dashboard-info-description">
                Sync e verificação automática
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CARDS OPERACIONAIS */}
      <div
        className="stats-grid"
        style={{ marginTop: "18px" }}
      >
        {statsCards.map((stat) => {
          const Icon = stat.icon;

          return (
            <div
              className="stat-card"
              key={stat.title}
            >
              <div className="stat-top">
                <div className="stat-icon">
                  <Icon size={20} />
                </div>

                <ArrowIcon />
              </div>

              <div className="stat-value">
                {loading ? "..." : stat.value}
              </div>

              <div className="stat-title">
                {stat.title}
              </div>

              <div className="stat-description">
                {stat.description}
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="dashboard-grid"
        style={{ marginTop: "18px" }}
      >
        {/* REGRAS */}
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Regras em execução</h2>

              <p>
                As regras definem o que o Ofertix deve
                procurar e como tratar as ofertas.
              </p>
            </div>

            <button
              className="text-button"
              onClick={() => {
                window.location.href =
                  "/regras";
              }}
            >
              Configurar
            </button>
          </div>

          {loading ? (
            <div className="empty-state">
              <Settings2 size={28} />
              <h3>Carregando regras...</h3>
            </div>
          ) : rules.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <Tags size={25} />
              </div>

              <h3>Nenhuma regra ativa</h3>

              <p>
                Crie uma regra para definir quais
                produtos devem ser encontrados.
              </p>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent:
                      "space-between",
                    gap: "12px",
                    padding: "12px",
                    border:
                      "1px solid #202734",
                    borderRadius: "10px",
                    background: "#0b0f16",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      minWidth: 0,
                    }}
                  >
                    <div className="stat-icon">
                      <Tags size={17} />
                    </div>

                    <div
                      style={{
                        minWidth: 0,
                      }}
                    >
                      <div
                        style={{
                          color: "#e8edf5",
                          fontSize: "12px",
                          fontWeight: 700,
                        }}
                      >
                        {rule.name}
                      </div>

                      <div
                        style={{
                          marginTop: "3px",
                          color: "#687386",
                          fontSize: "10px",
                        }}
                      >
                        {rule.category ||
                          "Categoria não definida"}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        color: "#687386",
                        fontSize: "10px",
                      }}
                    >
                      {ruleProductCount(
                        rule.id
                      )}{" "}
                      produtos
                    </span>

                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                        color: "#86efac",
                        fontSize: "10px",
                        fontWeight: 700,
                      }}
                    >
                      <CheckCircle2
                        size={12}
                      />
                      Ativa
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ATENÇÃO */}
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Atenção</h2>

              <p>
                Itens que precisam de intervenção.
              </p>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <AttentionCard
              icon={<Link2 size={18} />}
              title="Links de afiliado"
              value={counts.pendingAffiliate}
              description="produtos aguardando link"
              path="/links-afiliado"
            />

            <AttentionCard
              icon={<AlertCircle size={18} />}
              title="Aprovação"
              value={counts.pendingApproval}
              description="ofertas aguardando aprovação"
              path="/ofertas"
            />

            <AttentionCard
              icon={<Send size={18} />}
              title="Publicação"
              value={counts.publicationQueue}
              description="ofertas prontas para publicação"
              path="/publicacoes"
            />
          </div>
        </section>
      </div>

      {/* ÚLTIMAS EXECUÇÕES */}
      <section
        className="panel"
        style={{ marginTop: "18px" }}
      >
        <div className="panel-header">
          <div>
            <h2>Últimas execuções</h2>

            <p>
              Histórico recente das automações do
              Ofertix.
            </p>
          </div>

          <button
            className="text-button"
            onClick={() => {
              window.location.href =
                "/execucoes";
            }}
          >
            Ver histórico
          </button>
        </div>

        {loading ? (
          <div className="empty-state">
            <PlayCircle size={28} />
            <h3>Carregando execuções...</h3>
          </div>
        ) : runs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <PlayCircle size={25} />
            </div>

            <h3>Nenhuma execução registrada</h3>

            <p>
              As execuções automáticas aparecerão
              aqui depois que o scheduler rodar.
            </p>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
            }}
          >
            {runs.slice(0, 6).map((run) => {
              const statusIcon =
                run.status === "succeeded" ? (
                  <CheckCircle2
                    size={16}
                  />
                ) : run.status ===
                  "failed" ? (
                  <XCircle size={16} />
                ) : (
                  <RefreshCw
                    size={16}
                    className="spin"
                  />
                );

              const statusColor =
                run.status === "succeeded"
                  ? "#86efac"
                  : run.status === "failed"
                  ? "#fca5a5"
                  : "#fbbf24";

              return (
                <div
                  key={run.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "minmax(180px, 1fr) 130px 150px 120px",
                    alignItems: "center",
                    gap: "12px",
                    padding: "12px 0",
                    borderBottom:
                      "1px solid #202734",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    <div className="stat-icon">
                      {statusIcon}
                    </div>

                    <div>
                      <div
                        style={{
                          color: "#e8edf5",
                          fontSize: "12px",
                          fontWeight: 700,
                        }}
                      >
                        {getFunctionLabel(
                          run.function_name
                        )}
                      </div>

                      <div
                        style={{
                          marginTop: "3px",
                          color: "#687386",
                          fontSize: "10px",
                        }}
                      >
                        {formatDate(
                          run.started_at
                        )}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      color: "#9aa4b5",
                      fontSize: "11px",
                    }}
                  >
                    {run.products_processed ??
                      0}{" "}
                    produtos
                  </div>

                  <div
                    style={{
                      color: "#9aa4b5",
                      fontSize: "11px",
                    }}
                  >
                    {run.items_processed ??
                      0}{" "}
                    itens
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                      color: statusColor,
                      fontSize: "10px",
                      fontWeight: 700,
                    }}
                  >
                    {getStatusLabel(
                      run.status
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* PRODUTOS RECENTES */}
      <section
        className="panel"
        style={{ marginTop: "18px" }}
      >
        <div className="panel-header">
          <div>
            <h2>Produtos recentes</h2>

            <p>
              Últimos produtos encontrados nas
              integrações.
            </p>
          </div>

          <button
            className="text-button"
            onClick={() => {
              window.location.href =
                "/produtos";
            }}
          >
            Ver todos
          </button>
        </div>

        {loading ? (
          <div className="empty-state">
            <Package size={28} />
            <h3>Carregando produtos...</h3>
          </div>
        ) : products.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <Package size={25} />
            </div>

            <h3>Nenhum produto sincronizado</h3>

            <p>
              Quando o Mercado Livre encontrar
              produtos pelas regras ativas, eles
              aparecerão aqui.
            </p>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(2, minmax(0, 1fr))",
              gap: "12px",
            }}
          >
            {products.map((product) => {
              const marketplace =
                marketplaces.find(
                  (item) =>
                    item.id ===
                    product.marketplace_id
                )?.name ??
                "Marketplace";

              return (
                <article
                  key={product.id}
                  style={{
                    display: "flex",
                    gap: "12px",
                    padding: "12px",
                    border:
                      "1px solid #202734",
                    borderRadius: "10px",
                    background: "#0b0f16",
                    minWidth: 0,
                  }}
                >
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.title}
                      loading="lazy"
                      style={{
                        width: "72px",
                        height: "72px",
                        flexShrink: 0,
                        objectFit: "contain",
                        borderRadius: "8px",
                        background: "#fff",
                      }}
                    />
                  ) : (
                    <div
                      className="stat-icon"
                      style={{
                        width: "72px",
                        height: "72px",
                        flexShrink: 0,
                      }}
                    >
                      <Package size={23} />
                    </div>
                  )}

                  <div
                    style={{
                      minWidth: 0,
                      flex: 1,
                    }}
                  >
                    <div
                      style={{
                        color: "#e8edf5",
                        fontSize: "12px",
                        fontWeight: 600,
                        lineHeight: 1.4,
                        display:
                          "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient:
                          "vertical",
                        overflow: "hidden",
                      }}
                      title={product.title}
                    >
                      {product.title}
                    </div>

                    <div
                      style={{
                        marginTop: "5px",
                        color: "#687386",
                        fontSize: "10px",
                      }}
                    >
                      {marketplace}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems:
                          "baseline",
                        gap: "7px",
                        marginTop: "7px",
                      }}
                    >
                      <strong
                        style={{
                          color: "#e8edf5",
                          fontSize: "15px",
                        }}
                      >
                        {formatCurrency(
                          product.price
                        )}
                      </strong>

                      {product.original_price !==
                        null &&
                        product.original_price >
                          (product.price ??
                            0) && (
                          <span
                            style={{
                              color:
                                "#687386",
                              fontSize:
                                "10px",
                              textDecoration:
                                "line-through",
                            }}
                          >
                            {formatCurrency(
                              product.original_price
                            )}
                          </span>
                        )}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems:
                          "center",
                        justifyContent:
                          "space-between",
                        marginTop: "7px",
                      }}
                    >
                      {product.discount_percent !==
                      null ? (
                        <span
                          style={{
                            color:
                              "#60a5fa",
                            fontSize:
                              "10px",
                            fontWeight: 700,
                          }}
                        >
                          {
                            product.discount_percent
                          }
                          % OFF
                        </span>
                      ) : (
                        <span />
                      )}

                      {product.product_url && (
                        <button
                          className="text-button"
                          title="Abrir produto"
                          onClick={() =>
                            window.open(
                              product.product_url!,
                              "_blank",
                              "noopener,noreferrer"
                            )
                          }
                        >
                          <ExternalLink
                            size={14}
                          />
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* INDICADORES DA ÚLTIMA SINCRONIZAÇÃO */}
      {latestSync && (
        <section
          className="panel"
          style={{ marginTop: "18px" }}
        >
          <div className="panel-header">
            <div>
              <h2>Última sincronização</h2>

              <p>
                Resumo da execução mais recente do
                Mercado Livre.
              </p>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(4, minmax(0, 1fr))",
              gap: "12px",
            }}
          >
            <MetricBox
              label="Catálogo encontrado"
              value={
                catalogFound !== null
                  ? catalogFound
                  : "-"
              }
            />

            <MetricBox
              label="Produtos criados"
              value={
                productsCreated !== null
                  ? productsCreated
                  : "-"
              }
            />

            <MetricBox
              label="Produtos atualizados"
              value={
                latestSync.products_updated ??
                "-"
              }
            />

            <MetricBox
              label="Erros"
              value={
                latestSync.errors_count ??
                0
              }
              danger={
                (latestSync.errors_count ??
                  0) > 0
              }
            />
          </div>
        </section>
      )}
    </div>
  );
}

function ArrowIcon() {
  return (
    <TrendingUp
      size={16}
      className="stat-arrow"
    />
  );
}

function AttentionCard({
  icon,
  title,
  value,
  description,
  path,
}: {
  icon: React.ReactNode;
  title: string;
  value: number;
  description: string;
  path: string;
}) {
  return (
    <button
      onClick={() => {
        window.location.href = path;
      }}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "12px",
        border: "1px solid #202734",
        borderRadius: "10px",
        background: "#0b0f16",
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      <div className="stat-icon">
        {icon}
      </div>

      <div style={{ flex: 1 }}>
        <div
          style={{
            color: "#e8edf5",
            fontSize: "12px",
            fontWeight: 700,
          }}
        >
          {title}
        </div>

        <div
          style={{
            marginTop: "3px",
            color: "#687386",
            fontSize: "10px",
          }}
        >
          {description}
        </div>
      </div>

      <strong
        style={{
          color:
            value > 0
              ? "#fbbf24"
              : "#86efac",
          fontSize: "18px",
        }}
      >
        {value}
      </strong>
    </button>
  );
}

function MetricBox({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: number | string;
  danger?: boolean;
}) {
  return (
    <div
      style={{
        padding: "13px",
        border: "1px solid #202734",
        borderRadius: "10px",
        background: "#0b0f16",
      }}
    >
      <div
        style={{
          color: "#687386",
          fontSize: "10px",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: "6px",
          color: danger
            ? "#fca5a5"
            : "#e8edf5",
          fontSize: "20px",
          fontWeight: 700,
        }}
      >
        {value}
      </div>
    </div>
  );
}