import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Megaphone,
  RefreshCw,
  Search,
  Send,
  XCircle,
} from "lucide-react";

import { supabase } from "../lib/supabase";

type PublicationStatus =
  | "pending"
  | "publishing"
  | "published"
  | "failed"
  | "cancelled";

type ChannelType =
  | "facebook"
  | "instagram"
  | "tiktok"
  | "telegram"
  | "whatsapp";

type Publication = {
  id: string;
  offer_id: string;
  channel_id: string;
  status: PublicationStatus;
  external_post_id: string | null;
  published_at: string | null;
  error_message: string | null;
  attempts: number;
  next_retry_at: string | null;
  created_at: string;
  updated_at: string;
};

type Offer = {
  id: string;
  title: string | null;
  product_id: string;
  affiliate_url: string | null;
  status: string;
};

type Product = {
  id: string;
  title: string;
  image_url: string | null;
  price: number | null;
};

type Channel = {
  id: string;
  name: string;
  type: ChannelType;
};

type PublicationRow = Publication & {
  offer?: Offer;
  product?: Product;
  channel?: Channel;
};

function getStatusLabel(status: PublicationStatus) {
  switch (status) {
    case "pending":
      return "Pendente";

    case "publishing":
      return "Publicando";

    case "published":
      return "Publicado";

    case "failed":
      return "Falhou";

    case "cancelled":
      return "Cancelado";

    default:
      return status;
  }
}

function getStatusClass(status: PublicationStatus) {
  switch (status) {
    case "published":
      return "success";

    case "pending":
    case "publishing":
      return "warning";

    case "failed":
      return "error";

    case "cancelled":
      return "muted";

    default:
      return "muted";
  }
}

function getChannelLabel(type?: ChannelType) {
  switch (type) {
    case "facebook":
      return "Facebook";

    case "instagram":
      return "Instagram";

    case "tiktok":
      return "TikTok";

    case "telegram":
      return "Telegram";

    case "whatsapp":
      return "WhatsApp";

    default:
      return "Canal";
  }
}

function getChannelIcon(type?: ChannelType) {
  switch (type) {
    case "telegram":
      return Send;

    case "whatsapp":
      return Megaphone;

    case "facebook":
    case "instagram":
    case "tiktok":
    default:
      return Megaphone;
  }
}

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
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

export function Publicacoes() {
  const [publications, setPublications] = useState<
    PublicationRow[]
  >([]);

  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");

  const [statusFilter, setStatusFilter] =
    useState<"all" | PublicationStatus>("all");

  const [channelFilter, setChannelFilter] =
    useState<"all" | ChannelType>("all");

  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const loadPublications = async () => {
    setLoading(true);
    setMessage(null);

    try {
      const [
        publicationsResult,
        offersResult,
        productsResult,
        channelsResult,
      ] = await Promise.all([
        supabase
          .from("channel_publications")
          .select(
            `
              id,
              offer_id,
              channel_id,
              status,
              external_post_id,
              published_at,
              error_message,
              attempts,
              next_retry_at,
              created_at,
              updated_at
            `
          )
          .order("created_at", {
            ascending: false,
          }),

        supabase
          .from("offers")
          .select(
            `
              id,
              title,
              product_id,
              affiliate_url,
              status
            `
          ),

        supabase
          .from("products")
          .select(
            `
              id,
              title,
              image_url,
              price
            `
          ),

        supabase
          .from("channels")
          .select(
            `
              id,
              name,
              type
            `
          ),
      ]);

      if (publicationsResult.error) {
        throw publicationsResult.error;
      }

      if (offersResult.error) {
        throw offersResult.error;
      }

      if (productsResult.error) {
        throw productsResult.error;
      }

      if (channelsResult.error) {
        throw channelsResult.error;
      }

      const offersMap = new Map<string, Offer>();

      for (const offer of (offersResult.data ||
        []) as Offer[]) {
        offersMap.set(offer.id, offer);
      }

      const productsMap = new Map<string, Product>();

      for (const product of (productsResult.data ||
        []) as Product[]) {
        productsMap.set(product.id, product);
      }

      const channelsMap = new Map<string, Channel>();

      for (const channel of (channelsResult.data ||
        []) as Channel[]) {
        channelsMap.set(channel.id, channel);
      }

      const rows = (
        (publicationsResult.data || []) as Publication[]
      ).map((publication) => {
        const offer = offersMap.get(
          publication.offer_id
        );

        const product = offer
          ? productsMap.get(offer.product_id)
          : undefined;

        const channel = channelsMap.get(
          publication.channel_id
        );

        return {
          ...publication,
          offer,
          product,
          channel,
        };
      });

      setPublications(rows);
    } catch (error) {
      console.error(
        "Erro ao carregar publicações:",
        error
      );

      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Não foi possível carregar as publicações.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPublications();
  }, []);

  const channelTypes = useMemo(() => {
    const types = new Set<ChannelType>();

    for (const publication of publications) {
      if (publication.channel?.type) {
        types.add(publication.channel.type);
      }
    }

    return Array.from(types);
  }, [publications]);

  const filteredPublications = useMemo(() => {
    const normalizedSearch = search
      .trim()
      .toLowerCase();

    return publications.filter((publication) => {
      if (
        statusFilter !== "all" &&
        publication.status !== statusFilter
      ) {
        return false;
      }

      if (
        channelFilter !== "all" &&
        publication.channel?.type !== channelFilter
      ) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const values = [
        publication.offer?.title,
        publication.product?.title,
        publication.channel?.name,
        publication.external_post_id,
        publication.error_message,
      ];

      return values.some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(normalizedSearch)
      );
    });
  }, [
    publications,
    search,
    statusFilter,
    channelFilter,
  ]);

  const stats = useMemo(() => {
    return {
      total: publications.length,

      published: publications.filter(
        (item) => item.status === "published"
      ).length,

      pending: publications.filter(
        (item) =>
          item.status === "pending" ||
          item.status === "publishing"
      ).length,

      failed: publications.filter(
        (item) => item.status === "failed"
      ).length,
    };
  }, [publications]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">
            DISTRIBUIÇÃO
          </p>

          <h1>Publicações</h1>

          <p className="page-description">
            Acompanhe o histórico de distribuição das
            ofertas nos canais configurados.
          </p>
        </div>

        <div className="page-actions">
          <button
            type="button"
            className="button secondary"
            onClick={loadPublications}
            disabled={loading}
          >
            <RefreshCw
              size={16}
              className={
                loading ? "spin" : ""
              }
            />

            Atualizar
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`alert ${
            message.type === "error"
              ? "alert-error"
              : "alert-success"
          }`}
        >
          <AlertCircle size={17} />

          <span>{message.text}</span>
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-label">
            Total de publicações
          </div>

          <div className="stat-card-value">
            {stats.total}
          </div>

          <div className="stat-description">
            Registros na fila e no histórico
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">
            Publicadas
          </div>

          <div className="stat-card-value">
            {stats.published}
          </div>

          <div className="stat-description">
            Publicações concluídas
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">
            Pendentes
          </div>

          <div className="stat-card-value">
            {stats.pending}
          </div>

          <div className="stat-description">
            Aguardando processamento
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">
            Falhas
          </div>

          <div className="stat-card-value">
            {stats.failed}
          </div>

          <div className="stat-description">
            Publicações que precisam de atenção
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>Histórico de publicações</h2>

            <p>
              Cada registro representa uma tentativa de
              publicação de uma oferta em um canal.
            </p>
          </div>

          <span className="panel-count">
            {filteredPublications.length}
          </span>
        </div>

        <div className="filters-row">
          <div className="search-box">
            <Search size={16} />

            <input
              type="text"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Buscar oferta, produto, canal ou erro..."
            />
          </div>

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value as
                  | "all"
                  | PublicationStatus
              )
            }
          >
            <option value="all">
              Todos os status
            </option>

            <option value="pending">
              Pendentes
            </option>

            <option value="publishing">
              Publicando
            </option>

            <option value="published">
              Publicados
            </option>

            <option value="failed">
              Falhos
            </option>

            <option value="cancelled">
              Cancelados
            </option>
          </select>

          <select
            value={channelFilter}
            onChange={(event) =>
              setChannelFilter(
                event.target.value as
                  | "all"
                  | ChannelType
              )
            }
          >
            <option value="all">
              Todos os canais
            </option>

            {channelTypes.map((type) => (
              <option
                key={type}
                value={type}
              >
                {getChannelLabel(type)}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="empty-state">
            <div className="empty-icon">
              <RefreshCw
                size={22}
                className="spin"
              />
            </div>

            <h3>
              Carregando publicações...
            </h3>

            <p>
              Buscando o histórico de distribuição.
            </p>
          </div>
        ) : filteredPublications.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <Megaphone size={24} />
            </div>

            <h3>
              {publications.length === 0
                ? "Nenhuma publicação"
                : "Nenhum resultado encontrado"}
            </h3>

            <p>
              {publications.length === 0
                ? "Quando uma oferta entrar na fila de publicação, o histórico aparecerá aqui."
                : "Tente alterar os filtros ou o termo da busca."}
            </p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Oferta</th>
                  <th>Canal</th>
                  <th>Status</th>
                  <th>Tentativas</th>
                  <th>Data</th>
                  <th>Resultado</th>
                </tr>
              </thead>

              <tbody>
                {filteredPublications.map(
                  (publication) => {
                    const ChannelIcon =
                      getChannelIcon(
                        publication.channel?.type
                      );

                    const productTitle =
                      publication.product?.title ||
                      publication.offer?.title ||
                      "Oferta sem título";

                    return (
                      <tr
                        key={publication.id}
                      >
                        <td>
                          <div className="product-cell">
                            {publication.product
                              ?.image_url ? (
                              <img
                                src={
                                  publication
                                    .product
                                    .image_url
                                }
                                alt=""
                                className="product-thumb"
                              />
                            ) : (
                              <div className="product-thumb-placeholder">
                                <Megaphone
                                  size={18}
                                />
                              </div>
                            )}

                            <div>
                              <strong
                                title={
                                  productTitle
                                }
                              >
                                {productTitle}
                              </strong>

                              <span>
                                {formatPrice(
                                  publication
                                    .product
                                    ?.price ??
                                    null
                                )}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td>
                          <div className="table-main">
                            <div className="channel-icon">
                              <ChannelIcon
                                size={17}
                              />
                            </div>

                            <div>
                              <strong>
                                {publication
                                  .channel
                                  ?.name ||
                                  "Canal removido"}
                              </strong>

                              <span>
                                {getChannelLabel(
                                  publication
                                    .channel
                                    ?.type
                                )}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td>
                          <span
                            className={`status-badge ${getStatusClass(
                              publication.status
                            )}`}
                          >
                            {publication.status ===
                            "published" ? (
                              <CheckCircle2
                                size={13}
                              />
                            ) : publication.status ===
                              "failed" ? (
                              <XCircle
                                size={13}
                              />
                            ) : publication.status ===
                              "pending" ? (
                              <Clock3
                                size={13}
                              />
                            ) : publication.status ===
                              "publishing" ? (
                              <RefreshCw
                                size={13}
                                className="spin"
                              />
                            ) : (
                              <XCircle
                                size={13}
                              />
                            )}

                            {getStatusLabel(
                              publication.status
                            )}
                          </span>
                        </td>

                        <td>
                          <span className="muted">
                            {publication.attempts}
                          </span>
                        </td>

                        <td>
                          <span className="muted">
                            {formatDate(
                              publication.published_at ||
                                publication.created_at
                            )}
                          </span>
                        </td>

                        <td>
                          {publication.status ===
                          "failed" ? (
                            <span
                              className="muted"
                              title={
                                publication.error_message ||
                                "Erro não informado"
                              }
                            >
                              {publication.error_message ||
                                "Erro não informado"}
                            </span>
                          ) : publication.external_post_id ? (
                            <span
                              className="muted"
                              title={
                                publication.external_post_id
                              }
                            >
                              ID:{" "}
                              {
                                publication.external_post_id
                              }
                            </span>
                          ) : publication.status ===
                            "published" ? (
                            <span className="muted">
                              Concluída
                            </span>
                          ) : publication.next_retry_at ? (
                            <span className="muted">
                              Retry:{" "}
                              {formatDate(
                                publication.next_retry_at
                              )}
                            </span>
                          ) : (
                            <span className="muted">
                              Aguardando
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  }
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}