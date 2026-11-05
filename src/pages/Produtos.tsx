import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, Filter, Link2, Package, Power, RefreshCw, Search, Tags } from "lucide-react";
import { supabase } from "../lib/supabase";
import { EmptyState, formatCurrency, formatDate, MarketplaceTag, Metric, PageIntro, StatusPill } from "../components/OperationsUI";

type Marketplace = { id: string; name: string; slug: string };
type Product = { id: string; marketplace_id: string; title: string; brand: string | null; category: string | null; price: number | null; original_price: number | null; discount_percent: number | null; image_url: string | null; product_url: string | null; affiliate_url: string | null; active: boolean; availability_status: string | null; last_seen_at: string | null; created_at: string };
type Rule = { id: string; name: string; category: string | null };
type Match = { product_id: string; rule_id: string; status: string; matched_at: string };

export function Produtos() {
  const [products, setProducts] = useState<Product[]>([]);
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [linkedProductIds, setLinkedProductIds] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState("");
  const [marketplace, setMarketplace] = useState("all");
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const pageSize = 1000;
      const [marketplaceResult, rulesResult] = await Promise.all([
        supabase.from("marketplaces").select("id,name,slug").eq("active", true).order("name"),
        supabase.from("offer_rules").select("id,name,category").eq("active", true),
      ]);
      if (marketplaceResult.error) throw marketplaceResult.error;
      if (rulesResult.error) throw rulesResult.error;

      const allProducts: Product[] = [];
      for (let from = 0; ; from += pageSize) {
        const { data, error: pageError } = await supabase.from("products")
          .select("id,marketplace_id,title,brand,category,price,original_price,discount_percent,image_url,product_url,affiliate_url,active,availability_status,last_seen_at,created_at")
          .order("created_at", { ascending: false }).range(from, from + pageSize - 1);
        if (pageError) throw pageError;
        allProducts.push(...((data ?? []) as Product[]));
        if (!data || data.length < pageSize) break;
      }

      const allMatches: Match[] = [];
      for (let from = 0; ; from += pageSize) {
        const { data, error: pageError } = await supabase.from("product_rule_matches")
          .select("product_id,rule_id,status,matched_at")
          .order("matched_at", { ascending: false }).range(from, from + pageSize - 1);
        if (pageError) throw pageError;
        allMatches.push(...((data ?? []) as Match[]));
        if (!data || data.length < pageSize) break;
      }

      const linkedIds = new Set<string>();
      for (let from = 0; ; from += pageSize) {
        const { data, error: pageError } = await supabase.from("affiliate_links")
          .select("product_id,affiliate_url").range(from, from + pageSize - 1);
        if (pageError) throw pageError;
        (data ?? []).forEach((link: { product_id: string; affiliate_url: string | null }) => {
          if (link.affiliate_url?.trim()) linkedIds.add(link.product_id);
        });
        if (!data || data.length < pageSize) break;
      }

      setProducts(allProducts);
      setMarketplaces(marketplaceResult.data ?? []);
      setRules(rulesResult.data ?? []);
      setMatches(allMatches);
      setLinkedProductIds(linkedIds);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar os produtos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const marketplaceById = useMemo(() => new Map(marketplaces.map((item) => [item.id, item])), [marketplaces]);
  const rulesById = useMemo(() => new Map(rules.map((item) => [item.id, item])), [rules]);
  const matchesByProduct = useMemo(() => {
    const map = new Map<string, Match[]>();
    matches.forEach((match) => map.set(match.product_id, [...(map.get(match.product_id) ?? []), match]));
    return map;
  }, [matches]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((product) => {
      const qualified = (matchesByProduct.get(product.id)?.length ?? 0) > 0;
      const searchable = [product.title, product.brand, product.category].filter(Boolean).join(" ").toLowerCase();
      return (showHistory || qualified) && (marketplace === "all" || product.marketplace_id === marketplace) && (!term || searchable.includes(term));
    });
  }, [products, marketplace, matchesByProduct, search, showHistory]);

  // Os indicadores acompanham o marketplace selecionado e usam a mesma
  // fonte de links da Central de Afiliados (products + affiliate_links).
  const scopedProducts = marketplace === "all"
    ? products
    : products.filter((product) => product.marketplace_id === marketplace);
  const qualified = scopedProducts.filter((product) => (matchesByProduct.get(product.id)?.length ?? 0) > 0);
  const pendingAffiliate = qualified.filter((product) =>
    !product.affiliate_url?.trim() && !linkedProductIds.has(product.id)
  ).length;

  const toggleProduct = async (product: Product) => {
    const { error: updateError } = await supabase.from("products").update({ active: !product.active }).eq("id", product.id);
    if (updateError) setError(updateError.message); else await load();
  };

  return <div className="page ops-page">
    <PageIntro eyebrow="CATÁLOGO INTELIGENTE" title="Produtos qualificados" description="Itens encontrados pelas integrações e aprovados pelas regras do Ofertix." actions={<button className="ops-button ops-button-secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16} /> Atualizar</button>} />
    {error && <div className="ops-alert">{error}</div>}
    <section className="ops-metrics">
      <Metric icon={<Package size={19} />} value={loading ? "…" : qualified.length} label="Qualificados" detail="Atendem a pelo menos uma regra" />
      <Metric icon={<Link2 size={19} />} value={loading ? "…" : pendingAffiliate} label="Links pendentes" detail="Prontos para associação" />
      <Metric icon={<CheckCircle2 size={19} />} value={loading ? "…" : qualified.filter((item) => item.active).length} label="Ativos" detail="Em operação no catálogo" />
      <Metric icon={<Tags size={19} />} value={loading ? "…" : marketplaces.length} label="Marketplaces" detail="Separados na operação" />
    </section>
    <section className="ops-surface">
      <div className="ops-toolbar">
        <label className="ops-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar produto, marca ou categoria" /></label>
        <label className="ops-select"><Filter size={15} /><select value={marketplace} onChange={(event) => setMarketplace(event.target.value)}><option value="all">Todos os marketplaces</option>{marketplaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="ops-check"><input type="checkbox" checked={showHistory} onChange={(event) => setShowHistory(event.target.checked)} /> Mostrar importações antigas sem regra</label>
      </div>
      {loading ? <div className="ops-empty"><p>Carregando catálogo…</p></div> : visible.length === 0 ? <EmptyState title="Nenhum produto para exibir" detail={showHistory ? "Ajuste os filtros para ver os itens importados." : "Os próximos ciclos incluirão somente produtos que atendam às regras."} /> :
        <div className="ops-product-grid">{visible.map((product) => {
          const source = marketplaceById.get(product.marketplace_id);
          const productRules = (matchesByProduct.get(product.id) ?? []).map((match) => rulesById.get(match.rule_id)?.name).filter(Boolean);
          return <article className="ops-product-card" key={product.id}>
            <div className="ops-product-image">{product.image_url ? <img src={product.image_url} alt="" /> : <Package size={22} />}</div>
            <div className="ops-product-copy"><div className="ops-product-meta"><MarketplaceTag name={source?.name ?? "Marketplace"} slug={source?.slug} />{product.discount_percent != null && <StatusPill tone="success">{product.discount_percent}% OFF</StatusPill>}</div><h2>{product.title}</h2><p>{product.brand || product.category || "Sem marca informada"}</p><div className="ops-rules">{productRules.length ? productRules.map((rule) => <span key={rule}>{rule}</span>) : <span>Importação anterior sem regra</span>}</div></div>
            <div className="ops-product-price"><strong>{formatCurrency(product.price)}</strong>{product.original_price && product.original_price > (product.price ?? 0) && <del>{formatCurrency(product.original_price)}</del>}<small>Visto {formatDate(product.last_seen_at || product.created_at)}</small></div>
            <div className="ops-product-actions">{product.product_url && <a className="ops-icon-action" href={product.product_url} target="_blank" rel="noreferrer" aria-label="Abrir produto"><ExternalLink size={16} /></a>}<button className="ops-icon-action" onClick={() => void toggleProduct(product)} aria-label={product.active ? "Desativar produto" : "Ativar produto"}><Power size={16} /></button></div>
          </article>;
        })}</div>}
    </section>
  </div>;
}