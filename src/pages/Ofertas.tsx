import { useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  Package,
  RefreshCw,
  Tag,
  CheckCircle2,
  Clock3,
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
}

export function Ofertas() {
  const [products, setProducts] = useState<Product[]>([]);
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);

    const [productsResult, marketplacesResult, offersResult] =
      await Promise.all([
        supabase
          .from("products")
          .select("*")
          .eq("active", true)
          .order("created_at", {
            ascending: false,
          }),

        supabase
          .from("marketplaces")
          .select("id, name, slug, active")
          .eq("active", true)
          .order("name"),

        supabase
          .from("offers")
          .select("*")
          .order("created_at", {
            ascending: false,
          }),
      ]);

    if (productsResult.error) {
      console.error(productsResult.error);
      setError("Não foi possível carregar os produtos.");
      setLoading(false);
      return;
    }

    if (marketplacesResult.error) {
      console.error(marketplacesResult.error);
    }

    if (offersResult.error) {
      console.error(offersResult.error);
    }

    setProducts(productsResult.data ?? []);
    setMarketplaces(marketplacesResult.data ?? []);
    setOffers(offersResult.data ?? []);

    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

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

  function getProductOffer(productId: string) {
    return offers.find(
      (offer) => offer.product_id === productId
    );
  }

  async function generateOffer(product: Product) {
    setGenerating(product.id);
    setError(null);
    setSuccess(null);

    const existingOffer = getProductOffer(product.id);

    if (existingOffer) {
      setError("Este produto já possui uma oferta.");
      setGenerating(null);
      return;
    }

    const title =
      product.discount_percent && product.discount_percent > 0
        ? `${product.title} — ${product.discount_percent}% OFF`
        : product.title;

    const message =
      product.original_price &&
      product.price &&
      product.original_price > product.price
        ? `🔥 Oferta encontrada!\n\n${product.title}\n\nDe ${formatPrice(
            product.original_price
          )} por ${formatPrice(product.price)}`
        : `🔥 Oferta encontrada!\n\n${product.title}\n\nPor ${formatPrice(
            product.price
          )}`;

    const { error } = await supabase.from("offers").insert({
      product_id: product.id,
      rule_id: null,
      title,
      message,
      affiliate_url:
        product.affiliate_url || product.product_url || null,
      status: "pending",
      scheduled_at: null,
      published_at: null,
    });

    if (error) {
      console.error(error);
      setError(
        "Não foi possível gerar a oferta. Verifique as permissões da tabela offers."
      );
      setGenerating(null);
      return;
    }

    setSuccess("Oferta gerada com sucesso.");

    await loadData();

    setGenerating(null);
  }

  const productsWithOffers = useMemo(() => {
    return products.map((product) => ({
      product,
      offer: getProductOffer(product.id),
    }));
  }, [products, offers]);

  if (loading) {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <p className="eyebrow">OFERTAS</p>
            <h1>Ofertas</h1>
            <p className="page-description">
              Transforme produtos encontrados em ofertas
              prontas para publicação.
            </p>
          </div>
        </div>

        <div className="panel">
          <div className="empty-state">
            <RefreshCw size={30} />
            <h3>Carregando ofertas...</h3>
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
            Transforme produtos encontrados em ofertas
            prontas para publicação.
          </p>
        </div>

        <button
          className="text-button"
          onClick={loadData}
          title="Atualizar"
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

      <div className="panel">
        {productsWithOffers.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <Package size={25} />
            </div>

            <h3>Nenhum produto disponível</h3>

            <p>
              Os produtos sincronizados com os marketplaces
              aparecerão aqui para geração de ofertas.
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
            {productsWithOffers.map(
              ({ product, offer }) => (
                <div
                  key={product.id}
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
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt=""
                      style={{
                        width: "64px",
                        height: "64px",
                        objectFit: "cover",
                        borderRadius: "8px",
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <div
                      className="stat-icon"
                      style={{
                        width: "64px",
                        height: "64px",
                        flexShrink: 0,
                      }}
                    >
                      <Package size={22} />
                    </div>
                  )}

                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        color: "#e8edf5",
                        fontSize: "13px",
                        fontWeight: 600,
                        lineHeight: 1.4,
                      }}
                    >
                      {product.title}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        flexWrap: "wrap",
                        marginTop: "6px",
                      }}
                    >
                      <span
                        style={{
                          color: "#687386",
                          fontSize: "10px",
                        }}
                      >
                        {getMarketplaceName(
                          product.marketplace_id
                        )}
                      </span>

                      <span
                        style={{
                          color: "#687386",
                          fontSize: "10px",
                        }}
                      >
                        •
                      </span>

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
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              padding: "3px 7px",
                              borderRadius: "20px",
                              background: "#16243a",
                              color: "#60a5fa",
                              fontSize: "10px",
                              fontWeight: 600,
                            }}
                          >
                            <Tag size={11} />
                            {product.discount_percent}%
                            OFF
                          </span>
                        )}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      flexShrink: 0,
                    }}
                  >
                    {offer ? (
                      <>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            padding: "5px 9px",
                            borderRadius: "20px",
                            background:
                              offer.status === "published"
                                ? "#132a21"
                                : "#2a2418",
                            color:
                              offer.status === "published"
                                ? "#6ee7b7"
                                : "#facc15",
                            fontSize: "10px",
                            fontWeight: 600,
                          }}
                        >
                          {offer.status ===
                          "published" ? (
                            <CheckCircle2 size={12} />
                          ) : (
                            <Clock3 size={12} />
                          )}

                          {offer.status ===
                          "published"
                            ? "Publicada"
                            : "Pendente"}
                        </span>

                        {product.product_url && (
                          <button
                            className="text-button"
                            title="Abrir produto"
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
                      </>
                    ) : (
                      <>
                        {product.product_url && (
                          <button
                            className="text-button"
                            title="Abrir produto"
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
                          className="primary-button"
                          onClick={() =>
                            generateOffer(product)
                          }
                          disabled={
                            generating === product.id
                          }
                          style={{
                            minWidth: "130px",
                          }}
                        >
                          {generating === product.id ? (
                            <>
                              <RefreshCw
                                size={14}
                                style={{
                                  animation:
                                    "spin 1s linear infinite",
                                }}
                              />
                              Gerando...
                            </>
                          ) : (
                            <>
                              <Tag size={14} />
                              Gerar oferta
                            </>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}