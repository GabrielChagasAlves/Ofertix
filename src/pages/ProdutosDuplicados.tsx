import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Package, RefreshCw, Search, ShieldCheck, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { EmptyState, formatCurrency, PageIntro, StatusPill } from "../components/OperationsUI";
import "./ProdutosDuplicados.css";

type Product = { id: string; title: string; price: number | null; image_url: string | null; product_url: string | null; external_id: string | null; created_at: string; approved: boolean };
type DuplicateGroup = { key: string; title: string; marketplace_id: string; marketplace_name: string; item_count: number; approved_count: number; cheapest_id: string | null; items: Product[] };
type Marketplace = { id: string; name: string; slug: string };
type Props = { canDelete: boolean; onBack: () => void; onRefresh: () => Promise<void> };
type GroupResponse = { groups?: DuplicateGroup[]; total_groups?: number };

function eligibleProducts(group: DuplicateGroup) {
  if (group.approved_count > 0) return group.items.filter((item) => !item.approved);
  return group.items.filter((item) => item.id !== group.cheapest_id);
}
function describeError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return "Não foi possível concluir a operação.";
}

export function ProdutosDuplicados({ canDelete, onBack, onRefresh }: Props) {
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [marketplaceFilter, setMarketplaceFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [totalGroups, setTotalGroups] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const pageSize = 20;

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: groupError } = await supabase.rpc("get_duplicate_product_groups", {
        p_search: debouncedSearch || null,
        p_marketplace_id: marketplaceFilter === "all" ? null : marketplaceFilter,
        p_page: page,
        p_page_size: pageSize,
      });
      if (groupError) throw groupError;
      const payload = data as GroupResponse | null;
      setGroups(payload?.groups ?? []);
      setTotalGroups(payload?.total_groups ?? 0);
      setSelectedIds([]);
    } catch (loadError) {
      setError(describeError(loadError));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, marketplaceFilter, page]);

  useEffect(() => {
    let active = true;
    void supabase.from("marketplaces").select("id,name,slug").order("name").then(({ data, error: marketplaceError }) => {
      if (!active) return;
      if (marketplaceError) setError(marketplaceError.message);
      else setMarketplaces((data ?? []) as Marketplace[]);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => { void loadGroups(); }, [loadGroups]);
  useEffect(() => { setPage(1); }, [debouncedSearch, marketplaceFilter]);

  const marketplaceById = useMemo(() => new Map(marketplaces.map((item) => [item.id, item])), [marketplaces]);
  const pageCount = Math.max(1, Math.ceil(totalGroups / pageSize));
  const selectedCount = selectedIds.length;

  function toggleProduct(id: string, checked: boolean) {
    setSelectedIds((current) => checked ? [...new Set([...current, id])] : current.filter((item) => item !== id));
  }
  function toggleGroup(group: DuplicateGroup) {
    const eligible = eligibleProducts(group).map((item) => item.id);
    const allSelected = eligible.length > 0 && eligible.every((id) => selectedIds.includes(id));
    setSelectedIds((current) => allSelected ? current.filter((id) => !eligible.includes(id)) : [...new Set([...current, ...eligible])]);
  }
  function selectVisibleEligible() {
    const eligible = groups.flatMap((group) => eligibleProducts(group).map((item) => item.id));
    const allSelected = eligible.length > 0 && eligible.every((id) => selectedIds.includes(id));
    setSelectedIds((current) => allSelected ? current.filter((id) => !eligible.includes(id)) : [...new Set([...current, ...eligible])]);
  }

  async function confirmDeletion() {
    if (!selectedIds.length || !canDelete) return;
    setDeleting(true);
    setError("");
    setMessage("");
    const totals = { deleted: 0, protected: 0, kept: 0, missing: 0 };
    try {
      for (let index = 0; index < selectedIds.length; index += 100) {
        const chunk = selectedIds.slice(index, index + 100);
        const { data, error: rpcError } = await supabase.rpc("delete_duplicate_products_batch", { p_candidate_ids: chunk });
        if (rpcError) throw rpcError;
        const result = data as { deleted_ids?: string[]; protected_ids?: string[]; kept_ids?: string[]; missing_ids?: string[] } | null;
        totals.deleted += result?.deleted_ids?.length ?? 0;
        totals.protected += result?.protected_ids?.length ?? 0;
        totals.kept += result?.kept_ids?.length ?? 0;
        totals.missing += result?.missing_ids?.length ?? 0;
      }
      setReviewOpen(false);
      setSelectedIds([]);
      setMessage(totals.deleted + " produto(s) excluído(s). " + totals.protected + " aprovado(s) preservado(s), " + totals.kept + " menor(es) preço(s) mantido(s) e " + totals.missing + " já ausente(s).");
      await loadGroups();
      void onRefresh().catch((refreshError) => setError("Exclusão concluída, mas a lista de produtos não foi atualizada: " + describeError(refreshError)));
    } catch (deleteError) {
      setError(describeError(deleteError));
    } finally {
      setDeleting(false);
    }
  }

  return <div className="page ops-page duplicate-manager">
    <PageIntro eyebrow="MANUTENÇÃO DO CATÁLOGO" title="Produtos duplicados" description="Grupos carregados diretamente do banco, sem aguardar o catálogo completo. A aprovação de publicação define quais itens podem ser removidos." actions={<button className="ops-button ops-button-secondary" onClick={onBack}><ArrowLeft size={16} /> Voltar aos produtos</button>} />
    <section className="ops-metrics duplicate-metrics">
      <article className="ops-metric"><span className="ops-metric-icon"><Package size={19} /></span><strong>{loading ? "…" : totalGroups}</strong><span>Grupos duplicados</span><small>Resultado da busca atual</small></article>
      <article className="ops-metric"><span className="ops-metric-icon"><ShieldCheck size={19} /></span><strong>{groups.reduce((sum, group) => sum + group.approved_count, 0)}</strong><span>Itens aprovados nesta página</span><small>Protegidos contra exclusão</small></article>
      <article className="ops-metric"><span className="ops-metric-icon"><Trash2 size={19} /></span><strong>{selectedCount}</strong><span>Itens selecionados</span><small>Somente itens elegíveis</small></article>
    </section>
    <section className="ops-surface duplicate-list-surface">
      <div className="ops-toolbar duplicate-toolbar">
        <label className="ops-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar pelo título do produto" /></label>
        <label className="ops-select"><span>Marketplace</span><select value={marketplaceFilter} onChange={(event) => setMarketplaceFilter(event.target.value)}><option value="all">Todos os marketplaces</option>{marketplaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <button className="ops-button ops-button-secondary" onClick={() => void loadGroups()} disabled={loading}><RefreshCw size={16} /> Atualizar</button>
      </div>
      <div className="duplicate-rules"><ShieldCheck size={18} /><div><strong>Regras automáticas de exclusão</strong><p>Itens com aprovação de publicação nunca são excluídos. Se o grupo não tiver nenhum item aprovado, o sistema mantém somente o produto de menor preço. Links de afiliado não bloqueiam a exclusão.</p></div></div>
      {error && <div className="ops-alert">{error}</div>}
      {message && <div className="duplicate-feedback"><CheckCircle2 size={17} />{message}</div>}
      <div className="duplicate-bulk-actions">
        <button className="ops-button ops-button-secondary" onClick={selectVisibleEligible} disabled={loading || !groups.length}>Selecionar elegíveis desta página</button>
        <button className="ops-button ops-button-danger" onClick={() => setReviewOpen(true)} disabled={!canDelete || !selectedCount || deleting}><Trash2 size={16} /> Excluir selecionados ({selectedCount})</button>
      </div>
      {loading ? <div className="ops-empty"><p>Carregando grupos de duplicidade…</p></div> : groups.length === 0 ? <EmptyState title="Nenhum grupo duplicado encontrado" detail="Tente outro termo de busca ou selecione todos os marketplaces." /> :
        <div className="duplicate-groups">{groups.map((group) => {
          const eligible = eligibleProducts(group);
          const eligibleIds = eligible.map((item) => item.id);
          const allSelected = eligibleIds.length > 0 && eligibleIds.every((id) => selectedIds.includes(id));
          const source = marketplaceById.get(group.marketplace_id);
          return <article className="duplicate-group" key={group.key}>
            <header className="duplicate-group-header">
              <div><div className="duplicate-group-tags"><StatusPill>{source?.name ?? group.marketplace_name ?? "Marketplace"}</StatusPill><StatusPill tone="warning">{group.item_count} itens</StatusPill>{group.approved_count > 0 && <StatusPill tone="success">{group.approved_count} aprovado(s)</StatusPill>}</div><h2>{group.title}</h2></div>
              <button className="ops-button ops-button-secondary" onClick={() => toggleGroup(group)} disabled={!canDelete || !eligible.length}>{allSelected ? "Desmarcar elegíveis" : "Selecionar elegíveis"}</button>
            </header>
            <div className="duplicate-product-list">{group.items.map((item) => {
              const protectedItem = item.approved || (group.approved_count === 0 && item.id === group.cheapest_id);
              const isSelected = selectedIds.includes(item.id);
              return <div className={"duplicate-product-row" + (protectedItem ? " is-protected" : "") + (isSelected ? " is-selected" : "")} key={item.id}>
                <div className="duplicate-product-image">{item.image_url ? <img src={item.image_url} alt="" loading="lazy" /> : <Package size={21} />}</div>
                <div className="duplicate-product-info"><strong>{item.title}</strong><div className="duplicate-product-meta"><b>{formatCurrency(item.price)}</b>{item.external_id && <span>ID: {item.external_id}</span>}{item.product_url && <a href={item.product_url} target="_blank" rel="noreferrer">Abrir anúncio</a>}</div></div>
                <div className="duplicate-product-controls">{protectedItem
                  ? <StatusPill tone="success">{item.approved ? "Aprovado — protegido" : "Menor preço — manter"}</StatusPill>
                  : <label><input type="checkbox" checked={isSelected} onChange={(event) => toggleProduct(item.id, event.target.checked)} disabled={!canDelete} /> Excluir item</label>}</div>
              </div>;
            })}</div>
            <footer className="duplicate-group-footer"><span>{eligible.length} item(ns) elegível(is) para exclusão neste grupo</span><span>{group.approved_count > 0 ? "Aprovados preservados" : "Menor preço preservado"}</span></footer>
          </article>;
        })}</div>
      }
      <div className="duplicate-pagination"><span>Mostrando {groups.length} de {totalGroups} grupos</span><div><button className="ops-button ops-button-secondary" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={loading || page <= 1}><ChevronLeft size={16} /> Anterior</button><strong>Página {page} de {pageCount}</strong><button className="ops-button ops-button-secondary" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={loading || page >= pageCount}>Próxima <ChevronRight size={16} /></button></div></div>
    </section>
    {reviewOpen && <div className="duplicate-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) setReviewOpen(false); }}>
      <section className="duplicate-review-modal" role="dialog" aria-modal="true" aria-labelledby="duplicate-review-title">
        <div className="duplicate-review-heading"><div><span>CONFIRMAÇÃO DE EXCLUSÃO</span><h2 id="duplicate-review-title">Excluir {selectedCount} produto(s)?</h2></div><StatusPill tone="warning">Ação irreversível</StatusPill></div>
        <p>O banco vai revalidar a aprovação de publicação e a regra do menor preço no momento da exclusão. Itens aprovados e o menor preço de grupos sem aprovação serão preservados mesmo que tenham sido selecionados por engano.</p>
        <div className="duplicate-modal-actions"><button className="ops-button ops-button-secondary" onClick={() => setReviewOpen(false)} disabled={deleting}>Cancelar</button><button className="ops-button ops-button-danger" onClick={() => void confirmDeletion()} disabled={deleting}>{deleting ? "Excluindo…" : "Confirmar exclusão"}</button></div>
      </section>
    </div>}
  </div>;
}
