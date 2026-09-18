import { useEffect, useState } from "react";
import {
  Package,
  Tags,
  MousePointerClick,
  Send,
  TrendingUp,
  ArrowUpRight,
  ExternalLink,
} from "lucide-react";

import { supabase } from "../lib/supabase";

interface DashboardStats {
  products: number;
  offers: number;
  clicks: number;
  publications: number;
}

interface RecentProduct {
  id: string;
  title: string;
  price: number | null;
  original_price: number | null;
  discount_percent: number | null;
  image_url: string | null;
  product_url: string | null;
  active: boolean;
  marketplace_id: string;
}

interface Marketplace {
  id: string;
  name: string;
}

const initialStats: DashboardStats = {
  products: 0,
  offers: 0,
  clicks: 0,
  publications: 0,
};

export function Dashboard() {
  const [stats, setStats] =
    useState<DashboardStats>(initialStats);

  const [recentProducts, setRecentProducts] = useState<RecentProduct[]>([]);
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      setError(null);

      try {
        const [
          productsResult,
          offersResult,
          clicksResult,
          publicationsResult,
          recentProductsResult,
          marketplacesResult,
        ] = await Promise.all([
          supabase
            .from("products")
            .select("*", { count: "exact", head: true }),

          supabase
            .from("offers")
            .select("*", { count: "exact", head: true }),

          supabase
            .from("clicks")
            .select("*", { count: "exact", head: true }),

          supabase
            .from("offer_publications")
            .select("*", {
              count: "exact",
              head: true,
            }),

          supabase
            .from("products")
            .select(
              "id,title,price,original_price,discount_percent,image_url,product_url,active,marketplace_id"
            )
            .order("created_at", { ascending: false })
            .limit(6),

          supabase
            .from("marketplaces")
            .select("id,name")
            .eq("active", true),
        ]);

        const firstError =
          productsResult.error ||
          offersResult.error ||
          clicksResult.error ||
          publicationsResult.error ||
          recentProductsResult.error ||
          marketplacesResult.error;

        if (firstError) {
          throw firstError;
        }

        setStats({
          products: productsResult.count ?? 0,
          offers: offersResult.count ?? 0,
          clicks: clicksResult.count ?? 0,
          publications: publicationsResult.count ?? 0,
        });

        setRecentProducts(recentProductsResult.data ?? []);
        setMarketplaces(marketplacesResult.data ?? []);
      } catch (err) {
        console.error(
          "Erro ao carregar dashboard:",
          err
        );

        setError(
          "Não foi possível carregar os dados do dashboard."
        );
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  const statsCards = [
    {
      title: "Produtos",
      value: stats.products,
      description: "Produtos cadastrados",
      icon: Package,
    },
    {
      title: "Ofertas",
      value: stats.offers,
      description: "Ofertas cadastradas",
      icon: Tags,
    },
    {
      title: "Cliques",
      value: stats.clicks,
      description: "Cliques registrados",
      icon: MousePointerClick,
    },
    {
      title: "Publicações",
      value: stats.publications,
      description: "Publicações registradas",
      icon: Send,
    },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">VISÃO GERAL</p>

          <h1>Dashboard</h1>

          <p className="page-description">
            Acompanhe suas ofertas e resultados em um só lugar.
          </p>
        </div>

        <button className="primary-button">
          <TrendingUp size={18} />
          Nova oferta
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

      <div className="stats-grid">
        {statsCards.map((stat) => {
          const Icon = stat.icon;

          return (
            <div className="stat-card" key={stat.title}>
              <div className="stat-top">
                <div className="stat-icon">
                  <Icon size={20} />
                </div>

                <ArrowUpRight
                  size={17}
                  className="stat-arrow"
                />
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

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Produtos recentes</h2>
              <p>Últimos produtos sincronizados dos marketplaces.</p>
            </div>

            <button
              className="text-button"
              onClick={() => {
                window.location.href = "/produtos";
              }}
            >
              Ver todos
            </button>
          </div>

          {loading ? (
            <div className="empty-state">
              <Package size={30} />
              <h3>Carregando produtos...</h3>
            </div>
          ) : recentProducts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <Package size={25} />
              </div>
              <h3>Nenhum produto sincronizado</h3>
              <p>
                Quando os produtos forem importados dos marketplaces,
                eles aparecerão aqui.
              </p>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: "12px",
              }}
            >
              {recentProducts.map((product) => {
                const marketplace =
                  marketplaces.find(
                    (item) => item.id === product.marketplace_id
                  )?.name ?? "Marketplace";

                return (
                  <article
                    key={product.id}
                    style={{
                      display: "flex",
                      gap: "12px",
                      padding: "12px",
                      border: "1px solid #202734",
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
                          width: "76px",
                          height: "76px",
                          flexShrink: 0,
                          objectFit: "contain",
                          borderRadius: "8px",
                          background: "#ffffff",
                        }}
                      />
                    ) : (
                      <div
                        className="stat-icon"
                        style={{
                          width: "76px",
                          height: "76px",
                          flexShrink: 0,
                        }}
                      >
                        <Package size={24} />
                      </div>
                    )}

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          color: "#e8edf5",
                          fontSize: "12px",
                          fontWeight: 600,
                          lineHeight: 1.4,
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
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
                          alignItems: "baseline",
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
                          {product.price === null
                            ? "-"
                            : new Intl.NumberFormat("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              }).format(product.price)}
                        </strong>

                        {product.original_price !== null &&
                          product.original_price > (product.price ?? 0) && (
                            <span
                              style={{
                                color: "#687386",
                                fontSize: "10px",
                                textDecoration: "line-through",
                              }}
                            >
                              {new Intl.NumberFormat("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              }).format(product.original_price)}
                            </span>
                          )}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "8px",
                          marginTop: "7px",
                        }}
                      >
                        {product.discount_percent !== null ? (
                          <span
                            style={{
                              color: "#60a5fa",
                              fontSize: "10px",
                              fontWeight: 700,
                            }}
                          >
                            {product.discount_percent}% OFF
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
                            <ExternalLink size={14} />
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

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Desempenho</h2>

              <p>
                Resumo dos últimos períodos.
              </p>
            </div>
          </div>

          <div className="performance-empty">
            <TrendingUp size={32} />

            <span>
              Dados aparecerão após os primeiros cliques.
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}