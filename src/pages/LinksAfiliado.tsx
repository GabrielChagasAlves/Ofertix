import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CheckSquare,
  Clock3,
  ExternalLink,
  Link2,
  Save,
  Search,
  Square,
  X,
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

type AffiliateForm = {
  affiliateUrl: string;
  affiliateTag: string;
};

export function LinksAfiliado() {
  const [products, setProducts] = useState<Product[]>([]);
  const [affiliateLinks, setAffiliateLinks] = useState<AffiliateLink[]>([]);
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [marketplaceFilter, setMarketplaceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);

  const [forms, setForms] = useState<Record<string, AffiliateForm>>({});

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
    const normalizedSearch = search
      .trim()
      .toLowerCase();

    return products.filter((product) => {
      const title =
        product.title?.toLowerCase() || "";

      const externalId =
        product.external_id?.toLowerCase() || "";

      const matchesSearch =
        !normalizedSearch ||
        title.includes(normalizedSearch) ||
        externalId.includes(normalizedSearch);

      const matchesMarketplace =
        marketplaceFilter === "all" ||
        product.marketplace_id === marketplaceFilter;

      const link =
        linksByProduct.get(product.id);

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

    const ready = products.filter(
      (product) =>
        linksByProduct.get(product.id)?.status ===
        "ready"
    ).length;

    const pending = products.filter(
      (product) =>
        linksByProduct.get(product.id)?.status ===
        "pending"
    ).length;

    const without = products.filter(
      (product) =>
        !linksByProduct.has(product.id)
    ).length;

    return {
      total,
      ready,
      pending,
      without,
    };
  }, [products, linksByProduct]);

  const selectedProducts = useMemo(
    () =>
      selectedIds
        .map((id) =>
          products.find(
            (product) => product.id === id
          )
        )
        .filter(Boolean) as Product[],
    [selectedIds, products]
  );

  function formatPrice(
    value: number | null
  ) {
    if (
      value === null ||
      value === undefined
    ) {
      return "—";
    }

    return value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  function getMarketplaceName(
    product: Product
  ) {
    return (
      product.marketplaces?.[0]?.name || "—"
    );
  }

  function getStatus(product: Product) {
    const link =
      linksByProduct.get(product.id);

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

  function toggleProduct(
    productId: string
  ) {
    setSelectedIds((current) =>
      current.includes(productId)
        ? current.filter(
            (id) => id !== productId
          )
        : [...current, productId]
    );
  }

  function toggleAllVisible() {
    const visibleIds =
      filteredProducts.map(
        (product) => product.id
      );

    const allSelected =
      visibleIds.length > 0 &&
      visibleIds.every((id) =>
        selectedIds.includes(id)
      );

    setSelectedIds((current) => {
      if (allSelected) {
        return current.filter(
          (id) => !visibleIds.includes(id)
        );
      }

      return Array.from(
        new Set([
          ...current,
          ...visibleIds,
        ])
      );
    });
  }

  function openAffiliateModal(
    ids = selectedIds
  ) {
    if (ids.length === 0) {
      alert(
        "Selecione pelo menos um produto."
      );
      return;
    }

    const nextForms: Record<
      string,
      AffiliateForm
    > = {};

    for (const id of ids) {
      const product = products.find(
        (item) => item.id === id
      );

      if (!product) {
        continue;
      }

      const existingLink =
        linksByProduct.get(id);

      nextForms[id] = {
        affiliateUrl:
          existingLink?.affiliate_url ||
          product.affiliate_url ||
          "",
        affiliateTag:
          existingLink?.affiliate_tag ||
          "",
      };
    }

    setSelectedIds(ids);
    setForms(nextForms);
    setShowModal(true);
  }

  function closeAffiliateModal() {
    if (saving) {
      return;
    }

    setShowModal(false);
    setForms({});
  }

  function updateForm(
    productId: string,
    field: keyof AffiliateForm,
    value: string
  ) {
    setForms((current) => ({
      ...current,
      [productId]: {
        ...(current[productId] || {
          affiliateUrl: "",
          affiliateTag: "",
        }),
        [field]: value,
      },
    }));
  }

  async function saveAffiliateLinks() {
    if (selectedProducts.length === 0) {
      return;
    }

    for (const product of selectedProducts) {
      const url =
        forms[product.id]?.affiliateUrl.trim();

      if (!url) {
        alert(
          `Informe o link de afiliado para:\n\n${product.title}`
        );

        return;
      }

      try {
        const parsedUrl = new URL(url);

        if (
          !["http:", "https:"].includes(
            parsedUrl.protocol
          )
        ) {
          throw new Error();
        }
      } catch {
        alert(
          `Informe uma URL válida para:\n\n${product.title}`
        );

        return;
      }
    }

    setSaving(true);

    let createdOffers = 0;
    let duplicateOffers = 0;

    try {
      for (const product of selectedProducts) {
        const form = forms[product.id];

        const {
          data,
          error,
        } =
          await supabase.functions.invoke(
            "affiliate-link-associate",
            {
              body: {
                product_id: product.id,
                affiliate_url:
                  form.affiliateUrl.trim(),
                affiliate_tag:
                  form.affiliateTag.trim() ||
                  null,
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
              "Não foi possível salvar o link."
          );
        }

        if (data.offer_created) {
          createdOffers++;
        }

        if (data.duplicate_offer) {
          duplicateOffers++;
        }
      }

      setShowModal(false);
      setForms({});
      setSelectedIds([]);

      await loadData();

      alert(
        [
          "Links de afiliado salvos com sucesso!",
          "",
          `Ofertas criadas automaticamente: ${createdOffers}`,
          `Ofertas que já existiam: ${duplicateOffers}`,
          "",
          "As ofertas geradas podem ser acompanhadas na tela de Ofertas.",
        ].join("\n")
      );
    } catch (error) {
      console.error(
        "Erro ao salvar links:",
        error
      );

      const message =
        error instanceof Error
          ? error.message
          : "Erro desconhecido.";

      alert(
        `Não foi possível concluir o salvamento.\n\n${message}`
      );
    } finally {
      setSaving(false);
    }
  }

  const allVisibleSelected =
    filteredProducts.length > 0 &&
    filteredProducts.every((product) =>
      selectedIds.includes(product.id)
    );

  if (loading) {
    return (
      <section className="page">
        <div className="page-header">
          <div>
            <h1>Links de Afiliado</h1>

            <p>
              Selecione produtos e associe os
              links oficiais dos marketplaces.
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
            Selecione os produtos, gere os links
            na plataforma do marketplace e salve
            tudo de uma vez.
          </p>
        </div>

        {selectedIds.length > 0 && (
          <button
            type="button"
            className="primary-button"
            onClick={() =>
              openAffiliateModal()
            }
          >
            <Link2 size={16} />

            Gerar links (
            {selectedIds.length})
          </button>
        )}
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
                setSearch(
                  event.target.value
                )
              }
            />
          </div>

          <select
            value={marketplaceFilter}
            onChange={(event) =>
              setMarketplaceFilter(
                event.target.value
              )
            }
          >
            <option value="all">
              Todos os marketplaces
            </option>

            {marketplaces.map(
              (marketplace) => (
                <option
                  key={marketplace.id}
                  value={marketplace.id}
                >
                  {marketplace.name}
                </option>
              )
            )}
          </select>

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value
              )
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

        {selectedIds.length > 0 && (
          <div className="selection-toolbar">
            <span>
              <strong>
                {selectedIds.length}
              </strong>{" "}
              produto(s) selecionado(s)
            </span>

            <button
              type="button"
              className="text-button"
              onClick={() =>
                setSelectedIds([])
              }
            >
              Limpar seleção
            </button>
          </div>
        )}

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: "46px" }}>
                  <button
                    type="button"
                    className="checkbox-button"
                    onClick={
                      toggleAllVisible
                    }
                    title={
                      allVisibleSelected
                        ? "Desmarcar todos"
                        : "Selecionar todos"
                    }
                  >
                    {allVisibleSelected ? (
                      <CheckSquare
                        size={18}
                      />
                    ) : (
                      <Square size={18} />
                    )}
                  </button>
                </th>

                <th>Produto</th>

                <th>Marketplace</th>

                <th>Preço</th>

                <th>Desconto</th>

                <th>Status</th>

                <th />
              </tr>
            </thead>

            <tbody>
              {filteredProducts.length ===
              0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="table-empty"
                  >
                    Nenhum produto encontrado.
                  </td>
                </tr>
              ) : (
                filteredProducts.map(
                  (product) => {
                    const status =
                      getStatus(product);

                    const link =
                      linksByProduct.get(
                        product.id
                      );

                    const selected =
                      selectedIds.includes(
                        product.id
                      );

                    return (
                      <tr
                        key={product.id}
                      >
                        <td>
                          <button
                            type="button"
                            className="checkbox-button"
                            onClick={() =>
                              toggleProduct(
                                product.id
                              )
                            }
                            title={
                              selected
                                ? "Desmarcar produto"
                                : "Selecionar produto"
                            }
                          >
                            {selected ? (
                              <CheckSquare
                                size={18}
                              />
                            ) : (
                              <Square
                                size={18}
                              />
                            )}
                          </button>
                        </td>

                        <td>
                          <div className="product-cell">
                            {product.image_url ? (
                              <img
                                src={
                                  product.image_url
                                }
                                alt=""
                                className="product-thumb"
                              />
                            ) : (
                              <div className="product-thumb-placeholder">
                                <Link2
                                  size={18}
                                />
                              </div>
                            )}

                            <div>
                              <strong>
                                {
                                  product.title
                                }
                              </strong>

                              <span>
                                {
                                  product.external_id
                                }
                              </span>
                            </div>
                          </div>
                        </td>

                        <td>
                          {getMarketplaceName(
                            product
                          )}
                        </td>

                        <td>
                          {formatPrice(
                            product.price
                          )}
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
                            {status.type ===
                              "ready" && (
                              <CheckCircle2
                                size={14}
                              />
                            )}

                            {status.type ===
                              "pending" && (
                              <Clock3
                                size={14}
                              />
                            )}

                            {status.type ===
                              "invalid" && (
                              <AlertCircle
                                size={14}
                              />
                            )}

                            {status.label}
                          </span>
                        </td>

                        <td>
                          <div className="table-actions">
                            {product.product_url && (
                              <a
                                href={
                                  product.product_url
                                }
                                target="_blank"
                                rel="noreferrer"
                                className="icon-button"
                                title="Abrir produto no marketplace"
                              >
                                <ExternalLink
                                  size={17}
                                />
                              </a>
                            )}

                            {link?.affiliate_url && (
                              <a
                                href={
                                  link.affiliate_url
                                }
                                target="_blank"
                                rel="noreferrer"
                                className="icon-button"
                                title="Abrir link de afiliado"
                              >
                                <Link2
                                  size={17}
                                />
                              </a>
                            )}

                            <button
                              type="button"
                              className="text-button"
                              onClick={() =>
                                openAffiliateModal(
                                  [product.id]
                                )
                              }
                            >
                              Editar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div
          className="modal-overlay"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeAffiliateModal();
            }
          }}
        >
          <div
            className="modal-card affiliate-batch-modal"
            onMouseDown={(event) =>
              event.stopPropagation()
            }
          >
            <div className="modal-header">
              <div>
                <h2>
                  Gerar links de afiliado
                </h2>

                <p>
                  Abra os produtos no
                  marketplace, gere os links
                  oficiais e cole-os abaixo.
                </p>
              </div>

              <button
                type="button"
                className="icon-button"
                onClick={
                  closeAffiliateModal
                }
                disabled={saving}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="affiliate-batch-list">
                {selectedProducts.map(
                  (product) => {
                    const form =
                      forms[product.id] || {
                        affiliateUrl: "",
                        affiliateTag: "",
                      };

                    return (
                      <div
                        className="affiliate-batch-item"
                        key={product.id}
                      >
                        <div className="affiliate-batch-product">
                          {product.image_url ? (
                            <img
                              src={
                                product.image_url
                              }
                              alt=""
                            />
                          ) : (
                            <div className="product-thumb-placeholder">
                              <Link2
                                size={18}
                              />
                            </div>
                          )}

                          <div>
                            <strong>
                              {
                                product.title
                              }
                            </strong>

                            <span>
                              {
                                getMarketplaceName(
                                  product
                                )
                              }{" "}
                              •{" "}
                              {formatPrice(
                                product.price
                              )}
                            </span>

                            <span>
                              {
                                product.external_id
                              }
                            </span>
                          </div>
                        </div>

                        <div className="affiliate-batch-actions">
                          {product.product_url && (
                            <a
                              href={
                                product.product_url
                              }
                              target="_blank"
                              rel="noreferrer"
                              className="secondary-button"
                            >
                              <ExternalLink
                                size={15}
                              />

                              Abrir produto
                            </a>
                          )}
                        </div>

                        <div className="affiliate-batch-fields">
                          <div className="settings-field">
                            <label>
                              Link de afiliado
                            </label>

                            <input
                              type="url"
                              value={
                                form.affiliateUrl
                              }
                              onChange={(event) =>
                                updateForm(
                                  product.id,
                                  "affiliateUrl",
                                  event.target
                                    .value
                                )
                              }
                              placeholder="https://meli.la/..."
                              disabled={saving}
                            />
                          </div>

                          <div className="settings-field">
                            <label>
                              Etiqueta
                            </label>

                            <input
                              type="text"
                              value={
                                form.affiliateTag
                              }
                              onChange={(event) =>
                                updateForm(
                                  product.id,
                                  "affiliateTag",
                                  event.target
                                    .value
                                )
                              }
                              placeholder="ofertixauto"
                              disabled={saving}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  }
                )}
              </div>

              <div className="settings-note">
                O link normal serve apenas
                para acessar o produto no
                marketplace. As ofertas e
                publicações futuras usarão
                exclusivamente o link de
                afiliado salvo.
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={
                  closeAffiliateModal
                }
                disabled={saving}
              >
                Cancelar
              </button>

              <button
                type="button"
                className="primary-button"
                onClick={saveAffiliateLinks}
                disabled={saving}
              >
                <Save size={15} />

                {saving
                  ? "Salvando..."
                  : "Salvar e gerar ofertas"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}