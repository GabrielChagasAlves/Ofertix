import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, ExternalLink, Package, RefreshCw, Search, ShieldCheck, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { EmptyState, formatCurrency, formatDate, PageIntro, StatusPill } from "../components/OperationsUI";
import "./ProdutosDuplicados.css";

type Product = {
  id: string;
  marketplace_id: string;
  external_id?: string | null;
  title: string;
  price: number | null;
  image_url: string | null;
  product_url: string | null;
  affiliate_url: string | null;
  active: boolean;
  created_at: string;
};
type Marketplace = { id: string; name: string; slug: string };
type Props = {
  products: Product[];
  marketplaces: Marketplace[];
  canDelete: boolean;
  onBack: () => void;
  onRefresh: () => Promise<void>;
};
type DuplicateGroup = { key: string; title: string; marketplaceId: string; items: Product[] };
type ReferenceCounts = {
  productsWithAffiliateLink: number;
  productsWithPublication: number;
  blockedProductIds: string[];
};
type ReviewState = { groups: DuplicateGroup[]; keepIds: string[]; removeIds: string[]; references: ReferenceCounts; bulk: boolean };

function normalizeTitle(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function describeError(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "string" && error.trim()) return error;

  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    const parts = [
      typeof value.message === "string" ? value.message : null,
      typeof value.details === "string" ? value.details : null,
      typeof value.hint === "string" ? `Dica: ${value.hint}` : null,
      typeof value.code === "string" ? `Código: ${value.code}` : null,
      typeof value.status === "number" || typeof value.status === "string"
        ? `HTTP: ${value.status}` : null,
    ].filter((part): part is string => Boolean(part));
    if (parts.length) return parts.join(" · ");

    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== "{}") return serialized.slice(0, 1000);
    } catch {
      // Usa a mensagem alternativa para objetos não serializáveis.
    }
  }

  return fallback;
}

async function inspectReferences(productIds: string[]): Promise<ReferenceCounts> {
  // Evita URLs muito extensas no filtro .in() e limita a quantidade de
  // requisições simultâneas durante a análise de grandes catálogos.
  const chunkSize = 100;
  const chunks: string[][] = [];
  for (let index = 0; index < productIds.length; index += chunkSize) {
    chunks.push(productIds.slice(index, index + chunkSize));
  }

  const productsRows: { id: string; affiliate_url: string | null }[] = [];
  const affiliateLinksRows: { product_id: string; affiliate_url: string | null }[] = [];
  const offersRows: { id: string; product_id: string; affiliate_url: string | null; published_at: string | null }[] = [];

  for (const ids of chunks) {
    const [productsResult, affiliateLinksResult, offersResult] = await Promise.all([
      supabase.from("products").select("id, affiliate_url").in("id", ids),
      supabase.from("affiliate_links").select("product_id, affiliate_url").in("product_id", ids),
      supabase.from("offers").select("id, product_id, affiliate_url, published_at").in("product_id", ids),
    ]);

    if (productsResult.error) throw new Error(`Falha ao verificar links dos produtos: ${productsResult.error.message}`);
    if (affiliateLinksResult.error) throw new Error(`Falha ao verificar links de afiliado: ${affiliateLinksResult.error.message}`);
    if (offersResult.error) throw new Error(`Falha ao verificar ofertas: ${offersResult.error.message}`);

    productsRows.push(...(productsResult.data ?? []));
    affiliateLinksRows.push(...(affiliateLinksResult.data ?? []));
    offersRows.push(...(offersResult.data ?? []));
  }

  const offerIds = offersRows.map((offer) => offer.id);
  const offerChunks: string[][] = [];
  for (let index = 0; index < offerIds.length; index += chunkSize) {
    offerChunks.push(offerIds.slice(index, index + chunkSize));
  }

  const channelPublicationsRows: { offer_id: string; status: string | null }[] = [];
  const offerPublicationsRows: { offer_id: string; sent_at: string | null }[] = [];

  for (const ids of offerChunks) {
    const [channelPublicationsResult, offerPublicationsResult] = await Promise.all([
      supabase.from("channel_publications").select("offer_id, status").in("offer_id", ids),
      supabase.from("offer_publications").select("offer_id, sent_at").in("offer_id", ids),
    ]);

    if (channelPublicationsResult.error) throw new Error(`Falha ao verificar publicações nos canais: ${channelPublicationsResult.error.message}`);
    if (offerPublicationsResult.error) throw new Error(`Falha ao verificar publicações de ofertas: ${offerPublicationsResult.error.message}`);

    channelPublicationsRows.push(...(channelPublicationsResult.data ?? []));
    offerPublicationsRows.push(...(offerPublicationsResult.data ?? []));
  }

  const productsWithAffiliateLink = new Set<string>();
  productsRows.forEach((product) => {
    if (product.affiliate_url?.trim()) productsWithAffiliateLink.add(product.id);
  });
  affiliateLinksRows.forEach((link) => {
    if (link.affiliate_url?.trim()) productsWithAffiliateLink.add(link.product_id);
  });
  offersRows.forEach((offer) => {
    if (offer.affiliate_url?.trim()) productsWithAffiliateLink.add(offer.product_id);
  });

  const publishedOfferIds = new Set<string>();
  offersRows.forEach((offer) => {
    if (offer.published_at) publishedOfferIds.add(offer.id);
  });
  channelPublicationsRows.forEach((publication) => {
    if (publication.status === "published") publishedOfferIds.add(publication.offer_id);
  });
  offerPublicationsRows.forEach((publication) => {
    if (publication.sent_at) publishedOfferIds.add(publication.offer_id);
  });

  const productsWithPublication = new Set<string>();
  offersRows.forEach((offer) => {
    if (publishedOfferIds.has(offer.id)) productsWithPublication.add(offer.product_id);
  });

  // Basta um dos critérios para proteger o produto: link de afiliado OU publicação.
  const blockedProductIds = productIds.filter((id) =>
    productsWithAffiliateLink.has(id) || productsWithPublication.has(id)
  );

  return {
    productsWithAffiliateLink: productsWithAffiliateLink.size,
    productsWithPublication: productsWithPublication.size,
    blockedProductIds,
  };
}

export function ProdutosDuplicados({ products, marketplaces, canDelete, onBack, onRefresh }: Props) {
  const [search, setSearch] = useState("");
  const [marketplaceFilter, setMarketplaceFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [keepByGroup, setKeepByGroup] = useState<Record<string, string>>({});
  const [removeByGroup, setRemoveByGroup] = useState<Record<string, string[]>>({});
  const [review, setReview] = useState<ReviewState | null>(null);
  const [loadingReview, setLoadingReview] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const pageSize = 12;

  const marketplaceById = useMemo(() => new Map(marketplaces.map((item) => [item.id, item])), [marketplaces]);
  const groups = useMemo(() => {
    const grouped = new Map<string, DuplicateGroup>();
    products.forEach((product) => {
      const normalized = normalizeTitle(product.title || "");
      if (!normalized) return;
      const key = `${product.marketplace_id}::${normalized}`;
      const current = grouped.get(key);
      if (current) current.items.push(product);
      else grouped.set(key, { key, title: product.title, marketplaceId: product.marketplace_id, items: [product] });
    });
    const duplicateGroups = [...grouped.values()].filter((group) => group.items.length > 1);
    duplicateGroups.forEach((group) => {
      // Mantém cada conjunto isolado por título + marketplace e ordena seus anúncios
      // do menor preço para o maior; preços ausentes ficam no final.
      group.items.sort((a, b) => (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY)
        || a.created_at.localeCompare(b.created_at));
    });
    return duplicateGroups.sort((a, b) => {
      const minA = a.items[0]?.price ?? Number.POSITIVE_INFINITY;
      const minB = b.items[0]?.price ?? Number.POSITIVE_INFINITY;
      return minA - minB || b.items.length - a.items.length || a.title.localeCompare(b.title, "pt-BR");
    });
  }, [products]);

  const filteredGroups = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return groups.filter((group) => {
      const marketplaceName = marketplaceById.get(group.marketplaceId)?.name ?? "";
      return (marketplaceFilter === "all" || group.marketplaceId === marketplaceFilter)
        && (!term || group.title.toLocaleLowerCase("pt-BR").includes(term)
          || marketplaceName.toLocaleLowerCase("pt-BR").includes(term)
          || group.items.some((item) => (item.external_id || "").toLowerCase().includes(term)));
    });
  }, [groups, marketplaceById, marketplaceFilter, search]);

  const pageCount = Math.max(1, Math.ceil(filteredGroups.length / pageSize));
  const visibleGroups = filteredGroups.slice((page - 1) * pageSize, page * pageSize);
  const selectedCount = Object.values(removeByGroup).reduce((sum, ids) => sum + ids.length, 0);

  function toggleRemoval(groupKey: string, productId: string, checked: boolean) {
    setRemoveByGroup((current) => {
      const next = new Set(current[groupKey] ?? []);
      if (checked) next.add(productId); else next.delete(productId);
      return { ...current, [groupKey]: [...next] };
    });
  }

  function chooseKeep(groupKey: string, productId: string) {
    setKeepByGroup((current) => ({ ...current, [groupKey]: productId }));
    setRemoveByGroup((current) => ({ ...current, [groupKey]: (current[groupKey] ?? []).filter((id) => id !== productId) }));
  }

  function chooseCheapest(group: DuplicateGroup) {
    const cheapest = group.items.find((item) => item.price != null);
    if (cheapest) chooseKeep(group.key, cheapest.id);
  }

  function toggleAllInGroup(group: DuplicateGroup) {
    const keepId = keepByGroup[group.key];
    if (!keepId) return;
    const removableIds = group.items.filter((item) => item.id !== keepId).map((item) => item.id);
    const currentSelected = removeByGroup[group.key] ?? [];
    const allSelected = removableIds.length > 0 && removableIds.every((id) => currentSelected.includes(id));
    setRemoveByGroup((current) => ({
      ...current,
      [group.key]: allSelected ? [] : removableIds,
    }));
  }

  async function prepareBulkReview() {
    if (!canDelete || !groups.length) return;
    setError("");
    setMessage("");
    setLoadingReview(true);
    try {
      const allIds = groups.flatMap((group) => group.items.map((item) => item.id));
      const references = await inspectReferences(allIds);
      const protectedIds = new Set(references.blockedProductIds);
      const keepIds = new Set<string>();
      // Opção B: manter sempre o menor preço de cada grupo e todos os produtos
      // com link de afiliado ou publicação realizada. Os demais sem link são elegíveis.
      groups.forEach((group) => {
        const cheapest = group.items.find((item) => item.price != null) ?? group.items[0];
        if (cheapest) keepIds.add(cheapest.id);
      });
      references.blockedProductIds.forEach((id) => keepIds.add(id));
      const removeIds = allIds.filter((id) => !keepIds.has(id) && !protectedIds.has(id));
      const nextRemoveByGroup: Record<string, string[]> = {};
      groups.forEach((group) => {
        nextRemoveByGroup[group.key] = group.items
          .filter((item) => removeIds.includes(item.id))
          .map((item) => item.id);
      });
      setRemoveByGroup(nextRemoveByGroup);
      if (!removeIds.length) {
        setMessage("Nenhum produto elegível para exclusão. Os menores preços e todos os produtos com link de afiliado ou publicação foram preservados.");
        return;
      }
      setReview({ groups, keepIds: [...keepIds], removeIds, references, bulk: true });
    } catch (inspectionError) {
      setError(inspectionError instanceof Error ? inspectionError.message : "Não foi possível verificar os vínculos dos produtos.");
    } finally {
      setLoadingReview(false);
    }
  }

  async function prepareReview(group: DuplicateGroup) {
    const keepId = keepByGroup[group.key];
    const removeIds = (removeByGroup[group.key] ?? []).filter((id) => id !== keepId);
    if (!keepId || !removeIds.length) return;
    setError("");
    setMessage("");
    setLoadingReview(true);
    try {
      const references = await inspectReferences(removeIds);
      const protectedIds = new Set(references.blockedProductIds);
      const eligibleIds = removeIds.filter((id) => !protectedIds.has(id));
      // Itens protegidos saem da seleção, mas não impedem a exclusão dos demais.
      setRemoveByGroup((current) => ({ ...current, [group.key]: eligibleIds }));
      setReview({ groups: [group], keepIds: [keepId], removeIds: eligibleIds, references, bulk: false });
    } catch (inspectionError) {
      setError(inspectionError instanceof Error ? inspectionError.message : "Não foi possível verificar os vínculos.");
    } finally {
      setLoadingReview(false);
    }
  }

  async function confirmDeletion() {
    if (!review) return;
    setDeleting(true);
    setError("");
    setMessage("");
    try {
      // Revalida imediatamente antes da exclusão para reduzir o risco de apagar
      // um produto que recebeu novos vínculos depois da revisão inicial.
      const latestReferences = await inspectReferences(review.removeIds);
      const protectedIds = new Set(latestReferences.blockedProductIds);
      const eligibleIds = review.removeIds.filter((id) => !protectedIds.has(id));
      if (eligibleIds.length === 0) {
        setRemoveByGroup((current) => {
          const next = { ...current };
          review.groups.forEach((group) => { next[group.key] = []; });
          return next;
        });
        setReview(null);
        setMessage("Nenhum item foi excluído: todos os selecionados possuem link de afiliado ou publicação e foram preservados.");
        return;
      }
      const { data, error: deleteError } = await supabase.from("products")
        .delete().in("id", eligibleIds).select("id");
      if (deleteError) throw deleteError;
      const deletedCount = data?.length ?? 0;
      if (deletedCount !== eligibleIds.length) {
        throw new Error(`O banco confirmou ${deletedCount} exclusões de ${eligibleIds.length} elegíveis. Confira as permissões e atualize a tela antes de tentar novamente.`);
      }
      setRemoveByGroup((current) => {
        const next = { ...current };
        review.groups.forEach((group) => { next[group.key] = []; });
        return next;
      });
      setKeepByGroup((current) => {
        const next = { ...current };
        review.groups.forEach((group) => { delete next[group.key]; });
        return next;
      });
      setReview(null);
      const protectedCount = review.references.blockedProductIds.length + latestReferences.blockedProductIds.length;
      setMessage(`${deletedCount} produto(s) removido(s) em lote. ${protectedCount ? `${protectedCount} produto(s) protegido(s) foram mantidos.` : ""} Os menores preços e os produtos com link de afiliado/publicação foram preservados.`);
      // A exclusão já foi confirmada pelo banco. Uma falha ao recarregar o
      // catálogo não deve ser apresentada como se a exclusão tivesse falhado.
      try {
        await onRefresh();
      } catch (refreshError) {
        const detail = describeError(refreshError, "Erro desconhecido ao atualizar o catálogo.");
        setError(`A exclusão foi concluída (${deletedCount} produto(s)), mas não foi possível atualizar a lista: ${detail} Atualize a página para conferir o catálogo.`);
      }
    } catch (deleteError) {
      const detail = describeError(deleteError, "O Supabase não retornou detalhes do erro.");
      setError(`Não foi possível concluir a exclusão dos produtos selecionados: ${detail}`);
    } finally {
      setDeleting(false);
    }
  }

  return <div className="page ops-page duplicate-manager">
    <PageIntro
      eyebrow="MANUTENÇÃO DO CATÁLOGO"
      title="Gerenciamento de produtos duplicados"
      description="Compare anúncios com o mesmo título dentro do mesmo marketplace, escolha qual será mantido e revise os vínculos antes de remover os demais."
      actions={<button className="ops-button ops-button-secondary" onClick={onBack}><ArrowLeft size={16} /> Voltar aos produtos</button>}
    />
    <div className="duplicate-safety-note">
      <ShieldCheck size={19} />
      <div><strong>Regra de proteção</strong><p>Produtos que tenham link de afiliado OU publicação efetivamente realizada são preservados automaticamente e retirados da seleção. A exclusão em lote continua para os demais itens elegíveis.</p></div>
    </div>
    {!canDelete && <div className="ops-alert">Seu usuário pode consultar os duplicados, mas não possui a permissão <strong>Excluir produtos duplicados</strong>. Solicite essa ação ao administrador.</div>}
    {error && <div className="ops-alert">{error}</div>}
    {message && <div className="duplicate-success"><CheckCircle2 size={17} />{message}</div>}
    <section className="ops-metrics duplicate-metrics">
      <div className="ops-metric"><span>Grupos encontrados</span><strong>{groups.length.toLocaleString("pt-BR")}</strong><small>Títulos repetidos por marketplace</small></div>
      <div className="ops-metric"><span>Produtos nesses grupos</span><strong>{groups.reduce((sum, group) => sum + group.items.length, 0).toLocaleString("pt-BR")}</strong><small>Anúncios para comparar</small></div>
      <div className="ops-metric"><span>Exclusões selecionadas</span><strong>{selectedCount.toLocaleString("pt-BR")}</strong><small>Seleções ainda não executadas</small></div>
    </section>
    <section className="ops-surface duplicate-list-surface">
      <div className="ops-toolbar duplicate-toolbar">
        <label className="ops-search"><Search size={17} /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar título ou código MLB" /></label>
        <label className="ops-select"><select value={marketplaceFilter} onChange={(event) => { setMarketplaceFilter(event.target.value); setPage(1); }}><option value="all">Todos os marketplaces</option>{marketplaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <button className="ops-button ops-button-secondary" onClick={() => void onRefresh()}><RefreshCw size={15} /> Atualizar catálogo</button>
        <button className="ops-button ops-button-primary" disabled={!canDelete || !groups.length || loadingReview || deleting} onClick={() => void prepareBulkReview()}>
          <Trash2 size={15} /> {loadingReview ? "Analisando todos os grupos…" : "Selecionar todos os duplicados"}
        </button>
      </div>
      {visibleGroups.length === 0 ? <EmptyState title="Nenhum grupo duplicado encontrado" detail="Tente outro termo ou marketplace. A comparação considera títulos normalizados e mantém os marketplaces separados." /> :
        <div className="duplicate-groups">
          {visibleGroups.map((group) => {
            const keepId = keepByGroup[group.key] ?? "";
            const selectedIds = removeByGroup[group.key] ?? [];
            const marketplaceName = marketplaceById.get(group.marketplaceId)?.name ?? "Marketplace";
            return <article className="duplicate-group" key={group.key}>
              <header className="duplicate-group-header">
                <div><span className="duplicate-marketplace">{marketplaceName}</span><h2>{group.title}</h2><small>{group.items.length} anúncios com título igual</small></div>
                <StatusPill tone="warning">{group.items.length - 1} possíveis duplicados</StatusPill>
              </header>
              <div className="duplicate-product-list">
                {group.items.map((product, productIndex) => {
                  const isKeep = keepId === product.id;
                  const isSelected = selectedIds.includes(product.id);
                  return <div className={`duplicate-product-row ${isKeep ? "is-keep" : ""} ${isSelected ? "is-selected" : ""}`} key={product.id}>
                    <div className="duplicate-product-image">{product.image_url ? <img src={product.image_url} alt="" /> : <Package size={22} />}</div>
                    <div className="duplicate-product-info">
                      <strong>{product.title}</strong>
                      <span>{product.external_id || "Código externo não informado"} · {product.active ? "Ativo" : "Inativo"} · Incluído em {formatDate(product.created_at)}</span>
                      <div className="duplicate-product-meta">
                        <b>{formatCurrency(product.price)}</b>
                        {productIndex === 0 && product.price != null && <StatusPill tone="success">Menor preço do grupo</StatusPill>}{product.affiliate_url ? <StatusPill tone="success">Com link de afiliado</StatusPill> : <StatusPill>Sem link de afiliado</StatusPill>}
                        {product.product_url && <a href={product.product_url} target="_blank" rel="noreferrer">Abrir anúncio <ExternalLink size={12} /></a>}
                      </div>
                    </div>
                    <div className="duplicate-product-controls">
                      <label className="duplicate-keep-control"><input type="radio" name={`keep-${group.key}`} checked={isKeep} onChange={() => chooseKeep(group.key, product.id)} /><span>Manter este</span></label>
                      <label className="duplicate-remove-control"><input type="checkbox" checked={isSelected} disabled={isKeep} onChange={(event) => toggleRemoval(group.key, product.id, event.target.checked)} /><span>Remover</span></label>
                    </div>
                  </div>;
                })}
              </div>
              <footer className="duplicate-group-footer">
                <span>{keepId ? "Anúncio principal escolhido" : "Escolha qual anúncio será preservado"}{selectedIds.length ? ` · ${selectedIds.length} selecionado(s) para remoção` : ""}</span>
                <div className="duplicate-group-actions">
                  <button
                    className="ops-button ops-button-secondary"
                    disabled={!canDelete || !keepId}
                    onClick={() => toggleAllInGroup(group)}
                  >
                    {keepId && group.items.filter((item) => item.id !== keepId).every((item) => selectedIds.includes(item.id))
                      ? "Desmarcar todos"
                      : "Selecionar todos"}
                  </button>
                  <button className="ops-button ops-button-secondary" disabled={!canDelete || !group.items.some((item) => item.price != null)} onClick={() => chooseCheapest(group)}>Manter menor preço</button>
                  <button className="ops-button ops-button-primary" disabled={!canDelete || !keepId || !selectedIds.length || loadingReview} onClick={() => void prepareReview(group)}>
                    <Trash2 size={15} /> {loadingReview ? "Verificando vínculos…" : "Revisar remoção"}
                  </button>
                </div>
              </footer>
            </article>;
          })}
        </div>}
      {filteredGroups.length > 0 && <div className="duplicate-pagination"><span>Exibindo {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredGroups.length)} de {filteredGroups.length} grupos</span><div><button className="ops-button ops-button-secondary" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</button><strong>Página {page} de {pageCount}</strong><button className="ops-button ops-button-secondary" disabled={page === pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Próxima</button></div></div>}
    </section>
    {review && <div className="duplicate-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) setReview(null); }}>
      <section className="duplicate-review-modal" role="dialog" aria-modal="true" aria-labelledby="duplicate-review-title">
        <div className="duplicate-review-heading"><div><span>CONFIRMAÇÃO DE SEGURANÇA</span><h2 id="duplicate-review-title">{review.bulk ? "Revisar limpeza em massa" : "Revisar remoção"}</h2></div><button className="ops-icon-action" onClick={() => setReview(null)} disabled={deleting} aria-label="Fechar">×</button></div>
        <p>{review.bulk
          ? <>A limpeza geral analisou <strong>{review.groups.length} grupos</strong>. Serão removidos <strong>{review.removeIds.length} produtos</strong> sem link de afiliado e sem publicação, mantendo o menor preço de cada grupo e todos os produtos protegidos.</>
          : <>Você escolheu manter <strong>{review.groups[0].items.find((item) => item.id === review.keepIds[0])?.title}</strong> e remover {review.removeIds.length} anúncio(s).</>}</p>
        <div className="duplicate-reference-list">
          <div><span>Produtos com link de afiliado</span><strong>{review.references.productsWithAffiliateLink}</strong></div>
          <div><span>Produtos com publicação realizada</span><strong>{review.references.productsWithPublication}</strong></div>
          <div><span>Produtos protegidos (link OU publicação)</span><strong>{review.references.blockedProductIds.length}</strong></div>
        </div>
        <div className="duplicate-safe"><ShieldCheck size={18} /><span>{review.references.blockedProductIds.length > 0 ? `${review.references.blockedProductIds.length} item(ns) com link de afiliado ou publicação foram retirados do lote e serão preservados. ` : "Nenhum item protegido foi encontrado. "}Os demais produtos elegíveis poderão ser excluídos em lote. Registros dependentes dos produtos removidos também podem ser excluídos conforme as regras de integridade.</span></div>
        <div className="duplicate-modal-actions"><button className="ops-button ops-button-secondary" onClick={() => setReview(null)} disabled={deleting}>Voltar</button><button className="ops-button ops-button-primary" onClick={() => void confirmDeletion()} disabled={deleting || review.removeIds.length === 0}><Trash2 size={15} />{deleting ? "Excluindo…" : review.bulk ? "Confirmar exclusão em massa" : "Confirmar exclusão"}</button></div>
      </section>
    </div>}
  </div>;
}
