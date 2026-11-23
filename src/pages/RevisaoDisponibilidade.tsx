import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, RefreshCw, CheckCircle2, XCircle, Clock3, Search, Filter, CheckSquare, Square, Users, PauseCircle, Link2Off, ShieldAlert, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "../lib/supabase";
import { PageIntro } from "../components/OperationsUI";
import "./RevisaoDisponibilidade.css";

type Product = {
  id: string; external_id: string; title: string; product_url: string | null;
  affiliate_url?: string | null; availability_error: string | null; affiliate_generation_error: string | null;
  affiliate_generation_status: string | null; availability_retry_count: number;
  updated_at: string; availability_review_status: string | null; active: boolean;
};

type FilterKey = "all" | "paused" | "seller_red" | "no_link" | "http_403" | "closed";

const PAGE_SIZE = 20;
const getReason = (product: Product) => product.affiliate_generation_error || product.availability_error || "A integração não conseguiu confirmar o resultado automaticamente.";
const matchesFilter = (product: Product, filter: FilterKey) => {
  const reason = getReason(product).toLowerCase();
  if (filter === "paused") return reason.includes("status: paused");
  if (filter === "seller_red") return reason.includes("reputation: 1_red") || reason.includes("reputation: 2_orange");
  if (filter === "no_link") return !product.affiliate_url?.trim();
  if (filter === "http_403") return reason.includes("403") || reason.includes("forbidden");
  if (filter === "closed") return reason.includes("status: closed") || reason.includes("status: under_review");
  return true;
};

export function RevisaoDisponibilidade() {
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const { data, error: requestError } = await supabase.from("products")
      .select("id,external_id,title,product_url,affiliate_url,availability_error,affiliate_generation_error,affiliate_generation_status,availability_retry_count,updated_at,availability_review_status,active")
      .eq("availability_review_required", true).order("updated_at", { ascending: false }).limit(1000);
    if (requestError) setError(requestError.message);
    setItems((data ?? []) as Product[]);
    setSelected([]);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return items.filter(product => matchesFilter(product, filter) && (!term || product.title.toLocaleLowerCase("pt-BR").includes(term) || product.external_id.toLocaleLowerCase("pt-BR").includes(term) || getReason(product).toLocaleLowerCase("pt-BR").includes(term)));
  }, [items, filter, search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const allFilteredSelected = filtered.length > 0 && filtered.every(item => selected.includes(item.id));
  const selectedProducts = items.filter(item => selected.includes(item.id));
  const bulkEligible = selectedProducts.length > 0 && selectedProducts.every(item => item.affiliate_generation_status === "manual_review");

  useEffect(() => { setPage(1); setSelected([]); }, [filter, search]);

  const toggleOne = (id: string) => setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  const selectAllFiltered = () => {
    const ids = filtered.map(item => item.id);
    setSelected(current => allFilteredSelected
      ? current.filter(id => !ids.includes(id))
      : [...new Set([...current, ...ids])]);
  };

  const resolve = async (product: Product, status: "available" | "unavailable") => {
    setBusy(product.id); setError(""); setMessage("");
    const { data: auth } = await supabase.auth.getUser();
    const now = new Date().toISOString();
    const affiliateReview = product.affiliate_generation_status === "manual_review";
    const note = affiliateReview
      ? status === "available" ? "Produto aprovado na revisão de afiliados; devolvido à fila de geração do n8n." : "Produto reprovado na revisão de afiliados; exclusão lógica do catálogo."
      : status === "available" ? "Disponibilidade confirmada manualmente por usuário." : "Indisponibilidade confirmada manualmente por usuário.";
    const update = affiliateReview
      ? status === "available"
        ? { active: true, availability_status: "available", affiliate_generation_status: "pending", affiliate_generation_error: null, availability_review_required: false, availability_review_status: "affiliate_retry_approved", availability_reviewed_at: now, availability_reviewed_by: auth.user?.id ?? null, availability_review_note: note, updated_at: now }
        : { active: false, affiliate_generation_status: "rejected", availability_review_required: false, availability_review_status: "affiliate_rejected", availability_reviewed_at: now, availability_reviewed_by: auth.user?.id ?? null, availability_review_note: note, updated_at: now }
      : { availability_status: status, availability_error: null, last_availability_check: now, availability_retry_count: 0, availability_next_retry_at: null, availability_review_required: false, availability_review_status: status === "available" ? "confirmed_available" : "confirmed_unavailable", availability_reviewed_at: now, availability_reviewed_by: auth.user?.id ?? null, availability_review_note: note, ...(status === "available" ? { last_available_at: now } : { last_unavailable_at: now }), updated_at: now };
    const { error: updateError } = await supabase.from("products").update(update).eq("id", product.id);
    if (updateError) { setError("Não foi possível salvar a decisão: " + updateError.message); setBusy(null); return; }
    let feedback = affiliateReview
      ? status === "available" ? "Produto aprovado e devolvido à fila do n8n." : "Produto reprovado e removido do catálogo operacional."
      : status === "available" ? "Produto confirmado como ativo." : "Produto confirmado como indisponível.";
    if (!affiliateReview) {
      const { error: historyError } = await supabase.from("product_availability_history").insert({ product_id: product.id, status, reason: note, checked_at: now });
      if (historyError) feedback = "Status atualizado, mas não foi possível registrar o histórico: " + historyError.message;
    }
    setMessage(feedback);
    await load(); setBusy(null);
  };

  const resolveSelected = async (status: "available" | "unavailable") => {
    if (!bulkEligible || !window.confirm(status === "available"
      ? `Aprovar ${selectedProducts.length} produtos e reenviar para a fila do n8n?`
      : `Reprovar ${selectedProducts.length} produtos e removê-los do catálogo operacional?`)) return;
    setBulkBusy(true); setError(""); setMessage("");
    const { data: auth } = await supabase.auth.getUser();
    const now = new Date().toISOString();
    const note = status === "available"
      ? "Produto aprovado em lote na revisão de afiliados; devolvido à fila de geração do n8n."
      : "Produto reprovado em lote na revisão de afiliados; exclusão lógica do catálogo.";
    const update = status === "available"
      ? { active: true, availability_status: "available", affiliate_generation_status: "pending", affiliate_generation_error: null, availability_review_required: false, availability_review_status: "affiliate_retry_approved", availability_reviewed_at: now, availability_reviewed_by: auth.user?.id ?? null, availability_review_note: note, updated_at: now }
      : { active: false, affiliate_generation_status: "rejected", availability_review_required: false, availability_review_status: "affiliate_rejected", availability_reviewed_at: now, availability_reviewed_by: auth.user?.id ?? null, availability_review_note: note, updated_at: now };
    const ids = selectedProducts.map(product => product.id);
    const { error: updateError } = await supabase.from("products").update(update).in("id", ids).eq("availability_review_required", true).eq("affiliate_generation_status", "manual_review");
    if (updateError) setError("Não foi possível concluir a ação em lote: " + updateError.message);
    else setMessage(`${ids.length} produtos ${status === "available" ? "aprovados e reenviados ao n8n" : "reprovados e removidos do catálogo"}.`);
    setBulkBusy(false);
    await load();
  };

  const filters: { key: FilterKey; label: string; icon: typeof Filter; count: number }[] = [
    { key: "all", label: "Todos", icon: Filter, count: items.length },
    { key: "paused", label: "Anúncios pausados", icon: PauseCircle, count: items.filter(item => matchesFilter(item, "paused")).length },
    { key: "seller_red", label: "Vendedor vermelho/laranja", icon: ShieldAlert, count: items.filter(item => matchesFilter(item, "seller_red")).length },
    { key: "no_link", label: "Sem link de afiliado", icon: Link2Off, count: items.filter(item => matchesFilter(item, "no_link")).length },
    { key: "http_403", label: "Erro de acesso 403", icon: AlertTriangle, count: items.filter(item => matchesFilter(item, "http_403")).length },
    { key: "closed", label: "Fechado / em análise", icon: XCircle, count: items.filter(item => matchesFilter(item, "closed")).length },
  ];

  return <div className="page ops-page availability-review-page">
    <PageIntro eyebrow="MERCADO LIVRE" title="Revisão manual" description="Encontre rapidamente os produtos com falhas, selecione resultados em diferentes páginas e resolva vários anúncios de uma só vez." actions={<button className="ops-button ops-button-secondary" onClick={() => void load()} disabled={loading || bulkBusy}><RefreshCw size={16}/> Atualizar</button>} />
    <div className="availability-review-summary">
      <div><span>Na fila</span><strong>{items.length}</strong><small>produtos aguardando decisão</small></div>
      <div><span>Anúncios pausados</span><strong>{items.filter(item => matchesFilter(item, "paused")).length}</strong><small>exigem conferência no Mercado Livre</small></div>
      <div><span>Vendedor vermelho/laranja</span><strong>{items.filter(item => matchesFilter(item, "seller_red")).length}</strong><small>reputação abaixo do mínimo</small></div>
      <div><span>Sem link de afiliado</span><strong>{items.filter(item => matchesFilter(item, "no_link")).length}</strong><small>aguardando geração</small></div>
    </div>
    <div className="availability-review-note"><AlertTriangle size={18}/><span>Decida somente após conferir o anúncio. Aprovar devolve o produto à fila do n8n; reprovar desativa o produto no catálogo operacional.</span></div>
    {error && <div className="ops-alert">{error}</div>}
    {message && <div className="ops-alert availability-review-success">{message}</div>}
    <section className="availability-review-toolbar">
      <div className="availability-review-toolbar-top">
        <div className="availability-review-search"><Search size={17}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por nome, ID ou motivo da falha..." aria-label="Buscar produtos"/></div>
        <span className="availability-review-result-count">{filtered.length} resultado(s)</span>
      </div>
      <div className="availability-review-filters" role="group" aria-label="Filtros da revisão">
        {filters.map(({ key, label, icon: Icon, count }) => <button key={key} type="button" className={`availability-review-filter ${filter === key ? "is-active" : ""}`} onClick={() => setFilter(key)}><Icon size={15}/><span>{label}</span><b>{count}</b></button>)}
      </div>
    </section>
    {loading ? <div className="ops-empty">Carregando produtos para revisão…</div> :
      items.length === 0 ? <div className="ops-surface availability-review-empty"><CheckCircle2 size={28}/><strong>Nenhum produto aguardando revisão</strong><p>Falhas específicas de produtos aparecerão aqui automaticamente.</p></div> :
      filtered.length === 0 ? <div className="ops-surface availability-review-empty"><Search size={26}/><strong>Nenhum resultado encontrado</strong><p>Altere a busca ou selecione outro filtro.</p></div> :
      <>
        <section className="availability-review-selection">
          <div className="availability-review-select-line">
            <button type="button" className="availability-review-select-all" onClick={selectAllFiltered}><span>{allFilteredSelected ? <CheckSquare size={18}/> : <Square size={18}/>}</span>{allFilteredSelected ? "Desmarcar todos os resultados" : `Selecionar todos os ${filtered.length} resultados`}</button>
            <span className="availability-review-selected-count">{selected.length} selecionado(s)</span>
          </div>
          {selected.length > 0 && <div className="availability-review-bulk">
            <div><Users size={17}/><strong>{selected.length} produto(s) selecionado(s)</strong><span>A seleção inclui todas as páginas e permanece ao navegar</span></div>
            <div className="availability-review-bulk-actions">
              <button type="button" className="ops-button ops-button-primary" disabled={bulkBusy || !bulkEligible} onClick={() => void resolveSelected("available")}><CheckCircle2 size={15}/>{bulkBusy ? "Processando..." : "Aprovar selecionados"}</button>
              <button type="button" className="ops-button ops-button-danger" disabled={bulkBusy || !bulkEligible} onClick={() => void resolveSelected("unavailable")}><XCircle size={15}/>Reprovar selecionados</button>
              <button type="button" className="availability-review-clear" disabled={bulkBusy} onClick={() => setSelected([])}>Limpar seleção</button>
            </div>
            {!bulkEligible && <small className="availability-review-bulk-warning">A ação em lote está disponível apenas para itens em revisão de link de afiliado.</small>}
          </div>}
        </section>
        <div className="availability-review-list">{visible.map(product => {
          const affiliateReview = product.affiliate_generation_status === "manual_review";
          const reason = getReason(product);
          const isPaused = reason.toLowerCase().includes("status: paused");
          const isSellerRisk = reason.toLowerCase().includes("reputation: 1_red") || reason.toLowerCase().includes("reputation: 2_orange");
          return <article className={`availability-review-card ${selected.includes(product.id) ? "is-selected" : ""}`} key={product.id}>
            <div className="availability-review-card-head">
              <label className="availability-review-checkbox"><input type="checkbox" checked={selected.includes(product.id)} onChange={() => toggleOne(product.id)}/><span className="sr-only">Selecionar {product.title}</span></label>
              <div className="availability-review-product"><span className="availability-review-id">{product.external_id}</span><h3>{product.title}</h3><small><Clock3 size={13}/> Última tentativa: {new Date(product.updated_at).toLocaleString("pt-BR")} · Tentativas: {product.availability_retry_count}</small></div>
              {product.product_url && <a href={product.product_url} target="_blank" rel="noreferrer" className="ops-button ops-button-secondary"><ExternalLink size={15}/> Abrir anúncio</a>}
            </div>
            <div className="availability-review-tags">
              {affiliateReview && <span className="availability-review-tag tag-purple">Revisão de afiliado</span>}
              {isPaused && <span className="availability-review-tag tag-amber">Anúncio pausado</span>}
              {isSellerRisk && <span className="availability-review-tag tag-red">Reputação do vendedor baixa</span>}
              {!product.affiliate_url && <span className="availability-review-tag tag-slate">Sem link de afiliado</span>}
              {reason.toLowerCase().includes("403") && <span className="availability-review-tag tag-blue">Erro 403</span>}
            </div>
            {affiliateReview && <div className="availability-review-note"><strong>Revisão de link de afiliado</strong><span>Se aprovado, o produto volta para a fila de geração. Se reprovado, será ocultado do catálogo operacional.</span></div>}
            <div className="availability-review-error"><strong>Motivo da falha</strong><p>{reason}</p></div>
            <div className="availability-review-actions"><span>Após conferir o anúncio:</span>
              <button disabled={busy===product.id || bulkBusy} onClick={() => void resolve(product,"available")} className="ops-button ops-button-primary"><CheckCircle2 size={15}/>{affiliateReview ? "Aprovar e reenviar ao n8n" : "Confirmar ativo"}</button>
              <button disabled={busy===product.id || bulkBusy} onClick={() => void resolve(product,"unavailable")} className="ops-button ops-button-danger"><XCircle size={15}/>{affiliateReview ? "Reprovar e excluir do catálogo" : "Confirmar indisponível"}</button>
            </div>
          </article>;
        })}</div>
        <div className="availability-review-pagination"><span>Mostrando {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} de {filtered.length}</span><div><button type="button" disabled={currentPage <= 1} onClick={() => setPage(value => Math.max(1, value - 1))} aria-label="Página anterior"><ChevronLeft size={17}/></button><strong>Página {currentPage} de {totalPages}</strong><button type="button" disabled={currentPage >= totalPages} onClick={() => setPage(value => Math.min(totalPages, value + 1))} aria-label="Próxima página"><ChevronRight size={17}/></button></div></div>
      </>}
  </div>;
}
