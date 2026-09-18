import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Plus,
  Package,
  Pencil,
  Trash2,
  Power,
  ExternalLink,
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

export function Produtos() {
  const [products, setProducts] = useState<Product[]>([]);
  const [marketplaces, setMarketplaces] = useState<
    Marketplace[]
  >([]);

  const [search, setSearch] = useState("");
  const [marketplaceFilter, setMarketplaceFilter] =
    useState("all");

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  async function loadProducts() {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.error(error);
      setError("Não foi possível carregar os produtos.");
      setLoading(false);
      return;
    }

    setProducts(data ?? []);
    setLoading(false);
  }

  async function loadMarketplaces() {
    const { data, error } = await supabase
      .from("marketplaces")
      .select("id, name, slug, active")
      .eq("active", true)
      .order("name");

    if (error) {
      console.error(error);
      return;
    }

    setMarketplaces(data ?? []);
  }

  useEffect(() => {
    loadProducts();
    loadMarketplaces();
  }, []);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = search
      .trim()
      .toLowerCase();

    return products.filter((product) => {
      const matchesSearch =
        !normalizedSearch ||
        product.title
          .toLowerCase()
          .includes(normalizedSearch) ||
        product.brand
          ?.toLowerCase()
          .includes(normalizedSearch) ||
        product.category
          ?.toLowerCase()
          .includes(normalizedSearch);

      const matchesMarketplace =
        marketplaceFilter === "all" ||
        product.marketplace_id === marketplaceFilter;

      return matchesSearch && matchesMarketplace;
    });
  }, [products, search, marketplaceFilter]);

  async function toggleProduct(product: Product) {
    const { error } = await supabase
      .from("products")
      .update({
        active: !product.active,
      })
      .eq("id", product.id);

    if (error) {
      console.error(error);
      setError("Não foi possível alterar o status.");
      return;
    }

    await loadProducts();
  }

  async function deleteProduct(product: Product) {
    const confirmed = window.confirm(
      `Excluir o produto "${product.title}"?`
    );

    if (!confirmed) {
      return;
    }

    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", product.id);

    if (error) {
      console.error(error);
      setError("Não foi possível excluir o produto.");
      return;
    }

    await loadProducts();
  }

  function getMarketplaceName(id: string) {
    return (
      marketplaces.find(
        (marketplace) => marketplace.id === id
      )?.name ?? "Marketplace"
    );
  }

  function formatPrice(value: number | null) {
    if (value === null) {
      return "-";
    }

    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">CATÁLOGO</p>

          <h1>Produtos</h1>

          <p className="page-description">
            Produtos importados dos marketplaces e
            cadastrados manualmente.
          </p>
        </div>

        <button className="primary-button">
          <Plus size={17} />
          Adicionar produto
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

      <div className="panel">
        <div
          style={{
            display: "flex",
            gap: "10px",
            marginBottom: "18px",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              position: "relative",
              flex: 1,
              minWidth: "240px",
            }}
          >
            <Search
              size={17}
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "#687386",
              }}
            />

            <input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Buscar produto..."
              style={{
                width: "100%",
                height: "40px",
                padding: "0 12px 0 38px",
                background: "#0b0f16",
                border: "1px solid #202734",
                borderRadius: "8px",
                color: "#e8edf5",
                outline: "none",
              }}
            />
          </div>

          <select
            value={marketplaceFilter}
            onChange={(event) =>
              setMarketplaceFilter(event.target.value)
            }
            style={{
              height: "40px",
              padding: "0 35px 0 12px",
              background: "#0b0f16",
              border: "1px solid #202734",
              borderRadius: "8px",
              color: "#b8c0cd",
              outline: "none",
            }}
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
        </div>

        {loading ? (
          <div className="empty-state">
            <Package size={30} />

            <h3>Carregando produtos...</h3>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <Package size={25} />
            </div>

            <h3>
              {products.length === 0
                ? "Nenhum produto cadastrado"
                : "Nenhum produto encontrado"}
            </h3>

            <p>
              {products.length === 0
                ? "Os produtos importados dos marketplaces aparecerão aqui."
                : "Tente alterar os filtros ou a busca."}
            </p>

            {products.length === 0 && (
              <button className="primary-button">
                <Plus size={17} />
                Adicionar produto
              </button>
            )}
          </div>
        ) : (
          <div
            style={{
              overflowX: "auto",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
              }}
            >
              <thead>
                <tr>
                  {[
                    "Produto",
                    "Marketplace",
                    "Preço",
                    "Desconto",
                    "Status",
                    "Ações",
                  ].map((header) => (
                    <th
                      key={header}
                      style={{
                        padding: "12px",
                        textAlign: "left",
                        borderBottom:
                          "1px solid #202734",
                        color: "#687386",
                        fontSize: "10px",
                        fontWeight: 600,
                        textTransform: "uppercase",
                      }}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.id}>
                    <td
                      style={{
                        padding: "14px 12px",
                        borderBottom:
                          "1px solid #202734",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "11px",
                        }}
                      >
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt=""
                            style={{
                              width: "42px",
                              height: "42px",
                              objectFit: "cover",
                              borderRadius: "7px",
                            }}
                          />
                        ) : (
                          <div className="stat-icon">
                            <Package size={18} />
                          </div>
                        )}

                        <div>
                          <div
                            style={{
                              color: "#e8edf5",
                              fontSize: "12px",
                              fontWeight: 600,
                            }}
                          >
                            {product.title}
                          </div>

                          <div
                            style={{
                              color: "#687386",
                              fontSize: "10px",
                              marginTop: "3px",
                            }}
                          >
                            {product.brand ||
                              product.category ||
                              "Sem categoria"}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td
                      style={{
                        padding: "14px 12px",
                        borderBottom:
                          "1px solid #202734",
                        color: "#aeb7c5",
                        fontSize: "11px",
                      }}
                    >
                      {getMarketplaceName(
                        product.marketplace_id
                      )}
                    </td>

                    <td
                      style={{
                        padding: "14px 12px",
                        borderBottom:
                          "1px solid #202734",
                        color: "#e8edf5",
                        fontSize: "12px",
                        fontWeight: 600,
                      }}
                    >
                      {formatPrice(product.price)}
                    </td>

                    <td
                      style={{
                        padding: "14px 12px",
                        borderBottom:
                          "1px solid #202734",
                        color: "#60a5fa",
                        fontSize: "11px",
                      }}
                    >
                      {product.discount_percent
                        ? `${product.discount_percent}%`
                        : "-"}
                    </td>

                    <td
                      style={{
                        padding: "14px 12px",
                        borderBottom:
                          "1px solid #202734",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          padding: "4px 8px",
                          borderRadius: "20px",
                          background: product.active
                            ? "#132a21"
                            : "#29202a",
                          color: product.active
                            ? "#6ee7b7"
                            : "#a7adba",
                          fontSize: "10px",
                          fontWeight: 600,
                        }}
                      >
                        {product.active
                          ? "Ativo"
                          : "Inativo"}
                      </span>
                    </td>

                    <td
                      style={{
                        padding: "14px 12px",
                        borderBottom:
                          "1px solid #202734",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          gap: "5px",
                        }}
                      >
                        {product.product_url && (
                          <button
                            title="Abrir produto"
                            className="text-button"
                            onClick={() =>
                              window.open(
                                product.product_url!,
                                "_blank"
                              )
                            }
                          >
                            <ExternalLink size={15} />
                          </button>
                        )}

                        <button
                          title="Editar"
                          className="text-button"
                        >
                          <Pencil size={15} />
                        </button>

                        <button
                          title={
                            product.active
                              ? "Desativar"
                              : "Ativar"
                          }
                          className="text-button"
                          onClick={() =>
                            toggleProduct(product)
                          }
                        >
                          <Power size={15} />
                        </button>

                        <button
                          title="Excluir"
                          className="text-button"
                          onClick={() =>
                            deleteProduct(product)
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}