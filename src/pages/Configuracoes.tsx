import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Plus,
  RefreshCw,
  ShoppingCart,
  Trash2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { supabase } from "../lib/supabase";

interface MarketplaceStatus {
  connected: boolean;
  marketplace?: string;
  external_user_id?: string;
  token_expires_at?: string;
}

interface SearchTerm {
  id: string;
  term: string;
  active: boolean;
  created_at: string;
}

export function Configuracoes() {
  const [status, setStatus] = useState<MarketplaceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [searchTerms, setSearchTerms] = useState<SearchTerm[]>([]);
  const [termsLoading, setTermsLoading] = useState(true);
  const [newTerm, setNewTerm] = useState("");
  const [savingTerm, setSavingTerm] = useState(false);

  async function loadMarketplaceStatus() {
    try {
      setLoading(true);
      setError("");

      const { data, error } = await supabase.functions.invoke(
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
      console.error("Erro ao carregar status do Mercado Livre:", err);

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

  async function loadSearchTerms() {
    try {
      setTermsLoading(true);

      const { data, error } = await supabase
        .from("search_terms")
        .select("id, term, active, created_at")
        .order("created_at", { ascending: true });

      if (error) {
        throw error;
      }

      setSearchTerms(data || []);
    } catch (err: any) {
      console.error("Erro ao carregar buscas automáticas:", err);

      setError(
        err?.message ||
          err?.details ||
          err?.hint ||
          "Não foi possível carregar os termos de busca."
      );
    } finally {
      setTermsLoading(false);
    }
  }

  async function addSearchTerm() {
    const term = newTerm.trim();

    if (!term) {
      return;
    }

    try {
      setSavingTerm(true);
      setError("");

      const alreadyExists = searchTerms.some(
        (item) => item.term.toLowerCase() === term.toLowerCase()
      );

      if (alreadyExists) {
        setError("Esse termo já está cadastrado.");
        return;
      }

      const { data, error } = await supabase
        .from("search_terms")
        .insert({
          term,
          active: true,
        })
        .select("id, term, active, created_at")
        .single();

      if (error) {
        throw error;
      }

      if (data) {
        setSearchTerms((current) => [...current, data]);
      }

      setNewTerm("");
    } catch (err: any) {
      console.error("Erro ao adicionar termo:", err);

      setError(
        err?.message ||
          err?.details ||
          err?.hint ||
          "Não foi possível adicionar o termo."
      );
    } finally {
      setSavingTerm(false);
    }
  }

  async function toggleSearchTerm(searchTerm: SearchTerm) {
    try {
      setError("");

      const { error } = await supabase
        .from("search_terms")
        .update({
          active: !searchTerm.active,
          updated_at: new Date().toISOString(),
        })
        .eq("id", searchTerm.id);

      if (error) {
        throw error;
      }

      setSearchTerms((current) =>
        current.map((item) =>
          item.id === searchTerm.id
            ? {
                ...item,
                active: !item.active,
              }
            : item
        )
      );
    } catch (err: any) {
      console.error("Erro ao alterar status do termo:", err);

      setError(
        err?.message ||
          err?.details ||
          err?.hint ||
          "Não foi possível alterar o status do termo."
      );
    }
  }

  async function deleteSearchTerm(searchTerm: SearchTerm) {
    const confirmed = window.confirm(
      `Deseja realmente excluir a busca "${searchTerm.term}"?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setError("");

      const { error } = await supabase
        .from("search_terms")
        .delete()
        .eq("id", searchTerm.id);

      if (error) {
        throw error;
      }

      setSearchTerms((current) =>
        current.filter((item) => item.id !== searchTerm.id)
      );
    } catch (err: any) {
      console.error("Erro ao excluir termo:", err);

      setError(
        err?.message ||
          err?.details ||
          err?.hint ||
          "Não foi possível excluir o termo."
      );
    }
  }

  function conectarMercadoLivre() {
    window.open(
      "https://pndbombvfrxpyqnraqsy.supabase.co/functions/v1/mercado-livre-oauth?action=start",
      "_blank"
    );
  }

  function abrirMercadoLivre() {
    window.open("https://www.mercadolivre.com.br/", "_blank");
  }

  function formatExpiration(dateString?: string) {
    if (!dateString) {
      return "Não informado";
    }

    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) {
      return "Não informado";
    }

    return date.toLocaleString("pt-BR");
  }

  useEffect(() => {
    loadMarketplaceStatus();
    loadSearchTerms();
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Configurações</h1>
          <p>
            Configure as integrações e o funcionamento automático do Ofertix.
          </p>
        </div>
      </div>

      {error && (
        <div
          style={{
            marginBottom: 20,
            padding: 14,
            borderRadius: 10,
            background: "#fff1f2",
            border: "1px solid #fecdd3",
            color: "#be123c",
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        {/* MERCADO LIVRE */}
        <div className="card">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 20,
              gap: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#fff7ed",
                  color: "#ea580c",
                }}
              >
                <ShoppingCart size={22} />
              </div>

              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 18,
                  }}
                >
                  Mercado Livre
                </h2>

                <p
                  style={{
                    margin: "4px 0 0",
                    color: "#64748b",
                    fontSize: 14,
                  }}
                >
                  Integração com a conta do Mercado Livre
                </p>
              </div>
            </div>

            {loading ? (
              <span
                style={{
                  color: "#64748b",
                  fontSize: 14,
                }}
              >
                Verificando...
              </span>
            ) : status?.connected ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  color: "#16a34a",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                <CheckCircle2 size={18} />
                Conectado
              </div>
            ) : (
              <span
                style={{
                  color: "#64748b",
                  fontSize: 14,
                }}
              >
                Não conectado
              </span>
            )}
          </div>

          {status?.connected ? (
            <div>
              <div
                style={{
                  padding: 16,
                  borderRadius: 10,
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 16,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#64748b",
                        marginBottom: 5,
                      }}
                    >
                      Marketplace
                    </div>

                    <div
                      style={{
                        fontWeight: 600,
                      }}
                    >
                      {status.marketplace || "Mercado Livre"}
                    </div>
                  </div>

                  <div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#64748b",
                        marginBottom: 5,
                      }}
                    >
                      Usuário
                    </div>

                    <div
                      style={{
                        fontWeight: 600,
                      }}
                    >
                      {status.external_user_id || "Não informado"}
                    </div>
                  </div>

                  <div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#64748b",
                        marginBottom: 5,
                      }}
                    >
                      Token válido até
                    </div>

                    <div
                      style={{
                        fontWeight: 600,
                      }}
                    >
                      {formatExpiration(status.token_expires_at)}
                    </div>
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                <button
                  className="button secondary"
                  onClick={abrirMercadoLivre}
                >
                  <ExternalLink size={16} />
                  Abrir Mercado Livre
                </button>

                <button
                  className="button secondary"
                  onClick={conectarMercadoLivre}
                >
                  <RefreshCw size={16} />
                  Atualizar conexão
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p
                style={{
                  marginTop: 0,
                  color: "#64748b",
                  lineHeight: 1.6,
                }}
              >
                Conecte sua conta do Mercado Livre para permitir que o Ofertix
                consulte produtos e ofertas automaticamente.
              </p>

              <button className="button primary" onClick={conectarMercadoLivre}>
                <ShoppingCart size={16} />
                Conectar Mercado Livre
              </button>
            </div>
          )}
        </div>

        {/* BUSCAS AUTOMÁTICAS */}
        <div className="card">
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 16,
              marginBottom: 20,
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: 18,
                }}
              >
                Buscas automáticas
              </h2>

              <p
                style={{
                  margin: "6px 0 0",
                  color: "#64748b",
                  fontSize: 14,
                  lineHeight: 1.5,
                }}
              >
                Defina os termos que o Ofertix utilizará para procurar novos
                produtos automaticamente no Mercado Livre.
              </p>
            </div>

            <button
              className="button secondary"
              onClick={loadSearchTerms}
              disabled={termsLoading}
              title="Atualizar buscas"
            >
              <RefreshCw
                size={16}
                style={{
                  animation: termsLoading
                    ? "spin 1s linear infinite"
                    : undefined,
                }}
              />
              Atualizar
            </button>
          </div>

          {/* ADICIONAR TERMO */}
          <div
            style={{
              display: "flex",
              gap: 10,
              marginBottom: 20,
              flexWrap: "wrap",
            }}
          >
            <input
              type="text"
              value={newTerm}
              onChange={(event) => setNewTerm(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  addSearchTerm();
                }
              }}
              placeholder="Ex.: Pneus aro 15"
              disabled={savingTerm}
              style={{
                flex: 1,
                minWidth: 240,
                height: 42,
                padding: "0 14px",
                borderRadius: 9,
                border: "1px solid #cbd5e1",
                outline: "none",
                fontSize: 14,
              }}
            />

            <button
              className="button primary"
              onClick={addSearchTerm}
              disabled={savingTerm || !newTerm.trim()}
            >
              <Plus size={17} />
              {savingTerm ? "Adicionando..." : "Adicionar"}
            </button>
          </div>

          {/* LISTA */}
          {termsLoading ? (
            <div
              style={{
                padding: 30,
                textAlign: "center",
                color: "#64748b",
              }}
            >
              Carregando buscas...
            </div>
          ) : searchTerms.length === 0 ? (
            <div
              style={{
                padding: 30,
                textAlign: "center",
                color: "#64748b",
                border: "1px dashed #cbd5e1",
                borderRadius: 10,
              }}
            >
              Nenhum termo de busca cadastrado.
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {searchTerms.map((searchTerm) => (
                <div
                  key={searchTerm.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "12px 14px",
                    borderRadius: 10,
                    border: "1px solid #e2e8f0",
                    background: searchTerm.active ? "#ffffff" : "#f8fafc",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        width: 9,
                        height: 9,
                        minWidth: 9,
                        borderRadius: "50%",
                        background: searchTerm.active
                          ? "#22c55e"
                          : "#94a3b8",
                      }}
                    />

                    <div
                      style={{
                        minWidth: 0,
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 600,
                          color: searchTerm.active ? "#0f172a" : "#64748b",
                          wordBreak: "break-word",
                        }}
                      >
                        {searchTerm.term}
                      </div>

                      <div
                        style={{
                          marginTop: 3,
                          fontSize: 12,
                          color: "#94a3b8",
                        }}
                      >
                        {searchTerm.active ? "Busca ativa" : "Busca pausada"}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <button
                      onClick={() => toggleSearchTerm(searchTerm)}
                      title={
                        searchTerm.active
                          ? "Desativar busca"
                          : "Ativar busca"
                      }
                      style={{
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        padding: 6,
                        color: searchTerm.active ? "#16a34a" : "#94a3b8",
                      }}
                    >
                      {searchTerm.active ? (
                        <ToggleRight size={28} />
                      ) : (
                        <ToggleLeft size={28} />
                      )}
                    </button>

                    <button
                      onClick={() => deleteSearchTerm(searchTerm)}
                      title="Excluir busca"
                      style={{
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        padding: 6,
                        color: "#ef4444",
                      }}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 9,
              background: "#f8fafc",
              color: "#64748b",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            <strong>Como funciona:</strong> somente os termos ativos serão
            utilizados pelo sincronizador automático do Mercado Livre. Ao
            adicionar um novo termo aqui, não é necessário alterar o código do
            sistema.
          </div>
        </div>
      </div>

      <style>
        {`
          @keyframes spin {
            from {
              transform: rotate(0deg);
            }

            to {
              transform: rotate(360deg);
            }
          }
        `}
      </style>
    </div>
  );
}