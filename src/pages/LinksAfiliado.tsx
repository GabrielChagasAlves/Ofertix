import { useEffect, useMemo, useState } from "react";
import {
  Copy,
  ExternalLink,
  Link2,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabase";

interface Product {
  id: string;
  title: string;
  price: number | null;
  marketplace_id: string;
  product_url: string | null;
  affiliate_url: string | null;
}

interface Marketplace {
  id: string;
  name: string;
  slug: string;
}

interface AffiliateLink {
  id: string;
  product_id: string;
  marketplace_id: string;
  affiliate_url: string;
  affiliate_tag: string | null;
  source: "manual" | "extension" | "api" | "imported";
  status: "pending" | "ready" | "invalid";
  validation_message: string | null;
  created_at: string;
  updated_at: string;
}

const statusMap = {
  pending: {
    label: "Pendente",
    className: "status-pending",
  },
  ready: {
    label: "Pronto",
    className: "status-ready",
  },
  invalid: {
    label: "Inválido",
    className: "status-invalid",
  },
};

export function LinksAfiliado() {
  const [links, setLinks] = useState<AffiliateLink[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [showModal, setShowModal] = useState(false);

  const [productId, setProductId] = useState("");
  const [affiliateUrl, setAffiliateUrl] = useState("");
  const [affiliateTag, setAffiliateTag] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);

      const [linksResult, productsResult, marketplacesResult] =
        await Promise.all([
          supabase
            .from("affiliate_links")
            .select("*")
            .order("created_at", { ascending: false }),

          supabase
            .from("products")
            .select(
              "id, title, price, marketplace_id, product_url, affiliate_url"
            )
            .order("created_at", { ascending: false }),

          supabase
            .from("marketplaces")
            .select("id, name, slug")
            .order("name"),
        ]);

      if (linksResult.error) {
        console.error(
          "Erro ao carregar links de afiliado:",
          linksResult.error
        );
      } else {
        setLinks(linksResult.data || []);
      }

      if (productsResult.error) {
        console.error(
          "Erro ao carregar produtos:",
          productsResult.error
        );
      } else {
        setProducts(productsResult.data || []);
      }

      if (marketplacesResult.error) {
        console.error(
          "Erro ao carregar marketplaces:",
          marketplacesResult.error
        );
      } else {
        setMarketplaces(marketplacesResult.data || []);
      }
    } catch (error) {
      console.error("Erro inesperado ao carregar dados:", error);
    } finally {
      setLoading(false);
    }
  }

  const productMap = useMemo(() => {
    return new Map(products.map((product) => [product.id, product]));
  }, [products]);

  const marketplaceMap = useMemo(() => {
    return new Map(
      marketplaces.map((marketplace) => [marketplace.id, marketplace])
    );
  }, [marketplaces]);

  const filteredLinks = useMemo(() => {
    const normalizedSearch = search.toLowerCase().trim();

    return links.filter((link) => {
      const product = productMap.get(link.product_id);
      const marketplace = marketplaceMap.get(link.marketplace_id);

      const matchesSearch =
        !normalizedSearch ||
        product?.title?.toLowerCase().includes(normalizedSearch) ||
        link.affiliate_url?.toLowerCase().includes(normalizedSearch) ||
        link.affiliate_tag?.toLowerCase().includes(normalizedSearch) ||
        marketplace?.name?.toLowerCase().includes(normalizedSearch);

      const matchesStatus =
        statusFilter === "all" || link.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [
    links,
    products,
    marketplaces,
    productMap,
    marketplaceMap,
    search,
    statusFilter,
  ]);

  function openModal() {
    setProductId("");
    setAffiliateUrl("");
    setAffiliateTag("");
    setShowModal(true);
  }

  function closeModal() {
    if (saving) return;

    setShowModal(false);
    setProductId("");
    setAffiliateUrl("");
    setAffiliateTag("");
  }

  async function handleAddLink(event: React.FormEvent) {
    event.preventDefault();

    if (!productId) {
      alert("Selecione um produto.");
      return;
    }

    if (!affiliateUrl.trim()) {
      alert("Informe o link de afiliado.");
      return;
    }

    try {
      setSaving(true);

      const product = productMap.get(productId);

      if (!product) {
        alert("Produto não encontrado.");
        return;
      }

      const marketplace = marketplaceMap.get(product.marketplace_id);

      if (!marketplace) {
        alert("Marketplace do produto não encontrado.");
        return;
      }

      const url = affiliateUrl.trim();

      try {
        new URL(url);
      } catch {
        alert("Informe uma URL válida.");
        return;
      }

      const { data, error } = await supabase
        .from("affiliate_links")
        .insert({
          product_id: product.id,
          marketplace_id: product.marketplace_id,
          affiliate_url: url,
          affiliate_tag: affiliateTag.trim() || null,
          source: "manual",
          status: "pending",
          validation_message: "Aguardando validação.",
        })
        .select()
        .single();

      if (error) {
        console.error("Erro ao salvar link de afiliado:", error);

        alert(
          `Não foi possível salvar o link.\n\n${error.message}`
        );

        return;
      }

      if (data) {
        setLinks((current) => [data, ...current]);
      }

      closeModal();
    } catch (error) {
      console.error("Erro inesperado ao salvar link:", error);

      alert("Ocorreu um erro ao salvar o link de afiliado.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteLink(id: string) {
    const confirmed = window.confirm(
      "Tem certeza que deseja excluir este link de afiliado?"
    );

    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from("affiliate_links")
        .delete()
        .eq("id", id);

      if (error) {
        console.error("Erro ao excluir link:", error);
        alert(`Não foi possível excluir o link.\n\n${error.message}`);
        return;
      }

      setLinks((current) => current.filter((link) => link.id !== id));
    } catch (error) {
      console.error("Erro inesperado ao excluir link:", error);
      alert("Ocorreu um erro ao excluir o link.");
    }
  }

  async function handleCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      alert("Link copiado!");
    } catch (error) {
      console.error("Erro ao copiar link:", error);
      alert("Não foi possível copiar o link.");
    }
  }

  function handleOpen(url: string) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function formatDate(date: string) {
    if (!date) return "-";

    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(date));
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>Links de Afiliado</h1>

          <p>
            Gerencie os links de afiliado associados aos produtos do Ofertix.
          </p>
        </div>

        <button className="primary-button" onClick={openModal}>
          <Plus size={18} />
          Adicionar link
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-icon">
            <Link2 size={20} />
          </div>

          <div>
            <span>Total de links</span>
            <strong>{links.length}</strong>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon">
            <Link2 size={20} />
          </div>

          <div>
            <span>Prontos</span>
            <strong>
              {links.filter((link) => link.status === "ready").length}
            </strong>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon">
            <Link2 size={20} />
          </div>

          <div>
            <span>Pendentes</span>
            <strong>
              {links.filter((link) => link.status === "pending").length}
            </strong>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon">
            <Link2 size={20} />
          </div>

          <div>
            <span>Inválidos</span>
            <strong>
              {links.filter((link) => link.status === "invalid").length}
            </strong>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="filters-row">
          <div className="search-box">
            <Search size={18} />

            <input
              type="text"
              placeholder="Buscar produto, marketplace ou link..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">Todos os status</option>
            <option value="ready">Prontos</option>
            <option value="pending">Pendentes</option>
            <option value="invalid">Inválidos</option>
          </select>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="empty-state">
            <p>Carregando links de afiliado...</p>
          </div>
        ) : filteredLinks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Link2 size={28} />
            </div>

            <h3>Nenhum link encontrado</h3>

            <p>
              Adicione um link de afiliado para começar a associá-lo aos
              produtos do Ofertix.
            </p>

            <button className="primary-button" onClick={openModal}>
              <Plus size={18} />
              Adicionar link
            </button>
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Marketplace</th>
                  <th>Link de afiliado</th>
                  <th>Tag</th>
                  <th>Origem</th>
                  <th>Status</th>
                  <th>Data</th>
                  <th>Ações</th>
                </tr>
              </thead>

              <tbody>
                {filteredLinks.map((link) => {
                  const product = productMap.get(link.product_id);
                  const marketplace = marketplaceMap.get(
                    link.marketplace_id
                  );

                  const status = statusMap[link.status];

                  return (
                    <tr key={link.id}>
                      <td>
                        <div className="product-cell">
                          <strong>
                            {product?.title || "Produto não encontrado"}
                          </strong>

                          {product?.price !== null &&
                            product?.price !== undefined && (
                              <span>
                                R${" "}
                                {Number(product.price).toLocaleString(
                                  "pt-BR",
                                  {
                                    minimumFractionDigits: 2,
                                  }
                                )}
                              </span>
                            )}
                        </div>
                      </td>

                      <td>
                        {marketplace?.name || "Marketplace não encontrado"}
                      </td>

                      <td>
                        <div className="affiliate-link-cell">
                          <span title={link.affiliate_url}>
                            {link.affiliate_url}
                          </span>
                        </div>
                      </td>

                      <td>{link.affiliate_tag || "-"}</td>

                      <td>
                        <span className="source-badge">
                          {link.source === "extension"
                            ? "Extensão"
                            : link.source === "api"
                              ? "API"
                              : link.source === "imported"
                                ? "Importado"
                                : "Manual"}
                        </span>
                      </td>

                      <td>
                        <span className={`status-badge ${status.className}`}>
                          {status.label}
                        </span>
                      </td>

                      <td>{formatDate(link.created_at)}</td>

                      <td>
                        <div className="table-actions">
                          <button
                            className="icon-button"
                            title="Copiar link"
                            onClick={() =>
                              handleCopy(link.affiliate_url)
                            }
                          >
                            <Copy size={17} />
                          </button>

                          <button
                            className="icon-button"
                            title="Abrir link"
                            onClick={() =>
                              handleOpen(link.affiliate_url)
                            }
                          >
                            <ExternalLink size={17} />
                          </button>

                          <button
                            className="icon-button danger"
                            title="Excluir"
                            onClick={() =>
                              handleDeleteLink(link.id)
                            }
                          >
                            <Trash2 size={17} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <div>
                <h2>Adicionar link de afiliado</h2>

                <p>
                  Associe um link de afiliado a um produto do Ofertix.
                </p>
              </div>

              <button
                className="icon-button"
                onClick={closeModal}
                disabled={saving}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddLink}>
              <div className="form-group">
                <label htmlFor="affiliate-product">
                  Produto
                </label>

                <select
                  id="affiliate-product"
                  value={productId}
                  onChange={(event) =>
                    setProductId(event.target.value)
                  }
                  required
                >
                  <option value="">
                    Selecione um produto
                  </option>

                  {products.map((product) => {
                    const marketplace = marketplaceMap.get(
                      product.marketplace_id
                    );

                    return (
                      <option key={product.id} value={product.id}>
                        {product.title}
                        {marketplace
                          ? ` — ${marketplace.name}`
                          : ""}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="affiliate-url">
                  Link de afiliado
                </label>

                <input
                  id="affiliate-url"
                  type="url"
                  placeholder="https://meli.la/..."
                  value={affiliateUrl}
                  onChange={(event) =>
                    setAffiliateUrl(event.target.value)
                  }
                  required
                />

                <small>
                  Cole aqui o link oficial gerado pelo marketplace.
                </small>
              </div>

              <div className="form-group">
                <label htmlFor="affiliate-tag">
                  Tag / identificação
                </label>

                <input
                  id="affiliate-tag"
                  type="text"
                  placeholder="Ex.: ofertixauto"
                  value={affiliateTag}
                  onChange={(event) =>
                    setAffiliateTag(event.target.value)
                  }
                />

                <small>
                  Opcional. Ex.: ofertixauto.
                </small>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={saving}
                >
                  <Link2 size={18} />

                  {saving ? "Salvando..." : "Salvar link"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}