import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  Check,
  Edit3,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
  Sparkles,
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

interface SearchTermStat {
  category_id: string | null;
  source: "manual" | "discovered" | "trend";
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

interface TermStats {
  total: number;
  discovered: number;
  trends: number;
}

const emptyForm: RuleForm = {
  name: "",
  marketplace_id: "",
  category: "",
  min_discount_percent: "0",
  min_price: "",
  max_price: "",
  auto_approve: false,
  auto_approve_max_price: "500",
  active: true,
};

export function Regras() {
  const [rules, setRules] = useState<OfferRule[]>([]);
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [termStats, setTermStats] = useState<Record<string, TermStats>>({});
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

    const [rulesResult, marketplacesResult, categoriesResult, termsResult] =
      await Promise.all([
        supabase
          .from("offer_rules")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("marketplaces")
          .select("id,name,slug,active")
          .eq("active", true)
          .order("name"),
        supabase
          .from("offer_categories")
          .select("id,name,slug,active,priority")
          .eq("active", true)
          .order("priority", { ascending: true })
          .order("name", { ascending: true }),
        supabase
          .from("search_terms")
          .select("category_id,source,active")
          .eq("active", true),
      ]);

    if (rulesResult.error) {
      setError(`Não foi possível carregar as regras: ${rulesResult.error.message}`);
    } else {
      setRules((rulesResult.data ?? []) as OfferRule[]);
    }

    if (marketplacesResult.error) {
      console.error("Erro ao carregar marketplaces:", marketplacesResult.error);
    } else {
      setMarketplaces((marketplacesResult.data ?? []) as Marketplace[]);
    }

    if (categoriesResult.error) {
      console.error("Erro ao carregar categorias:", categoriesResult.error);
    } else {
      setCategories((categoriesResult.data ?? []) as Category[]);
    }

    if (termsResult.error) {
      console.error("Erro ao carregar descoberta de termos:", termsResult.error);
    } else {
      const stats: Record<string, TermStats> = {};

      for (const term of (termsResult.data ?? []) as SearchTermStat[]) {
        if (!term.category_id) continue;

        if (!stats[term.category_id]) {
          stats[term.category_id] = {
            total: 0,
            discovered: 0,
            trends: 0,
          };
        }

        stats[term.category_id].total += 1;

        if (term.source === "discovered") {
          stats[term.category_id].discovered += 1;
        }

        if (term.source === "trend") {
          stats[term.category_id].trends += 1;
        }
      }

      setTermStats(stats);
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
        marketplaces.length === 1 ? marketplaces[0].id : "",
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
          : "0",
      min_price:
        rule.min_price !== null ? String(rule.min_price) : "",
      max_price:
        rule.max_price !== null ? String(rule.max_price) : "",
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
    if (saving) return;

    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function updateField(
    field: keyof RuleForm,
    value: string | boolean,
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

    return Number.isFinite(number) ? number : null;
  }

  async function saveRule() {
    setError(null);
    setSuccess(null);

    if (!form.name.trim()) {
      setError("Informe um nome para a regra.");
      return;
    }

    if (
      form.category &&
      !categories.some(
        (category) => category.name === form.category,
      )
    ) {
      setError("Selecione uma categoria válida.");
      return;
    }

    const discount = numberOrNull(form.min_discount_percent);
    const minPrice = numberOrNull(form.min_price);
    const maxPrice = numberOrNull(form.max_price);
    const autoApproveMax = numberOrNull(
      form.auto_approve_max_price,
    );

    if (
      discount !== null &&
      (discount < 0 || discount > 100)
    ) {
      setError(
        "O desconto mínimo deve estar entre 0% e 100%.",
      );
      return;
    }

    if (minPrice !== null && minPrice < 0) {
      setError("O preço mínimo não pode ser negativo.");
      return;
    }

    if (maxPrice !== null && maxPrice < 0) {
      setError("O preço máximo não pode ser negativo.");
      return;
    }

    if (
      minPrice !== null &&
      maxPrice !== null &&
      maxPrice < minPrice
    ) {
      setError(
        "O preço máximo não pode ser menor que o preço mínimo.",
      );
      return;
    }

    if (
      form.auto_approve &&
      autoApproveMax !== null &&
      autoApproveMax < 0
    ) {
      setError(
        "O limite de aprovação automática não pode ser negativo.",
      );
      return;
    }

    setSaving(true);

    const payload = {
      name: form.name.trim(),
      marketplace_id: form.marketplace_id || null,
      category: form.category.trim() || null,
      min_discount_percent: discount ?? 0,
      min_price: minPrice,
      max_price: maxPrice,
      auto_approve: form.auto_approve,
      auto_approve_max_price: form.auto_approve
        ? autoApproveMax
        : null,
      active: form.active,
    };

    let ruleId = editingId;

    if (editingId) {
      const result = await supabase
        .from("offer_rules")
        .update(payload)
        .eq("id", editingId)
        .select("id")
        .single();

      if (result.error) {
        setError(
          `Erro ao atualizar regra: ${result.error.message}`,
        );
        setSaving(false);
        return;
      }
    } else {
      const result = await supabase
        .from("offer_rules")
        .insert(payload)
        .select("id")
        .single();

      if (result.error) {
        setError(
          `Erro ao criar regra: ${result.error.message}`,
        );
        setSaving(false);
        return;
      }

      ruleId = result.data.id;
    }

    if (!ruleId) {
      setError("Não foi possível identificar a regra.");
      setSaving(false);
      return;
    }

    setSuccess(
      editingId
        ? "Regra atualizada. A busca automática continuará usando a categoria e os termos descobertos pelo Ofertix."
        : "Regra criada. O Ofertix fará a descoberta automática de produtos e termos para essa categoria.",
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
      setError(
        `Não foi possível alterar a regra: ${error.message}`,
      );
      return;
    }

    setSuccess(
      rule.active
        ? "Regra desativada."
        : "Regra ativada.",
    );

    await loadData();
  }

  async function deleteRule(rule: OfferRule) {
    const confirmed = window.confirm(
      `Excluir a regra "${rule.name}"?\n\nOs vínculos dessa regra também serão removidos.`,
    );

    if (!confirmed) return;

    setDeleting(rule.id);
    setError(null);
    setSuccess(null);

    const { error } = await supabase
      .from("offer_rules")
      .delete()
      .eq("id", rule.id);

    if (error) {
      setError(
        `Não foi possível excluir a regra: ${error.message}`,
      );

      setDeleting(null);
      return;
    }

    setSuccess("Regra excluída com sucesso.");

    await loadData();

    setDeleting(null);
  }

  function getMarketplaceName(
    marketplaceId: string | null,
  ) {
    if (!marketplaceId) {
      return "Todos os marketplaces";
    }

    return (
      marketplaces.find(
        (marketplace) => marketplace.id === marketplaceId,
      )?.name ?? "Marketplace"
    );
  }

  function getCategoryStats(
    categoryName: string | null,
  ): TermStats {
    if (!categoryName) {
      return {
        total: 0,
        discovered: 0,
        trends: 0,
      };
    }

    const category = categories.find(
      (item) => item.name === categoryName,
    );

    if (!category) {
      return {
        total: 0,
        discovered: 0,
        trends: 0,
      };
    }

    return (
      termStats[category.id] ?? {
        total: 0,
        discovered: 0,
        trends: 0,
      }
    );
  }

  function formatNumber(value: number | null) {
    if (value === null) return null;

    return new Intl.NumberFormat("pt-BR", {
      maximumFractionDigits: 2,
    }).format(value);
  }

  function formatPrice(value: number | null) {
    if (value === null) return null;

    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  }

  const activeRules = useMemo(
    () => rules.filter((rule) => rule.active).length,
    [rules],
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">AUTOMAÇÃO</p>

          <h1>Regras</h1>

          <p className="page-description">
            Defina o que o Ofertix deve procurar. A descoberta de
            termos e a seleção dos melhores produtos são feitas
            automaticamente pelo sistema.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
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
              gap: 7,
              padding: "8px 12px",
              border: "1px solid #202734",
              borderRadius: 8,
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
          >
            <Plus size={16} />
            Nova regra
          </button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 10,
          marginBottom: 16,
        }}
      >
        <div
          className="panel"
          style={{ padding: 14 }}
        >
          <div
            style={{
              color: "#687386",
              fontSize: 9,
              textTransform: "uppercase",
            }}
          >
            Regras ativas
          </div>

          <div
            style={{
              color: "#e8edf5",
              fontSize: 20,
              fontWeight: 700,
              marginTop: 4,
            }}
          >
            {activeRules}
          </div>
        </div>

        <div
          className="panel"
          style={{ padding: 14 }}
        >
          <div
            style={{
              color: "#687386",
              fontSize: 9,
              textTransform: "uppercase",
            }}
          >
            Descoberta automática
          </div>

          <div
            style={{
              color: "#60a5fa",
              fontSize: 12,
              fontWeight: 600,
              marginTop: 7,
            }}
          >
            Ativa
          </div>

          <div
            style={{
              color: "#687386",
              fontSize: 10,
              marginTop: 3,
            }}
          >
            Termos são aprendidos pelo sincronizador.
          </div>
        </div>

        <div
          className="panel"
          style={{ padding: 14 }}
        >
          <div
            style={{
              color: "#687386",
              fontSize: 9,
              textTransform: "uppercase",
            }}
          >
            Qualidade
          </div>

          <div
            style={{
              color: "#6ee7b7",
              fontSize: 12,
              fontWeight: 600,
              marginTop: 7,
            }}
          >
            Automática
          </div>

          <div
            style={{
              color: "#687386",
              fontSize: 10,
              marginTop: 3,
            }}
          >
            Vendedor + vendas + reputação.
          </div>
        </div>
      </div>

      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: "12px 14px",
            borderRadius: 8,
            background: "#2a1820",
            border: "1px solid #5a2735",
            color: "#fca5a5",
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          style={{
            marginBottom: 16,
            padding: "12px 14px",
            borderRadius: 8,
            background: "#132a21",
            border: "1px solid #24553f",
            color: "#6ee7b7",
            fontSize: 12,
          }}
        >
          {success}
        </div>
      )}

      {showForm && (
        <div
          className="panel"
          style={{ marginBottom: 16 }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 18,
            }}
          >
            <div>
              <div
                style={{
                  color: "#e8edf5",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                {editingId
                  ? "Editar regra"
                  : "Nova regra"}
              </div>

              <div
                style={{
                  color: "#687386",
                  fontSize: 10,
                  marginTop: 4,
                }}
              >
                Você define a intenção. O Ofertix cuida da
                descoberta dos produtos.
              </div>
            </div>

            <button
              className="text-button"
              onClick={closeForm}
              disabled={saving}
            >
              <X size={15} />
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(2, minmax(0, 1fr))",
              gap: 14,
            }}
          >
            <Field label="Nome da regra">
              <input
                value={form.name}
                onChange={(event) =>
                  updateField(
                    "name",
                    event.target.value,
                  )
                }
                placeholder="Ex.: Ofertas de perfumes"
                style={inputStyle}
              />
            </Field>

            <Field label="Marketplace">
              <select
                value={form.marketplace_id}
                onChange={(event) =>
                  updateField(
                    "marketplace_id",
                    event.target.value,
                  )
                }
                style={inputStyle}
              >
                <option value="">
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
            </Field>

            <Field label="Categoria">
              <select
                value={form.category}
                onChange={(event) =>
                  updateField(
                    "category",
                    event.target.value,
                  )
                }
                style={inputStyle}
              >
                <option value="">
                  Todas as categorias
                </option>

                {categories.map((category) => (
                  <option
                    key={category.id}
                    value={category.name}
                  >
                    {category.name}
                  </option>
                ))}
              </select>

              <HelpText>
                A categoria é a base da descoberta. O sistema
                aprende novos termos automaticamente.
              </HelpText>
            </Field>

            <div
              style={{
                padding: 12,
                borderRadius: 9,
                border: "1px solid #263244",
                background: "#0d1420",
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
              }}
            >
              <Sparkles
                size={16}
                style={{
                  color: "#60a5fa",
                  marginTop: 1,
                }}
              />

              <div>
                <div
                  style={{
                    color: "#d9e2ef",
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  Descoberta automática ativada
                </div>

                <div
                  style={{
                    color: "#687386",
                    fontSize: 10,
                    lineHeight: 1.5,
                    marginTop: 4,
                  }}
                >
                  Não é necessário cadastrar termos de busca.
                  O Ofertix usa a categoria, resultados
                  encontrados, tendências e novos padrões dos
                  títulos para ampliar a busca.
                </div>
              </div>
            </div>

            <Field label="Desconto mínimo (%)">
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.min_discount_percent}
                onChange={(event) =>
                  updateField(
                    "min_discount_percent",
                    event.target.value,
                  )
                }
                placeholder="0"
                style={inputStyle}
              />
            </Field>

            <Field label="Preço mínimo">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.min_price}
                onChange={(event) =>
                  updateField(
                    "min_price",
                    event.target.value,
                  )
                }
                placeholder="Sem mínimo"
                style={inputStyle}
              />
            </Field>

            <Field label="Preço máximo">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.max_price}
                onChange={(event) =>
                  updateField(
                    "max_price",
                    event.target.value,
                  )
                }
                placeholder="Sem máximo"
                style={inputStyle}
              />
            </Field>

            <div>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  color: "#cbd3df",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={form.auto_approve}
                  onChange={(event) =>
                    updateField(
                      "auto_approve",
                      event.target.checked,
                    )
                  }
                />

                Aprovação automática
              </label>

              {form.auto_approve && (
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.auto_approve_max_price}
                  onChange={(event) =>
                    updateField(
                      "auto_approve_max_price",
                      event.target.value,
                    )
                  }
                  placeholder="Limite de preço"
                  style={{
                    ...inputStyle,
                    marginTop: 8,
                  }}
                />
              )}

              <HelpText>
                Produtos acima do limite não são descartados;
                ficam para aprovação manual.
              </HelpText>
            </div>

            <div
              style={{
                gridColumn: "1 / -1",
                borderTop: "1px solid #202734",
                paddingTop: 14,
              }}
            >
              <button
                type="button"
                onClick={() =>
                  updateField(
                    "active",
                    !form.active,
                  )
                }
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  border: "1px solid #202734",
                  borderRadius: 8,
                  background: "#0b0f16",
                  color: form.active
                    ? "#6ee7b7"
                    : "#8d98aa",
                  padding: "8px 11px",
                  cursor: "pointer",
                  fontSize: 11,
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
              gap: 8,
              marginTop: 22,
              paddingTop: 16,
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
              Consultando as regras configuradas no Ofertix.
            </p>
          </div>
        ) : rules.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <Plus size={25} />
            </div>

            <h3>Nenhuma regra configurada</h3>

            <p>
              Crie uma regra para definir quais categorias e
              critérios o Ofertix deve procurar.
            </p>

            <button
              className="primary-button"
              onClick={openCreateForm}
              style={{ marginTop: 8 }}
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
              gap: 10,
            }}
          >
            {rules.map((rule) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                marketplaces={marketplaces}
                termStats={getCategoryStats(
                  rule.category,
                )}
                onEdit={openEditForm}
                onToggle={toggleRule}
                onDelete={deleteRule}
                deleting={deleting}
                getMarketplaceName={getMarketplaceName}
                formatNumber={formatNumber}
                formatPrice={formatPrice}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 11px",
  border: "1px solid #202734",
  borderRadius: 8,
  background: "#0b0f16",
  color: "#e8edf5",
  outline: "none",
  fontSize: 12,
};

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        style={{
          display: "block",
          color: "#aeb7c6",
          fontSize: 10,
          fontWeight: 600,
          marginBottom: 6,
        }}
      >
        {label}
      </label>

      {children}
    </div>
  );
}

function HelpText({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <p
      style={{
        margin: "6px 0 0",
        color: "#687386",
        fontSize: 10,
        lineHeight: 1.5,
      }}
    >
      {children}
    </p>
  );
}

interface RuleCardProps {
  rule: OfferRule;
  marketplaces: Marketplace[];
  termStats: TermStats;
  onEdit: (rule: OfferRule) => void;
  onToggle: (rule: OfferRule) => void;
  onDelete: (rule: OfferRule) => void;
  deleting: string | null;
  getMarketplaceName: (
    marketplaceId: string | null,
  ) => string;
  formatNumber: (
    value: number | null,
  ) => string | null;
  formatPrice: (
    value: number | null,
  ) => string | null;
}

function RuleCard({
  rule,
  termStats,
  onEdit,
  onToggle,
  onDelete,
  deleting,
  getMarketplaceName,
  formatNumber,
  formatPrice,
}: RuleCardProps) {
  return (
    <div
      style={{
        padding: 16,
        border: "1px solid #202734",
        borderRadius: 10,
        background: "#0b0f16",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 220,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                color: "#e8edf5",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {rule.name}
            </span>

            <span
              style={{
                padding: "4px 8px",
                borderRadius: 20,
                background: rule.active
                  ? "#132a21"
                  : "#20232b",
                color: rule.active
                  ? "#6ee7b7"
                  : "#8d98aa",
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              {rule.active ? "Ativa" : "Inativa"}
            </span>

            {rule.auto_approve && (
              <span
                style={{
                  padding: "4px 8px",
                  borderRadius: 20,
                  background: "#16243a",
                  color: "#60a5fa",
                  fontSize: 10,
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
              gap: 8,
              flexWrap: "wrap",
              marginTop: 8,
            }}
          >
            <span
              style={{
                color: "#687386",
                fontSize: 10,
              }}
            >
              {getMarketplaceName(
                rule.marketplace_id,
              )}
            </span>

            {rule.category && (
              <>
                <span
                  style={{
                    color: "#3c4555",
                    fontSize: 10,
                  }}
                >
                  •
                </span>

                <span
                  style={{
                    color: "#687386",
                    fontSize: 10,
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
            gap: 7,
          }}
        >
          <button
            className="text-button"
            onClick={() => onEdit(rule)}
            title="Editar regra"
          >
            <Edit3 size={15} />
          </button>

          <button
            className="text-button"
            onClick={() => onToggle(rule)}
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
            onClick={() => onDelete(rule)}
            disabled={deleting === rule.id}
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
          gap: 10,
          marginTop: 16,
          paddingTop: 14,
          borderTop: "1px solid #202734",
        }}
      >
        <div>
          <div style={labelStyle}>
            Desconto mínimo
          </div>

          <div style={valueStyle}>
            {formatNumber(
              rule.min_discount_percent,
            ) ?? "0"}
            %
          </div>
        </div>

        <div>
          <div style={labelStyle}>
            Faixa de preço
          </div>

          <div style={valueStyle}>
            {formatPrice(rule.min_price) ??
              "Sem mínimo"}{" "}
            →{" "}
            {formatPrice(rule.max_price) ??
              "Sem máximo"}
          </div>
        </div>

        <div>
          <div style={labelStyle}>
            Aprovação
          </div>

          <div
            style={{
              ...valueStyle,
              color: rule.auto_approve
                ? "#6ee7b7"
                : "#facc15",
            }}
          >
            {rule.auto_approve
              ? rule.auto_approve_max_price !== null
                ? `Automática até ${formatPrice(
                    rule.auto_approve_max_price,
                  )}`
                : "Automática sem limite"
              : "Manual"}
          </div>
        </div>

        <div>
          <div style={labelStyle}>
            Descoberta
          </div>

          <div
            style={{
              ...valueStyle,
              color: "#60a5fa",
            }}
          >
            {rule.category
              ? "Automática"
              : "Por categoria"}
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          padding: "11px 12px",
          borderRadius: 8,
          background: "#0d1420",
          border: "1px solid #1c2b40",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Sparkles
          size={15}
          style={{
            color: "#60a5fa",
            flexShrink: 0,
          }}
        />

        <div style={{ flex: 1 }}>
          <div
            style={{
              color: "#cbd3df",
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            O Ofertix encontra os termos automaticamente
          </div>

          <div
            style={{
              color: "#687386",
              fontSize: 9,
              marginTop: 3,
            }}
          >
            {rule.category
              ? `${termStats.total} termos conhecidos para esta categoria · ${termStats.discovered} descobertos · ${termStats.trends} vindos de tendências`
              : "Defina uma categoria para ativar a descoberta específica."}
          </div>
        </div>
      </div>
    </div>
  );
}

const labelStyle: CSSProperties = {
  color: "#687386",
  fontSize: 9,
  textTransform: "uppercase",
};

const valueStyle: CSSProperties = {
  color: "#cbd3df",
  fontSize: 12,
  marginTop: 4,
};