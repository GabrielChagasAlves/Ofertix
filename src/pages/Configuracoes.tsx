import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FolderKanban,
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
  category_id: string | null;
  created_at: string;
}

interface OfferCategory {
  id: string;
  name: string;
  slug: string;
  priority: number;
  active: boolean;
}

export function Configuracoes() {
  const [status, setStatus] = useState<MarketplaceStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const [searchTerms, setSearchTerms] = useState<SearchTerm[]>([]);
  const [categories, setCategories] = useState<OfferCategory[]>([]);
  const [termsLoading, setTermsLoading] = useState(true);

  const [newTerm, setNewTerm] = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [savingTerm, setSavingTerm] = useState(false);

  const [error, setError] = useState("");

  const [openCategories, setOpenCategories] = useState<
    Record<string, boolean>
  >({});

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

  async function loadSearchTerms() {
    try {
      setTermsLoading(true);
      setError("");

      const [termsResult, categoriesResult] = await Promise.all([
        supabase
          .from("search_terms")
          .select(
            "id, term, active, category_id, created_at"
          )
          .order("created_at", {
            ascending: true,
          }),

        supabase
          .from("offer_categories")
          .select(
            "id, name, slug, priority, active"
          )
          .eq("active", true)
          .order("priority", {
            ascending: true,
          })
          .order("name", {
            ascending: true,
          }),
      ]);

      if (termsResult.error) {
        throw termsResult.error;
      }

      if (categoriesResult.error) {
        throw categoriesResult.error;
      }

      const loadedTerms = termsResult.data || [];
      const loadedCategories =
        categoriesResult.data || [];

      setSearchTerms(loadedTerms);
      setCategories(loadedCategories);

      setNewCategoryId((current) => {
        if (
          current &&
          loadedCategories.some(
            (category) => category.id === current
          )
        ) {
          return current;
        }

        return loadedCategories[0]?.id || "";
      });

      const initialOpenState: Record<
        string,
        boolean
      > = {};

      loadedCategories.forEach((category) => {
        initialOpenState[category.id] = true;
      });

      initialOpenState.uncategorized = true;

      setOpenCategories(initialOpenState);
    } catch (err: any) {
      console.error(
        "Erro ao carregar buscas automáticas:",
        err
      );

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

    if (!newCategoryId) {
      setError(
        "Selecione uma categoria para a busca."
      );
      return;
    }

    try {
      setSavingTerm(true);
      setError("");

      const alreadyExists = searchTerms.some(
        (item) =>
          item.term.toLowerCase() ===
          term.toLowerCase()
      );

      if (alreadyExists) {
        setError(
          "Esse termo já está cadastrado."
        );
        return;
      }

      const { data, error } = await supabase
        .from("search_terms")
        .insert({
          term,
          active: true,
          category_id: newCategoryId,
        })
        .select(
          "id, term, active, category_id, created_at"
        )
        .single();

      if (error) {
        throw error;
      }

      if (data) {
        setSearchTerms((current) => [
          ...current,
          data,
        ]);

        setOpenCategories((current) => ({
          ...current,
          [newCategoryId]: true,
        }));
      }

      setNewTerm("");
    } catch (err: any) {
      console.error(
        "Erro ao adicionar termo:",
        err
      );

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

  async function toggleSearchTerm(
    searchTerm: SearchTerm
  ) {
    try {
      setError("");

      const { error } = await supabase
        .from("search_terms")
        .update({
          active: !searchTerm.active,
          updated_at:
            new Date().toISOString(),
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
      console.error(
        "Erro ao alterar status do termo:",
        err
      );

      setError(
        err?.message ||
          err?.details ||
          err?.hint ||
          "Não foi possível alterar o status do termo."
      );
    }
  }

  async function deleteSearchTerm(
    searchTerm: SearchTerm
  ) {
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
        current.filter(
          (item) => item.id !== searchTerm.id
        )
      );
    } catch (err: any) {
      console.error(
        "Erro ao excluir termo:",
        err
      );

      setError(
        err?.message ||
          err?.details ||
          err?.hint ||
          "Não foi possível excluir o termo."
      );
    }
  }

  function toggleCategory(categoryId: string) {
    setOpenCategories((current) => ({
      ...current,
      [categoryId]: !current[categoryId],
    }));
  }

  function conectarMercadoLivre() {
    window.open(
      "https://pndbombvfrxpyqnraqsy.supabase.co/functions/v1/mercado-livre-oauth?action=start",
      "_blank"
    );
  }

  function abrirMercadoLivre() {
    window.open(
      "https://www.mercadolivre.com.br/",
      "_blank"
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

  const groupedCategories = useMemo(() => {
    const groups = categories.map(
      (category) => ({
        category,
        terms: searchTerms.filter(
          (term) =>
            term.category_id ===
            category.id
        ),
      })
    );

    const uncategorized =
      searchTerms.filter(
        (term) =>
          !term.category_id ||
          !categories.some(
            (category) =>
              category.id ===
              term.category_id
          )
      );

    if (uncategorized.length > 0) {
      groups.push({
        category: {
          id: "uncategorized",
          name: "Sem categoria",
          slug: "sem-categoria",
          priority: 999,
          active: true,
        },
        terms: uncategorized,
      });
    }

    return groups.filter(
      (group) => group.terms.length > 0
    );
  }, [categories, searchTerms]);

  useEffect(() => {
    loadMarketplaceStatus();
    loadSearchTerms();
  }, []);

  return (
    <div className="page settings-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">
            CONFIGURAÇÕES
          </p>

          <h1>Configurações</h1>

          <p className="page-description">
            Configure as integrações e o
            funcionamento automático do
            Ofertix.
          </p>
        </div>
      </div>

      {error && (
        <div className="settings-alert">
          {error}
        </div>
      )}

      <div className="settings-stack">
        {/* MERCADO LIVRE */}

        <section className="card settings-card">
          <div className="settings-section-header">
            <div className="settings-title-area">
              <div className="settings-icon marketplace-icon">
                <ShoppingCart size={21} />
              </div>

              <div>
                <h2>Mercado Livre</h2>

                <p>
                  Integração com a conta do
                  Mercado Livre
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
                  <span>Usuário</span>

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
                Ofertix consulte produtos e
                ofertas automaticamente.
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

        {/* BUSCAS AUTOMÁTICAS */}

        <section className="card settings-card">
          <div className="settings-section-header">
            <div className="settings-title-area">
              <div className="settings-icon category-icon">
                <FolderKanban size={21} />
              </div>

              <div>
                <h2>
                  Buscas automáticas
                </h2>

                <p>
                  Organize os termos de
                  pesquisa por categoria.
                  Somente buscas ativas serão
                  utilizadas pelo
                  sincronizador.
                </p>
              </div>
            </div>

            <button
              className="button secondary"
              onClick={
                loadSearchTerms
              }
              disabled={termsLoading}
            >
              <RefreshCw
                size={16}
                className={
                  termsLoading
                    ? "spin"
                    : ""
                }
              />

              Atualizar
            </button>
          </div>

          {/* NOVA BUSCA */}

          <div className="search-term-form">
            <div className="settings-field">
              <label htmlFor="search-term">
                Nova busca
              </label>

              <input
                id="search-term"
                type="text"
                value={newTerm}
                onChange={(event) =>
                  setNewTerm(
                    event.target.value
                  )
                }
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter"
                  ) {
                    addSearchTerm();
                  }
                }}
                placeholder="Ex.: Vara de pesca"
                disabled={savingTerm}
              />
            </div>

            <div className="settings-field category-field">
              <label htmlFor="search-category">
                Categoria
              </label>

              <select
                id="search-category"
                value={newCategoryId}
                onChange={(event) =>
                  setNewCategoryId(
                    event.target.value
                  )
                }
                disabled={
                  savingTerm ||
                  categories.length === 0
                }
              >
                {categories.length === 0 ? (
                  <option value="">
                    Nenhuma categoria
                    disponível
                  </option>
                ) : (
                  categories.map(
                    (category) => (
                      <option
                        key={
                          category.id
                        }
                        value={
                          category.id
                        }
                      >
                        {category.name}
                      </option>
                    )
                  )
                )}
              </select>
            </div>

            <button
              className="primary-button add-search-button"
              onClick={
                addSearchTerm
              }
              disabled={
                savingTerm ||
                !newTerm.trim() ||
                !newCategoryId
              }
            >
              <Plus size={17} />

              {savingTerm
                ? "Adicionando..."
                : "Adicionar busca"}
            </button>
          </div>

          {/* CATEGORIAS */}

          <div className="category-list">
            {termsLoading ? (
              <div className="settings-empty">
                <RefreshCw
                  size={20}
                  className="spin"
                />

                <span>
                  Carregando categorias
                  e buscas...
                </span>
              </div>
            ) : groupedCategories.length ===
              0 ? (
              <div className="settings-empty">
                <FolderKanban
                  size={24}
                />

                <strong>
                  Nenhuma busca
                  cadastrada
                </strong>

                <span>
                  Adicione uma busca e
                  escolha a categoria
                  correspondente.
                </span>
              </div>
            ) : (
              groupedCategories.map(
                ({
                  category,
                  terms,
                }) => {
                  const isOpen =
                    openCategories[
                      category.id
                    ] !== false;

                  const activeCount =
                    terms.filter(
                      (term) =>
                        term.active
                    ).length;

                  return (
                    <div
                      className="category-group"
                      key={category.id}
                    >
                      <button
                        className="category-header"
                        onClick={() =>
                          toggleCategory(
                            category.id
                          )
                        }
                      >
                        <div className="category-heading">
                          <div className="category-dot" />

                          <div>
                            <strong>
                              {category.name}
                            </strong>

                            <span>
                              {terms.length}{" "}
                              {terms.length ===
                              1
                                ? "busca"
                                : "buscas"}{" "}
                              ·{" "}
                              {activeCount}{" "}
                              ativas
                            </span>
                          </div>
                        </div>

                        {isOpen ? (
                          <ChevronUp
                            size={19}
                          />
                        ) : (
                          <ChevronDown
                            size={19}
                          />
                        )}
                      </button>

                      {isOpen && (
                        <div className="category-terms">
                          {terms.map(
                            (
                              searchTerm
                            ) => (
                              <div
                                className="search-term-row"
                                key={
                                  searchTerm.id
                                }
                              >
                                <div className="search-term-main">
                                  <span
                                    className={
                                      searchTerm.active
                                        ? "term-status active"
                                        : "term-status"
                                    }
                                  />

                                  <div>
                                    <strong>
                                      {
                                        searchTerm.term
                                      }
                                    </strong>

                                    <span>
                                      {searchTerm.active
                                        ? "Busca ativa"
                                        : "Busca pausada"}
                                    </span>
                                  </div>
                                </div>

                                <div className="search-term-actions">
                                  <button
                                    onClick={() =>
                                      toggleSearchTerm(
                                        searchTerm
                                      )
                                    }
                                    title={
                                      searchTerm.active
                                        ? "Desativar busca"
                                        : "Ativar busca"
                                    }
                                    className="term-action"
                                  >
                                    {searchTerm.active ? (
                                      <ToggleRight
                                        size={
                                          27
                                        }
                                      />
                                    ) : (
                                      <ToggleLeft
                                        size={
                                          27
                                        }
                                      />
                                    )}
                                  </button>

                                  <button
                                    onClick={() =>
                                      deleteSearchTerm(
                                        searchTerm
                                      )
                                    }
                                    title="Excluir busca"
                                    className="term-action danger"
                                  >
                                    <Trash2
                                      size={
                                        17
                                      }
                                    />
                                  </button>
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  );
                }
              )
            )}
          </div>

          <div className="settings-note">
            <strong>
              Organização por categoria:
            </strong>{" "}
            cada busca pertence a uma
            categoria. Isso permite que o
            Ofertix use a mesma estrutura
            depois para direcionar ofertas
            para canais específicos, como
            Automotivo, Pesca e outras
            categorias.
          </div>
        </section>
      </div>
    </div>
  );
}