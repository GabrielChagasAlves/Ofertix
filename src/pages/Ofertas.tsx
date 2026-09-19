import { useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  Package,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock3,
  AlertCircle,
  CalendarClock,
  Archive,
  XCircle,
} from "lucide-react";

import { supabase } from "../lib/supabase";

interface Product {
  id: string;
  title: string;
  brand: string | null;
  category: string | null;
  price: number | null;
  original_price: number | null;
  discount_percent: number | null;
  image_url: string | null;
  product_url: string | null;
  affiliate_url: string | null;
  active: boolean;
  marketplace_id: string;
  external_id: string;
  created_at: string;
}

interface Marketplace {
  id: string;
  name: string;
  slug: string;
  active: boolean;
}

interface Rule {
  id: string;
  name: string;
  category: string | null;
}

interface OfferCategory {
  id: string;
  name: string;
  slug: string;
}

interface Offer {
  id: string;
  product_id: string;
  rule_id: string | null;
  title: string;
  message: string | null;
  affiliate_url: string | null;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  created_at: string;
}

type StatusFilter =
  | "all"
  | "draft"
  | "approved"
  | "scheduled"
  | "published"
  | "failed"
  | "archived";

export function Ofertas() {
  const [products, setProducts] = useState<Product[]>([]);
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [categories, setCategories] = useState<OfferCategory[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("all");

  async function loadData() {
    setLoading(true);
    setError(null);

    const [
      productsResult,
      marketplacesResult,
      rulesResult,
      categoriesResult,
      offersResult,
    ] = await Promise.all([
      supabase
        .from("products")
        .select(
          `
            id,
            title,
            brand,
            category,
            price,
            original_price,
            discount_percent,
            image_url,
            product_url,
            affiliate_url,
            active,
            marketplace_id,
            external_id,
            created_at
          `
        )
        .order("created_at", {
          ascending: false,
        }),

      supabase
        .from("marketplaces")
        .select("id, name, slug, active")
        .order("name"),

      supabase
        .from("offer_rules")
        .select("id, name, category")
        .order("name"),

      supabase
        .from("offer_categories")
        .select("id, name, slug")
        .order("name"),

      supabase
        .from("offers")
        .select(
          `
            id,
            product_id,
            rule_id,
            title,
            message,
            affiliate_url,
            status,
            scheduled_at,
            published_at,
            created_at
          `
        )
        .order("created_at", {
          ascending: false,
        }),
    ]);

    if (productsResult.error) {
      console.error(
        "Erro ao carregar produtos:",
        productsResult.error
      );
      setError("Não foi possível carregar os produtos.");
    }

    if (marketplacesResult.error) {
      console.error(
        "Erro ao carregar marketplaces:",
        marketplacesResult.error
      );
    }

    if (rulesResult.error) {
      console.error(
        "Erro ao carregar regras:",
        rulesResult.error
      );
    }

    if (categoriesResult.error) {
      console.error(
        "Erro ao carregar categorias:",
        categoriesResult.error
      );
    }

    if (offersResult.error) {
      console.error(
        "Erro ao carregar ofertas:",
        offersResult.error
      );
      setError("Não foi possível carregar as ofertas.");
    }

    setProducts(productsResult.data ?? []);
    setMarketplaces(marketplacesResult.data ?? []);
    setRules(rulesResult.data ?? []);
    setCategories(categoriesResult.data ?? []);
    setOffers(offersResult.data ?? []);

    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  function formatPrice(value: number | null) {
    if (value === null || value === undefined) {
      return "-";
    }

    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  }

  function formatDate(value: string | null) {
    if (!value) {
      return "-";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "-";
    }

    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);
  }

  function getProduct(productId: string) {
    return products.find(
      (product) => product.id === productId
    );
  }

  function getMarketplaceName(marketplaceId: string) {
    return (
      marketplaces.find(
        (marketplace) => marketplace.id === marketplaceId
      )?.name ?? "Marketplace"
    );
  }

  function getRuleName(ruleId: string | null) {
    if (!ruleId) {
      return "Sem regra";
    }

    return (
      rules.find((rule) => rule.id === ruleId)?.name ??
      "Regra não encontrada"
    );
  }

  function getCategoryName(product: Product | undefined) {
    if (!product) {
      return "-";
    }

    const directCategory = categories.find(
      (category) =>
        category.name.toLowerCase() ===
        (product.category ?? "").toLowerCase()
    );

    if (directCategory) {
      return directCategory.name;
    }

    const rule = rules.find(
      (item) => item.id === offers.find(
        (offer) => offer.product_id === product.id
      )?.rule_id
    );

    if (rule?.category) {
      return rule.category;
    }

    return product.category || "-";
  }

  function getStatusLabel(status: string) {
    switch (status) {
      case "draft":
        return "Aguardando aprovação";

      case "approved":
        return "Aprovada";

      case "scheduled":
        return "Agendada";

      case "published":
        return "Publicada";

      case "failed":
        return "Falhou";

      case "archived":
        return "Arquivada";

      default:
        return status;
    }
  }

  function getStatusClass(status: string) {
    switch (status) {
      case "draft":
        return "warning";

      case "approved":
        return "success";

      case "scheduled":
        return "info";

      case "published":
        return "success";

      case "failed":
        return "danger";

      case "archived":
        return "muted";

      default:
        return "muted";
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case "draft":
        return <Clock3 size={13} />;

      case "approved":
        return <CheckCircle2 size={13} />;

      case "scheduled":
        return <CalendarClock size={13} />;

      case "published":
        return <CheckCircle2 size={13} />;

      case "failed":
        return <XCircle size={13} />;

      case "archived":
        return <Archive size={13} />;

      default:
        return <AlertCircle size={13} />;
    }
  }

  const filteredOffers = useMemo(() => {
    const normalizedSearch = search
      .trim()
      .toLowerCase();

    return offers.filter((offer) => {
      const product = getProduct(offer.product_id);

      const matchesStatus =
        statusFilter === "all" ||
        offer.status === statusFilter;

      if (!matchesStatus) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return (
        offer.title
          .toLowerCase()
          .includes(normalizedSearch) ||
        product?.title
          .toLowerCase()
          .includes(normalizedSearch) ||
        product?.brand
          ?.toLowerCase()
          .includes(normalizedSearch)
      );
    });
  }, [offers, products, search, statusFilter]);

  const statistics = useMemo(() => {
    return {
      total: offers.length,

      pending: offers.filter(
        (offer) => offer.status === "draft"
      ).length,

      approved: offers.filter(
        (offer) => offer.status === "approved"
      ).length,

      scheduled: offers.filter(
        (offer) => offer.status === "scheduled"
      ).length,

      published: offers.filter(
        (offer) => offer.status === "published"
      ).length,

      failed: offers.filter(
        (offer) => offer.status === "failed"
      ).length,
    };
  }, [offers]);

  function clearMessages() {
    setError(null);
    setSuccess(null);
  }

  async function refresh() {
    clearMessages();

    await loadData();

    setSuccess("Ofertas atualizadas.");
  }

  if (loading) {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <p className="eyebrow">OFERTAS</p>

            <h1>Ofertas</h1>

            <p className="page-description">
              Acompanhe as ofertas geradas automaticamente
              pelo Ofertix.
            </p>
          </div>
        </div>

        <div className="panel">
          <div className="empty-state">
            <RefreshCw size={30} />

            <h3>Carregando ofertas...</h3>

            <p>
              Buscando as ofertas já processadas pelo
              sistema.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">OFERTAS</p>

          <h1>Ofertas</h1>

          <p className="page-description">
            Acompanhe as ofertas geradas automaticamente
            pelo Ofertix.
          </p>
        </div>

        <button
          className="text-button"
          onClick={refresh}
          title="Atualizar ofertas"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "7px",
            padding: "8px 12px",
            border: "1px solid #202734",
            borderRadius: "8px",
          }}
        >
          <RefreshCw size={15} />

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

      {success && (
        <div
          style={{
            marginBottom: "16px",
            padding: "12px 14px",
            borderRadius: "8px",
            background: "#132a21",
            border: "1px solid #24553f",
            color: "#6ee7b7",
            fontSize: "12px",
          }}
        >
          {success}
        </div>
      )}

      {/* ESTATÍSTICAS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "12px",
          marginBottom: "18px",
        }}
      >
        <div className="stat-card">
          <div className="stat-icon">
            <Package size={19} />
          </div>

          <div>
            <div className="stat-label">Total</div>

            <div className="stat-value">
              {statistics.total}
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <Clock3 size={19} />
          </div>

          <div>
            <div className="stat-label">
              Aguardando aprovação
            </div>

            <div className="stat-value">
              {statistics.pending}
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <CheckCircle2 size={19} />
          </div>

          <div>
            <div className="stat-label">Aprovadas</div>

            <div className="stat-value">
              {statistics.approved}
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <CalendarClock size={19} />
          </div>

          <div>
            <div className="stat-label">Agendadas</div>

            <div className="stat-value">
              {statistics.scheduled}
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <CheckCircle2 size={19} />
          </div>

          <div>
            <div className="stat-label">Publicadas</div>

            <div className="stat-value">
              {statistics.published}
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        {/* FILTROS */}
        <div
          style={{
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
            alignItems: "center",
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
            <Search size={15} />

            <input
              type="text"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Buscar oferta ou produto..."
            />
          </div>

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value as StatusFilter
              )
            }
            style={{
              minWidth: "190px",
              height: "38px",
              padding: "0 11px",
              borderRadius: "8px",
              border: "1px solid #202734",
              background: "#0b0f16",
              color: "#e8edf5",
              fontSize: "12px",
              outline: "none",
            }}
          >
            <option value="all">Todos os status</option>
            <option value="draft">
              Aguardando aprovação
            </option>
            <option value="approved">Aprovadas</option>
            <option value="scheduled">Agendadas</option>
            <option value="published">Publicadas</option>
            <option value="failed">Falhas</option>
            <option value="archived">Arquivadas</option>
          </select>
        </div>

        {/* LISTAGEM */}
        {filteredOffers.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <Package size={25} />
            </div>

            <h3>
              {offers.length === 0
                ? "Nenhuma oferta gerada"
                : "Nenhuma oferta encontrada"}
            </h3>

            <p>
              {offers.length === 0
                ? "As ofertas aparecerão aqui automaticamente depois que um produto receber um link oficial de afiliado."
                : "Tente alterar os filtros ou o termo de busca."}
            </p>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            {filteredOffers.map((offer) => {
              const product = getProduct(
                offer.product_id
              );

              if (!product) {
                return null;
              }

              const marketplaceName =
                getMarketplaceName(
                  product.marketplace_id
                );

              const statusClass =
                getStatusClass(offer.status);

              const categoryName =
                getCategoryName(product);

              return (
                <div
                  key={offer.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "14px",
                    padding: "14px",
                    border: "1px solid #202734",
                    borderRadius: "10px",
                    background: "#0b0f16",
                  }}
                >
                  {/* IMAGEM */}
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt=""
                      style={{
                        width: "68px",
                        height: "68px",
                        objectFit: "cover",
                        borderRadius: "8px",
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <div
                      className="stat-icon"
                      style={{
                        width: "68px",
                        height: "68px",
                        flexShrink: 0,
                      }}
                    >
                      <Package size={22} />
                    </div>
                  )}

                  {/* INFORMAÇÕES */}
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        flexWrap: "wrap",
                        marginBottom: "5px",
                      }}
                    >
                      <span
                        style={{
                          color: "#e8edf5",
                          fontSize: "13px",
                          fontWeight: 600,
                          lineHeight: 1.4,
                        }}
                      >
                        {offer.title}
                      </span>

                      <span
                        className={`status-badge status-${statusClass}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        {getStatusIcon(offer.status)}

                        {getStatusLabel(
                          offer.status
                        )}
                      </span>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          color: "#687386",
                          fontSize: "10px",
                        }}
                      >
                        {marketplaceName}
                      </span>

                      <span
                        style={{
                          color: "#384150",
                          fontSize: "10px",
                        }}
                      >
                        •
                      </span>

                      <span
                        style={{
                          color: "#687386",
                          fontSize: "10px",
                        }}
                      >
                        {categoryName}
                      </span>

                      <span
                        style={{
                          color: "#384150",
                          fontSize: "10px",
                        }}
                      >
                        •
                      </span>

                      <span
                        style={{
                          color: "#687386",
                          fontSize: "10px",
                        }}
                      >
                        Regra:{" "}
                        {getRuleName(
                          offer.rule_id
                        )}
                      </span>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        flexWrap: "wrap",
                        marginTop: "8px",
                      }}
                    >
                      <span
                        style={{
                          color: "#e8edf5",
                          fontSize: "12px",
                          fontWeight: 600,
                        }}
                      >
                        {formatPrice(product.price)}
                      </span>

                      {product.original_price &&
                        product.original_price >
                          (product.price ?? 0) && (
                          <span
                            style={{
                              color: "#687386",
                              fontSize: "10px",
                              textDecoration:
                                "line-through",
                            }}
                          >
                            {formatPrice(
                              product.original_price
                            )}
                          </span>
                        )}

                      {product.discount_percent &&
                        product.discount_percent > 0 && (
                          <span
                            style={{
                              padding: "3px 7px",
                              borderRadius: "20px",
                              background: "#16243a",
                              color: "#60a5fa",
                              fontSize: "10px",
                              fontWeight: 600,
                            }}
                          >
                            {product.discount_percent}% OFF
                          </span>
                        )}

                      <span
                        style={{
                          color: "#687386",
                          fontSize: "10px",
                        }}
                      >
                        Criada em{" "}
                        {formatDate(
                          offer.created_at
                        )}
                      </span>
                    </div>
                  </div>

                  {/* AÇÕES */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "7px",
                      flexShrink: 0,
                    }}
                  >
                    {product.product_url && (
                      <button
                        className="text-button"
                        title="Abrir produto no marketplace"
                        onClick={() =>
                          window.open(
                            product.product_url!,
                            "_blank"
                          )
                        }
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                        }}
                      >
                        <ExternalLink size={15} />

                        Produto
                      </button>
                    )}

                    {offer.affiliate_url && (
                      <button
                        className="primary-button"
                        title="Abrir link de afiliado"
                        onClick={() =>
                          window.open(
                            offer.affiliate_url!,
                            "_blank"
                          )
                        }
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                        }}
                      >
                        <ExternalLink size={14} />

                        Afiliado
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}