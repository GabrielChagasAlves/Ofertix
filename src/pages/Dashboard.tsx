import { useEffect, useState } from "react";
import {
  Package,
  Tags,
  MousePointerClick,
  Send,
  TrendingUp,
  ArrowUpRight,
} from "lucide-react";

import { supabase } from "../lib/supabase";

interface DashboardStats {
  products: number;
  offers: number;
  clicks: number;
  publications: number;
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
        ]);

        const firstError =
          productsResult.error ||
          offersResult.error ||
          clicksResult.error ||
          publicationsResult.error;

        if (firstError) {
          throw firstError;
        }

        setStats({
          products: productsResult.count ?? 0,
          offers: offersResult.count ?? 0,
          clicks: clicksResult.count ?? 0,
          publications: publicationsResult.count ?? 0,
        });
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
              <h2>Ofertas recentes</h2>

              <p>
                As últimas ofertas adicionadas ao Ofertix.
              </p>
            </div>

            <button className="text-button">
              Ver todas
            </button>
          </div>

          <div className="empty-state">
            <div className="empty-icon">
              <Tags size={25} />
            </div>

            <h3>Nenhuma oferta cadastrada</h3>

            <p>
              Quando você adicionar ofertas, elas
              aparecerão aqui.
            </p>

            <button className="primary-button">
              Adicionar oferta
            </button>
          </div>
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