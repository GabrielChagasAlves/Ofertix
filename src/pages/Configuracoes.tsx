import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  ShoppingCart,
} from "lucide-react";

import { supabase } from "../lib/supabase";

interface MarketplaceStatus {
  connected: boolean;
  marketplace?: string;
  external_user_id?: string;
  token_expires_at?: string;
  error?: string;
}

export function Configuracoes() {
  const [status, setStatus] =
    useState<MarketplaceStatus | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadMarketplaceStatus() {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase.functions.invoke(
      "marketplace-status",
      {
        body: {},
      }
    );

    if (error) {
      console.error("Erro ao consultar marketplace:", error);

      setStatus(null);
      setError(
        "Não foi possível verificar a conexão com o Mercado Livre."
      );

      setLoading(false);
      return;
    }

    if (!data) {
      setStatus({
        connected: false,
      });

      setLoading(false);
      return;
    }

    setStatus(data as MarketplaceStatus);
    setLoading(false);
  }

  useEffect(() => {
    loadMarketplaceStatus();
  }, []);

  function conectarMercadoLivre() {
    window.location.href =
      "https://pndbombvfrxpyqnraqsy.supabase.co/functions/v1/mercado-livre-oauth?action=start";
  }

  function abrirMercadoLivre() {
    window.open(
      "https://www.mercadolivre.com.br",
      "_blank",
      "noopener,noreferrer"
    );
  }

  function formatExpiration(date: string | undefined) {
    if (!date) {
      return "Não informado";
    }

    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(date));
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">SISTEMA</p>

          <h1>Configurações</h1>

          <p className="page-description">
            Configure as integrações e o funcionamento do
            Ofertix.
          </p>
        </div>
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
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          <div>
            <p className="eyebrow">INTEGRAÇÕES</p>

            <h2
              style={{
                margin: "6px 0 0",
                color: "#e8edf5",
                fontSize: "17px",
              }}
            >
              Marketplaces
            </h2>

            <p
              style={{
                margin: "6px 0 0",
                color: "#687386",
                fontSize: "11px",
              }}
            >
              Gerencie as conexões utilizadas pelo Ofertix.
            </p>
          </div>

          <button
            className="text-button"
            onClick={loadMarketplaceStatus}
            title="Atualizar conexão"
            disabled={loading}
          >
            <RefreshCw
              size={16}
              style={{
                animation: loading
                  ? "spin 1s linear infinite"
                  : "none",
              }}
            />
          </button>
        </div>

        <div
          style={{
            border: "1px solid #202734",
            borderRadius: "10px",
            padding: "18px",
            background: "#0b0f16",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "18px",
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "14px",
              }}
            >
              <div
                style={{
                  width: "46px",
                  height: "46px",
                  borderRadius: "10px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#171d29",
                  color: "#60a5fa",
                }}
              >
                <ShoppingCart size={23} />
              </div>

              <div>
                <div
                  style={{
                    color: "#e8edf5",
                    fontSize: "14px",
                    fontWeight: 600,
                  }}
                >
                  Mercado Livre
                </div>

                <div
                  style={{
                    color: "#687386",
                    fontSize: "11px",
                    marginTop: "4px",
                  }}
                >
                  Integração para busca e sincronização de
                  produtos.
                </div>
              </div>
            </div>

            {loading ? (
              <span
                style={{
                  padding: "6px 10px",
                  borderRadius: "20px",
                  background: "#171d29",
                  color: "#8d98aa",
                  fontSize: "10px",
                  fontWeight: 600,
                }}
              >
                Verificando...
              </span>
            ) : status?.connected ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 10px",
                  borderRadius: "20px",
                  background: "#132a21",
                  color: "#6ee7b7",
                  fontSize: "10px",
                  fontWeight: 600,
                }}
              >
                <CheckCircle2 size={13} />
                Conectado
              </span>
            ) : (
              <span
                style={{
                  padding: "6px 10px",
                  borderRadius: "20px",
                  background: "#29202a",
                  color: "#a7adba",
                  fontSize: "10px",
                  fontWeight: 600,
                }}
              >
                Não conectado
              </span>
            )}
          </div>

          {status?.connected && (
            <div
              style={{
                marginTop: "18px",
                paddingTop: "18px",
                borderTop: "1px solid #202734",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "14px",
                }}
              >
                <div>
                  <div
                    style={{
                      color: "#687386",
                      fontSize: "10px",
                      textTransform: "uppercase",
                    }}
                  >
                    Conta Mercado Livre
                  </div>

                  <div
                    style={{
                      color: "#cbd3df",
                      fontSize: "12px",
                      marginTop: "5px",
                    }}
                  >
                    {status.external_user_id}
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      color: "#687386",
                      fontSize: "10px",
                      textTransform: "uppercase",
                    }}
                  >
                    Token válido até
                  </div>

                  <div
                    style={{
                      color: "#cbd3df",
                      fontSize: "12px",
                      marginTop: "5px",
                    }}
                  >
                    {formatExpiration(
                      status.token_expires_at
                    )}
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  marginTop: "18px",
                  flexWrap: "wrap",
                }}
              >
                <button
                  className="primary-button"
                  onClick={abrirMercadoLivre}
                >
                  <ExternalLink size={15} />
                  Abrir Mercado Livre
                </button>

                <button
                  className="secondary-button"
                  onClick={loadMarketplaceStatus}
                >
                  <RefreshCw size={15} />
                  Atualizar
                </button>
              </div>
            </div>
          )}

          {!loading && !status?.connected && (
            <div
              style={{
                marginTop: "18px",
                paddingTop: "18px",
                borderTop: "1px solid #202734",
              }}
            >
              <button
                className="primary-button"
                onClick={conectarMercadoLivre}
              >
                <ShoppingCart size={16} />
                Conectar Mercado Livre
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}