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

type Category = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
};

type WhatsAppGroup = {
  id: string;
  name: string;
  group_identifier: string | null;
  category_id: string | null;
  active: boolean;
  created_at: string;
};

type FormData = {
  name: string;
  group_identifier: string;
  category_id: string;
  active: boolean;
};

const initialForm: FormData = {
  name: "",
  group_identifier: "",
  category_id: "",
  active: true,
};

export function WhatsApp() {
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState<FormData>(initialForm);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const [groupsResult, categoriesResult] = await Promise.all([
        supabase
          .from("whatsapp_groups")
          .select(
            "id, name, group_identifier, category_id, active, created_at"
          )
          .order("created_at", { ascending: false }),

        supabase
          .from("offer_categories")
          .select("id, name, slug, active")
          .eq("active", true)
          .order("name", { ascending: true }),
      ]);

      if (groupsResult.error) {
        throw groupsResult.error;
      }

      if (categoriesResult.error) {
        throw categoriesResult.error;
      }

      setGroups(groupsResult.data || []);
      setCategories(categoriesResult.data || []);
    } catch (err: any) {
      console.error("Erro ao carregar WhatsApp:", err);
      setError(
        err?.message ||
          "Não foi possível carregar os canais do WhatsApp."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function getCategoryName(categoryId: string | null) {
    if (!categoryId) return "Sem categoria";

    const category = categories.find(
      (item) => item.id === categoryId
    );

    return category?.name || "Categoria não encontrada";
  }

  function openCreate() {
    setEditingId(null);
    setForm(initialForm);
    setError("");
    setSuccess("");
    setShowForm(true);
  }

  function openEdit(group: WhatsAppGroup) {
    setEditingId(group.id);

    setForm({
      name: group.name || "",
      group_identifier: group.group_identifier || "",
      category_id: group.category_id || "",
      active: group.active,
    });

    setError("");
    setSuccess("");
    setShowForm(true);
  }

  function closeForm() {
    if (saving) return;

    setShowForm(false);
    setEditingId(null);
    setForm(initialForm);
  }

  async function saveGroup() {
    setError("");
    setSuccess("");

    if (!form.name.trim()) {
      setError("Informe o nome do grupo.");
      return;
    }

    if (!form.category_id) {
      setError("Selecione uma categoria para o grupo.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        name: form.name.trim(),
        group_identifier: form.group_identifier.trim() || null,
        category_id: form.category_id,
        active: form.active,
      };

      if (editingId) {
        const { error } = await supabase
          .from("whatsapp_groups")
          .update(payload)
          .eq("id", editingId);

        if (error) {
          throw error;
        }

        setSuccess("Grupo atualizado com sucesso.");
      } else {
        const { error } = await supabase
          .from("whatsapp_groups")
          .insert(payload);

        if (error) {
          throw error;
        }

        setSuccess("Grupo criado com sucesso.");
      }

      await loadData();

      setTimeout(() => {
        setShowForm(false);
        setEditingId(null);
        setForm(initialForm);
        setSuccess("");
      }, 700);
    } catch (err: any) {
      console.error("Erro ao salvar grupo:", err);

      setError(
        err?.message ||
          "Não foi possível salvar o grupo."
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(group: WhatsAppGroup) {
    setError("");
    setSuccess("");

    try {
      const { error } = await supabase
        .from("whatsapp_groups")
        .update({
          active: !group.active,
        })
        .eq("id", group.id);

      if (error) {
        throw error;
      }

      setGroups((current) =>
        current.map((item) =>
          item.id === group.id
            ? {
                ...item,
                active: !item.active,
              }
            : item
        )
      );
    } catch (err: any) {
      console.error("Erro ao alterar status:", err);

      setError(
        err?.message ||
          "Não foi possível alterar o status do grupo."
      );
    }
  }

  async function deleteGroup(group: WhatsAppGroup) {
    const confirmed = window.confirm(
      `Deseja realmente excluir o grupo "${group.name}"?`
    );

    if (!confirmed) return;

    setError("");
    setSuccess("");

    try {
      const { error } = await supabase
        .from("whatsapp_groups")
        .delete()
        .eq("id", group.id);

      if (error) {
        throw error;
      }

      setGroups((current) =>
        current.filter((item) => item.id !== group.id)
      );

      setSuccess("Grupo excluído com sucesso.");

      setTimeout(() => {
        setSuccess("");
      }, 2500);
    } catch (err: any) {
      console.error("Erro ao excluir grupo:", err);

      setError(
        err?.message ||
          "Não foi possível excluir o grupo."
      );
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">CANAIS</p>

          <h1>WhatsApp</h1>

          <p className="page-description">
            Configure os grupos e defina quais categorias de ofertas
            serão encaminhadas para cada canal.
          </p>
        </div>

        <div className="page-actions">
          <button
            className="button secondary"
            onClick={loadData}
            disabled={loading}
          >
            <RefreshCw size={17} />

            Atualizar
          </button>

          <button
            className="button primary"
            onClick={openCreate}
          >
            <Plus size={17} />

            Novo grupo
          </button>
        </div>
      </div>

      {error && (
        <div className="alert error">
          <X size={18} />

          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="alert success">
          <Check size={18} />

          <span>{success}</span>
        </div>
      )}

      {showForm && (
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>
                {editingId
                  ? "Editar grupo"
                  : "Novo grupo"}
              </h2>

              <p>
                Vincule o grupo a uma categoria para que as ofertas
                sejam direcionadas corretamente.
              </p>
            </div>

            <button
              className="icon-button"
              onClick={closeForm}
              disabled={saving}
              title="Fechar"
            >
              <X size={18} />
            </button>
          </div>

          <div className="form-grid">
            <div className="form-field">
              <label>Nome do grupo</label>

              <input
                type="text"
                placeholder="Ex.: Ofertas Automotivas"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </div>

            <div className="form-field">
              <label>Identificador do grupo</label>

              <input
                type="text"
                placeholder="ID, JID ou identificador do canal"
                value={form.group_identifier}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    group_identifier: event.target.value,
                  }))
                }
              />

              <small>
                Pode ser preenchido agora ou posteriormente,
                dependendo da integração utilizada.
              </small>
            </div>

            <div className="form-field">
              <label>Categoria</label>

              <div className="select-wrapper">
                <select
                  value={form.category_id}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      category_id: event.target.value,
                    }))
                  }
                >
                  <option value="">
                    Selecione uma categoria
                  </option>

                  {categories.map((category) => (
                    <option
                      key={category.id}
                      value={category.id}
                    >
                      {category.name}
                    </option>
                  ))}
                </select>

                <ChevronDown size={17} />
              </div>
            </div>

            <div className="form-field">
              <label>Status</label>

              <label className="switch-row">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      active: event.target.checked,
                    }))
                  }
                />

                <span>
                  Grupo ativo
                </span>
              </label>
            </div>
          </div>

          <div className="panel-footer">
            <button
              className="button secondary"
              onClick={closeForm}
              disabled={saving}
            >
              Cancelar
            </button>

            <button
              className="button primary"
              onClick={saveGroup}
              disabled={saving}
            >
              <Save size={17} />

              {saving
                ? "Salvando..."
                : editingId
                ? "Salvar alterações"
                : "Criar grupo"}
            </button>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>Grupos configurados</h2>

            <p>
              Cada grupo pode receber ofertas de uma categoria
              específica.
            </p>
          </div>

          <div className="panel-count">
            {groups.length}{" "}
            {groups.length === 1 ? "grupo" : "grupos"}
          </div>
        </div>

        {loading ? (
          <div className="empty-state">
            <RefreshCw
              size={24}
              className="spin"
            />

            <h3>Carregando grupos...</h3>

            <p>
              Buscando os canais configurados.
            </p>
          </div>
        ) : groups.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <Plus size={24} />
            </div>

            <h3>Nenhum grupo configurado</h3>

            <p>
              Crie o primeiro grupo para começar a
              organizar suas publicações por categoria.
            </p>

            <button
              className="button primary"
              onClick={openCreate}
            >
              <Plus size={17} />

              Criar primeiro grupo
            </button>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Grupo</th>
                  <th>Categoria</th>
                  <th>Identificador</th>
                  <th>Status</th>
                  <th className="actions-column">
                    Ações
                  </th>
                </tr>
              </thead>

              <tbody>
                {groups.map((group) => (
                  <tr key={group.id}>
                    <td>
                      <div className="table-main">
                        <strong>
                          {group.name}
                        </strong>
                      </div>
                    </td>

                    <td>
                      <span className="category-badge">
                        {getCategoryName(
                          group.category_id
                        )}
                      </span>
                    </td>

                    <td>
                      <span className="muted">
                        {group.group_identifier ||
                          "Não configurado"}
                      </span>
                    </td>

                    <td>
                      <button
                        className={`status-badge ${
                          group.active
                            ? "active"
                            : "inactive"
                        }`}
                        onClick={() =>
                          toggleActive(group)
                        }
                        title={
                          group.active
                            ? "Desativar grupo"
                            : "Ativar grupo"
                        }
                      >
                        <span className="status-dot" />

                        {group.active
                          ? "Ativo"
                          : "Inativo"}
                      </button>
                    </td>

                    <td>
                      <div className="table-actions">
                        <button
                          className="icon-button"
                          onClick={() =>
                            openEdit(group)
                          }
                          title="Editar grupo"
                        >
                          <Edit3 size={17} />
                        </button>

                        <button
                          className="icon-button danger"
                          onClick={() =>
                            deleteGroup(group)
                          }
                          title="Excluir grupo"
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}