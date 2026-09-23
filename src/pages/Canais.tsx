import { useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  Edit3,
  Globe2,
  MessageCircle,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabase";

type ChannelType =
  | "facebook"
  | "instagram"
  | "tiktok"
  | "telegram"
  | "whatsapp";

type Category = {
  id: string;
  name: string;
};

type Channel = {
  id: string;
  name: string;
  type: ChannelType;
  category_id: string | null;
  identifier: string | null;
  active: boolean;
  auto_publish: boolean;
  created_at: string;
  updated_at: string;
};

type ChannelForm = {
  name: string;
  type: ChannelType;
  category_id: string;
  identifier: string;
  active: boolean;
  auto_publish: boolean;
};

const emptyForm: ChannelForm = {
  name: "",
  type: "telegram",
  category_id: "",
  identifier: "",
  active: true,
  auto_publish: false,
};

function getChannelLabel(type: ChannelType) {
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
      return type;
  }
}

function getChannelIcon(type: ChannelType) {
  switch (type) {
    case "whatsapp":
      return MessageCircle;

    case "facebook":
    case "instagram":
      return Globe2;

    case "telegram":
    case "tiktok":
    default:
      return Send;
  }
}

function getIdentifierPlaceholder(type: ChannelType) {
  switch (type) {
    case "telegram":
      return "@canal_ou_chat";

    case "whatsapp":
      return "ID ou identificador do grupo";

    case "instagram":
      return "@perfil";

    case "facebook":
      return "Página ou identificador";

    case "tiktok":
      return "@perfil";

    default:
      return "Identificador";
  }
}

export function Canais() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState<ChannelForm>(emptyForm);

  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const loadData = async () => {
    setLoading(true);
    setMessage(null);

    try {
      const [channelsResult, categoriesResult] = await Promise.all([
        supabase
          .from("channels")
          .select(
            "id,name,type,category_id,identifier,active,auto_publish,created_at,updated_at"
          )
          .order("created_at", { ascending: false }),

        supabase
          .from("offer_categories")
          .select("id,name")
          .eq("active", true)
          .order("name", { ascending: true }),
      ]);

      if (channelsResult.error) {
        throw channelsResult.error;
      }

      if (categoriesResult.error) {
        throw categoriesResult.error;
      }

      setChannels((channelsResult.data || []) as Channel[]);
      setCategories((categoriesResult.data || []) as Category[]);
    } catch (error) {
      console.error("Erro ao carregar canais:", error);

      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Não foi possível carregar os canais.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateForm = () => {
    setEditingId(null);
    setForm(emptyForm);
    setMessage(null);
    setShowForm(true);
  };

  const openEditForm = (channel: Channel) => {
    setEditingId(channel.id);

    setForm({
      name: channel.name,
      type: channel.type,
      category_id: channel.category_id || "",
      identifier: channel.identifier || "",
      active: channel.active,
      auto_publish: channel.auto_publish,
    });

    setMessage(null);
    setShowForm(true);
  };

  const closeForm = () => {
    if (saving) {
      return;
    }

    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setMessage({
        type: "error",
        text: "Informe um nome para o canal.",
      });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        category_id: form.category_id || null,
        identifier: form.identifier.trim() || null,
        active: form.active,
        auto_publish: form.auto_publish,
        updated_at: new Date().toISOString(),
      };

      if (editingId) {
        const { error } = await supabase
          .from("channels")
          .update(payload)
          .eq("id", editingId);

        if (error) {
          throw error;
        }

        setMessage({
          type: "success",
          text: "Canal atualizado com sucesso.",
        });
      } else {
        const { error } = await supabase.from("channels").insert({
          ...payload,
          created_at: new Date().toISOString(),
        });

        if (error) {
          throw error;
        }

        setMessage({
          type: "success",
          text: "Canal criado com sucesso.",
        });
      }

      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);

      await loadData();
    } catch (error) {
      console.error("Erro ao salvar canal:", error);

      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Não foi possível salvar o canal.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (channel: Channel) => {
    setMessage(null);

    try {
      const { error } = await supabase
        .from("channels")
        .update({
          active: !channel.active,
          updated_at: new Date().toISOString(),
        })
        .eq("id", channel.id);

      if (error) {
        throw error;
      }

      setChannels((current) =>
        current.map((item) =>
          item.id === channel.id
            ? {
                ...item,
                active: !item.active,
              }
            : item
        )
      );
    } catch (error) {
      console.error("Erro ao alterar status:", error);

      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Não foi possível alterar o status.",
      });
    }
  };

  const handleToggleAutoPublish = async (channel: Channel) => {
    setMessage(null);

    try {
      const { error } = await supabase
        .from("channels")
        .update({
          auto_publish: !channel.auto_publish,
          updated_at: new Date().toISOString(),
        })
        .eq("id", channel.id);

      if (error) {
        throw error;
      }

      setChannels((current) =>
        current.map((item) =>
          item.id === channel.id
            ? {
                ...item,
                auto_publish: !item.auto_publish,
              }
            : item
        )
      );
    } catch (error) {
      console.error(
        "Erro ao alterar publicação automática:",
        error
      );

      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Não foi possível alterar a publicação automática.",
      });
    }
  };

  const handleDelete = async (channel: Channel) => {
    const confirmed = window.confirm(
      `Deseja realmente excluir o canal "${channel.name}"?`
    );

    if (!confirmed) {
      return;
    }

    setDeleting(channel.id);
    setMessage(null);

    try {
      const { error } = await supabase
        .from("channels")
        .delete()
        .eq("id", channel.id);

      if (error) {
        throw error;
      }

      setChannels((current) =>
        current.filter((item) => item.id !== channel.id)
      );

      setMessage({
        type: "success",
        text: "Canal excluído com sucesso.",
      });
    } catch (error) {
      console.error("Erro ao excluir canal:", error);

      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Não foi possível excluir o canal.",
      });
    } finally {
      setDeleting(null);
    }
  };

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) {
      return "Todas as categorias";
    }

    const category = categories.find(
      (item) => item.id === categoryId
    );

    return category?.name || "Categoria não encontrada";
  };

  const activeChannels = channels.filter(
    (channel) => channel.active
  ).length;

  const automaticChannels = channels.filter(
    (channel) => channel.auto_publish
  ).length;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">DISTRIBUIÇÃO</p>

          <h1>Canais</h1>

          <p className="page-description">
            Configure onde o Ofertix poderá publicar suas ofertas
            automaticamente.
          </p>
        </div>

        <div className="page-actions">
          <button
            type="button"
            className="button secondary"
            onClick={loadData}
            disabled={loading}
          >
            <RefreshCw
              size={16}
              className={loading ? "spin" : ""}
            />

            Atualizar
          </button>

          <button
            type="button"
            className="button primary"
            onClick={openCreateForm}
          >
            <Plus size={17} />

            Novo canal
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
          <div>
            {message.type === "success" ? (
              <Check size={17} />
            ) : (
              <X size={17} />
            )}
          </div>

          <span>{message.text}</span>
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-header">
            <span>Total de canais</span>
          </div>

          <strong>{channels.length}</strong>

          <small>canais configurados</small>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span>Canais ativos</span>
          </div>

          <strong>{activeChannels}</strong>

          <small>disponíveis para publicação</small>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span>Publicação automática</span>
          </div>

          <strong>{automaticChannels}</strong>

          <small>canais com automação habilitada</small>
        </div>
      </div>

      {showForm && (
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>
                {editingId
                  ? "Editar canal"
                  : "Novo canal"}
              </h2>

              <p>
                Defina o destino das publicações e as regras de
                distribuição.
              </p>
            </div>

            <button
              type="button"
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
              <label htmlFor="channel-name">
                Nome do canal
              </label>

              <input
                id="channel-name"
                type="text"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Ex.: Ofertas de Perfumes"
              />
            </div>

            <div className="form-field">
              <label htmlFor="channel-type">
                Tipo
              </label>

              <div className="select-wrapper">
                <select
                  id="channel-type"
                  value={form.type}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      type: event.target.value as ChannelType,
                    }))
                  }
                >
                  <option value="telegram">
                    Telegram
                  </option>

                  <option value="whatsapp">
                    WhatsApp
                  </option>

                  <option value="instagram">
                    Instagram
                  </option>

                  <option value="facebook">
                    Facebook
                  </option>

                  <option value="tiktok">
                    TikTok
                  </option>
                </select>

                <ChevronDown size={16} />
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="channel-category">
                Categoria
              </label>

              <div className="select-wrapper">
                <select
                  id="channel-category"
                  value={form.category_id}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      category_id: event.target.value,
                    }))
                  }
                >
                  <option value="">
                    Todas as categorias
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

                <ChevronDown size={16} />
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="channel-identifier">
                Identificador
              </label>

              <input
                id="channel-identifier"
                type="text"
                value={form.identifier}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    identifier: event.target.value,
                  }))
                }
                placeholder={getIdentifierPlaceholder(
                  form.type
                )}
              />

              <small>
                Identificador usado futuramente pela integração
                para localizar o canal.
              </small>
            </div>
          </div>

          <div className="form-grid">
            <div className="switch-row">
              <div>
                <strong>Canal ativo</strong>

                <span>
                  Permite que o canal receba publicações.
                </span>
              </div>

              <button
                type="button"
                className={`switch ${
                  form.active ? "active" : ""
                }`}
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    active: !current.active,
                  }))
                }
                aria-label="Alternar canal ativo"
              >
                <span />
              </button>
            </div>

            <div className="switch-row">
              <div>
                <strong>Publicação automática</strong>

                <span>
                  Permite que o motor publique ofertas
                  automaticamente neste canal.
                </span>
              </div>

              <button
                type="button"
                className={`switch ${
                  form.auto_publish ? "active" : ""
                }`}
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    auto_publish: !current.auto_publish,
                  }))
                }
                aria-label="Alternar publicação automática"
              >
                <span />
              </button>
            </div>
          </div>

          <div className="panel-footer">
            <button
              type="button"
              className="button secondary"
              onClick={closeForm}
              disabled={saving}
            >
              Cancelar
            </button>

            <button
              type="button"
              className="button primary"
              onClick={handleSave}
              disabled={saving}
            >
              <Save size={16} />

              {saving
                ? "Salvando..."
                : editingId
                ? "Salvar alterações"
                : "Criar canal"}
            </button>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>Canais configurados</h2>

            <p>
              Destinos disponíveis para distribuição das ofertas.
            </p>
          </div>

          <span className="panel-count">
            {channels.length}
          </span>
        </div>

        {loading ? (
          <div className="empty-state">
            <div className="empty-icon">
              <RefreshCw
                size={22}
                className="spin"
              />
            </div>

            <h3>Carregando canais...</h3>

            <p>
              Estamos buscando as configurações de canais.
            </p>
          </div>
        ) : channels.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <Globe2 size={24} />
            </div>

            <h3>Nenhum canal configurado</h3>

            <p>
              Crie seu primeiro canal para preparar o Ofertix
              para publicar ofertas automaticamente.
            </p>

            <button
              type="button"
              className="button primary"
              onClick={openCreateForm}
            >
              <Plus size={16} />

              Criar primeiro canal
            </button>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Canal</th>
                  <th>Tipo</th>
                  <th>Categoria</th>
                  <th>Identificador</th>
                  <th>Status</th>
                  <th>Automático</th>
                  <th />
                </tr>
              </thead>

              <tbody>
                {channels.map((channel) => {
                  const Icon = getChannelIcon(
                    channel.type
                  );

                  return (
                    <tr key={channel.id}>
                      <td>
                        <div className="table-main">
                          <div className="channel-icon">
                            <Icon size={18} />
                          </div>

                          <div>
                            <strong>
                              {channel.name}
                            </strong>

                            <span>
                              {getChannelLabel(
                                channel.type
                              )}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className="category-badge">
                          {getChannelLabel(
                            channel.type
                          )}
                        </span>
                      </td>

                      <td>
                        <span className="muted">
                          {getCategoryName(
                            channel.category_id
                          )}
                        </span>
                      </td>

                      <td>
                        <span className="muted">
                          {channel.identifier ||
                            "Não informado"}
                        </span>
                      </td>

                      <td>
                        <button
                          type="button"
                          className={`status-badge ${
                            channel.active
                              ? "success"
                              : "muted"
                          }`}
                          onClick={() =>
                            handleToggleActive(channel)
                          }
                          title="Alterar status"
                        >
                          <span className="status-dot" />

                          {channel.active
                            ? "Ativo"
                            : "Inativo"}
                        </button>
                      </td>

                      <td>
                        <button
                          type="button"
                          className={`status-badge ${
                            channel.auto_publish
                              ? "success"
                              : "muted"
                          }`}
                          onClick={() =>
                            handleToggleAutoPublish(
                              channel
                            )
                          }
                          title="Alterar publicação automática"
                        >
                          <span className="status-dot" />

                          {channel.auto_publish
                            ? "Automático"
                            : "Manual"}
                        </button>
                      </td>

                      <td>
                        <div className="table-actions">
                          <button
                            type="button"
                            className="icon-button"
                            onClick={() =>
                              openEditForm(channel)
                            }
                            title="Editar canal"
                          >
                            <Edit3 size={16} />
                          </button>

                          <button
                            type="button"
                            className="icon-button danger"
                            onClick={() =>
                              handleDelete(channel)
                            }
                            disabled={
                              deleting === channel.id
                            }
                            title="Excluir canal"
                          >
                            <Trash2
                              size={16}
                              className={
                                deleting === channel.id
                                  ? "spin"
                                  : ""
                              }
                            />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}