import { useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  Edit3,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
  Search,
} from "lucide-react";

import { supabase } from "../lib/supabase";

interface Marketplace {
  id: string;
  name: string;
  slug: string;
  active: boolean;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  priority: number;
}

interface SearchTerm {
  id: string;
  term: string;
  active: boolean;
  category_id: string | null;
}

interface OfferRule {
  id: string;
  name: string;
  marketplace_id: string | null;
  category: string | null;
  min_discount_percent: number | null;
  min_price: number | null;
  max_price: number | null;
  auto_approve: boolean;
  auto_approve_max_price: number | null;
  active: boolean;
  created_at: string;
}

interface RuleForm {
  name: string;
  marketplace_id: string;
  category: string;
  min_discount_percent: string;
  min_price: string;
  max_price: string;
  auto_approve: boolean;
  auto_approve_max_price: string;
  active: boolean;
}

const emptyForm: RuleForm = {
  name: "",
  marketplace_id: "",
  category: "",
  min_discount_percent: "",
  min_price: "",
  max_price: "",
  auto_approve: false,
  auto_approve_max_price: "500",
  active: true,
};

export function Regras() {
  const [rules, setRules] =
    useState<OfferRule[]>([]);

  const [marketplaces, setMarketplaces] =
    useState<Marketplace[]>([]);

  const [categories, setCategories] =
    useState<Category[]>([]);

  const [searchTerms, setSearchTerms] =
    useState<SearchTerm[]>([]);

  const [selectedTerms, setSelectedTerms] =
    useState<string[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [deleting, setDeleting] =
    useState<string | null>(null);

  const [showForm, setShowForm] =
    useState(false);

  const [editingId, setEditingId] =
    useState<string | null>(null);

  const [form, setForm] =
    useState<RuleForm>(emptyForm);

  const [error, setError] =
    useState<string | null>(null);

  const [success, setSuccess] =
    useState<string | null>(null);

  const [termsLoading, setTermsLoading] =
    useState(false);

  async function loadData() {
    setLoading(true);
    setError(null);

    const [
      rulesResult,
      marketplacesResult,
      categoriesResult,
      termsResult,
    ] = await Promise.all([
      supabase
        .from("offer_rules")
        .select("*")
        .order("created_at", {
          ascending: false,
        }),

      supabase
        .from("marketplaces")
        .select(
          "id, name, slug, active"
        )
        .eq("active", true)
        .order("name"),

      supabase
        .from("offer_categories")
        .select(
          "id, name, slug, active, priority"
        )
        .eq("active", true)
        .order("priority", {
          ascending: true,
        })
        .order("name", {
          ascending: true,
        }),

      supabase
        .from("search_terms")
        .select(
          "id, term, active, category_id"
        )
        .eq("active", true)
        .order("term"),
    ]);

    if (rulesResult.error) {
      console.error(
        "Erro ao carregar regras:",
        rulesResult.error
      );

      setError(
        `Não foi possível carregar as regras: ${rulesResult.error.message}`
      );
    } else {
      setRules(
        rulesResult.data ?? []
      );
    }

    if (marketplacesResult.error) {
      console.error(
        "Erro ao carregar marketplaces:",
        marketplacesResult.error
      );
    } else {
      setMarketplaces(
        marketplacesResult.data ?? []
      );
    }

    if (categoriesResult.error) {
      console.error(
        "Erro ao carregar categorias:",
        categoriesResult.error
      );
    } else {
      setCategories(
        categoriesResult.data ?? []
      );
    }

    if (termsResult.error) {
      console.error(
        "Erro ao carregar termos:",
        termsResult.error
      );
    } else {
      setSearchTerms(
        termsResult.data ?? []
      );
    }

    setLoading(false);
  }

  async function loadRuleTerms(
    ruleId: string
  ) {
    setTermsLoading(true);

    const { data, error } =
      await supabase
        .from("offer_rule_search_terms")
        .select(
          "search_term_id"
        )
        .eq("rule_id", ruleId)
        .eq("active", true);

    if (error) {
      console.error(
        "Erro ao carregar termos da regra:",
        error
      );

      setError(
        `Não foi possível carregar os termos da regra: ${error.message}`
      );

      setSelectedTerms([]);
    } else {
      setSelectedTerms(
        (data ?? []).map(
          (item) =>
            item.search_term_id
        )
      );
    }

    setTermsLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  function openCreateForm() {
    setEditingId(null);

    setForm({
      ...emptyForm,
      marketplace_id:
        marketplaces.length === 1
          ? marketplaces[0].id
          : "",
    });

    setSelectedTerms([]);

    setError(null);
    setSuccess(null);
    setShowForm(true);
  }

  async function openEditForm(
    rule: OfferRule
  ) {
    setEditingId(rule.id);

    setForm({
      name: rule.name,
      marketplace_id:
        rule.marketplace_id ?? "",
      category:
        rule.category ?? "",
      min_discount_percent:
        rule.min_discount_percent !== null
          ? String(
              rule.min_discount_percent
            )
          : "",
      min_price:
        rule.min_price !== null
          ? String(rule.min_price)
          : "",
      max_price:
        rule.max_price !== null
          ? String(rule.max_price)
          : "",
      auto_approve:
        rule.auto_approve,
      auto_approve_max_price:
        rule.auto_approve_max_price !== null
          ? String(
              rule.auto_approve_max_price
            )
          : "500",
      active: rule.active,
    });

    setError(null);
    setSuccess(null);
    setShowForm(true);

    await loadRuleTerms(rule.id);
  }

  function closeForm() {
    if (saving) {
      return;
    }

    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setSelectedTerms([]);
  }

  function updateField(
    field: keyof RuleForm,
    value: string | boolean
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

    if (
      field === "category" &&
      typeof value === "string"
    ) {
      const category = categories.find(
        (item) =>
          item.name === value
      );

      if (category) {
        const categoryTerms =
          searchTerms
            .filter(
              (term) =>
                term.active &&
                term.category_id ===
                  category.id
            )
            .map(
              (term) => term.id
            );

        setSelectedTerms(
          categoryTerms
        );
      } else {
        setSelectedTerms([]);
      }
    }
  }

  function numberOrNull(
    value: string
  ) {
    const trimmed =
      value.trim();

    if (!trimmed) {
      return null;
    }

    const number =
      Number(trimmed);

    return Number.isFinite(number)
      ? number
      : null;
  }

  function toggleTerm(
    termId: string
  ) {
    setSelectedTerms(
      (current) =>
        current.includes(termId)
          ? current.filter(
              (id) => id !== termId
            )
          : [...current, termId]
    );
  }

  function selectAllCategoryTerms() {
    if (!form.category) {
      return;
    }

    const category =
      categories.find(
        (item) =>
          item.name ===
          form.category
      );

    if (!category) {
      return;
    }

    const ids =
      searchTerms
        .filter(
          (term) =>
            term.active &&
            term.category_id ===
              category.id
        )
        .map(
          (term) => term.id
        );

    setSelectedTerms(ids);
  }

  function clearCategoryTerms() {
    if (!form.category) {
      return;
    }

    const category =
      categories.find(
        (item) =>
          item.name ===
          form.category
      );

    if (!category) {
      return;
    }

    const categoryIds =
      searchTerms
        .filter(
          (term) =>
            term.category_id ===
            category.id
        )
        .map(
          (term) => term.id
        );

    setSelectedTerms(
      (current) =>
        current.filter(
          (id) =>
            !categoryIds.includes(id)
        )
    );
  }

  async function saveRule() {
    setError(null);
    setSuccess(null);

    if (!form.name.trim()) {
      setError(
        "Informe um nome para a regra."
      );
      return;
    }

    if (
      form.category &&
      !categories.some(
        (category) =>
          category.name ===
          form.category
      )
    ) {
      setError(
        "Selecione uma categoria válida."
      );
      return;
    }

    if (
      form.min_discount_percent.trim() &&
      Number(
        form.min_discount_percent
      ) < 0
    ) {
      setError(
        "O desconto mínimo não pode ser negativo."
      );
      return;
    }

    if (
      form.min_discount_percent.trim() &&
      Number(
        form.min_discount_percent
      ) > 100
    ) {
      setError(
        "O desconto mínimo não pode ser maior que 100%."
      );
      return;
    }

    if (
      form.min_price.trim() &&
      Number(form.min_price) < 0
    ) {
      setError(
        "O preço mínimo não pode ser negativo."
      );
      return;
    }

    if (
      form.max_price.trim() &&
      Number(form.max_price) < 0
    ) {
      setError(
        "O preço máximo não pode ser negativo."
      );
      return;
    }

    if (
      form.min_price.trim() &&
      form.max_price.trim() &&
      Number(form.max_price) <
        Number(form.min_price)
    ) {
      setError(
        "O preço máximo não pode ser menor que o preço mínimo."
      );
      return;
    }

    if (
      form.auto_approve &&
      form.auto_approve_max_price.trim() &&
      Number(
        form.auto_approve_max_price
      ) < 0
    ) {
      setError(
        "O limite de aprovação automática não pode ser negativo."
      );
      return;
    }

    if (
      form.category &&
      selectedTerms.length === 0
    ) {
      setError(
        "Selecione pelo menos um termo de busca para esta regra."
      );
      return;
    }

    setSaving(true);

    const payload = {
      name: form.name.trim(),

      marketplace_id:
        form.marketplace_id ||
        null,

      category:
        form.category.trim() ||
        null,

      min_discount_percent:
        numberOrNull(
          form.min_discount_percent
        ) ?? 0,

      min_price:
        numberOrNull(
          form.min_price
        ),

      max_price:
        numberOrNull(
          form.max_price
        ),

      auto_approve:
        form.auto_approve,

      auto_approve_max_price:
        form.auto_approve
          ? numberOrNull(
              form.auto_approve_max_price
            )
          : null,

      active:
        form.active,
    };

    let ruleId =
      editingId;

    if (editingId) {
      const result =
        await supabase
          .from("offer_rules")
          .update(payload)
          .eq(
            "id",
            editingId
          )
          .select("id")
          .single();

      if (result.error) {
        setError(
          `Erro ao atualizar regra: ${result.error.message}`
        );

        setSaving(false);
        return;
      }
    } else {
      const result =
        await supabase
          .from("offer_rules")
          .insert(payload)
          .select("id")
          .single();

      if (result.error) {
        setError(
          `Erro ao criar regra: ${result.error.message}`
        );

        setSaving(false);
        return;
      }

      ruleId =
        result.data.id;
    }

    if (!ruleId) {
      setError(
        "Não foi possível identificar a regra."
      );

      setSaving(false);
      return;
    }

    /*
     * Os termos ficam vinculados diretamente
     * à regra.
     *
     * Primeiro removemos os vínculos antigos
     * e depois recriamos os atuais.
     */

    const deleteTerms =
      await supabase
        .from(
          "offer_rule_search_terms"
        )
        .delete()
        .eq(
          "rule_id",
          ruleId
        );

    if (deleteTerms.error) {
      setError(
        `Regra salva, mas não foi possível atualizar os termos: ${deleteTerms.error.message}`
      );

      setSaving(false);
      return;
    }

    if (selectedTerms.length > 0) {
      const rows =
        selectedTerms.map(
          (searchTermId) => ({
            rule_id:
              ruleId,
            search_term_id:
              searchTermId,
            active:
              true,
          })
        );

      const insertTerms =
        await supabase
          .from(
            "offer_rule_search_terms"
          )
          .insert(rows);

      if (insertTerms.error) {
        setError(
          `Regra salva, mas não foi possível vincular os termos: ${insertTerms.error.message}`
        );

        setSaving(false);
        return;
      }
    }

    setSuccess(
      editingId
        ? "Regra atualizada com sucesso."
        : "Regra criada com sucesso."
    );

    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setSelectedTerms([]);

    await loadData();

    setSaving(false);
  }

  async function toggleRule(
    rule: OfferRule
  ) {
    setError(null);
    setSuccess(null);

    const { error } =
      await supabase
        .from("offer_rules")
        .update({
          active:
            !rule.active,
        })
        .eq(
          "id",
          rule.id
        );

    if (error) {
      setError(
        `Não foi possível alterar a regra: ${error.message}`
      );

      return;
    }

    setSuccess(
      rule.active
        ? "Regra desativada."
        : "Regra ativada."
    );

    await loadData();
  }

  async function deleteRule(
    rule: OfferRule
  ) {
    const confirmed =
      window.confirm(
        `Excluir a regra "${rule.name}"?\n\nOs vínculos dessa regra também serão removidos.`
      );

    if (!confirmed) {
      return;
    }

    setDeleting(rule.id);
    setError(null);
    setSuccess(null);

    const { error } =
      await supabase
        .from("offer_rules")
        .delete()
        .eq(
          "id",
          rule.id
        );

    if (error) {
      setError(
        `Não foi possível excluir a regra: ${error.message}`
      );

      setDeleting(null);
      return;
    }

    setSuccess(
      "Regra excluída com sucesso."
    );

    await loadData();

    setDeleting(null);
  }

  function getMarketplaceName(
    marketplaceId: string | null
  ) {
    if (!marketplaceId) {
      return "Todos os marketplaces";
    }

    return (
      marketplaces.find(
        (marketplace) =>
          marketplace.id ===
          marketplaceId
      )?.name ??
      "Marketplace"
    );
  }

  function formatNumber(
    value: number | null
  ) {
    if (value === null) {
      return null;
    }

    return new Intl.NumberFormat(
      "pt-BR",
      {
        maximumFractionDigits: 2,
      }
    ).format(value);
  }

  function formatPrice(
    value: number | null
  ) {
    if (value === null) {
      return null;
    }

    return new Intl.NumberFormat(
      "pt-BR",
      {
        style: "currency",
        currency: "BRL",
      }
    ).format(value);
  }

  const currentCategory =
    categories.find(
      (category) =>
        category.name ===
        form.category
    );

  const currentCategoryTerms =
    currentCategory
      ? searchTerms.filter(
          (term) =>
            term.active &&
            term.category_id ===
              currentCategory.id
        )
      : [];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">
            AUTOMAÇÃO
          </p>

          <h1>Regras</h1>

          <p className="page-description">
            Defina o que o Ofertix deve
            procurar e quais critérios um
            produto precisa atender.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "center",
          }}
        >
          <button
            className="text-button"
            onClick={loadData}
            disabled={loading}
            title="Atualizar regras"
            style={{
              display:
                "inline-flex",
              alignItems:
                "center",
              gap: "7px",
              padding:
                "8px 12px",
              border:
                "1px solid #202734",
              borderRadius:
                "8px",
            }}
          >
            <RefreshCw
              size={15}
              style={{
                animation:
                  loading
                    ? "spin 1s linear infinite"
                    : "none",
              }}
            />

            Atualizar
          </button>

          <button
            className="primary-button"
            onClick={
              openCreateForm
            }
          >
            <Plus size={16} />
            Nova regra
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            marginBottom: "16px",
            padding:
              "12px 14px",
            borderRadius: "8px",
            background:
              "#2a1820",
            border:
              "1px solid #5a2735",
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
            padding:
              "12px 14px",
            borderRadius: "8px",
            background:
              "#132a21",
            border:
              "1px solid #24553f",
            color: "#6ee7b7",
            fontSize: "12px",
          }}
        >
          {success}
        </div>
      )}

      {showForm && (
        <div
          className="panel"
          style={{
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems:
                "center",
              justifyContent:
                "space-between",
              gap: "12px",
              marginBottom:
                "20px",
            }}
          >
            <div>
              <p className="eyebrow">
                CONFIGURAÇÃO
              </p>

              <h2
                style={{
                  margin:
                    "6px 0 0",
                  color:
                    "#e8edf5",
                  fontSize:
                    "17px",
                }}
              >
                {editingId
                  ? "Editar regra"
                  : "Nova regra"}
              </h2>

              <p
                style={{
                  margin:
                    "6px 0 0",
                  color:
                    "#687386",
                  fontSize:
                    "11px",
                }}
              >
                A regra define a busca,
                os critérios e o
                comportamento da
                aprovação.
              </p>
            </div>

            <button
              className="text-button"
              onClick={
                closeForm
              }
              disabled={saving}
              title="Fechar"
            >
              <X size={18} />
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "14px",
            }}
          >
            {/* NOME */}

            <div
              style={{
                gridColumn:
                  "1 / -1",
              }}
            >
              <label
                style={{
                  display:
                    "block",
                  color:
                    "#aeb7c6",
                  fontSize:
                    "11px",
                  marginBottom:
                    "6px",
                }}
              >
                Nome da regra *
              </label>

              <input
                value={form.name}
                onChange={(
                  event
                ) =>
                  updateField(
                    "name",
                    event.target
                      .value
                  )
                }
                placeholder="Ex.: Ofertas de perfumes"
                style={{
                  width:
                    "100%",
                  boxSizing:
                    "border-box",
                  padding:
                    "10px 11px",
                  border:
                    "1px solid #202734",
                  borderRadius:
                    "8px",
                  background:
                    "#0b0f16",
                  color:
                    "#e8edf5",
                  outline:
                    "none",
                  fontSize:
                    "12px",
                }}
              />
            </div>

            {/* MARKETPLACE */}

            <div>
              <label
                style={{
                  display:
                    "block",
                  color:
                    "#aeb7c6",
                  fontSize:
                    "11px",
                  marginBottom:
                    "6px",
                }}
              >
                Marketplace
              </label>

              <div
                style={{
                  position:
                    "relative",
                }}
              >
                <select
                  value={
                    form.marketplace_id
                  }
                  onChange={(
                    event
                  ) =>
                    updateField(
                      "marketplace_id",
                      event.target
                        .value
                    )
                  }
                  style={{
                    width:
                      "100%",
                    boxSizing:
                      "border-box",
                    appearance:
                      "none",
                    padding:
                      "10px 34px 10px 11px",
                    border:
                      "1px solid #202734",
                    borderRadius:
                      "8px",
                    background:
                      "#0b0f16",
                    color:
                      "#e8edf5",
                    outline:
                      "none",
                    fontSize:
                      "12px",
                  }}
                >
                  <option value="">
                    Todos os marketplaces
                  </option>

                  {marketplaces.map(
                    (
                      marketplace
                    ) => (
                      <option
                        key={
                          marketplace.id
                        }
                        value={
                          marketplace.id
                        }
                      >
                        {
                          marketplace.name
                        }
                      </option>
                    )
                  )}
                </select>

                <ChevronDown
                  size={15}
                  style={{
                    position:
                      "absolute",
                    right:
                      "10px",
                    top:
                      "50%",
                    transform:
                      "translateY(-50%)",
                    pointerEvents:
                      "none",
                    color:
                      "#687386",
                  }}
                />
              </div>
            </div>

            {/* CATEGORIA */}

            <div>
              <label
                style={{
                  display:
                    "block",
                  color:
                    "#aeb7c6",
                  fontSize:
                    "11px",
                  marginBottom:
                    "6px",
                }}
              >
                Categoria *
              </label>

              <div
                style={{
                  position:
                    "relative",
                }}
              >
                <select
                  value={
                    form.category
                  }
                  onChange={(
                    event
                  ) =>
                    updateField(
                      "category",
                      event.target
                        .value
                    )
                  }
                  style={{
                    width:
                      "100%",
                    boxSizing:
                      "border-box",
                    appearance:
                      "none",
                    padding:
                      "10px 34px 10px 11px",
                    border:
                      "1px solid #202734",
                    borderRadius:
                      "8px",
                    background:
                      "#0b0f16",
                    color:
                      "#e8edf5",
                    outline:
                      "none",
                    fontSize:
                      "12px",
                  }}
                >
                  <option value="">
                    Selecione uma categoria
                  </option>

                  {categories.map(
                    (
                      category
                    ) => (
                      <option
                        key={
                          category.id
                        }
                        value={
                          category.name
                        }
                      >
                        {
                          category.name
                        }
                      </option>
                    )
                  )}
                </select>

                <ChevronDown
                  size={15}
                  style={{
                    position:
                      "absolute",
                    right:
                      "10px",
                    top:
                      "50%",
                    transform:
                      "translateY(-50%)",
                    pointerEvents:
                      "none",
                    color:
                      "#687386",
                  }}
                />
              </div>
            </div>

            {/* TERMOS */}

            <div
              style={{
                gridColumn:
                  "1 / -1",
                padding:
                  "16px",
                border:
                  "1px solid #202734",
                borderRadius:
                  "10px",
                background:
                  "#0b0f16",
              }}
            >
              <div
                style={{
                  display:
                    "flex",
                  alignItems:
                    "flex-start",
                  justifyContent:
                    "space-between",
                  gap:
                    "12px",
                  flexWrap:
                    "wrap",
                }}
              >
                <div>
                  <div
                    style={{
                      display:
                        "flex",
                      alignItems:
                        "center",
                      gap:
                        "7px",
                      color:
                        "#e8edf5",
                      fontSize:
                        "13px",
                      fontWeight:
                        600,
                    }}
                  >
                    <Search
                      size={15}
                    />
                    Termos de busca
                  </div>

                  <p
                    style={{
                      margin:
                        "5px 0 0",
                      color:
                        "#687386",
                      fontSize:
                        "10px",
                      lineHeight:
                        1.5,
                    }}
                  >
                    Esses são os termos
                    que o sincronizador
                    utilizará no
                    marketplace para
                    executar esta regra.
                  </p>
                </div>

                {currentCategoryTerms.length >
                  0 && (
                  <div
                    style={{
                      display:
                        "flex",
                      gap:
                        "6px",
                    }}
                  >
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={
                        selectAllCategoryTerms
                      }
                    >
                      Selecionar todos
                    </button>

                    <button
                      type="button"
                      className="secondary-button"
                      onClick={
                        clearCategoryTerms
                      }
                    >
                      Limpar
                    </button>
                  </div>
                )}
              </div>

              {!form.category ? (
                <div
                  style={{
                    marginTop:
                      "14px",
                    padding:
                      "15px",
                    border:
                      "1px dashed #283243",
                    borderRadius:
                      "8px",
                    color:
                      "#687386",
                    fontSize:
                      "10px",
                    textAlign:
                      "center",
                  }}
                >
                  Selecione uma categoria
                  para visualizar os termos
                  disponíveis.
                </div>
              ) : termsLoading ? (
                <div
                  style={{
                    marginTop:
                      "14px",
                    padding:
                      "15px",
                    color:
                      "#687386",
                    fontSize:
                      "10px",
                    textAlign:
                      "center",
                  }}
                >
                  <RefreshCw
                    size={16}
                    style={{
                      animation:
                        "spin 1s linear infinite",
                      marginRight:
                        "6px",
                      verticalAlign:
                        "middle",
                    }}
                  />
                  Carregando termos...
                </div>
              ) : currentCategoryTerms.length ===
                0 ? (
                <div
                  style={{
                    marginTop:
                      "14px",
                    padding:
                      "15px",
                    border:
                      "1px dashed #283243",
                    borderRadius:
                      "8px",
                    color:
                      "#facc15",
                    fontSize:
                      "10px",
                  }}
                >
                  Esta categoria ainda
                  não possui termos de
                  busca cadastrados.
                </div>
              ) : (
                <div
                  style={{
                    display:
                      "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(180px, 1fr))",
                    gap:
                      "8px",
                    marginTop:
                      "14px",
                  }}
                >
                  {currentCategoryTerms.map(
                    (
                      term
                    ) => {
                      const selected =
                        selectedTerms.includes(
                          term.id
                        );

                      return (
                        <button
                          type="button"
                          key={
                            term.id
                          }
                          onClick={() =>
                            toggleTerm(
                              term.id
                            )
                          }
                          style={{
                            display:
                              "flex",
                            alignItems:
                              "center",
                            gap:
                              "9px",
                            padding:
                              "10px 11px",
                            border:
                              selected
                                ? "1px solid #2563eb"
                                : "1px solid #202734",
                            borderRadius:
                              "8px",
                            background:
                              selected
                                ? "#111f38"
                                : "#10151f",
                            color:
                              selected
                                ? "#dbeafe"
                                : "#8d98aa",
                            cursor:
                              "pointer",
                            textAlign:
                              "left",
                            fontSize:
                              "10px",
                          }}
                        >
                          <span
                            style={{
                              width:
                                "18px",
                              height:
                                "18px",
                              flexShrink:
                                0,
                              display:
                                "flex",
                              alignItems:
                                "center",
                              justifyContent:
                                "center",
                              border:
                                selected
                                  ? "1px solid #3b82f6"
                                  : "1px solid #354052",
                              borderRadius:
                                "5px",
                              background:
                                selected
                                  ? "#2563eb"
                                  : "transparent",
                            }}
                          >
                            {selected && (
                              <Check
                                size={
                                  12
                                }
                              />
                            )}
                          </span>

                          <span>
                            {
                              term.term
                            }
                          </span>
                        </button>
                      );
                    }
                  )}
                </div>
              )}

              {form.category &&
                currentCategoryTerms.length >
                  0 && (
                  <div
                    style={{
                      marginTop:
                        "10px",
                      color:
                        "#687386",
                      fontSize:
                        "10px",
                    }}
                  >
                    {selectedTerms.filter(
                      (id) =>
                        currentCategoryTerms.some(
                          (term) =>
                            term.id ===
                            id
                        )
                    ).length}{" "}
                    de{" "}
                    {
                      currentCategoryTerms.length
                    }{" "}
                    termos selecionados
                  </div>
                )}
            </div>

            {/* DESCONTO */}

            <div>
              <label
                style={{
                  display:
                    "block",
                  color:
                    "#aeb7c6",
                  fontSize:
                    "11px",
                  marginBottom:
                    "6px",
                }}
              >
                Desconto mínimo (%)
              </label>

              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={
                  form.min_discount_percent
                }
                onChange={(
                  event
                ) =>
                  updateField(
                    "min_discount_percent",
                    event.target
                      .value
                  )
                }
                placeholder="Ex.: 10"
                style={{
                  width:
                    "100%",
                  boxSizing:
                    "border-box",
                  padding:
                    "10px 11px",
                  border:
                    "1px solid #202734",
                  borderRadius:
                    "8px",
                  background:
                    "#0b0f16",
                  color:
                    "#e8edf5",
                  outline:
                    "none",
                  fontSize:
                    "12px",
                }}
              />
            </div>

            {/* PREÇO MÍNIMO */}

            <div>
              <label
                style={{
                  display:
                    "block",
                  color:
                    "#aeb7c6",
                  fontSize:
                    "11px",
                  marginBottom:
                    "6px",
                }}
              >
                Preço mínimo
              </label>

              <input
                type="number"
                min="0"
                step="0.01"
                value={
                  form.min_price
                }
                onChange={(
                  event
                ) =>
                  updateField(
                    "min_price",
                    event.target
                      .value
                  )
                }
                placeholder="Ex.: 50"
                style={{
                  width:
                    "100%",
                  boxSizing:
                    "border-box",
                  padding:
                    "10px 11px",
                  border:
                    "1px solid #202734",
                  borderRadius:
                    "8px",
                  background:
                    "#0b0f16",
                  color:
                    "#e8edf5",
                  outline:
                    "none",
                  fontSize:
                    "12px",
                }}
              />
            </div>

            {/* PREÇO MÁXIMO */}

            <div>
              <label
                style={{
                  display:
                    "block",
                  color:
                    "#aeb7c6",
                  fontSize:
                    "11px",
                  marginBottom:
                    "6px",
                }}
              >
                Preço máximo
              </label>

              <input
                type="number"
                min="0"
                step="0.01"
                value={
                  form.max_price
                }
                onChange={(
                  event
                ) =>
                  updateField(
                    "max_price",
                    event.target
                      .value
                  )
                }
                placeholder="Ex.: 350"
                style={{
                  width:
                    "100%",
                  boxSizing:
                    "border-box",
                  padding:
                    "10px 11px",
                  border:
                    "1px solid #202734",
                  borderRadius:
                    "8px",
                  background:
                    "#0b0f16",
                  color:
                    "#e8edf5",
                  outline:
                    "none",
                  fontSize:
                    "12px",
                }}
              />
            </div>

            {/* APROVAÇÃO */}

            <div
              style={{
                gridColumn:
                  "1 / -1",
                borderTop:
                  "1px solid #202734",
                paddingTop:
                  "18px",
              }}
            >
              <div
                style={{
                  display:
                    "flex",
                  alignItems:
                    "flex-start",
                  justifyContent:
                    "space-between",
                  gap:
                    "16px",
                  flexWrap:
                    "wrap",
                }}
              >
                <div>
                  <div
                    style={{
                      color:
                        "#e8edf5",
                      fontSize:
                        "13px",
                      fontWeight:
                        600,
                    }}
                  >
                    Aprovação automática
                  </div>

                  <p
                    style={{
                      margin:
                        "5px 0 0",
                      color:
                        "#687386",
                      fontSize:
                        "10px",
                      maxWidth:
                        "650px",
                      lineHeight:
                        1.5,
                    }}
                  >
                    Produtos que atendem
                    aos critérios podem
                    ser aprovados
                    automaticamente.
                    Produtos acima do
                    limite permanecem para
                    aprovação manual.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    updateField(
                      "auto_approve",
                      !form.auto_approve
                    )
                  }
                  style={{
                    display:
                      "inline-flex",
                    alignItems:
                      "center",
                    gap:
                      "8px",
                    border:
                      "1px solid #202734",
                    borderRadius:
                      "8px",
                    background:
                      form.auto_approve
                        ? "#132a21"
                        : "#0b0f16",
                    color:
                      form.auto_approve
                        ? "#6ee7b7"
                        : "#8d98aa",
                    padding:
                      "8px 11px",
                    cursor:
                      "pointer",
                    fontSize:
                      "11px",
                    fontWeight:
                      600,
                  }}
                >
                  <Check size={14} />

                  {form.auto_approve
                    ? "Ativada"
                    : "Desativada"}
                </button>
              </div>

              {form.auto_approve && (
                <div
                  style={{
                    marginTop:
                      "16px",
                    maxWidth:
                      "300px",
                  }}
                >
                  <label
                    style={{
                      display:
                        "block",
                      color:
                        "#aeb7c6",
                      fontSize:
                        "11px",
                      marginBottom:
                        "6px",
                    }}
                  >
                    Limite de aprovação automática
                  </label>

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={
                      form.auto_approve_max_price
                    }
                    onChange={(
                      event
                    ) =>
                      updateField(
                        "auto_approve_max_price",
                        event.target
                          .value
                      )
                    }
                    placeholder="Ex.: 500"
                    style={{
                      width:
                        "100%",
                      boxSizing:
                        "border-box",
                      padding:
                        "10px 11px",
                      border:
                        "1px solid #202734",
                      borderRadius:
                        "8px",
                      background:
                        "#0b0f16",
                      color:
                        "#e8edf5",
                      outline:
                        "none",
                      fontSize:
                        "12px",
                    }}
                  />

                  <p
                    style={{
                      margin:
                        "6px 0 0",
                      color:
                        "#687386",
                      fontSize:
                        "10px",
                      lineHeight:
                        1.5,
                    }}
                  >
                    Produtos acima deste
                    valor não são
                    descartados. Eles ficam
                    aguardando aprovação
                    manual.
                  </p>
                </div>
              )}
            </div>

            {/* STATUS */}

            <div
              style={{
                gridColumn:
                  "1 / -1",
                borderTop:
                  "1px solid #202734",
                paddingTop:
                  "16px",
              }}
            >
              <button
                type="button"
                onClick={() =>
                  updateField(
                    "active",
                    !form.active
                  )
                }
                style={{
                  display:
                    "inline-flex",
                  alignItems:
                    "center",
                  gap:
                    "8px",
                  border:
                    "1px solid #202734",
                  borderRadius:
                    "8px",
                  background:
                    "#0b0f16",
                  color:
                    form.active
                      ? "#6ee7b7"
                      : "#8d98aa",
                  padding:
                    "8px 11px",
                  cursor:
                    "pointer",
                  fontSize:
                    "11px",
                  fontWeight:
                    600,
                }}
              >
                <Check size={14} />

                {form.active
                  ? "Regra ativa"
                  : "Regra inativa"}
              </button>
            </div>
          </div>

          <div
            style={{
              display:
                "flex",
              justifyContent:
                "flex-end",
              gap:
                "8px",
              marginTop:
                "22px",
              paddingTop:
                "16px",
              borderTop:
                "1px solid #202734",
            }}
          >
            <button
              className="secondary-button"
              onClick={
                closeForm
              }
              disabled={saving}
            >
              <X size={15} />
              Cancelar
            </button>

            <button
              className="primary-button"
              onClick={
                saveRule
              }
              disabled={saving}
            >
              {saving ? (
                <>
                  <RefreshCw
                    size={15}
                    style={{
                      animation:
                        "spin 1s linear infinite",
                    }}
                  />

                  Salvando...
                </>
              ) : (
                <>
                  <Save size={15} />

                  {editingId
                    ? "Salvar alterações"
                    : "Criar regra"}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* =====================================================
          LISTA DE REGRAS
          ===================================================== */}

      <div className="panel">
        {loading ? (
          <div className="empty-state">
            <RefreshCw
              size={30}
              style={{
                animation:
                  "spin 1s linear infinite",
              }}
            />

            <h3>
              Carregando regras...
            </h3>

            <p>
              Consultando as regras
              configuradas no Ofertix.
            </p>
          </div>
        ) : rules.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <Plus size={25} />
            </div>

            <h3>
              Nenhuma regra configurada
            </h3>

            <p>
              Crie uma regra para definir
              quais produtos o Ofertix
              deve procurar.
            </p>

            <button
              className="primary-button"
              onClick={
                openCreateForm
              }
              style={{
                marginTop:
                  "8px",
              }}
            >
              <Plus size={15} />
              Criar primeira regra
            </button>
          </div>
        ) : (
          <div
            style={{
              display:
                "flex",
              flexDirection:
                "column",
              gap:
                "10px",
            }}
          >
            {rules.map(
              (rule) => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  marketplaces={
                    marketplaces
                  }
                  searchTerms={
                    searchTerms
                  }
                  onEdit={
                    openEditForm
                  }
                  onToggle={
                    toggleRule
                  }
                  onDelete={
                    deleteRule
                  }
                  deleting={
                    deleting
                  }
                  getMarketplaceName={
                    getMarketplaceName
                  }
                  formatNumber={
                    formatNumber
                  }
                  formatPrice={
                    formatPrice
                  }
                />
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface RuleCardProps {
  rule: OfferRule;
  marketplaces: Marketplace[];
  searchTerms: SearchTerm[];
  onEdit: (
    rule: OfferRule
  ) => void;
  onToggle: (
    rule: OfferRule
  ) => void;
  onDelete: (
    rule: OfferRule
  ) => void;
  deleting: string | null;
  getMarketplaceName: (
    marketplaceId: string | null
  ) => string;
  formatNumber: (
    value: number | null
  ) => string | null;
  formatPrice: (
    value: number | null
  ) => string | null;
}

function RuleCard({
  rule,
  marketplaces,
  searchTerms,
  onEdit,
  onToggle,
  onDelete,
  deleting,
  getMarketplaceName,
  formatNumber,
  formatPrice,
}: RuleCardProps) {
  const [open, setOpen] =
    useState(false);

  const [terms, setTerms] =
    useState<SearchTerm[]>([]);

  const [loadingTerms, setLoadingTerms] =
    useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    async function loadTerms() {
      setLoadingTerms(true);

      const { data, error } =
        await supabase
          .from(
            "offer_rule_search_terms"
          )
          .select(
            "search_term_id"
          )
          .eq(
            "rule_id",
            rule.id
          )
          .eq(
            "active",
            true
          );

      if (!error) {
        const ids =
          (data ?? []).map(
            (item) =>
              item.search_term_id
          );

        setTerms(
          searchTerms.filter(
            (term) =>
              ids.includes(
                term.id
              )
          )
        );
      }

      setLoadingTerms(false);
    }

    loadTerms();
  }, [
    open,
    rule.id,
    searchTerms,
  ]);

  return (
    <div
      style={{
        padding:
          "16px",
        border:
          "1px solid #202734",
        borderRadius:
          "10px",
        background:
          "#0b0f16",
      }}
    >
      <div
        style={{
          display:
            "flex",
          alignItems:
            "flex-start",
          justifyContent:
            "space-between",
          gap:
            "16px",
          flexWrap:
            "wrap",
        }}
      >
        <div
          style={{
            flex:
              1,
            minWidth:
              "220px",
          }}
        >
          <div
            style={{
              display:
                "flex",
              alignItems:
                "center",
              gap:
                "8px",
              flexWrap:
                "wrap",
            }}
          >
            <span
              style={{
                color:
                  "#e8edf5",
                fontSize:
                  "14px",
                fontWeight:
                  600,
              }}
            >
              {rule.name}
            </span>

            <span
              style={{
                padding:
                  "4px 8px",
                borderRadius:
                  "20px",
                background:
                  rule.active
                    ? "#132a21"
                    : "#20232b",
                color:
                  rule.active
                    ? "#6ee7b7"
                    : "#8d98aa",
                fontSize:
                  "10px",
                fontWeight:
                  600,
              }}
            >
              {rule.active
                ? "Ativa"
                : "Inativa"}
            </span>

            {rule.auto_approve && (
              <span
                style={{
                  padding:
                    "4px 8px",
                  borderRadius:
                    "20px",
                  background:
                    "#16243a",
                  color:
                    "#60a5fa",
                  fontSize:
                    "10px",
                  fontWeight:
                    600,
                }}
              >
                Aprovação automática
              </span>
            )}
          </div>

          <div
            style={{
              display:
                "flex",
              gap:
                "8px",
              flexWrap:
                "wrap",
              marginTop:
                "8px",
            }}
          >
            <span
              style={{
                color:
                  "#687386",
                fontSize:
                  "10px",
              }}
            >
              {getMarketplaceName(
                rule.marketplace_id
              )}
            </span>

            {rule.category && (
              <>
                <span
                  style={{
                    color:
                      "#3c4555",
                    fontSize:
                      "10px",
                  }}
                >
                  •
                </span>

                <span
                  style={{
                    color:
                      "#687386",
                    fontSize:
                      "10px",
                  }}
                >
                  {rule.category}
                </span>
              </>
            )}
          </div>
        </div>

        <div
          style={{
            display:
              "flex",
            gap:
              "7px",
          }}
        >
          <button
            className="text-button"
            onClick={() =>
              onEdit(rule)
            }
            title="Editar regra"
          >
            <Edit3 size={15} />
          </button>

          <button
            className="text-button"
            onClick={() =>
              onToggle(rule)
            }
            title={
              rule.active
                ? "Desativar regra"
                : "Ativar regra"
            }
          >
            <Check size={15} />
          </button>

          <button
            className="text-button"
            onClick={() =>
              onDelete(rule)
            }
            disabled={
              deleting ===
              rule.id
            }
            title="Excluir regra"
            style={{
              color:
                "#f87171",
            }}
          >
            {deleting ===
            rule.id ? (
              <RefreshCw
                size={15}
                style={{
                  animation:
                    "spin 1s linear infinite",
                }}
              />
            ) : (
              <Trash2
                size={15}
              />
            )}
          </button>

          <button
            className="text-button"
            onClick={() =>
              setOpen(
                (current) =>
                  !current
              )
            }
            title="Ver termos"
          >
            {open ? (
              <X size={15} />
            ) : (
              <ChevronDown
                size={15}
              />
            )}
          </button>
        </div>
      </div>

      <div
        style={{
          display:
            "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(150px, 1fr))",
          gap:
            "10px",
          marginTop:
            "16px",
          paddingTop:
            "14px",
          borderTop:
            "1px solid #202734",
        }}
      >
        <div>
          <div
            style={{
              color:
                "#687386",
              fontSize:
                "9px",
              textTransform:
                "uppercase",
            }}
          >
            Desconto mínimo
          </div>

          <div
            style={{
              color:
                "#cbd3df",
              fontSize:
                "12px",
              marginTop:
                "4px",
            }}
          >
            {formatNumber(
              rule.min_discount_percent
            ) ?? "0"}
            %
          </div>
        </div>

        <div>
          <div
            style={{
              color:
                "#687386",
              fontSize:
                "9px",
              textTransform:
                "uppercase",
            }}
          >
            Faixa de preço
          </div>

          <div
            style={{
              color:
                "#cbd3df",
              fontSize:
                "12px",
              marginTop:
                "4px",
            }}
          >
            {formatPrice(
              rule.min_price
            ) ??
              "Sem mínimo"}

            {" → "}

            {formatPrice(
              rule.max_price
            ) ??
              "Sem máximo"}
          </div>
        </div>

        <div>
          <div
            style={{
              color:
                "#687386",
              fontSize:
                "9px",
              textTransform:
                "uppercase",
            }}
          >
            Aprovação
          </div>

          <div
            style={{
              color:
                rule.auto_approve
                  ? "#6ee7b7"
                  : "#facc15",
              fontSize:
                "12px",
              marginTop:
                "4px",
            }}
          >
            {rule.auto_approve
              ? rule.auto_approve_max_price !==
                null
                ? `Automática até ${formatPrice(
                    rule.auto_approve_max_price
                  )}`
                : "Automática sem limite"
              : "Manual"}
          </div>
        </div>
      </div>

      {open && (
        <div
          style={{
            marginTop:
              "14px",
            paddingTop:
              "14px",
            borderTop:
              "1px solid #202734",
          }}
        >
          <div
            style={{
              color:
                "#aeb7c6",
              fontSize:
                "10px",
              fontWeight:
                600,
              marginBottom:
                "9px",
            }}
          >
            TERMOS UTILIZADOS NA BUSCA
          </div>

          {loadingTerms ? (
            <span
              style={{
                color:
                  "#687386",
                fontSize:
                  "10px",
              }}
            >
              Carregando...
            </span>
          ) : terms.length ===
            0 ? (
            <span
              style={{
                color:
                  "#facc15",
                fontSize:
                  "10px",
              }}
            >
              Nenhum termo vinculado.
            </span>
          ) : (
            <div
              style={{
                display:
                  "flex",
                flexWrap:
                  "wrap",
                gap:
                  "6px",
              }}
            >
              {terms.map(
                (term) => (
                  <span
                    key={
                      term.id
                    }
                    style={{
                      padding:
                        "5px 8px",
                      borderRadius:
                        "6px",
                      background:
                        "#111827",
                      border:
                        "1px solid #263244",
                      color:
                        "#9fb1c9",
                      fontSize:
                        "10px",
                    }}
                  >
                    {term.term}
                  </span>
                )
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}