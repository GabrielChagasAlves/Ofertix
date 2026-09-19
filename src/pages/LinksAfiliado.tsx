import { useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  Link2,
  Search,
  X,
  CheckCircle2,
  Clock3,
  AlertCircle,
} from "lucide-react";

import { supabase } from "../lib/supabase";

type Marketplace = {
  id: string;
  name: string;
  slug: string;
};

type Product = {
  id: string;
  marketplace_id: string;
  external_id: string;
  title: string;
  price: number | null;
  original_price: number | null;
  discount_percent: number | null;
  image_url: string | null;
  product_url: string | null;
  affiliate_url: string | null;
  active: boolean;
  marketplaces: Marketplace[] | null;
};

type AffiliateLink = {
  id: string;
  product_id: string;
  marketplace_id: string;
  affiliate_url: string;
  affiliate_tag: string | null;
  source: string;
  status: "pending" | "ready" | "invalid";
  validation_message: string | null;
  created_at: string;
  updated_at: string;
};

export function LinksAfiliado() {
  const [products, setProducts] = useState<Product[]>([]);
  const [affiliateLinks, setAffiliateLinks] = useState<
    AffiliateLink[]
  >([]);
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>(
    []
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [marketplaceFilter, setMarketplaceFilter] =
    useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [selectedProduct, setSelectedProduct] =
    useState<Product | null>(null);

  const [affiliateUrl, setAffiliateUrl] = useState("");
  const [affiliateTag, setAffiliateTag] = useState("");

  async function loadData() {
    setLoading(true);

    try {
      const [
        { data: productData, error: productError },
        { data: linkData, error: linkError },
        { data: marketplaceData, error: marketplaceError },
      ] = await Promise.all([
        supabase
          .from("products")
          .select(
            `
              id,
              marketplace_id,
              external_id,
              title,
              price,
              original_price,
              discount_percent,
              image_url,
              product_url,
              affiliate_url,
              active,
              marketplaces (
                id,
                name,
                slug
              )
            `
          )
          .eq("active", true)
          .order("created_at", {
            ascending: false,
          }),

        supabase
          .from("affiliate_links")
          .select("*")
          .order("created_at", {
            ascending: false,
          }),

        supabase
          .from("marketplaces")
          .select("id, name, slug")
          .eq("active", true)
          .order("name"),
      ]);

      if (productError) {
        throw productError;
      }

      if (linkError) {
        throw linkError;
      }

      if (marketplaceError) {
        throw marketplaceError;
      }

      setProducts(
        (productData ?? []) as unknown as Product[]
      );

      setAffiliateLinks(
        (linkData ?? []) as unknown as AffiliateLink[]
      );

      setMarketplaces(
        (marketplaceData ?? []) as Marketplace[]
      );
    } catch (error) {
      console.error(
        "Erro ao carregar links de afiliado:",
        error
      );

      alert(
        "Não foi possível carregar os dados dos links de afiliado."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const linksByProduct = useMemo(() => {
    const map = new Map<string, AffiliateLink>();

    for (const link of affiliateLinks) {
      if (!map.has(link.product_id)) {
        map.set(link.product_id, link);
      }
    }

    return map;
  }, [affiliateLinks]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return products.filter((product) => {
      const title = product.title?.toLowerCase() || "";

      const matchesSearch =
        !normalizedSearch ||
        title.includes(normalizedSearch) ||
        product.external_id
          ?.toLowerCase()
          .includes(normalizedSearch);

      const matchesMarketplace =
        marketplaceFilter === "all" ||
        product.marketplace_id === marketplaceFilter;

      const link = linksByProduct.get(product.id);

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "without" && !link) ||
        (statusFilter === "ready" &&
          link?.status === "ready") ||
        (statusFilter === "pending" &&
          link?.status === "pending") ||
        (statusFilter === "invalid" &&
          link?.status === "invalid");

      return (
        matchesSearch &&
        matchesMarketplace &&
        matchesStatus
      );
    });
  }, [
    products,
    search,
    marketplaceFilter,
    statusFilter,
    linksByProduct,
  ]);

  const stats = useMemo(() => {
    const total = products.length;

    const ready = products.filter((product) => {
      const link = linksByProduct.get(product.id);

      return link?.status === "ready";
    }).length;

    const pending = products.filter((product) => {
      const link = linksByProduct.get(product.id);

      return link?.status === "pending";
    }).length;

    const without = products.filter((product) => {
      return !linksByProduct.has(product.id);
    }).length;

    return {
      total,
      ready,
      pending,
      without,
    };
  }, [products, linksByProduct]);

  function openAffiliateModal(product: Product) {
    const existingLink = linksByProduct.get(product.id);

    setSelectedProduct(product);

    setAffiliateUrl(
      existingLink?.affiliate_url ||
        product.affiliate_url ||
        ""
    );

    setAffiliateTag(existingLink?.affiliate_tag || "");
  }

  function closeAffiliateModal() {
    if (saving) {
      return;
    }

    setSelectedProduct(null);
    setAffiliateUrl("");
    setAffiliateTag("");
  }

  async function saveAffiliateLink() {
    if (!selectedProduct) {
      return;
    }

    const url = affiliateUrl.trim();

    if (!url) {
      alert("Informe o link de afiliado.");
      return;
    }

    let parsedUrl: URL;

    try {
      parsedUrl = new URL(url);
    } catch {
      alert("Informe uma URL válida.");
      return;
    }

    if (
      parsedUrl.protocol !== "https:" &&
      parsedUrl.protocol !== "http:"
    ) {
      alert("O link precisa utilizar HTTP ou HTTPS.");
      return;
    }

    setSaving(true);

    try {
      const { data, error } =
        await supabase.functions.invoke(
          "affiliate-link-associate",
          {
            body: {
              product_id: selectedProduct.id,
              affiliate_url: url,
              affiliate_tag:
                affiliateTag.trim() || null,
              source: "manual",
            },
          }
        );

      if (error) {
        throw error;
      }

      if (!data?.success) {
        throw new Error(
          data?.error ||
            "Não foi possível associar o link."
        );
      }

      closeAffiliateModal();

      await loadData();

      alert(
        "Link de afiliado associado com sucesso!"
      );
    } catch (error) {
      console.error(
        "Erro ao associar link de afiliado:",
        error
      );

      const message =
        error instanceof Error
          ? error.message
          : "Erro desconhecido.";

      alert(
        `Não foi possível associar o link de afiliado.\n\n${message}`
      );
    } finally {
      setSaving(false);
    }
  }

  function formatPrice(value: number | null) {
    if (value === null || value === undefined) {
      return "—";
    }

    return value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  function getMarketplaceName(product: Product) {
    return product.marketplaces?.[0]?.name || "—";
  }

  function getStatus(product: Product) {
    const link = linksByProduct.get(product.id);

    if (!link) {
      return {
        label: "Sem link",
        type: "without",
      };
    }

    if (link.status === "ready") {
      return {
        label: "Pronto",
        type: "ready",
      };
    }

    if (link.status === "pending") {
      return {
        label: "Pendente",
        type: "pending",
      };
    }

    return {
      label: "Inválido",
      type: "invalid",
    };
  }

  if (loading) {
    return (
      <section className="page">
        <div className="page-header">
          <div>
            <h1>Links de Afiliado</h1>

            <p>
              Associe os links oficiais dos marketplaces
              aos produtos do Ofertix.
            </p>
          </div>
        </div>

        <div className="settings-empty">
          Carregando links de afiliado...
        </div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>Links de Afiliado</h1>

          <p>
            Gerencie os links oficiais que serão utilizados
            nas ofertas publicadas pelo Ofertix.
          </p>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-label">
            Produtos
          </div>

          <div className="stat-card-value">
            {stats.total}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">
            Links prontos
          </div>

          <div className="stat-card-value">
            {stats.ready}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">
            Pendentes
          </div>

          <div className="stat-card-value">
            {stats.pending}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">
            Sem link
          </div>

          <div className="stat-card-value">
            {stats.without}
          </div>
        </div>
      </div>

      <div className="page-card">
        <div className="filters-row">
          <div className="search-box">
            <Search size={18} />

            <input
              type="text"
              placeholder="Buscar produto..."
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
            />
          </div>

          <select
            value={marketplaceFilter}
            onChange={(event) =>
              setMarketplaceFilter(event.target.value)
            }
          >
            <option value="all">
              Todos os marketplaces
            </option>

            {marketplaces.map((marketplace) => (
              <option
                key={marketplace.id}
                value={marketplace.id}
              >
                {marketplace.name}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value)
            }
          >
            <option value="all">
              Todos os status
            </option>

            <option value="without">
              Sem link
            </option>

            <option value="ready">
              Pronto
            </option>

            <option value="pending">
              Pendente
            </option>

            <option value="invalid">
              Inválido
            </option>
          </select>
        </div>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Marketplace</th>
                <th>Preço</th>
                <th>Desconto</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>

            <tbody>
              {filteredProducts.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="table-empty"
                  >
                    Nenhum produto encontrado.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => {
                  const status = getStatus(product);
                  const link =
                    linksByProduct.get(product.id);

                  return (
                    <tr key={product.id}>
                      <td>
                        <div className="product-cell">
                          {product.image_url ? (
                            <img
                              src={product.image_url}
                              alt=""
                              className="product-thumb"
                            />
                          ) : (
                            <div className="product-thumb-placeholder">
                              <Link2 size={18} />
                            </div>
                          )}

                          <div>
                            <strong>
                              {product.title}
                            </strong>

                            <span>
                              {product.external_id}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td>
                        {getMarketplaceName(product)}
                      </td>

                      <td>
                        {formatPrice(product.price)}
                      </td>

                      <td>
                        {product.discount_percent !==
                        null
                          ? `${product.discount_percent.toFixed(
                              2
                            )}%`
                          : "—"}
                      </td>

                      <td>
                        <span
                          className={`status-badge status-${status.type}`}
                        >
                          {status.type === "ready" && (
                            <CheckCircle2 size={14} />
                          )}

                          {status.type === "pending" && (
                            <Clock3 size={14} />
                          )}

                          {status.type === "invalid" && (
                            <AlertCircle size={14} />
                          )}

                          {status.label}
                        </span>
                      </td>

                      <td>
                        <div className="table-actions">
                          {product.product_url && (
                            <a
                              href={product.product_url}
                              target="_blank"
                              rel="noreferrer"
                              className="icon-button"
                              title="Abrir produto"
                            >
                              <ExternalLink
                                size={17}
                              />
                            </a>
                          )}

                          <button
                            type="button"
                            className="primary-button"
                            onClick={() =>
                              openAffiliateModal(
                                product
                              )
                            }
                          >
                            {link
                              ? "Editar link"
                              : "Associar link"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedProduct && (
        <div
          className="modal-overlay"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget
            ) {
              closeAffiliateModal();
            }
          }}
        >
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <h2>Associar link de afiliado</h2>

                <p>
                  {selectedProduct.title}
                </p>
              </div>

              <button
                type="button"
                className="icon-button"
                onClick={closeAffiliateModal}
                disabled={saving}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="affiliate-product-preview">
                {selectedProduct.image_url ? (
                  <img
                    src={selectedProduct.image_url}
                    alt=""
                  />
                ) : (
                  <div className="product-thumb-placeholder">
                    <Link2 size={20} />
                  </div>
                )}

                <div>
                  <strong>
                    {selectedProduct.title}
                  </strong>

                  <span>
                    {getMarketplaceName(
                      selectedProduct
                    )}
                  </span>

                  <span>
                    {formatPrice(
                      selectedProduct.price
                    )}
                  </span>
                </div>
              </div>

              <div className="settings-field">
                <label htmlFor="affiliate-url">
                  Link de afiliado
                </label>

                <input
                  id="affiliate-url"
                  type="url"
                  value={affiliateUrl}
                  onChange={(event) =>
                    setAffiliateUrl(
                      event.target.value
                    )
                  }
                  placeholder="https://meli.la/..."
                  disabled={saving}
                />

                <small>
                  Cole aqui o link oficial gerado
                  pelo programa de afiliados do
                  marketplace.
                </small>
              </div>

              <div className="settings-field">
                <label htmlFor="affiliate-tag">
                  Identificador / etiqueta
                </label>

                <input
                  id="affiliate-tag"
                  type="text"
                  value={affiliateTag}
                  onChange={(event) =>
                    setAffiliateTag(
                      event.target.value
                    )
                  }
                  placeholder="ofertixauto"
                  disabled={saving}
                />

                <small>
                  Opcional. Ex.: ofertixauto
                </small>
              </div>

              <div className="settings-note">
                O Ofertix valida o domínio do link antes
                de associá-lo ao produto.
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={closeAffiliateModal}
                disabled={saving}
              >
                Cancelar
              </button>

              <button
                type="button"
                className="primary-button"
                onClick={saveAffiliateLink}
                disabled={saving}
              >
                {saving
                  ? "Salvando..."
                  : "Associar link"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}