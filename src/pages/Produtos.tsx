import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Package,
  Trash2,
  Power,
  ExternalLink,
  Link2,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  CircleCheck,
  CircleAlert,
  CircleX,
  Filter,
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
  availability_status:
    | "unknown"
    | "checking"
    | "available"
    | "unavailable"
    | "error";
  last_seen_at: string | null;
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
  active: boolean;
}

interface ProductRuleMatch {
  id: string;
  product_id: string;
  rule_id: string;
  search_term_id: string | null;
  status:
    | "matched"
    | "rejected"
    | "pending_affiliate"
    | "offer_created";
  reason: string | null;
  matched_at: string;
}

interface ProductView extends Product {
  rules: Rule[];
  matches: ProductRuleMatch[];
}

type StatusFilter =
  | "all"
  | "available"
  | "unavailable"
  | "affiliate"
  | "inactive";

interface ProductGroup {
  rule: Rule;
  products: ProductView[];
}

export function Produtos() {
  const [products, setProducts] =
    useState<Product[]>([]);

  const [marketplaces, setMarketplaces] =
    useState<Marketplace[]>([]);

  const [rules, setRules] =
    useState<Rule[]>([]);

  const [matches, setMatches] =
    useState<ProductRuleMatch[]>([]);

  const [search, setSearch] =
    useState("");

  const [marketplaceFilter, setMarketplaceFilter] =
    useState("all");

  const [ruleFilter, setRuleFilter] =
    useState("all");

  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("all");

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [expandedRules, setExpandedRules] =
    useState<Record<string, boolean>>({});

  async function loadData(
    showRefresh = false
  ) {
    if (showRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const [
        productsResult,
        marketplacesResult,
        rulesResult,
        matchesResult,
      ] = await Promise.all([
        supabase
          .from("products")
          .select(
            "id,title,brand,category,price,original_price,discount_percent,image_url,product_url,affiliate_url,active,marketplace_id,external_id,availability_status,last_seen_at,created_at"
          )
          .order("created_at", {
            ascending: false,
          }),

        supabase
          .from("marketplaces")
          .select(
            "id,name,slug,active"
          )
          .order("name"),

        supabase
          .from("offer_rules")
          .select(
            "id,name,category,active"
          )
          .order("created_at", {
            ascending: true,
          }),

        supabase
          .from("product_rule_matches")
          .select(
            "id,product_id,rule_id,search_term_id,status,reason,matched_at"
          )
          .order("matched_at", {
            ascending: false,
          }),
      ]);

      const firstError =
        productsResult.error ||
        marketplacesResult.error ||
        rulesResult.error ||
        matchesResult.error;

      if (firstError) {
        throw firstError;
      }

      setProducts(
        productsResult.data ?? []
      );

      setMarketplaces(
        marketplacesResult.data ?? []
      );

      setRules(
        rulesResult.data ?? []
      );

      setMatches(
        matchesResult.data ?? []
      );

      /*
       * Expande automaticamente as regras
       * que possuem produtos.
       */
      const productIds = new Set(
        (productsResult.data ?? []).map(
          (product) => product.id
        )
      );

      const activeMatchRuleIds =
        new Set(
          (matchesResult.data ?? [])
            .filter((match) =>
              productIds.has(
                match.product_id
              )
            )
            .map(
              (match) =>
                match.rule_id
            )
        );

      const initialExpanded: Record<
        string,
        boolean
      > = {};

      (rulesResult.data ?? []).forEach(
        (rule) => {
          initialExpanded[rule.id] =
            activeMatchRuleIds.has(
              rule.id
            );
        }
      );

      setExpandedRules(
        initialExpanded
      );
    } catch (err: any) {
      console.error(
        "Erro ao carregar produtos:",
        err
      );

      setError(
        err?.message ||
          "Não foi possível carregar os produtos."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function getMarketplaceName(
    id: string
  ) {
    return (
      marketplaces.find(
        (marketplace) =>
          marketplace.id === id
      )?.name ??
      "Marketplace"
    );
  }

  function getProductMatches(
    productId: string
  ) {
    return matches.filter(
      (match) =>
        match.product_id ===
        productId
    );
  }

  function getProductRules(
    productId: string
  ) {
    const productMatches =
      getProductMatches(
        productId
      );

    const ruleIds =
      new Set(
        productMatches.map(
          (match) =>
            match.rule_id
        )
      );

    return rules.filter(
      (rule) =>
        ruleIds.has(rule.id)
    );
  }

  const productViews =
    useMemo<ProductView[]>(() => {
      return products.map(
        (product) => ({
          ...product,
          matches:
            getProductMatches(
              product.id
            ),
          rules:
            getProductRules(
              product.id
            ),
        })
      );
    }, [
      products,
      matches,
      rules,
    ]);

  const filteredProducts =
    useMemo(() => {
      const normalizedSearch =
        search
          .trim()
          .toLowerCase();

      return productViews.filter(
        (product) => {
          const matchesSearch =
            !normalizedSearch ||
            product.title
              .toLowerCase()
              .includes(
                normalizedSearch
              ) ||
            product.brand
              ?.toLowerCase()
              .includes(
                normalizedSearch
              ) ||
            product.category
              ?.toLowerCase()
              .includes(
                normalizedSearch
              ) ||
            product.rules.some(
              (rule) =>
                rule.name
                  .toLowerCase()
                  .includes(
                    normalizedSearch
                  )
            );

          const matchesMarketplace =
            marketplaceFilter ===
              "all" ||
            product.marketplace_id ===
              marketplaceFilter;

          const matchesRule =
            ruleFilter === "all" ||
            product.rules.some(
              (rule) =>
                rule.id ===
                ruleFilter
            );

          const matchesStatus =
            statusFilter === "all"
              ? true
              : statusFilter ===
                "available"
              ? product.availability_status ===
                "available"
              : statusFilter ===
                "unavailable"
              ? product.availability_status ===
                "unavailable"
              : statusFilter ===
                "affiliate"
              ? Boolean(
                  product.affiliate_url
                )
              : statusFilter ===
                "inactive"
              ? !product.active
              : true;

          return (
            matchesSearch &&
            matchesMarketplace &&
            matchesRule &&
            matchesStatus
          );
        }
      );
    }, [
      productViews,
      search,
      marketplaceFilter,
      ruleFilter,
      statusFilter,
    ]);

  const groupedProducts =
    useMemo<ProductGroup[]>(() => {
      const groups: ProductGroup[] =
        [];

      const groupMap =
        new Map<
          string,
          ProductGroup
        >();

      /*
       * Primeiro agrupamos pelos vínculos
       * produto/regra.
       */
      filteredProducts.forEach(
        (product) => {
          if (
            product.rules.length ===
            0
          ) {
            return;
          }

          product.rules.forEach(
            (rule) => {
              if (
                !groupMap.has(
                  rule.id
                )
              ) {
                groupMap.set(
                  rule.id,
                  {
                    rule,
                    products: [],
                  }
                );
              }

              const group =
                groupMap.get(
                  rule.id
                )!;

              if (
                !group.products.some(
                  (item) =>
                    item.id ===
                    product.id
                )
              ) {
                group.products.push(
                  product
                );
              }
            }
          );
        }
      );

      /*
       * Produtos sem regra também ficam
       * visíveis. Isso é importante para
       * não esconder produtos antigos ou
       * importados antes da nova arquitetura.
       */
      const withoutRule =
        filteredProducts.filter(
          (product) =>
            product.rules.length ===
            0
        );

      if (
        withoutRule.length > 0
      ) {
        groupMap.set(
          "__without_rule__",
          {
            rule: {
              id: "__without_rule__",
              name: "Sem regra vinculada",
              category: null,
              active: false,
            },
            products:
              withoutRule,
          }
        );
      }

      rules.forEach((rule) => {
        const group =
          groupMap.get(
            rule.id
          );

        if (group) {
          groups.push(group);
        }
      });

      const noRuleGroup =
        groupMap.get(
          "__without_rule__"
        );

      if (noRuleGroup) {
        groups.push(
          noRuleGroup
        );
      }

      return groups;
    }, [
      filteredProducts,
      rules,
    ]);

  const totalProducts =
    filteredProducts.length;

  const availableProducts =
    filteredProducts.filter(
      (product) =>
        product.availability_status ===
        "available"
    ).length;

  const pendingAffiliate =
    filteredProducts.filter(
      (product) =>
        !product.affiliate_url
    ).length;

  const inactiveProducts =
    filteredProducts.filter(
      (product) =>
        !product.active
    ).length;

  async function toggleProduct(
    product: Product
  ) {
    setError(null);

    const { error } =
      await supabase
        .from("products")
        .update({
          active:
            !product.active,
        })
        .eq(
          "id",
          product.id
        );

    if (error) {
      console.error(error);

      setError(
        "Não foi possível alterar o status do produto."
      );

      return;
    }

    await loadData(true);
  }

  async function deleteProduct(
    product: Product
  ) {
    const confirmed =
      window.confirm(
        `Excluir o produto "${product.title}"?\n\nAs ofertas e vínculos relacionados também poderão ser afetados.`
      );

    if (!confirmed) {
      return;
    }

    setError(null);

    const { error } =
      await supabase
        .from("products")
        .delete()
        .eq(
          "id",
          product.id
        );

    if (error) {
      console.error(error);

      setError(
        `Não foi possível excluir o produto: ${error.message}`
      );

      return;
    }

    await loadData(true);
  }

  function toggleRuleGroup(
    ruleId: string
  ) {
    setExpandedRules(
      (current) => ({
        ...current,
        [ruleId]:
          !current[ruleId],
      })
    );
  }

  function formatPrice(
    value: number | null
  ) {
    if (value === null) {
      return "-";
    }

    return new Intl.NumberFormat(
      "pt-BR",
      {
        style: "currency",
        currency: "BRL",
      }
    ).format(value);
  }

  function formatDate(
    value: string | null
  ) {
    if (!value) {
      return "-";
    }

    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return "-";
    }

    return date.toLocaleString(
      "pt-BR"
    );
  }

  function availabilityLabel(
    status: Product["availability_status"]
  ) {
    switch (status) {
      case "available":
        return "Disponível";

      case "unavailable":
        return "Indisponível";

      case "checking":
        return "Verificando";

      case "error":
        return "Erro";

      default:
        return "Não verificado";
    }
  }

  function availabilityColor(
    status: Product["availability_status"]
  ) {
    switch (status) {
      case "available":
        return {
          background:
            "#132a21",
          color:
            "#6ee7b7",
        };

      case "unavailable":
        return {
          background:
            "#2a1820",
          color:
            "#fca5a5",
        };

      case "checking":
        return {
          background:
            "#172236",
          color:
            "#93c5fd",
        };

      case "error":
        return {
          background:
            "#2a2418",
          color:
            "#facc15",
        };

      default:
        return {
          background:
            "#20232b",
          color:
            "#8d98aa",
        };
    }
  }

  return (
    <div className="page">
      {/* =====================================================
          CABEÇALHO
          ===================================================== */}

      <div className="page-header">
        <div>
          <p className="eyebrow">
            CATÁLOGO
          </p>

          <h1>Produtos</h1>

          <p className="page-description">
            Produtos encontrados
            automaticamente pelas
            integrações e regras do
            Ofertix.
          </p>
        </div>

        <button
          className="text-button"
          onClick={() =>
            loadData(true)
          }
          disabled={
            refreshing
          }
          style={{
            display:
              "inline-flex",
            alignItems:
              "center",
            gap:
              "7px",
            padding:
              "8px 12px",
            border:
              "1px solid #202734",
            borderRadius:
              "8px",
          }}
        >
          <RefreshCw
            size={15}
            style={{
              animation:
                refreshing
                  ? "spin 1s linear infinite"
                  : "none",
            }}
          />

          Atualizar
        </button>
      </div>

      {error && (
        <div
          style={{
            marginBottom:
              "16px",
            padding:
              "12px 14px",
            borderRadius:
              "8px",
            background:
              "#2a1820",
            border:
              "1px solid #5a2735",
            color:
              "#fca5a5",
            fontSize:
              "12px",
          }}
        >
          {error}
        </div>
      )}

      {/* =====================================================
          RESUMO
          ===================================================== */}

      <div
        style={{
          display:
            "grid",
          gridTemplateColumns:
            "repeat(4, minmax(0, 1fr))",
          gap:
            "10px",
          marginBottom:
            "16px",
        }}
      >
        <div className="stat-card">
          <div className="stat-top">
            <div className="stat-icon">
              <Package size={19} />
            </div>
          </div>

          <div className="stat-value">
            {loading
              ? "..."
              : totalProducts}
          </div>

          <div className="stat-title">
            Produtos
          </div>

          <div className="stat-description">
            Encontrados pelas regras
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <div className="stat-icon">
              <CircleCheck
                size={19}
              />
            </div>
          </div>

          <div className="stat-value">
            {loading
              ? "..."
              : availableProducts}
          </div>

          <div className="stat-title">
            Disponíveis
          </div>

          <div className="stat-description">
            Confirmados pelo monitoramento
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <div className="stat-icon">
              <Link2 size={19} />
            </div>
          </div>

          <div className="stat-value">
            {loading
              ? "..."
              : pendingAffiliate}
          </div>

          <div className="stat-title">
            Sem afiliado
          </div>

          <div className="stat-description">
            Aguardando associação
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <div className="stat-icon">
              <Power size={19} />
            </div>
          </div>

          <div className="stat-value">
            {loading
              ? "..."
              : inactiveProducts}
          </div>

          <div className="stat-title">
            Inativos
          </div>

          <div className="stat-description">
            Fora da operação
          </div>
        </div>
      </div>

      {/* =====================================================
          FILTROS
          ===================================================== */}

      <div className="panel">
        <div
          style={{
            display:
              "flex",
            alignItems:
              "center",
            gap:
              "8px",
            marginBottom:
              "12px",
            color:
              "#aeb7c6",
            fontSize:
              "11px",
            fontWeight:
              600,
          }}
        >
          <Filter size={14} />
          Filtros
        </div>

        <div
          style={{
            display:
              "grid",
            gridTemplateColumns:
              "minmax(220px, 1.6fr) repeat(3, minmax(160px, 1fr))",
            gap:
              "10px",
          }}
        >
          {/* BUSCA */}

          <div
            style={{
              position:
                "relative",
            }}
          >
            <Search
              size={16}
              style={{
                position:
                  "absolute",
                left:
                  "12px",
                top:
                  "50%",
                transform:
                  "translateY(-50%)",
                color:
                  "#687386",
              }}
            />

            <input
              value={search}
              onChange={(
                event
              ) =>
                setSearch(
                  event.target
                    .value
                )
              }
              placeholder="Buscar produto, marca ou regra..."
              style={{
                width:
                  "100%",
                height:
                  "40px",
                padding:
                  "0 12px 0 38px",
                boxSizing:
                  "border-box",
                background:
                  "#0b0f16",
                border:
                  "1px solid #202734",
                borderRadius:
                  "8px",
                color:
                  "#e8edf5",
                outline:
                  "none",
              }}
            />
          </div>

          {/* MARKETPLACE */}

          <select
            value={
              marketplaceFilter
            }
            onChange={(
              event
            ) =>
              setMarketplaceFilter(
                event.target
                  .value
              )
            }
            style={{
              height:
                "40px",
              padding:
                "0 12px",
              background:
                "#0b0f16",
              border:
                "1px solid #202734",
              borderRadius:
                "8px",
              color:
                "#b8c0cd",
              outline:
                "none",
            }}
          >
            <option value="all">
              Todos os marketplaces
            </option>

            {marketplaces.map(
              (
                marketplace
              ) => (
                <option
                  key={
                    marketplace.id
                  }
                  value={
                    marketplace.id
                  }
                >
                  {
                    marketplace.name
                  }
                </option>
              )
            )}
          </select>

          {/* REGRA */}

          <select
            value={
              ruleFilter
            }
            onChange={(
              event
            ) =>
              setRuleFilter(
                event.target
                  .value
              )
            }
            style={{
              height:
                "40px",
              padding:
                "0 12px",
              background:
                "#0b0f16",
              border:
                "1px solid #202734",
              borderRadius:
                "8px",
              color:
                "#b8c0cd",
              outline:
                "none",
            }}
          >
            <option value="all">
              Todas as regras
            </option>

            {rules.map(
              (rule) => (
                <option
                  key={
                    rule.id
                  }
                  value={
                    rule.id
                  }
                >
                  {rule.name}
                </option>
              )
            )}
          </select>

          {/* STATUS */}

          <select
            value={
              statusFilter
            }
            onChange={(
              event
            ) =>
              setStatusFilter(
                event.target
                  .value as StatusFilter
              )
            }
            style={{
              height:
                "40px",
              padding:
                "0 12px",
              background:
                "#0b0f16",
              border:
                "1px solid #202734",
              borderRadius:
                "8px",
              color:
                "#b8c0cd",
              outline:
                "none",
            }}
          >
            <option value="all">
              Todos os status
            </option>

            <option value="available">
              Disponíveis
            </option>

            <option value="unavailable">
              Indisponíveis
            </option>

            <option value="affiliate">
              Com link de afiliado
            </option>

            <option value="inactive">
              Inativos
            </option>
          </select>
        </div>
      </div>

      {/* =====================================================
          LISTAGEM
          ===================================================== */}

      <div
        style={{
          marginTop:
            "16px",
        }}
      >
        {loading ? (
          <div className="panel">
            <div className="empty-state">
              <RefreshCw
                size={30}
                style={{
                  animation:
                    "spin 1s linear infinite",
                }}
              />

              <h3>
                Carregando produtos...
              </h3>

              <p>
                Consultando produtos,
                regras e integrações.
              </p>
            </div>
          </div>
        ) : groupedProducts.length ===
          0 ? (
          <div className="panel">
            <div className="empty-state">
              <div className="empty-icon">
                <Package size={25} />
              </div>

              <h3>
                {products.length ===
                0
                  ? "Nenhum produto encontrado"
                  : "Nenhum produto corresponde aos filtros"}
              </h3>

              <p>
                {products.length ===
                0
                  ? "Quando uma regra executar uma busca e encontrar produtos, eles aparecerão aqui."
                  : "Tente alterar os filtros utilizados."}
              </p>
            </div>
          </div>
        ) : (
          groupedProducts.map(
            (group) => {
              const isExpanded =
                expandedRules[
                  group.rule.id
                ] ?? true;

              const available =
                group.products.filter(
                  (product) =>
                    product.availability_status ===
                    "available"
                ).length;

              const affiliate =
                group.products.filter(
                  (product) =>
                    Boolean(
                      product.affiliate_url
                    )
                ).length;

              return (
                <section
                  key={
                    group.rule.id
                  }
                  className="panel"
                  style={{
                    marginBottom:
                      "12px",
                    padding:
                      "0",
                    overflow:
                      "hidden",
                  }}
                >
                  {/* CABEÇALHO DA REGRA */}

                  <button
                    type="button"
                    onClick={() =>
                      toggleRuleGroup(
                        group.rule.id
                      )
                    }
                    style={{
                      width:
                        "100%",
                      display:
                        "flex",
                      alignItems:
                        "center",
                      justifyContent:
                        "space-between",
                      gap:
                        "16px",
                      padding:
                        "16px 18px",
                      border:
                        "none",
                      background:
                        "transparent",
                      color:
                        "inherit",
                      cursor:
                        "pointer",
                      textAlign:
                        "left",
                    }}
                  >
                    <div
                      style={{
                        display:
                          "flex",
                        alignItems:
                          "center",
                        gap:
                          "11px",
                        minWidth:
                          0,
                      }}
                    >
                      {isExpanded ? (
                        <ChevronDown
                          size={17}
                        />
                      ) : (
                        <ChevronRight
                          size={17}
                        />
                      )}

                      <div
                        style={{
                          width:
                            "8px",
                          height:
                            "8px",
                          borderRadius:
                            "50%",
                          background:
                            group.rule
                              .active
                              ? "#60a5fa"
                              : "#687386",
                          flexShrink:
                            0,
                        }}
                      />

                      <div
                        style={{
                          minWidth:
                            0,
                        }}
                      >
                        <div
                          style={{
                            color:
                              "#e8edf5",
                            fontSize:
                              "13px",
                            fontWeight:
                              700,
                          }}
                        >
                          {
                            group
                              .rule
                              .name
                          }
                        </div>

                        <div
                          style={{
                            marginTop:
                              "3px",
                            color:
                              "#687386",
                            fontSize:
                              "10px",
                          }}
                        >
                          {group
                            .rule
                            .category ||
                            "Sem categoria"}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display:
                          "flex",
                        alignItems:
                          "center",
                        gap:
                          "7px",
                        flexShrink:
                          0,
                      }}
                    >
                      <span
                        style={{
                          padding:
                            "5px 8px",
                          borderRadius:
                            "20px",
                          background:
                            "#111827",
                          color:
                            "#aeb7c6",
                          fontSize:
                            "10px",
                        }}
                      >
                        {
                          group
                            .products
                            .length
                        }{" "}
                        produtos
                      </span>

                      <span
                        style={{
                          padding:
                            "5px 8px",
                          borderRadius:
                            "20px",
                          background:
                            "#132a21",
                          color:
                            "#6ee7b7",
                          fontSize:
                            "10px",
                        }}
                      >
                        {available}{" "}
                        disponíveis
                      </span>

                      <span
                        style={{
                          padding:
                            "5px 8px",
                          borderRadius:
                            "20px",
                          background:
                            affiliate >
                            0
                              ? "#16243a"
                              : "#20232b",
                          color:
                            affiliate >
                            0
                              ? "#93c5fd"
                              : "#8d98aa",
                          fontSize:
                            "10px",
                        }}
                      >
                        {affiliate}{" "}
                        afiliados
                      </span>
                    </div>
                  </button>

                  {/* PRODUTOS */}

                  {isExpanded && (
                    <div
                      style={{
                        borderTop:
                          "1px solid #202734",
                        overflowX:
                          "auto",
                      }}
                    >
                      <table
                        style={{
                          width:
                            "100%",
                          borderCollapse:
                            "collapse",
                        }}
                      >
                        <thead>
                          <tr>
                            {[
                              "Produto",
                              "Marketplace",
                              "Preço",
                              "Desconto",
                              "Disponibilidade",
                              "Afiliado",
                              "Ações",
                            ].map(
                              (
                                header
                              ) => (
                                <th
                                  key={
                                    header
                                  }
                                  style={{
                                    padding:
                                      "10px 12px",
                                    textAlign:
                                      "left",
                                    borderBottom:
                                      "1px solid #202734",
                                    color:
                                      "#687386",
                                    fontSize:
                                      "9px",
                                    fontWeight:
                                      600,
                                    textTransform:
                                      "uppercase",
                                    whiteSpace:
                                      "nowrap",
                                  }}
                                >
                                  {
                                    header
                                  }
                                </th>
                              )
                            )}
                          </tr>
                        </thead>

                        <tbody>
                          {group.products.map(
                            (
                              product
                            ) => {
                              const availabilityStyle =
                                availabilityColor(
                                  product.availability_status
                                );

                              const productMatches =
                                product.matches;

                              const hasPendingAffiliate =
                                productMatches.some(
                                  (
                                    match
                                  ) =>
                                    match.status ===
                                      "pending_affiliate"
                                );

                              return (
                                <tr
                                  key={
                                    product.id
                                  }
                                >
                                  {/* PRODUTO */}

                                  <td
                                    style={{
                                      padding:
                                        "12px",
                                      borderBottom:
                                        "1px solid #202734",
                                      minWidth:
                                        "300px",
                                    }}
                                  >
                                    <div
                                      style={{
                                        display:
                                          "flex",
                                        alignItems:
                                          "center",
                                        gap:
                                          "10px",
                                      }}
                                    >
                                      {product.image_url ? (
                                        <img
                                          src={
                                            product.image_url
                                          }
                                          alt=""
                                          loading="lazy"
                                          style={{
                                            width:
                                              "44px",
                                            height:
                                              "44px",
                                            objectFit:
                                              "contain",
                                            borderRadius:
                                              "7px",
                                            background:
                                              "#ffffff",
                                            flexShrink:
                                              0,
                                          }}
                                        />
                                      ) : (
                                        <div
                                          className="stat-icon"
                                          style={{
                                            width:
                                              "44px",
                                            height:
                                              "44px",
                                            flexShrink:
                                              0,
                                          }}
                                        >
                                          <Package
                                            size={
                                              18
                                            }
                                          />
                                        </div>
                                      )}

                                      <div
                                        style={{
                                          minWidth:
                                            0,
                                        }}
                                      >
                                        <div
                                          style={{
                                            color:
                                              "#e8edf5",
                                            fontSize:
                                              "11px",
                                            fontWeight:
                                              600,
                                            lineHeight:
                                              1.4,
                                          }}
                                        >
                                          {
                                            product.title
                                          }
                                        </div>

                                        <div
                                          style={{
                                            display:
                                              "flex",
                                            gap:
                                              "7px",
                                            marginTop:
                                              "4px",
                                            flexWrap:
                                              "wrap",
                                          }}
                                        >
                                          <span
                                            style={{
                                              color:
                                                "#687386",
                                              fontSize:
                                                "9px",
                                            }}
                                          >
                                            {product.brand ||
                                              "Sem marca"}
                                          </span>

                                          <span
                                            style={{
                                              color:
                                                "#3c4555",
                                              fontSize:
                                                "9px",
                                            }}
                                          >
                                            •
                                          </span>

                                          <span
                                            style={{
                                              color:
                                                "#687386",
                                              fontSize:
                                                "9px",
                                            }}
                                          >
                                            {product.category ||
                                              "Sem categoria"}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  </td>

                                  {/* MARKETPLACE */}

                                  <td
                                    style={{
                                      padding:
                                        "12px",
                                      borderBottom:
                                        "1px solid #202734",
                                      color:
                                        "#aeb7c5",
                                      fontSize:
                                        "10px",
                                      whiteSpace:
                                        "nowrap",
                                    }}
                                  >
                                    {
                                      getMarketplaceName(
                                        product.marketplace_id
                                      )
                                    }
                                  </td>

                                  {/* PREÇO */}

                                  <td
                                    style={{
                                      padding:
                                        "12px",
                                      borderBottom:
                                        "1px solid #202734",
                                      whiteSpace:
                                        "nowrap",
                                    }}
                                  >
                                    <strong
                                      style={{
                                        color:
                                          "#e8edf5",
                                        fontSize:
                                          "12px",
                                      }}
                                    >
                                      {formatPrice(
                                        product.price
                                      )}
                                    </strong>

                                    {product.original_price !==
                                      null &&
                                      product.original_price >
                                        (product.price ??
                                          0) && (
                                        <div
                                          style={{
                                            marginTop:
                                              "3px",
                                            color:
                                              "#687386",
                                            fontSize:
                                              "9px",
                                            textDecoration:
                                              "line-through",
                                          }}
                                        >
                                          {formatPrice(
                                            product.original_price
                                          )}
                                        </div>
                                      )}
                                  </td>

                                  {/* DESCONTO */}

                                  <td
                                    style={{
                                      padding:
                                        "12px",
                                      borderBottom:
                                        "1px solid #202734",
                                      whiteSpace:
                                        "nowrap",
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
                                          fontWeight:
                                            700,
                                        }}
                                      >
                                        {
                                          product.discount_percent
                                        }
                                        % OFF
                                      </span>
                                    ) : (
                                      <span
                                        style={{
                                          color:
                                            "#687386",
                                          fontSize:
                                            "10px",
                                        }}
                                      >
                                        -
                                      </span>
                                    )}
                                  </td>

                                  {/* DISPONIBILIDADE */}

                                  <td
                                    style={{
                                      padding:
                                        "12px",
                                      borderBottom:
                                        "1px solid #202734",
                                    }}
                                  >
                                    <span
                                      style={{
                                        display:
                                          "inline-flex",
                                        alignItems:
                                          "center",
                                        gap:
                                          "5px",
                                        padding:
                                          "5px 8px",
                                        borderRadius:
                                          "20px",
                                        background:
                                          availabilityStyle.background,
                                        color:
                                          availabilityStyle.color,
                                        fontSize:
                                          "9px",
                                        fontWeight:
                                          600,
                                        whiteSpace:
                                          "nowrap",
                                      }}
                                    >
                                      {product.availability_status ===
                                      "available" ? (
                                        <CircleCheck
                                          size={
                                            12
                                          }
                                        />
                                      ) : product.availability_status ===
                                        "unavailable" ? (
                                        <CircleX
                                          size={
                                            12
                                          }
                                        />
                                      ) : (
                                        <CircleAlert
                                          size={
                                            12
                                          }
                                        />
                                      )}

                                      {availabilityLabel(
                                        product.availability_status
                                      )}
                                    </span>

                                    <div
                                      style={{
                                        marginTop:
                                          "4px",
                                        color:
                                          "#4f596b",
                                        fontSize:
                                          "8px",
                                      }}
                                    >
                                      {formatDate(
                                        product.last_seen_at
                                      )}
                                    </div>
                                  </td>

                                  {/* AFILIADO */}

                                  <td
                                    style={{
                                      padding:
                                        "12px",
                                      borderBottom:
                                        "1px solid #202734",
                                    }}
                                  >
                                    {product.affiliate_url ? (
                                      <span
                                        style={{
                                          display:
                                            "inline-flex",
                                          alignItems:
                                            "center",
                                          gap:
                                            "5px",
                                          padding:
                                            "5px 8px",
                                          borderRadius:
                                            "20px",
                                          background:
                                            "#132a21",
                                          color:
                                            "#6ee7b7",
                                          fontSize:
                                            "9px",
                                          fontWeight:
                                            600,
                                        }}
                                      >
                                        <Link2
                                          size={
                                            11
                                          }
                                        />
                                        Pronto
                                      </span>
                                    ) : (
                                      <span
                                        style={{
                                          display:
                                            "inline-flex",
                                          alignItems:
                                            "center",
                                          gap:
                                            "5px",
                                          padding:
                                            "5px 8px",
                                          borderRadius:
                                            "20px",
                                          background:
                                            "#2a2418",
                                          color:
                                            "#facc15",
                                          fontSize:
                                            "9px",
                                          fontWeight:
                                            600,
                                        }}
                                      >
                                        <CircleAlert
                                          size={
                                            11
                                          }
                                        />
                                        Pendente
                                      </span>
                                    )}

                                    {hasPendingAffiliate && (
                                      <div
                                        style={{
                                          marginTop:
                                            "4px",
                                          color:
                                            "#facc15",
                                          fontSize:
                                            "8px",
                                        }}
                                      >
                                        Aguardando
                                        link
                                      </div>
                                    )}
                                  </td>

                                  {/* AÇÕES */}

                                  <td
                                    style={{
                                      padding:
                                        "12px",
                                      borderBottom:
                                        "1px solid #202734",
                                    }}
                                  >
                                    <div
                                      style={{
                                        display:
                                          "flex",
                                        gap:
                                          "4px",
                                      }}
                                    >
                                      {product.product_url && (
                                        <button
                                          title="Abrir produto no marketplace"
                                          className="text-button"
                                          onClick={() =>
                                            window.open(
                                              product.product_url!,
                                              "_blank",
                                              "noopener,noreferrer"
                                            )
                                          }
                                        >
                                          <ExternalLink
                                            size={
                                              15
                                            }
                                          />
                                        </button>
                                      )}

                                      <button
                                        title={
                                          product.active
                                            ? "Desativar produto"
                                            : "Ativar produto"
                                        }
                                        className="text-button"
                                        onClick={() =>
                                          toggleProduct(
                                            product
                                          )
                                        }
                                      >
                                        <Power
                                          size={
                                            15
                                          }
                                        />
                                      </button>

                                      <button
                                        title="Excluir produto"
                                        className="text-button"
                                        onClick={() =>
                                          deleteProduct(
                                            product
                                          )
                                        }
                                        style={{
                                          color:
                                            "#f87171",
                                        }}
                                      >
                                        <Trash2
                                          size={
                                            15
                                          }
                                        />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            }
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              );
            }
          )
        )}
      </div>
    </div>
  );
}