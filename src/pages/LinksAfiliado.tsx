import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowUpDown,
  Check,
  CheckCircle2,
  CheckSquare,
  Clock3,
  ExternalLink,
  Grid2X2,
  Heart,
  Link2,
  List,
  Package,
  Search,
  ShoppingBag,
  Square,
  Tags,
  X,
} from "lucide-react";

import { supabase } from "../lib/supabase";

type Marketplace = { id: string; name: string; slug: string };
type AvailabilityStatus = "unknown" | "checking" | "available" | "unavailable" | "error";

type Product = {
  id: string;
  marketplace_id: string;
  external_id: string;
  title: string;
  price: number | null;
  original_price: number | null;
  discount_percent: number | null;
  image_url: string | null;
  product_url: string | null;
  affiliate_url: string | null;
  active: boolean;
  availability_status: AvailabilityStatus | null;
  last_availability_check: string | null;
  availability_error: string | null;
  marketplaces: Marketplace | Marketplace[] | null;
};

type AffiliateLink = {
  id: string;
  product_id: string;
  marketplace_id: string;
  affiliate_url: string;
  affiliate_tag: string | null;
  source: string;
  status: "pending" | "ready" | "invalid";
  validation_message: string | null;
  created_at: string;
  updated_at: string;
};

type AffiliateForm = { affiliateUrl: string; affiliateTag: string };
type BrandInfo = { className: string; displayName: string };

function getBrandInfo(name: string, slug: string): BrandInfo {
  const value = `${name} ${slug}`.toLowerCase();
  if (value.includes("mercado") || value.includes("meli") || value.includes("mercadolivre")) {
    return { className: "mercado-livre", displayName: "Mercado Livre" };
  }
  if (value.includes("amazon")) return { className: "amazon", displayName: "Amazon" };
  if (value.includes("shopee")) return { className: "shopee", displayName: "Shopee" };
  if (value.includes("magalu") || value.includes("magazine")) return { className: "magalu", displayName: "Magalu" };
  return { className: "generic", displayName: name || "Marketplace" };
}

export function LinksAfiliado() {
  const [products, setProducts] = useState<Product[]>([]);
  const [affiliateLinks, setAffiliateLinks] = useState<AffiliateLink[]>([]);
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [marketplaceFilter, setMarketplaceFilter] = useState("all");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("recent");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("ofertix-affiliate-favorites") || "[]") as string[];
    } catch {
      return [];
    }
  });
  const [inlineUrls, setInlineUrls] = useState<Record<string, string>>({});
  const [savingProductId, setSavingProductId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [forms, setForms] = useState<Record<string, AffiliateForm>>({});

  async function loadData() {
    setLoading(true);
    try {
      const [
        { data: productData, error: productError },
        { data: linkData, error: linkError },
        { data: marketplaceData, error: marketplaceError },
      ] = await Promise.all([
        supabase.from("products").select(`
          id, marketplace_id, external_id, title, price, original_price,
          discount_percent, image_url, product_url, affiliate_url, active,
          availability_status, last_availability_check, availability_error,
          marketplaces (id, name, slug)
        `).eq("active", true).order("created_at", { ascending: false }),
        supabase.from("affiliate_links").select("*").order("created_at", { ascending: false }),
        supabase.from("marketplaces").select("id, name, slug").eq("active", true).order("name"),
      ]);
      if (productError) throw productError;
      if (linkError) throw linkError;
      if (marketplaceError) throw marketplaceError;
      setProducts((productData ?? []) as unknown as Product[]);
      setAffiliateLinks((linkData ?? []) as AffiliateLink[]);
      setMarketplaces((marketplaceData ?? []) as Marketplace[]);
    } catch (error) {
      console.error("Erro ao carregar links de afiliado:", error);
      alert("Não foi possível carregar os produtos. Verifique a conexão e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadData(); }, []);

  const linksByProduct = useMemo(() => {
    const map = new Map<string, AffiliateLink>();
    for (const link of affiliateLinks) {
      const current = map.get(link.product_id);
      if (!current || new Date(link.updated_at).getTime() > new Date(current.updated_at).getTime()) {
        map.set(link.product_id, link);
      }
    }
    return map;
  }, [affiliateLinks]);

  const productsWithoutAffiliateLink = useMemo(() => products.filter((product) => {
    const productUrl = product.affiliate_url?.trim();
    const linkUrl = linksByProduct.get(product.id)?.affiliate_url?.trim();
    return !productUrl && !linkUrl;
  }), [products, linksByProduct]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
    return productsWithoutAffiliateLink.filter((product) => {
      const title = (product.title || "").toLocaleLowerCase("pt-BR");
      const externalId = (product.external_id || "").toLocaleLowerCase("pt-BR");
      const matchesSearch = !normalizedSearch || title.includes(normalizedSearch) || externalId.includes(normalizedSearch);
      const matchesMarketplace = marketplaceFilter === "all" || product.marketplace_id === marketplaceFilter;
      const availability = product.availability_status || "unknown";
      const matchesAvailability = availabilityFilter === "all" || availability === availabilityFilter;
      return matchesSearch && matchesMarketplace && matchesAvailability;
    });
  }, [productsWithoutAffiliateLink, search, marketplaceFilter, availabilityFilter]);

  const displayedProducts = useMemo(() => {
    const list = filteredProducts.filter((product) => !showFavoritesOnly || favoriteIds.includes(product.id));
    return [...list].sort((a, b) => {
      if (sortOrder === "price-asc") return (a.price ?? Infinity) - (b.price ?? Infinity);
      if (sortOrder === "price-desc") return (b.price ?? -Infinity) - (a.price ?? -Infinity);
      if (sortOrder === "title") return a.title.localeCompare(b.title, "pt-BR");
      return 0;
    });
  }, [filteredProducts, showFavoritesOnly, favoriteIds, sortOrder]);

  const selectedProducts = useMemo(
    () => selectedIds.map((id) => products.find((product) => product.id === id)).filter((product): product is Product => Boolean(product)),
    [selectedIds, products],
  );

  const marketplaceStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of productsWithoutAffiliateLink) {
      counts.set(product.marketplace_id, (counts.get(product.marketplace_id) || 0) + 1);
    }
    return counts;
  }, [productsWithoutAffiliateLink]);

  function toggleFavorite(productId: string) {
    setFavoriteIds((current) => {
      const next = current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId];
      localStorage.setItem("ofertix-affiliate-favorites", JSON.stringify(next));
      return next;
    });
  }

  function formatPrice(value: number | null) {
    if (value === null || value === undefined) return "Preço não informado";
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function getMarketplace(product: Product): Marketplace | null {
    const relation = product.marketplaces;
    if (Array.isArray(relation)) return relation[0] || null;
    if (relation && typeof relation === "object") return relation as Marketplace;
    return null;
  }

  function getMarketplaceName(product: Product) {
    const marketplace = getMarketplace(product);
    if (marketplace?.name?.trim()) return getBrandInfo(marketplace.name, marketplace.slug || "").displayName;
    if ((product.external_id || "").toUpperCase().startsWith("MLB")) return "Mercado Livre";
    return "Marketplace";
  }

  function getAvailabilityStatus(product: Product) {
    switch (product.availability_status) {
      case "available": return { label: "Disponível", type: "ready", icon: CheckCircle2 };
      case "unavailable": return { label: "Indisponível", type: "invalid", icon: AlertCircle };
      case "checking": return { label: "Verificando", type: "pending", icon: Clock3 };
      case "error": return { label: "Erro na verificação", type: "invalid", icon: AlertCircle };
      default: return { label: "Não verificado", type: "without", icon: Clock3 };
    }
  }

  function toggleProduct(productId: string) {
    setSelectedIds((current) => current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]);
  }

  function toggleAllVisible() {
    const visibleIds = displayedProducts.map((product) => product.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds((current) => allSelected
      ? current.filter((id) => !visibleIds.includes(id))
      : Array.from(new Set([...current, ...visibleIds])));
  }

  function openAffiliateModal(ids: string[] = selectedIds) {
    if (!ids.length) { alert("Selecione pelo menos um produto."); return; }
    const nextForms: Record<string, AffiliateForm> = {};
    for (const id of ids) {
      const product = products.find((item) => item.id === id);
      if (!product) continue;
      const existingLink = linksByProduct.get(id);
      nextForms[id] = {
        affiliateUrl: inlineUrls[id] || existingLink?.affiliate_url || product.affiliate_url || "",
        affiliateTag: existingLink?.affiliate_tag || "",
      };
    }
    setSelectedIds(ids);
    setForms(nextForms);
    setShowModal(true);
  }

  function closeAffiliateModal() {
    if (saving) return;
    setShowModal(false);
    setForms({});
  }

  function updateForm(productId: string, field: keyof AffiliateForm, value: string) {
    setForms((current) => ({
      ...current,
      [productId]: {
        ...(current[productId] || { affiliateUrl: "", affiliateTag: "" }),
        [field]: value,
      },
    }));
  }

  async function saveInlineAffiliateLink(product: Product) {
    const url = (inlineUrls[product.id] || "").trim();
    if (!url) { alert("Cole o link de afiliado antes de salvar."); return; }
    try {
      const parsedUrl = new URL(url);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error("URL inválida");
    } catch {
      alert("Informe uma URL válida, começando com http:// ou https://.");
      return;
    }
    setSavingProductId(product.id);
    try {
      const { data, error } = await supabase.functions.invoke("affiliate-link-associate", {
        body: { product_id: product.id, affiliate_url: url, affiliate_tag: null, source: "manual" },
      });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "Não foi possível associar o link.");
      setInlineUrls((current) => {
        const next = { ...current };
        delete next[product.id];
        return next;
      });
      await loadData();
      const statusMessage = data.offer_deferred
        ? "\nA oferta foi adiada porque o produto ainda não atende aos critérios de elegibilidade."
        : data.offer_generation_failed
          ? "\nO link foi processado, mas houve uma falha operacional ao gerar a oferta."
          : data.offer_created
            ? "\nA oferta foi gerada."
            : data.duplicate_offer
              ? "\nA oferta já existia."
              : "";
      alert("Link associado com sucesso." + statusMessage);
    } catch (error) {
      console.error("Erro ao associar link pelo cartão:", error);
      alert(error instanceof Error ? error.message : "Erro ao salvar o link.");
    } finally {
      setSavingProductId(null);
    }
  }

  async function saveAffiliateLinks() {
    if (!selectedProducts.length) return;
    for (const product of selectedProducts) {
      const url = forms[product.id]?.affiliateUrl.trim();
      if (!url) { alert(`Informe o link de afiliado para:\n\n${product.title}`); return; }
      try {
        const parsedUrl = new URL(url);
        if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error("Protocolo inválido");
      } catch {
        alert(`Informe uma URL válida para:\n\n${product.title}`);
        return;
      }
    }

    setSaving(true);
    let createdOffers = 0;
    let duplicateOffers = 0;
    let deferredOffers = 0;
    let generationFailures = 0;
    let savedLinks = 0;
    const offerWarnings: string[] = [];

    try {
      for (const product of selectedProducts) {
        const form = forms[product.id];
        const { data, error } = await supabase.functions.invoke("affiliate-link-associate", {
          body: {
            product_id: product.id,
            affiliate_url: form.affiliateUrl.trim(),
            affiliate_tag: form.affiliateTag.trim() || null,
            source: "manual",
          },
        });
        if (error) throw new Error(`Falha ao processar "${product.title}": ${error.message}`);
        if (!data?.success) throw new Error(data?.error || `Não foi possível salvar o link de "${product.title}".`);
        savedLinks++;
        if (data.offer_created) createdOffers++;
        if (data.duplicate_offer) duplicateOffers++;
        if (data.offer_deferred) {
          deferredOffers++;
          offerWarnings.push(`${product.title}: oferta adiada — ${data.offer_error || "o produto ainda não atende aos critérios de elegibilidade."}`);
        } else if (data.offer_generation_failed) {
          generationFailures++;
          offerWarnings.push(`${product.title}: falha operacional na geração da oferta — ${data.offer_error || "erro não detalhado."}`);
        }
      }
      setShowModal(false);
      setForms({});
      setSelectedIds([]);
      await loadData();
      const summary = [
        "Processamento dos links concluído.", "",
        `Links salvos/processados: ${savedLinks}`,
        `Ofertas criadas: ${createdOffers}`,
        `Ofertas que já existiam: ${duplicateOffers}`,
        `Ofertas adiadas por elegibilidade: ${deferredOffers}`,
        `Falhas operacionais na geração: ${generationFailures}`,
      ];
      if (offerWarnings.length) summary.push("", "Detalhes:", ...offerWarnings);
      summary.push("", "Consulte a tela de Ofertas para acompanhar os resultados.");
      alert(summary.join("\n"));
    } catch (error) {
      console.error("Erro ao salvar links:", error);
      const message = error instanceof Error ? error.message : "Erro desconhecido.";
      await loadData();
      alert(`O processamento foi interrompido.\n\n${message}\n\nAntes de tentar novamente, confira quais links já foram salvos.`);
    } finally {
      setSaving(false);
    }
  }

  const allVisibleSelected = displayedProducts.length > 0 && displayedProducts.every((product) => selectedIds.includes(product.id));

  if (loading) {
    return (
      <section className="page affiliate-page">
        <div className="page-header"><div><h1>Links de Afiliado</h1><p>Preparando seus produtos...</p></div></div>
        <div className="affiliate-loading"><span className="affiliate-loading-spinner" />Carregando produtos integrados...</div>
      </section>
    );
  }

  return (
    <section className="page affiliate-page">
      <header className="affiliate-page-header">
        <div className="affiliate-heading">
          <div className="affiliate-heading-icon"><Link2 size={27} /></div>
          <div>
            <span className="affiliate-eyebrow">CENTRAL DE AFILIAÇÃO</span>
            <h1>Links de Afiliado</h1>
            <p>Produtos novos que precisam de um link. Salvou? Eles saem desta tela automaticamente.</p>
          </div>
        </div>
        <div className="affiliate-total-card">
          <div className="affiliate-total-icon"><Package size={24} /></div>
          <div><strong>{productsWithoutAffiliateLink.length}</strong><span>produtos aguardando link</span></div>
        </div>
      </header>

      <div className="affiliate-summary">
        <div className="affiliate-summary-card">
          <span className="affiliate-summary-icon purple"><ShoppingBag size={20} /></span>
          <div><span>Produtos na fila</span><strong>{productsWithoutAffiliateLink.length}</strong></div>
        </div>
        <div className="affiliate-summary-card">
          <span className="affiliate-summary-icon green"><CheckCircle2 size={20} /></span>
          <div><span>Disponíveis</span><strong>{productsWithoutAffiliateLink.filter((p) => p.availability_status === "available").length}</strong></div>
        </div>
        <div className="affiliate-summary-card">
          <span className="affiliate-summary-icon orange"><Clock3 size={20} /></span>
          <div><span>Não verificados</span><strong>{productsWithoutAffiliateLink.filter((p) => !p.availability_status || p.availability_status === "unknown").length}</strong></div>
        </div>
      </div>

      <div className="affiliate-marketplace-tabs">
        <button type="button" className={marketplaceFilter === "all" && !showFavoritesOnly ? "active" : ""} onClick={() => { setMarketplaceFilter("all"); setShowFavoritesOnly(false); }}>
          <Package size={15} />Todos ({productsWithoutAffiliateLink.length})
        </button>
        {marketplaces.map((marketplace) => {
          const brand = getBrandInfo(marketplace.name, marketplace.slug);
          const active = marketplaceFilter === marketplace.id && !showFavoritesOnly;
          return (
            <button type="button" key={marketplace.id} className={`${active ? "active " : ""}brand-tab-${brand.className}`} onClick={() => { setMarketplaceFilter(marketplace.id); setShowFavoritesOnly(false); }}>
              <span className="affiliate-tab-logo">{brand.className === "mercado-livre" ? "🤝" : brand.className === "amazon" ? "a" : brand.className === "shopee" ? "S" : brand.className === "magalu" ? "M" : brand.displayName.slice(0, 1)}</span>
              {brand.displayName} ({marketplaceStats.get(marketplace.id) || 0})
            </button>
          );
        })}
        <button type="button" className={showFavoritesOnly ? "active affiliate-favorites-filter" : "affiliate-favorites-filter"} onClick={() => { setShowFavoritesOnly((value) => !value); setMarketplaceFilter("all"); }}>
          <Heart size={15} />Favoritos ({favoriteIds.length})
        </button>
      </div>

      <div className="affiliate-toolbar">
        <div className="affiliate-search">
          <Search size={19} />
          <input type="search" placeholder="Buscar por produto ou código..." value={search} onChange={(event) => setSearch(event.target.value)} />
          {search && <button type="button" aria-label="Limpar busca" onClick={() => setSearch("")}><X size={16} /></button>}
        </div>
        <select value={availabilityFilter} onChange={(event) => setAvailabilityFilter(event.target.value)} aria-label="Filtrar disponibilidade">
          <option value="all">Toda disponibilidade</option>
          <option value="available">Disponível</option>
          <option value="unknown">Não verificado</option>
          <option value="checking">Verificando</option>
          <option value="unavailable">Indisponível</option>
          <option value="error">Erro na verificação</option>
        </select>
        <label className="affiliate-sort-control">
          <ArrowUpDown size={15} />
          <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} aria-label="Ordenar produtos">
            <option value="recent">Mais recentes</option>
            <option value="price-asc">Menor preço</option>
            <option value="price-desc">Maior preço</option>
            <option value="title">Nome A–Z</option>
          </select>
        </label>
        <div className="affiliate-view-switch" aria-label="Modo de visualização">
          <button type="button" className={viewMode === "grid" ? "active" : ""} aria-label="Visualização em grade" title="Grade" onClick={() => setViewMode("grid")}><Grid2X2 size={17} /></button>
          <button type="button" className={viewMode === "list" ? "active" : ""} aria-label="Visualização em lista" title="Lista" onClick={() => setViewMode("list")}><List size={18} /></button>
        </div>
        <button type="button" className="affiliate-select-all" onClick={toggleAllVisible} disabled={!displayedProducts.length}>
          {allVisibleSelected ? <CheckSquare size={17} /> : <Square size={17} />}
          {allVisibleSelected ? "Desmarcar" : "Selecionar todos"}
        </button>
      </div>

      {selectedIds.length > 0 && (
        <div className="affiliate-selection-bar">
          <div><CheckCircle2 size={19} /><span><strong>{selectedIds.length}</strong> produto(s) selecionado(s)</span></div>
          <div className="affiliate-selection-actions">
            <button type="button" className="affiliate-clear-selection" onClick={() => setSelectedIds([])}>Limpar seleção</button>
            <button type="button" className="affiliate-bulk-button" onClick={() => openAffiliateModal()}><Link2 size={17} />Associar links</button>
          </div>
        </div>
      )}

      {displayedProducts.length === 0 ? (
        <div className="affiliate-empty-state">
          <div className="affiliate-empty-icon"><Check size={31} /></div>
          <h2>{showFavoritesOnly ? "Nenhum favorito ainda" : "Tudo em dia!"}</h2>
          <p>{showFavoritesOnly ? "Toque no coração de um produto para guardá-lo aqui." : "Não há produtos aguardando link com os filtros selecionados."}</p>
          {(search || marketplaceFilter !== "all" || availabilityFilter !== "all" || showFavoritesOnly) && (
            <button type="button" className="affiliate-reset-filters" onClick={() => { setSearch(""); setMarketplaceFilter("all"); setAvailabilityFilter("all"); setShowFavoritesOnly(false); }}>Limpar filtros</button>
          )}
        </div>
      ) : (
        <div className={`affiliate-card-grid ${viewMode === "list" ? "is-list-view" : ""}`}>
          {displayedProducts.map((product, index) => {
            const marketplace = getMarketplace(product);
            const brand = getBrandInfo(marketplace?.name || getMarketplaceName(product), marketplace?.slug || product.marketplace_id || "");
            const availability = getAvailabilityStatus(product);
            const AvailabilityIcon = availability.icon;
            const selected = selectedIds.includes(product.id);
            const isFavorite = favoriteIds.includes(product.id);
            const discount = product.discount_percent !== null && product.discount_percent > 0
              ? product.discount_percent
              : product.original_price !== null && product.price !== null && product.original_price > product.price
                ? ((product.original_price - product.price) / product.original_price) * 100
                : null;

            return (
              <article key={product.id} className={["affiliate-product-card", `brand-${brand.className}`, selected ? "is-selected" : ""].join(" ")} style={{ animationDelay: `${Math.min(index, 12) * 55}ms` }}>
                <div className="affiliate-card-brandbar">
                  <div className="affiliate-brand-identity">
                    {brand.className === "mercado-livre" ? (
                      <img className="affiliate-marketplace-logo" src="/logos/mercado-livre.png" alt="Logo do Mercado Livre" />
                    ) : (
                      <span className={`affiliate-brand-symbol affiliate-brand-symbol-${brand.className}`} aria-label={brand.displayName}>
                        {brand.className === "amazon" ? <span className="affiliate-brand-wordmark">a</span> : brand.className === "shopee" ? <ShoppingBag size={23} strokeWidth={2.5} /> : brand.className === "magalu" ? <span className="affiliate-brand-wordmark">M</span> : brand.displayName.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <div><strong>{brand.displayName}</strong><span>Produto integrado</span></div>
                  </div>
                  <button type="button" className={`affiliate-select-toggle ${selected ? "selected" : ""}`} onClick={() => toggleProduct(product.id)} aria-label={selected ? "Desmarcar produto" : "Selecionar produto"}>
                    {selected ? <CheckSquare size={19} /> : <Square size={19} />}
                  </button>
                </div>

                <div className="affiliate-card-image-wrap">
                  {product.image_url ? <img src={product.image_url} alt={product.title} className="affiliate-card-image" loading="lazy" /> : <div className="affiliate-card-image-placeholder"><ShoppingBag size={37} /><span>Imagem não disponível</span></div>}
                  <span className="affiliate-new-badge">NOVO · SEM LINK</span>
                  {discount !== null && discount > 0 && <span className="affiliate-discount-badge">-{discount.toFixed(0)}%</span>}
                </div>

                <button type="button" className={`affiliate-favorite-toggle ${isFavorite ? "is-favorite" : ""}`} aria-label={isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"} aria-pressed={isFavorite} title={isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"} onClick={() => toggleFavorite(product.id)}>
                  <Heart size={19} fill={isFavorite ? "currentColor" : "none"} />
                </button>

                <div className="affiliate-card-content">
                  <div className="affiliate-product-marketplace">{getMarketplaceName(product)}<span>•</span>Código {product.external_id}</div>
                  <h2 className="affiliate-card-title" title={product.title}>{product.title}</h2>
                  <div className="affiliate-card-availability">
                    <span className={`status-badge status-${availability.type}`} title={product.availability_error || ""}><AvailabilityIcon size={14} />{availability.label}</span>
                  </div>
                  <div className="affiliate-card-pricing">
                    <strong>{formatPrice(product.price)}</strong>
                    {product.original_price !== null && product.price !== null && product.original_price > product.price && <del>{formatPrice(product.original_price)}</del>}
                  </div>
                  <div className="affiliate-coupon-placeholder"><Tags size={16} /><span>Cupom não informado</span></div>
                  <div className="affiliate-inline-link-field">
                    <Link2 size={15} />
                    <input type="url" value={inlineUrls[product.id] || ""} onChange={(event) => setInlineUrls((current) => ({ ...current, [product.id]: event.target.value }))} placeholder="Cole o link de afiliado aqui..." aria-label={`Link de afiliado para ${product.title}`} disabled={savingProductId === product.id} />
                  </div>
                  <div className="affiliate-card-footer">
                    <span className="affiliate-needs-link"><Link2 size={15} />Link pendente</span>
                    <button type="button" className="affiliate-card-action" onClick={() => (inlineUrls[product.id] || "").trim() ? void saveInlineAffiliateLink(product) : openAffiliateModal([product.id])} disabled={savingProductId === product.id}>
                      <Link2 size={16} />{savingProductId === product.id ? "Salvando..." : "Salvar link"}
                    </button>
                  </div>
                  {product.product_url && <a href={product.product_url} target="_blank" rel="noreferrer" className="affiliate-product-source"><ExternalLink size={14} />Ver produto original</a>}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay affiliate-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) closeAffiliateModal(); }}>
          <div className="modal-card affiliate-batch-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div><h2>Associar links de afiliado</h2><p>Cole os links gerados nos respectivos marketplaces.</p></div>
              <button type="button" className="icon-button" onClick={closeAffiliateModal} disabled={saving} aria-label="Fechar"><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="affiliate-batch-list">
                {selectedProducts.map((product) => {
                  const form = forms[product.id] || { affiliateUrl: "", affiliateTag: "" };
                  return (
                    <div className="affiliate-batch-item" key={product.id}>
                      <div className="affiliate-batch-product">
                        {product.image_url ? <img src={product.image_url} alt={product.title} /> : <div className="product-thumb-placeholder"><Link2 size={18} /></div>}
                        <div><strong>{product.title}</strong><span>{getMarketplaceName(product)} · {formatPrice(product.price)}</span><span>{product.external_id}</span></div>
                      </div>
                      {product.product_url && <a href={product.product_url} target="_blank" rel="noreferrer" className="secondary-button"><ExternalLink size={15} />Abrir produto original</a>}
                      <div className="affiliate-batch-fields">
                        <div className="settings-field">
                          <label htmlFor={`affiliate-url-${product.id}`}>Link de afiliado</label>
                          <input id={`affiliate-url-${product.id}`} type="url" value={form.affiliateUrl} onChange={(event) => updateForm(product.id, "affiliateUrl", event.target.value)} placeholder="Cole aqui o link de afiliado" disabled={saving} />
                        </div>
                        <div className="settings-field">
                          <label htmlFor={`affiliate-tag-${product.id}`}>Etiqueta (opcional)</label>
                          <input id={`affiliate-tag-${product.id}`} type="text" value={form.affiliateTag} onChange={(event) => updateForm(product.id, "affiliateTag", event.target.value)} placeholder="Ex.: ofertix" disabled={saving} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="settings-note">A associação do link não ignora as regras de elegibilidade. O Ofertix tentará gerar a oferta automaticamente quando os critérios aplicáveis forem atendidos.</div>
            </div>
            <div className="modal-footer">
              <button type="button" className="secondary-button" onClick={closeAffiliateModal} disabled={saving}>Cancelar</button>
              <button type="button" className="primary-button" onClick={saveAffiliateLinks} disabled={saving}>
                {saving ? <span className="affiliate-button-spinner" /> : <Link2 size={16} />}
                {saving ? "Salvando links..." : "Salvar e gerar ofertas"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
