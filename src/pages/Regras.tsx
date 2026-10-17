import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Armchair,
  BedDouble,
  Check,
  CookingPot,
  Edit3,
  Layers3,
  Plus,
  RefreshCw,
  Search,
  Shirt,
  Sparkles,
  Tags,
  Trash2,
  X,
  Save,
  ShieldCheck,
  CarFront,
  HeartPulse,
  PawPrint,
  Smartphone,
  Gamepad2,
  BookOpen,
  Wrench,
  Flower2,
  Package,
  ArrowLeft,
} from "lucide-react";
import { supabase } from "../lib/supabase";

type Marketplace = { id: string; name: string; slug: string; active: boolean };
type Category = { id: string; name: string; slug: string; active: boolean; priority: number };
type Rule = {
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
};
type Term = {
  id?: string;
  term: string;
  category_id: string | null;
  source: "manual" | "discovered" | "trend";
  active: boolean;
};
type Form = {
  name: string;
  marketplace_id: string;
  category: string;
  searchTerms: string;
  min_discount_percent: string;
  min_price: string;
  max_price: string;
  auto_approve: boolean;
  auto_approve_max_price: string;
  active: boolean;
};

const empty: Form = {
  name: "",
  marketplace_id: "",
  category: "",
  searchTerms: "",
  min_discount_percent: "0",
  min_price: "",
  max_price: "",
  auto_approve: false,
  auto_approve_max_price: "500",
  active: true,
};
const input = "rules-input";
const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function art(name: string) {
  const n = name.toLowerCase();
  if (/automot|carro|veículo|veiculo|auto/.test(n))
    return { emoji: "🚗", Icon: CarFront, cls: "automotive" };
  if (/cozinha|culin/.test(n))
    return { emoji: "🍳", Icon: CookingPot, cls: "kitchen" };
  if (/cama|quarto|lenç|lenc/.test(n))
    return { emoji: "🛏️", Icon: BedDouble, cls: "bedroom" };
  if (/sala|sofá|sofa|móveis|moveis|decora/.test(n))
    return { emoji: "🛋️", Icon: Armchair, cls: "living" };
  if (/roupa|moda|vestu/.test(n))
    return { emoji: "👕", Icon: Shirt, cls: "fashion" };
  if (/beleza|perfume|cosmét|cosmet|saúde|saude/.test(n))
    return { emoji: "🧴", Icon: HeartPulse, cls: "beauty" };
  if (/pet|animal/.test(n))
    return { emoji: "🐾", Icon: PawPrint, cls: "pets" };
  if (/celular|smartphone|eletrôn|eletron|informát|informat/.test(n))
    return { emoji: "📱", Icon: Smartphone, cls: "electronics" };
  if (/jogo|game|brinquedo/.test(n))
    return { emoji: "🎮", Icon: Gamepad2, cls: "games" };
  if (/livro|papelaria|escolar/.test(n))
    return { emoji: "📚", Icon: BookOpen, cls: "books" };
  if (/ferrament|constru|reforma/.test(n))
    return { emoji: "🛠️", Icon: Wrench, cls: "tools" };
  if (/jardim|planta|flor/.test(n))
    return { emoji: "🌿", Icon: Flower2, cls: "garden" };
  return { emoji: "📦", Icon: Package, cls: "general" };
}

export function Regras() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // A tela possui dois modos: listagem e formulário em subtela.
  const [view, setView] = useState<"list" | "form">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryPriority, setNewCategoryPriority] = useState("10");
  const [addingCategory, setAddingCategory] = useState(false);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function loadData(showLoading = true) {
    if (showLoading) setLoading(true);
    const [r, m, c, t] = await Promise.all([
      supabase.from("offer_rules").select("*").order("created_at", { ascending: false }),
      supabase.from("marketplaces").select("id,name,slug,active").eq("active", true).order("name"),
      supabase.from("offer_categories").select("id,name,slug,active,priority").eq("active", true).order("priority").order("name"),
      supabase.from("search_terms").select("id,term,category_id,source,active").eq("active", true),
    ]);

    if (r.error) setError("Erro ao carregar regras: " + r.error.message);
    else setRules((r.data || []) as Rule[]);

    if (m.error) console.error(m.error);
    else setMarketplaces((m.data || []) as Marketplace[]);

    if (c.error) console.error(c.error);
    else setCategories((c.data || []) as Category[]);

    if (t.error) console.error("Termos:", t.error);
    else setTerms((t.data || []) as Term[]);

    if (showLoading) setLoading(false);
  }

  useEffect(() => {
    void loadData();
  }, []);

  const activeRules = rules.filter((x) => x.active).length;
  const activeTerms = terms.filter((x) => x.active).length;
  const shown = useMemo(
    () =>
      rules.filter(
        (r) =>
          (!query.trim() ||
            `${r.name} ${r.category || ""}`
              .toLowerCase()
              .includes(query.trim().toLowerCase())) &&
          (status === "all" || (status === "active" ? r.active : !r.active)),
      ),
    [rules, query, status],
  );

  const setField = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const currency = (value: number | null) =>
    value == null
      ? null
      : new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
        }).format(value);

  const marketName = (id: string | null) =>
    id ? marketplaces.find((m) => m.id === id)?.name || "Marketplace" : "Todos os marketplaces";

  const categoryTerms = (name: string | null) => {
    const category = categories.find((item) => item.name === name);
    return category ? terms.filter((term) => term.category_id === category.id && term.active) : [];
  };

  function createRule() {
    setEditingId(null);
    setForm({
      ...empty,
      marketplace_id: marketplaces.length === 1 ? marketplaces[0].id : "",
    });
    setNewCategoryName("");
    setNewCategoryPriority("10");
    setAddingCategory(false);
    setView("form");
    setError(null);
    setSuccess(null);
  }

  async function editRule(rule: Rule) {
    const category = categories.find((item) => item.name === rule.category);
    setEditingId(rule.id);
    setForm({
      name: rule.name,
      marketplace_id: rule.marketplace_id || "",
      category: rule.category || "",
      searchTerms: terms
        .filter((term) => term.category_id === category?.id && term.source === "manual")
        .map((term) => term.term)
        .join(", "),
      min_discount_percent: String(rule.min_discount_percent ?? 0),
      min_price: rule.min_price == null ? "" : String(rule.min_price),
      max_price: rule.max_price == null ? "" : String(rule.max_price),
      auto_approve: rule.auto_approve,
      auto_approve_max_price: String(rule.auto_approve_max_price ?? 500),
      active: rule.active,
    });
    setNewCategoryName("");
    setNewCategoryPriority("10");
    setAddingCategory(false);
    setView("form");
    setError(null);
    setSuccess(null);
  }

  function closeForm() {
    if (saving) return;
    setView("list");
    setEditingId(null);
    setAddingCategory(false);
    setError(null);
  }

  function num(value: string) {
    return value.trim() ? Number(value) : null;
  }

  async function addCategoryToForm() {
    setError(null);
    setSuccess(null);

    const name = newCategoryName.trim();
    if (!name) {
      setError("Informe o nome da categoria.");
      return;
    }

    const slug = slugify(name);
    const existing = categories.find(
      (category) => category.slug === slug || category.name.toLowerCase() === name.toLowerCase(),
    );

    if (existing) {
      setForm((previous) => ({ ...previous, category: existing.name }));
      setAddingCategory(false);
      setNewCategoryName("");
      setSuccess("Categoria existente selecionada.");
      return;
    }

    setSaving(true);
    try {
      const { data, error: insertError } = await supabase
        .from("offer_categories")
        .insert({
          name,
          slug,
          active: true,
          priority: Number(newCategoryPriority) || 10,
        })
        .select("id,name,slug,active,priority")
        .single();

      if (insertError) throw insertError;

      const created = data as Category;
      setCategories((previous) => [...previous, created].sort(
        (a, b) => a.priority - b.priority || a.name.localeCompare(b.name, "pt-BR"),
      ));
      setForm((previous) => ({ ...previous, category: created.name }));
      setAddingCategory(false);
      setNewCategoryName("");
      setNewCategoryPriority("10");
      setSuccess("Categoria criada e selecionada. Salve a regra para concluir.");
    } catch (e) {
      console.error(e);
      setError("Não foi possível cadastrar a categoria. " + (e instanceof Error ? e.message : ""));
    } finally {
      setSaving(false);
    }
  }

  async function saveRule() {
    setError(null);
    setSuccess(null);

    if (!form.name.trim()) {
      setError("Informe um nome para a regra.");
      return;
    }
    if (!form.category) {
      setError("Selecione ou cadastre uma categoria para a regra.");
      return;
    }

    const discount = num(form.min_discount_percent);
    const min = num(form.min_price);
    const max = num(form.max_price);
    const autoMax = num(form.auto_approve_max_price);

    if (discount !== null && (discount < 0 || discount > 100)) {
      setError("Desconto mínimo deve ficar entre 0% e 100%.");
      return;
    }
    if ((min !== null && min < 0) || (max !== null && max < 0)) {
      setError("Os preços não podem ser negativos.");
      return;
    }
    if (min !== null && max !== null && max < min) {
      setError("Preço máximo menor que o mínimo.");
      return;
    }
    if (form.auto_approve && autoMax !== null && autoMax < 0) {
      setError("O limite de preço para aprovação automática não pode ser negativo.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        marketplace_id: form.marketplace_id || null,
        category: form.category,
        min_discount_percent: discount ?? 0,
        min_price: min,
        max_price: max,
        auto_approve: form.auto_approve,
        auto_approve_max_price: form.auto_approve ? autoMax : null,
        active: form.active,
      };

      if (editingId) {
        const { error: updateError } = await supabase
          .from("offer_rules")
          .update(payload)
          .eq("id", editingId);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase.from("offer_rules").insert(payload);
        if (insertError) throw insertError;
      }

      const category = categories.find((item) => item.name === form.category);
      if (category) {
        const cleanTerms = [
          ...new Set(
            form.searchTerms
              .split(/[,;\n]+/)
              .map((term) => term.trim())
              .filter(Boolean),
          ),
        ];

        const { error: deleteError } = await supabase
          .from("search_terms")
          .delete()
          .eq("category_id", category.id)
          .eq("source", "manual");
        if (deleteError) throw deleteError;

        if (cleanTerms.length) {
          const { error: insertTermsError } = await supabase.from("search_terms").insert(
            cleanTerms.map((term) => ({
              term,
              category_id: category.id,
              source: "manual",
              active: true,
            })),
          );
          if (insertTermsError) throw insertTermsError;
        }
      }

      setSuccess("Regra e termos manuais salvos. A descoberta automática existente continua habilitada.");
      setView("list");
      setEditingId(null);
      setForm(empty);
      await loadData(false);
    } catch (e) {
      console.error(e);
      setError("Não foi possível salvar a regra e os termos. " + (e instanceof Error ? e.message : ""));
    } finally {
      setSaving(false);
    }
  }

  async function toggleRule(rule: Rule) {
    const { error: updateError } = await supabase
      .from("offer_rules")
      .update({ active: !rule.active })
      .eq("id", rule.id);

    if (updateError) setError(updateError.message);
    else {
      setSuccess(rule.active ? "Regra pausada." : "Regra ativada.");
      await loadData(false);
    }
  }

  async function deleteRule(rule: Rule) {
    if (!confirm(`Excluir a regra "${rule.name}"?`)) return;
    setDeleting(rule.id);

    const { error: deleteError } = await supabase.from("offer_rules").delete().eq("id", rule.id);
    if (deleteError) setError(deleteError.message);
    else {
      setSuccess("Regra excluída.");
      await loadData(false);
    }
    setDeleting(null);
  }

  if (loading) {
    return (
      <section className="page rules-page">
        <div className="rules-empty">
          <RefreshCw className="rules-spin" />
          <span>Carregando regras e categorias...</span>
        </div>
      </section>
    );
  }

  if (view === "form") {
    return (
      <section className="page rules-page">
        <header className="rules-hero">
          <div className="rules-hero-left">
            <button className="rules-ghost-button" onClick={closeForm} disabled={saving}>
              <ArrowLeft size={16} /> Voltar
            </button>
            <div className="rules-hero-icon">
              <Layers3 size={28} />
            </div>
            <div>
              <span className="rules-eyebrow">CONFIGURAÇÃO DA AUTOMAÇÃO</span>
              <h1>{editingId ? "Editar regra" : "Nova regra"}</h1>
              <p>Configure a categoria e os critérios de busca desta regra.</p>
            </div>
          </div>
          <div className="rules-hero-actions">
            <button className="rules-ghost-button" onClick={closeForm} disabled={saving}>
              <X size={15} /> Cancelar
            </button>
            <button className="rules-primary-button" onClick={() => void saveRule()} disabled={saving}>
              {saving ? <RefreshCw size={15} className="rules-spin" /> : <Save size={15} />}
              {editingId ? "Salvar alterações" : "Criar regra"}
            </button>
          </div>
        </header>

        {error && <div className="rules-alert error"><X size={16} />{error}</div>}
        {success && <div className="rules-alert success"><Check size={16} />{success}</div>}

        <section className="rules-section rules-editor-section">
          <div className="rules-section-heading">
            <div>
              <span className="rules-kicker">IDENTIFICAÇÃO</span>
              <h2>Dados da regra</h2>
              <p>Escolha um nome claro para identificar esta estratégia.</p>
            </div>
          </div>

          <div className="rules-form-panel">
            <div className="rules-form-grid">
              <label className="rules-field">
                <span>Nome da regra</span>
                <input className={input} value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="Ex.: Ofertas para casa" />
              </label>
              <label className="rules-field">
                <span>Marketplace</span>
                <select className={input} value={form.marketplace_id} onChange={(e) => setField("marketplace_id", e.target.value)}>
                  <option value="">Todos os marketplaces</option>
                  {marketplaces.map((marketplace) => <option key={marketplace.id} value={marketplace.id}>{marketplace.name}</option>)}
                </select>
              </label>
            </div>
          </div>
        </section>

        <section className="rules-section rules-editor-section">
          <div className="rules-section-heading">
            <div>
              <span className="rules-kicker">CATEGORIA E PESQUISA</span>
              <h2>O que devemos procurar?</h2>
              <p>A categoria e os termos iniciais orientam a busca de produtos.</p>
            </div>
          </div>

          <div className="rules-form-panel">
            <div className="rules-form-grid">
              <label className="rules-field">
                <span>Categoria da regra</span>
                <select className={input} value={form.category} onChange={(e) => setField("category", e.target.value)}>
                  <option value="">Selecione uma categoria</option>
                  {categories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}
                </select>
              </label>

              <div className="rules-category-inline">
                {!addingCategory ? (
                  <button type="button" className="rules-ghost-button" onClick={() => { setAddingCategory(true); setError(null); setSuccess(null); }}>
                    <Plus size={15} /> Cadastrar nova categoria
                  </button>
                ) : (
                  <div className="rules-inline-category-form">
                    <label className="rules-field">
                      <span>Nome da nova categoria</span>
                      <input className={input} value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="Ex.: Automotivo, Beleza, Pet" />
                    </label>
                    <label className="rules-field">
                      <span>Prioridade</span>
                      <input className={input} type="number" min="1" value={newCategoryPriority} onChange={(e) => setNewCategoryPriority(e.target.value)} />
                      <small>Menor número representa prioridade maior, caso o sincronizador use este campo.</small>
                    </label>
                    <div className="rules-form-actions">
                      <button type="button" className="rules-ghost-button" onClick={() => setAddingCategory(false)} disabled={saving}>Cancelar</button>
                      <button type="button" className="rules-primary-button" onClick={() => void addCategoryToForm()} disabled={saving}>
                        {saving ? <RefreshCw size={15} className="rules-spin" /> : <Save size={15} />} Criar e selecionar
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <label className="rules-field rules-field-wide">
                <span>Termos de pesquisa</span>
                <textarea className={input} rows={4} value={form.searchTerms} onChange={(e) => setField("searchTerms", e.target.value)} placeholder={"Ex.: perfume importado, eau de parfum, kit perfume"} />
                <small>Separe os termos por vírgula, ponto e vírgula ou linha. Os termos manuais desta categoria serão atualizados ao salvar.</small>
              </label>
            </div>
          </div>
        </section>

        <section className="rules-section rules-editor-section">
          <div className="rules-section-heading">
            <div>
              <span className="rules-kicker">FILTROS</span>
              <h2>Critérios da oferta</h2>
              <p>Defina os limites de preço e desconto usados pela regra.</p>
            </div>
          </div>
          <div className="rules-form-panel">
            <div className="rules-form-grid">
              <label className="rules-field">
                <span>Desconto mínimo (%)</span>
                <input className={input} type="number" min="0" max="100" value={form.min_discount_percent} onChange={(e) => setField("min_discount_percent", e.target.value)} />
              </label>
              <label className="rules-field">
                <span>Preço mínimo (R$)</span>
                <input className={input} type="number" min="0" value={form.min_price} onChange={(e) => setField("min_price", e.target.value)} placeholder="Sem mínimo" />
              </label>
              <label className="rules-field">
                <span>Preço máximo (R$)</span>
                <input className={input} type="number" min="0" value={form.max_price} onChange={(e) => setField("max_price", e.target.value)} placeholder="Sem máximo" />
              </label>
              <div className="rules-approval">
                <label>
                  <input type="checkbox" checked={form.auto_approve} onChange={(e) => setField("auto_approve", e.target.checked)} />
                  Aprovação automática
                </label>
                {form.auto_approve && (
                  <input className={input} type="number" min="0" value={form.auto_approve_max_price} onChange={(e) => setField("auto_approve_max_price", e.target.value)} placeholder="Limite de preço" />
                )}
              </div>
              <label className="rules-active">
                <input type="checkbox" checked={form.active} onChange={(e) => setField("active", e.target.checked)} />
                Regra ativa
              </label>
            </div>
          </div>
        </section>

        <div className="rules-form-actions rules-editor-actions">
          <button className="rules-ghost-button" onClick={closeForm} disabled={saving}>Cancelar</button>
          <button className="rules-primary-button" onClick={() => void saveRule()} disabled={saving}>
            {saving ? <RefreshCw size={15} className="rules-spin" /> : <Save size={15} />}
            {editingId ? "Salvar alterações" : "Criar regra"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="page rules-page">
      <header className="rules-hero">
        <div className="rules-hero-left">
          <div className="rules-hero-icon"><Layers3 size={28} /></div>
          <div>
            <span className="rules-eyebrow">CENTRAL DE AUTOMAÇÃO</span>
            <h1>Regras</h1>
            <p>Gerencie as estratégias que orientam a busca de oportunidades.</p>
          </div>
        </div>
        <div className="rules-hero-actions">
          <button className="rules-ghost-button" onClick={() => void loadData()}><RefreshCw size={15} /> Atualizar</button>
          <button className="rules-primary-button" onClick={createRule}><Plus size={16} /> Nova regra</button>
        </div>
      </header>

      {error && <div className="rules-alert error"><X size={16} />{error}</div>}
      {success && <div className="rules-alert success"><Check size={16} />{success}</div>}

      <div className="rules-stats">
        <div className="rules-stat-card"><span className="purple"><ShieldCheck size={20} /></span><div><small>Regras ativas</small><strong>{activeRules}</strong></div></div>
        <div className="rules-stat-card"><span className="green"><Tags size={20} /></span><div><small>Categorias ativas</small><strong>{categories.length}</strong></div></div>
        <div className="rules-stat-card"><span className="orange"><Search size={20} /></span><div><small>Termos ativos</small><strong>{activeTerms}</strong></div></div>
      </div>

      <section className="rules-section">
        <div className="rules-section-heading">
          <div>
            <span className="rules-kicker">SUAS CONFIGURAÇÕES</span>
            <h2>Regras cadastradas</h2>
            <p>Pesquise, edite e acompanhe suas estratégias de busca.</p>
          </div>
          <span className="rules-count">{rules.length} regras</span>
        </div>

        <div className="rules-toolbar">
          <div className="rules-search">
            <Search size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar regra ou categoria..." />
          </div>
          <select className={input} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Todos os status</option>
            <option value="active">Ativas</option>
            <option value="inactive">Inativas</option>
          </select>
        </div>

        <div className="rules-grid">
          {shown.map((rule) => {
            const visual = art(rule.category || "");
            const Icon = visual.Icon;
            const categoryTermList = categoryTerms(rule.category);
            return (
              <article className={`rules-rule-card ${rule.active ? "" : "inactive"}`} key={rule.id}>
                <div className={`rules-rule-art art-${visual.cls}`}>
                  <span>{visual.emoji}</span>
                  <Icon size={39} />
                  <b className={rule.active ? "active" : "paused"}>{rule.active ? "Ativa" : "Pausada"}</b>
                </div>
                <div className="rules-rule-body">
                  <div className="rules-rule-head">
                    <div>
                      <small>{marketName(rule.marketplace_id)}</small>
                      <h3>{rule.name}</h3>
                      <p>{rule.category || "Sem categoria"}</p>
                    </div>
                    <div className="rules-actions">
                      <button title="Editar" onClick={() => void editRule(rule)}><Edit3 size={14} /></button>
                      <button title={rule.active ? "Pausar" : "Ativar"} onClick={() => void toggleRule(rule)}><Check size={14} /></button>
                      <button title="Excluir" disabled={deleting === rule.id} onClick={() => void deleteRule(rule)}>
                        {deleting === rule.id ? <RefreshCw size={14} className="rules-spin" /> : <Trash2 size={14} />}
                      </button>
                    </div>
                  </div>
                  <div className="rules-term-box">
                    <strong><Search size={13} /> O que buscar</strong>
                    <div className="rules-chips">
                      {categoryTermList.length
                        ? categoryTermList.slice(0, 8).map((term) => <span key={term.id || term.term}>{term.term}</span>)
                        : <small>Sem termos manuais. A descoberta automática atual continua disponível.</small>}
                    </div>
                  </div>
                  <div className="rules-metrics">
                    <div><small>Desconto mínimo</small><b>{rule.min_discount_percent ?? 0}%</b></div>
                    <div><small>Faixa de preço</small><b>{currency(rule.min_price) || "Sem mínimo"} – {currency(rule.max_price) || "Sem máximo"}</b></div>
                    <div><small>Aprovação</small><b>{rule.auto_approve ? `Até ${currency(rule.auto_approve_max_price) || "sem limite"}` : "Manual"}</b></div>
                  </div>
                  <footer className="rules-rule-footer">
                    <span><Sparkles size={13} /> Descoberta automática habilitada</span>
                    <span>{categoryTermList.length} termos manuais/ativos</span>
                  </footer>
                </div>
              </article>
            );
          })}
        </div>

        {!shown.length && (
          <div className="rules-empty">
            <Search size={25} />
            <h3>Nenhuma regra encontrada</h3>
            <p>Ajuste a busca ou crie uma nova regra.</p>
            <button className="rules-primary-button" onClick={createRule}><Plus size={15} /> Nova regra</button>
          </div>
        )}
      </section>
    </section>
  );
}
