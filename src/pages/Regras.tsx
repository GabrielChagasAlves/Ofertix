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
} from "lucide-react";

import { supabase } from "../lib/supabase";

interface Marketplace {
  id: string;
  name: string;
  slug: string;
  active: boolean;
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
  const [rules, setRules] = useState<OfferRule[]>([]);
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState<RuleForm>(emptyForm);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);

    const [rulesResult, marketplacesResult] =
      await Promise.all([
        supabase
          .from("offer_rules")
          .select("*")
          .order("created_at", {
            ascending: false,
          }),

        supabase
          .from("marketplaces")
          .select("id, name, slug, active")
          .eq("active", true)
          .order("name"),
      ]);

    if (rulesResult.error) {
      console.error(
        "Erro ao carregar regras:",
        rulesResult.error
      );

      setError(
        `Não foi possível carregar as regras: ${
          rulesResult.error.message
        }`
      );
    } else {
      setRules(rulesResult.data ?? []);
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

    setLoading(false);
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
    setError(null);
    setSuccess(null);
    setShowForm(true);
  }

  function openEditForm(rule: OfferRule) {
    setEditingId(rule.id);

    setForm({
      name: rule.name,
      marketplace_id: rule.marketplace_id ?? "",
      category: rule.category ?? "",
      min_discount_percent:
        rule.min_discount_percent !== null
          ? String(rule.min_discount_percent)
          : "",
      min_price:
        rule.min_price !== null
          ? String(rule.min_price)
          : "",
      max_price:
        rule.max_price !== null
          ? String(rule.max_price)
          : "",
      auto_approve: rule.auto_approve,
      auto_approve_max_price:
        rule.auto_approve_max_price !== null
          ? String(rule.auto_approve_max_price)
          : "500",
      active: rule.active,
    });

    setError(null);
    setSuccess(null);
    setShowForm(true);
  }

  function closeForm() {
    if (saving) {
      return;
    }

    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function updateField(
    field: keyof RuleForm,
    value: string | boolean
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function numberOrNull(value: string) {
    const trimmed = value.trim();

    if (!trimmed) {
      return null;
    }

    const number = Number(trimmed);

    return Number.isFinite(number)
      ? number
      : null;
  }

  async function saveRule() {
    setError(null);
    setSuccess(null);

    if (!form.name.trim()) {
      setError("Informe um nome para a regra.");
      return;
    }

    if (
      form.min_discount_percent.trim() &&
      Number(form.min_discount_percent) < 0
    ) {
      setError(
        "O desconto mínimo não pode ser negativo."
      );
      return;
    }

    if (
      form.min_discount_percent.trim() &&
      Number(form.min_discount_percent) > 100
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
      Number(form.auto_approve_max_price) < 0
    ) {
      setError(
        "O limite de aprovação automática não pode ser negativo."
      );
      return;
    }

    setSaving(true);

    const payload = {
      name: form.name.trim(),
      marketplace_id:
        form.marketplace_id || null,
      category:
        form.category.trim() || null,
      min_discount_percent:
        numberOrNull(form.min_discount_percent) ?? 0,
      min_price: numberOrNull(form.min_price),
      max_price: numberOrNull(form.max_price),
      auto_approve: form.auto_approve,
      auto_approve_max_price:
        form.auto_approve
          ? numberOrNull(
              form.auto_approve_max_price
            )
          : null,
      active: form.active,
    };

    let result;

    if (editingId) {
      result = await supabase
        .from("offer_rules")
        .update(payload)
        .eq("id", editingId);
    } else {
      result = await supabase
        .from("offer_rules")
        .insert(payload);
    }

    if (result.error) {
      console.error(
        "Erro ao salvar regra:",
        result.error
      );

      setError(
        `Erro ao salvar regra: ${
          result.error.message ||
          result.error.details ||
          result.error.hint ||
          JSON.stringify(result.error)
        }`
      );

      setSaving(false);
      return;
    }

    setSuccess(
      editingId
        ? "Regra atualizada com sucesso."
        : "Regra criada com sucesso."
    );

    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);

    await loadData();

    setSaving(false);
  }

  async function toggleRule(rule: OfferRule) {
    setError(null);
    setSuccess(null);

    const { error } = await supabase
      .from("offer_rules")
      .update({
        active: !rule.active,
      })
      .eq("id", rule.id);

    if (error) {
      console.error(
        "Erro ao alterar regra:",
        error
      );

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

  async function deleteRule(rule: OfferRule) {
    const confirmed = window.confirm(
      `Excluir a regra "${rule.name}"?\n\nEssa ação não pode ser desfeita.`
    );

    if (!confirmed) {
      return;
    }

    setDeleting(rule.id);
    setError(null);
    setSuccess(null);

    const { error } = await supabase
      .from("offer_rules")
      .delete()
      .eq("id", rule.id);

    if (error) {
      console.error(
        "Erro ao excluir regra:",
        error
      );

      setError(
        `Não foi possível excluir a regra: ${error.message}`
      );

      setDeleting(null);
      return;
    }

    setSuccess("Regra excluída com sucesso.");

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
          marketplace.id === marketplaceId
      )?.name ?? "Marketplace"
    );
  }

  function formatNumber(
    value: number | null
  ) {
    if (value === null) {
      return null;
    }

    return new Intl.NumberFormat("pt-BR", {
      maximumFractionDigits: 2,
    }).format(value);
  }

  function formatPrice(
    value: number | null
  ) {
    if (value === null) {
      return null;
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
          <p className="eyebrow">AUTOMAÇÃO</p>

          <h1>Regras</h1>

          <p className="page-description">
            Configure os critérios para seleção e
            aprovação automática de ofertas.
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
              display: "inline-flex",
              alignItems: "center",
              gap: "7px",
              padding: "8px 12px",
              border: "1px solid #202734",
              borderRadius: "8px",
            }}
          >
            <RefreshCw
              size={15}
              style={{
                animation: loading
                  ? "spin 1s linear infinite"
                  : "none",
              }}
            />
            Atualizar
          </button>

          <button
            className="primary-button"
            onClick={openCreateForm}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "7px",
            }}
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
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              marginBottom: "20px",
            }}
          >
            <div>
              <p className="eyebrow">
                CONFIGURAÇÃO
              </p>

              <h2
                style={{
                  margin: "6px 0 0",
                  color: "#e8edf5",
                  fontSize: "17px",
                }}
              >
                {editingId
                  ? "Editar regra"
                  : "Nova regra"}
              </h2>

              <p
                style={{
                  margin: "6px 0 0",
                  color: "#687386",
                  fontSize: "11px",
                }}
              >
                Defina quando um produto poderá
                virar uma oferta.
              </p>
            </div>

            <button
              className="text-button"
              onClick={closeForm}
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
            <div
              style={{
                gridColumn:
                  "span 2",
                minWidth: 0,
              }}
            >
              <label
                style={{
                  display: "block",
                  color: "#aeb7c6",
                  fontSize: "11px",
                  marginBottom: "6px",
                }}
              >
                Nome da regra *
              </label>

              <input
                value={form.name}
                onChange={(event) =>
                  updateField(
                    "name",
                    event.target.value
                  )
                }
                placeholder="Ex.: Ofertas automotivas"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "10px 11px",
                  borderRadius: "8px",
                  border: "1px solid #202734",
                  background: "#0b0f16",
                  color: "#e8edf5",
                  outline: "none",
                  fontSize: "12px",
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  color: "#aeb7c6",
                  fontSize: "11px",
                  marginBottom: "6px",
                }}
              >
                Marketplace
              </label>

              <div
                style={{
                  position: "relative",
                }}
              >
                <select
                  value={form.marketplace_id}
                  onChange={(event) =>
                    updateField(
                      "marketplace_id",
                      event.target.value
                    )
                  }
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    appearance: "none",
                    padding: "10px 34px 10px 11px",
                    borderRadius: "8px",
                    border: "1px solid #202734",
                    background: "#0b0f16",
                    color: "#e8edf5",
                    outline: "none",
                    fontSize: "12px",
                  }}
                >
                  <option value="">
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

                <ChevronDown
                  size={15}
                  style={{
                    position: "absolute",
                    right: "10px",
                    top: "50%",
                    transform:
                      "translateY(-50%)",
                    pointerEvents: "none",
                    color: "#687386",
                  }}
                />
              </div>
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  color: "#aeb7c6",
                  fontSize: "11px",
                  marginBottom: "6px",
                }}
              >
                Categoria
              </label>

              <input
                value={form.category}
                onChange={(event) =>
                  updateField(
                    "category",
                    event.target.value
                  )
                }
                placeholder="Ex.: Automotivo"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "10px 11px",
                  borderRadius: "8px",
                  border: "1px solid #202734",
                  background: "#0b0f16",
                  color: "#e8edf5",
                  outline: "none",
                  fontSize: "12px",
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  color: "#aeb7c6",
                  fontSize: "11px",
                  marginBottom: "6px",
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
                onChange={(event) =>
                  updateField(
                    "min_discount_percent",
                    event.target.value
                  )
                }
                placeholder="Ex.: 15"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "10px 11px",
                  borderRadius: "8px",
                  border: "1px solid #202734",
                  background: "#0b0f16",
                  color: "#e8edf5",
                  outline: "none",
                  fontSize: "12px",
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  color: "#aeb7c6",
                  fontSize: "11px",
                  marginBottom: "6px",
                }}
              >
                Preço mínimo
              </label>

              <input
                type="number"
                min="0"
                step="0.01"
                value={form.min_price}
                onChange={(event) =>
                  updateField(
                    "min_price",
                    event.target.value
                  )
                }
                placeholder="Ex.: 20"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "10px 11px",
                  borderRadius: "8px",
                  border: "1px solid #202734",
                  background: "#0b0f16",
                  color: "#e8edf5",
                  outline: "none",
                  fontSize: "12px",
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  color: "#aeb7c6",
                  fontSize: "11px",
                  marginBottom: "6px",
                }}
              >
                Preço máximo para seleção
              </label>

              <input
                type="number"
                min="0"
                step="0.01"
                value={form.max_price}
                onChange={(event) =>
                  updateField(
                    "max_price",
                    event.target.value
                  )
                }
                placeholder="Deixe vazio para não limitar"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "10px 11px",
                  borderRadius: "8px",
                  border: "1px solid #202734",
                  background: "#0b0f16",
                  color: "#e8edf5",
                  outline: "none",
                  fontSize: "12px",
                }}
              />

              <p
                style={{
                  margin: "6px 0 0",
                  color: "#687386",
                  fontSize: "10px",
                }}
              >
                Se preenchido, produtos acima
                desse valor não entram nesta regra.
              </p>
            </div>

            <div
              style={{
                gridColumn:
                  "1 / -1",
                borderTop:
                  "1px solid #202734",
                paddingTop: "18px",
                marginTop: "2px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent:
                    "space-between",
                  gap: "16px",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div
                    style={{
                      color: "#e8edf5",
                      fontSize: "13px",
                      fontWeight: 600,
                    }}
                  >
                    Aprovação automática
                  </div>

                  <p
                    style={{
                      margin: "5px 0 0",
                      color: "#687386",
                      fontSize: "10px",
                      maxWidth: "650px",
                      lineHeight: 1.5,
                    }}
                  >
                    Produtos que atendem à regra
                    podem ser aprovados
                    automaticamente. Produtos acima
                    do limite continuam disponíveis
                    para aprovação manual.
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
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    border: "1px solid #202734",
                    borderRadius: "8px",
                    background:
                      form.auto_approve
                        ? "#132a21"
                        : "#0b0f16",
                    color:
                      form.auto_approve
                        ? "#6ee7b7"
                        : "#8d98aa",
                    padding: "8px 11px",
                    cursor: "pointer",
                    fontSize: "11px",
                    fontWeight: 600,
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
                    marginTop: "16px",
                    maxWidth: "300px",
                  }}
                >
                  <label
                    style={{
                      display: "block",
                      color: "#aeb7c6",
                      fontSize: "11px",
                      marginBottom: "6px",
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
                    onChange={(event) =>
                      updateField(
                        "auto_approve_max_price",
                        event.target.value
                      )
                    }
                    placeholder="Ex.: 500"
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "10px 11px",
                      borderRadius: "8px",
                      border: "1px solid #202734",
                      background: "#0b0f16",
                      color: "#e8edf5",
                      outline: "none",
                      fontSize: "12px",
                    }}
                  />

                  <p
                    style={{
                      margin: "6px 0 0",
                      color: "#687386",
                      fontSize: "10px",
                      lineHeight: 1.5,
                    }}
                  >
                    Ex.: R$ 500. Produtos acima
                    desse valor não são descartados;
                    ficam aguardando aprovação manual.
                  </p>
                </div>
              )}
            </div>

            <div
              style={{
                gridColumn:
                  "1 / -1",
                borderTop:
                  "1px solid #202734",
                paddingTop: "16px",
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
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  border: "1px solid #202734",
                  borderRadius: "8px",
                  background: "#0b0f16",
                  color: form.active
                    ? "#6ee7b7"
                    : "#8d98aa",
                  padding: "8px 11px",
                  cursor: "pointer",
                  fontSize: "11px",
                  fontWeight: 600,
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
              display: "flex",
              justifyContent: "flex-end",
              gap: "8px",
              marginTop: "22px",
              paddingTop: "16px",
              borderTop: "1px solid #202734",
            }}
          >
            <button
              className="secondary-button"
              onClick={closeForm}
              disabled={saving}
            >
              <X size={15} />
              Cancelar
            </button>

            <button
              className="primary-button"
              onClick={saveRule}
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

            <h3>Carregando regras...</h3>

            <p>
              Consultando as regras configuradas
              no Ofertix.
            </p>
          </div>
        ) : rules.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <Plus size={25} />
            </div>

            <h3>Nenhuma regra configurada</h3>

            <p>
              Crie uma regra para definir quais
              produtos podem virar ofertas
              automaticamente.
            </p>

            <button
              className="primary-button"
              onClick={openCreateForm}
              style={{
                marginTop: "8px",
              }}
            >
              <Plus size={15} />
              Criar primeira regra
            </button>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            {rules.map((rule) => (
              <div
                key={rule.id}
                style={{
                  padding: "16px",
                  border: "1px solid #202734",
                  borderRadius: "10px",
                  background: "#0b0f16",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent:
                      "space-between",
                    gap: "16px",
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      minWidth: "220px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          color: "#e8edf5",
                          fontSize: "14px",
                          fontWeight: 600,
                        }}
                      >
                        {rule.name}
                      </span>

                      <span
                        style={{
                          padding: "4px 8px",
                          borderRadius: "20px",
                          background: rule.active
                            ? "#132a21"
                            : "#20232b",
                          color: rule.active
                            ? "#6ee7b7"
                            : "#8d98aa",
                          fontSize: "10px",
                          fontWeight: 600,
                        }}
                      >
                        {rule.active
                          ? "Ativa"
                          : "Inativa"}
                      </span>

                      {rule.auto_approve && (
                        <span
                          style={{
                            padding: "4px 8px",
                            borderRadius: "20px",
                            background: "#16243a",
                            color: "#60a5fa",
                            fontSize: "10px",
                            fontWeight: 600,
                          }}
                        >
                          Aprovação automática
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: "8px",
                        flexWrap: "wrap",
                        marginTop: "8px",
                      }}
                    >
                      <span
                        style={{
                          color: "#687386",
                          fontSize: "10px",
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
                              color: "#3c4555",
                              fontSize: "10px",
                            }}
                          >
                            •
                          </span>

                          <span
                            style={{
                              color: "#687386",
                              fontSize: "10px",
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
                      display: "flex",
                      gap: "7px",
                    }}
                  >
                    <button
                      className="text-button"
                      onClick={() =>
                        openEditForm(rule)
                      }
                      title="Editar regra"
                    >
                      <Edit3 size={15} />
                    </button>

                    <button
                      className="text-button"
                      onClick={() =>
                        toggleRule(rule)
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
                        deleteRule(rule)
                      }
                      disabled={
                        deleting === rule.id
                      }
                      title="Excluir regra"
                      style={{
                        color: "#f87171",
                      }}
                    >
                      {deleting === rule.id ? (
                        <RefreshCw
                          size={15}
                          style={{
                            animation:
                              "spin 1s linear infinite",
                          }}
                        />
                      ) : (
                        <Trash2 size={15} />
                      )}
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(150px, 1fr))",
                    gap: "10px",
                    marginTop: "16px",
                    paddingTop: "14px",
                    borderTop: "1px solid #202734",
                  }}
                >
                  <div>
                    <div
                      style={{
                        color: "#687386",
                        fontSize: "9px",
                        textTransform:
                          "uppercase",
                      }}
                    >
                      Desconto mínimo
                    </div>

                    <div
                      style={{
                        color: "#cbd3df",
                        fontSize: "12px",
                        marginTop: "4px",
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
                        color: "#687386",
                        fontSize: "9px",
                        textTransform:
                          "uppercase",
                      }}
                    >
                      Faixa de preço
                    </div>

                    <div
                      style={{
                        color: "#cbd3df",
                        fontSize: "12px",
                        marginTop: "4px",
                      }}
                    >
                      {formatPrice(
                        rule.min_price
                      ) ?? "Sem mínimo"}
                      {" → "}
                      {formatPrice(
                        rule.max_price
                      ) ?? "Sem máximo"}
                    </div>
                  </div>

                  <div>
                    <div
                      style={{
                        color: "#687386",
                        fontSize: "9px",
                        textTransform:
                          "uppercase",
                      }}
                    >
                      Aprovação
                    </div>

                    <div
                      style={{
                        color: rule.auto_approve
                          ? "#6ee7b7"
                          : "#facc15",
                        fontSize: "12px",
                        marginTop: "4px",
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

                {rule.auto_approve &&
                  rule.auto_approve_max_price !==
                    null && (
                    <div
                      style={{
                        marginTop: "12px",
                        padding: "9px 11px",
                        borderRadius: "7px",
                        background: "#111827",
                        color: "#8d98aa",
                        fontSize: "10px",
                      }}
                    >
                      Produtos acima de{" "}
                      <strong
                        style={{
                          color: "#cbd3df",
                        }}
                      >
                        {formatPrice(
                          rule.auto_approve_max_price
                        )}
                      </strong>{" "}
                      continuam no Ofertix e
                      exigem aprovação manual.
                    </div>
                  )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}