import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { supabase } from "../lib/supabase";

type PreviewRow = {
  product_id: string;
  title: string;
  marketplace_category: string | null;
  current_category_id: string | null;
  current_category: string | null;
  commercial_category_source: "manual" | "automatic" | null;
  suggested_category_id: string | null;
  suggested_category: string | null;
  classification_reason: string;
  confidence: number;
  active: boolean;
};

const reasonLabels: Record<string, string> = {
  manual_override_preserved: "Classificação manual preservada",
  marketplace_category_mapping: "Categoria original do marketplace",
  marketplace_category_id_mapping: "ID de categoria do marketplace",
  title_keyword_fallback: "Correspondência pelo título",
  no_confident_match: "Sem correspondência confiável",
};

export function ClassificacaoCategorias() {
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "changes" | "manual" | "unmatched">("changes");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const all: PreviewRow[] = [];
      for (let from = 0; ; from += 1000) {
        const result = await supabase
          .from("product_category_classification_preview")
          .select("product_id,title,marketplace_category,current_category_id,current_category,commercial_category_source,suggested_category_id,suggested_category,classification_reason,confidence,active")
          .order("title", { ascending: true })
          .range(from, from + 999);
        if (result.error) throw result.error;
        all.push(...((result.data || []) as PreviewRow[]));
        if (!result.data || result.data.length < 1000) break;
      }
      setRows(all);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar a prévia.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const stats = useMemo(() => ({
    total: rows.length,
    changes: rows.filter(row => row.commercial_category_source !== "manual" && row.current_category_id !== row.suggested_category_id).length,
    manual: rows.filter(row => row.commercial_category_source === "manual").length,
    unmatched: rows.filter(row => !row.suggested_category_id && row.commercial_category_source !== "manual").length,
  }), [rows]);

  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return rows.filter(row => {
      if (filter === "changes" && (row.commercial_category_source === "manual" || row.current_category_id === row.suggested_category_id)) return false;
      if (filter === "manual" && row.commercial_category_source !== "manual") return false;
      if (filter === "unmatched" && (row.suggested_category_id || row.commercial_category_source === "manual")) return false;
      if (!term) return true;
      return [row.title, row.marketplace_category, row.current_category, row.suggested_category]
        .filter(Boolean).join(" ").toLocaleLowerCase("pt-BR").includes(term);
    });
  }, [rows, search, filter]);

  return (
    <div className="page ops-page category-preview-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">INTELIGÊNCIA DE PRODUTOS</p>
          <h1>Prévia de classificação</h1>
          <p className="page-description">Compare a categoria atual com a sugestão automática antes de qualquer correção.</p>
        </div>
        <button className="button secondary" type="button" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={15} className={loading ? "spin" : ""} /> Atualizar prévia
        </button>
      </div>

      <div className="category-preview-notice">
        <ShieldCheck size={18} />
        <div><strong>Modo somente leitura</strong><span>Esta tela não altera produtos, regras, ofertas ou classificações manuais.</span></div>
      </div>

      {error && <div className="settings-alert">{error}</div>}

      <div className="category-preview-stats">
        <div className="panel"><span>Produtos analisados</span><strong>{stats.total.toLocaleString("pt-BR")}</strong></div>
        <div className="panel"><span>Divergências sugeridas</span><strong>{stats.changes.toLocaleString("pt-BR")}</strong></div>
        <div className="panel"><span>Classificações manuais protegidas</span><strong>{stats.manual.toLocaleString("pt-BR")}</strong></div>
        <div className="panel"><span>Sem correspondência</span><strong>{stats.unmatched.toLocaleString("pt-BR")}</strong></div>
      </div>

      <section className="panel category-preview-panel">
        <div className="category-preview-toolbar">
          <label className="category-preview-search"><Search size={16}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar produto ou categoria..." /></label>
          <select value={filter} onChange={event => setFilter(event.target.value as typeof filter)} aria-label="Filtrar classificação">
            <option value="changes">Somente divergências</option>
            <option value="all">Todos os produtos</option>
            <option value="manual">Classificações manuais</option>
            <option value="unmatched">Sem correspondência</option>
          </select>
        </div>

        {loading ? <div className="settings-empty"><RefreshCw size={20} className="spin"/>Carregando classificação...</div> :
          visible.length === 0 ? <div className="settings-empty"><CheckCircle2 size={20}/><strong>Nenhum produto encontrado</strong><span>Altere o filtro ou a busca para consultar outros registros.</span></div> :
          <div className="category-preview-table-wrap">
            <table className="category-preview-table">
              <thead><tr><th>Produto</th><th>Categoria original</th><th>Categoria atual</th><th>Sugestão</th><th>Motivo</th><th>Confiança</th></tr></thead>
              <tbody>{visible.map(row => {
                const changed = row.commercial_category_source !== "manual" && row.current_category_id !== row.suggested_category_id;
                return <tr key={row.product_id}>
                  <td><strong>{row.title}</strong><small>{row.active ? "Ativo" : "Inativo"} · {row.product_id.slice(0, 8)}</small></td>
                  <td>{row.marketplace_category || "—"}</td>
                  <td>{row.current_category || "Sem categoria"}</td>
                  <td><span className={changed ? "category-preview-suggestion changed" : "category-preview-suggestion"}>{row.suggested_category || "Sem sugestão"}</span></td>
                  <td>{reasonLabels[row.classification_reason] || row.classification_reason}</td>
                  <td><span className={row.confidence >= 0.9 ? "confidence high" : row.confidence >= 0.7 ? "confidence medium" : "confidence low"}>{Math.round(Number(row.confidence) * 100)}%</span></td>
                </tr>;
              })}</tbody>
            </table>
          </div>}
        <div className="category-preview-footer">{visible.length.toLocaleString("pt-BR")} de {rows.length.toLocaleString("pt-BR")} produtos exibidos. Nenhuma sugestão é aplicada automaticamente por esta tela.</div>
      </section>
    </div>
  );
}
