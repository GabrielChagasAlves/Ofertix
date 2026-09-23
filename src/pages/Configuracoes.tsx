import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  ShoppingCart,
  Settings2,
} from "lucide-react";

import { supabase } from "../lib/supabase";

interface MarketplaceStatus {
  connected: boolean;
  marketplace?: string;
  external_user_id?: string;
  token_expires_at?: string;
}

export function Configuracoes() {
  const [status, setStatus] =
    useState<MarketplaceStatus | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadMarketplaceStatus() {
    try {
      setLoading(true);
      setError("");

      const { data, error } =
        await supabase.functions.invoke(
          "marketplace-status",
          {
            body: {},
          }
        );

      if (error) {
        throw error;
      }

      setStatus(data);
    } catch (err: any) {
      console.error(
        "Erro ao carregar status do Mercado Livre:",
        err
      );

      setError(
        err?.message ||
          err?.details ||
          err?.hint ||
          "Não foi possível carregar o status do Mercado Livre."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMarketplaceStatus();
  }, []);

  function conectarMercadoLivre() {
    window.open(
      "https://pndbombvfrxpyqnraqsy.supabase.co/functions/v1/mercado-livre-oauth?action=start",
      "_blank"
    );
  }

  function abrirMercadoLivre() {
    window.open(
      "https://www.mercadolivre.com.br/",
      "_blank",
      "noopener,noreferrer"
    );
  }

  function formatExpiration(
    dateString?: string
  ) {
    if (!dateString) {
      return "Não informado";
    }

    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) {
      return "Não informado";
    }

    return date.toLocaleString("pt-BR");
  }

  return (
    <div className="page settings-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">
            SISTEMA
          </p>

          <h1>Configurações</h1>

          <p className="page-description">
            Configure as conexões e os parâmetros
            gerais do Ofertix.
          </p>
        </div>
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

      <div className="settings-stack">
        {/* =====================================================
            MERCADO LIVRE
            ===================================================== */}

        <section className="card settings-card">
          <div className="settings-section-header">
            <div className="settings-title-area">
              <div className="settings-icon marketplace-icon">
                <ShoppingCart size={21} />
              </div>

              <div>
                <h2>Mercado Livre</h2>

                <p>
                  Conexão utilizada pelo Ofertix
                  para consultar produtos e
                  publicações.
                </p>
              </div>
            </div>

            {loading ? (
              <span className="settings-connection checking">
                Verificando...
              </span>
            ) : status?.connected ? (
              <span className="settings-connection connected">
                <CheckCircle2 size={17} />
                Conectado
              </span>
            ) : (
              <span className="settings-connection disconnected">
                Não conectado
              </span>
            )}
          </div>

          {status?.connected ? (
            <>
              <div className="connection-info">
                <div>
                  <span>
                    Marketplace
                  </span>

                  <strong>
                    {status.marketplace ||
                      "Mercado Livre"}
                  </strong>
                </div>

                <div>
                  <span>
                    Usuário
                  </span>

                  <strong>
                    {status.external_user_id ||
                      "Não informado"}
                  </strong>
                </div>

                <div>
                  <span>
                    Token válido até
                  </span>

                  <strong>
                    {formatExpiration(
                      status.token_expires_at
                    )}
                  </strong>
                </div>
              </div>

              <div className="settings-actions">
                <button
                  className="button secondary"
                  onClick={
                    abrirMercadoLivre
                  }
                >
                  <ExternalLink size={16} />
                  Abrir Mercado Livre
                </button>

                <button
                  className="button secondary"
                  onClick={
                    conectarMercadoLivre
                  }
                >
                  <RefreshCw size={16} />
                  Atualizar conexão
                </button>
              </div>
            </>
          ) : (
            <div className="connection-empty">
              <p>
                Conecte sua conta do Mercado
                Livre para permitir que o
                Ofertix consulte produtos
                automaticamente.
              </p>

              <button
                className="primary-button"
                onClick={
                  conectarMercadoLivre
                }
              >
                <ShoppingCart size={17} />
                Conectar Mercado Livre
              </button>
            </div>
          )}
        </section>

        {/* =====================================================
            COMO O OFERTIX FUNCIONA
            ===================================================== */}

        <section className="card settings-card">
          <div className="settings-section-header">
            <div className="settings-title-area">
              <div className="settings-icon category-icon">
                <Settings2 size={21} />
              </div>

              <div>
                <h2>
                  Funcionamento automático
                </h2>

                <p>
                  A busca de produtos é
                  determinada pelas regras
                  cadastradas no Ofertix.
                </p>
              </div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "12px",
            }}
          >
            <div
              style={{
                padding: "15px",
                border: "1px solid #202734",
                borderRadius: "10px",
                background: "#0b0f16",
              }}
            >
              <strong
                style={{
                  display: "block",
                  color: "#e8edf5",
                  fontSize: "12px",
                }}
              >
                Regras controlam as buscas
              </strong>

              <p
                style={{
                  margin: "7px 0 0",
                  color: "#687386",
                  fontSize: "10px",
                  lineHeight: 1.6,
                }}
              >
                Cada regra define a categoria,
                os termos de pesquisa e os
                critérios necessários para um
                produto ser considerado.
              </p>
            </div>

            <div
              style={{
                padding: "15px",
                border: "1px solid #202734",
                borderRadius: "10px",
                background: "#0b0f16",
              }}
            >
              <strong
                style={{
                  display: "block",
                  color: "#e8edf5",
                  fontSize: "12px",
                }}
              >
                Configurações não fazem buscas
              </strong>

              <p
                style={{
                  margin: "7px 0 0",
                  color: "#687386",
                  fontSize: "10px",
                  lineHeight: 1.6,
                }}
              >
                Não existem termos específicos
                de nichos ou categorias nesta
                tela. Isso evita que a integração
                fique dependente de configurações
                fixas.
              </p>
            </div>

            <div
              style={{
                padding: "15px",
                border: "1px solid #202734",
                borderRadius: "10px",
                background: "#0b0f16",
              }}
            >
              <strong
                style={{
                  display: "block",
                  color: "#e8edf5",
                  fontSize: "12px",
                }}
              >
                Automação segue as regras
              </strong>

              <p
                style={{
                  margin: "7px 0 0",
                  color: "#687386",
                  fontSize: "10px",
                  lineHeight: 1.6,
                }}
              >
                O sincronizador consulta as
                regras ativas e executa somente
                as pesquisas relacionadas a
                elas.
              </p>
            </div>
          </div>
        </section>

        {/* =====================================================
            INFORMAÇÃO
            ===================================================== */}

        <section className="card settings-card">
          <div className="settings-section-header">
            <div className="settings-title-area">
              <div className="settings-icon category-icon">
                <Settings2 size={21} />
              </div>

              <div>
                <h2>
                  Onde configurar cada coisa
                </h2>

                <p>
                  Cada tela possui uma
                  responsabilidade específica.
                </p>
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            {[
              [
                "Regras",
                "Definem o que o Ofertix deve procurar e quais produtos podem virar ofertas.",
              ],
              [
                "Produtos",
                "Mostram os produtos encontrados pelas integrações e pelas regras.",
              ],
              [
                "Links de Afiliado",
                "Controlam os produtos que precisam de um link oficial de afiliado.",
              ],
              [
                "Execuções",
                "Mostram o histórico das automações executadas.",
              ],
              [
                "Publicações",
                "Mostram o que foi enviado para cada canal.",
              ],
              [
                "Configurações",
                "Mantêm apenas parâmetros gerais e conexões do sistema.",
              ],
            ].map(
              ([title, description]) => (
                <div
                  key={title}
                  style={{
                    display: "flex",
                    alignItems:
                      "flex-start",
                    gap: "12px",
                    padding: "12px 14px",
                    border:
                      "1px solid #202734",
                    borderRadius: "9px",
                    background:
                      "#0b0f16",
                  }}
                >
                  <div
                    style={{
                      width: "7px",
                      height: "7px",
                      marginTop: "5px",
                      flexShrink: 0,
                      borderRadius: "50%",
                      background:
                        "#3b82f6",
                    }}
                  />

                  <div>
                    <strong
                      style={{
                        display:
                          "block",
                        color:
                          "#e8edf5",
                        fontSize:
                          "11px",
                      }}
                    >
                      {title}
                    </strong>

                    <span
                      style={{
                        display:
                          "block",
                        marginTop:
                          "4px",
                        color:
                          "#687386",
                        fontSize:
                          "10px",
                        lineHeight:
                          1.5,
                      }}
                    >
                      {description}
                    </span>
                  </div>
                </div>
              )
            )}
          </div>
        </section>
      </div>
    </div>
  );
}