import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUp, Check, ExternalLink, Package, RotateCcw, SkipForward, Sparkles } from "lucide-react";
import { supabase } from "../lib/supabase";
import { MarketplaceTag, PageIntro } from "../components/OperationsUI";
import { canAction, type AccessData } from "../lib/access";
import "./ClassificacaoOrigem.css";

type Item = {
  id: string;
  title: string;
  marketplace_id: string;
  origin_type: "national" | "imported" | "unknown";
  origin_type_source: "automatic" | "manual";
  image_url: string | null;
  product_url: string | null;
  active: boolean;
};
type Market = { id: string; name: string; slug: string };
type UndoEntry = { id: string; previous: Item["origin_type"]; next: Item["origin_type"] };
type Drag = { x: number; y: number; pointerId: number };

const SESSION_KEY = "ofertix-origin-review-v1";
const readSession = () => {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) as { currentId?: string; filter?: string; search?: string; skipped?: string[]; history?: UndoEntry[] } : {};
  } catch { return {}; }
};

export function ClassificacaoOrigem({ access }: { access: AccessData }) {
  const [items, setItems] = useState<Item[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [search, setSearch] = useState(() => readSession().search || "");
  const [filter, setFilter] = useState(() => readSession().filter || "unknown");
  const [currentId, setCurrentId] = useState<string | null>(() => readSession().currentId || null);
  const [skipped, setSkipped] = useState<string[]>(() => readSession().skipped || []);
  const [history, setHistory] = useState<UndoEntry[]>(() => readSession().history || []);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [drag, setDrag] = useState<Drag | null>(null);
  const [exitDirection, setExitDirection] = useState<"left" | "right" | "up" | null>(null);
  const cardRef = useRef<HTMLElement | null>(null);
  const marketplaceLinkRef = useRef<HTMLAnchorElement | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [m, p] = await Promise.all([
        supabase.from("marketplaces").select("id,name,slug"),
        supabase.from("products").select("id,title,marketplace_id,origin_type,origin_type_source,image_url,product_url,active").order("created_at", { ascending: false }).limit(5000),
      ]);
      if (m.error) throw m.error;
      if (p.error) throw p.error;
      const loaded = (p.data || []) as Item[];
      setItems(loaded);
      const loadedMarkets = (m.data || []) as Market[];
      setMarkets(loadedMarkets);
      const savedId = readSession().currentId;
      setCurrentId(savedId && loaded.some(x => x.id === savedId) ? savedId : loaded.find(x => x.origin_type === "unknown")?.id || loaded[0]?.id || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar produtos.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ currentId, filter, search, skipped, history })); } catch { /* sessão indisponível */ }
  }, [currentId, filter, search, skipped, history]);

  const filtered = useMemo(() => items.filter(x =>
    (filter === "all" || x.origin_type === filter) &&
    (!search.trim() || x.title.toLowerCase().includes(search.trim().toLowerCase()))
  ), [items, filter, search]);
  const current = filtered.find(x => x.id === currentId) || filtered.find(x => !skipped.includes(x.id)) || null;
  const currentIndex = current ? filtered.findIndex(x => x.id === current.id) : -1;
  const nextItem = (fromId: string) => {
    const list = filtered;
    const index = list.findIndex(x => x.id === fromId);
    return list.slice(index + 1).find(x => !skipped.includes(x.id))?.id
      || list.slice(0, Math.max(index, 0)).find(x => !skipped.includes(x.id))?.id
      || null;
  };
  const counts = useMemo(() => ({
    national: items.filter(x => x.origin_type === "national").length,
    imported: items.filter(x => x.origin_type === "imported").length,
    unknown: items.filter(x => x.origin_type === "unknown").length,
    skipped: skipped.length,
  }), [items, skipped]);

  const classify = async (item: Item, value: "national" | "imported") => {
    if (busy || !canAction(access, "products.origin.update")) return;
    setBusy(true); setError(""); setNotice("");
    setExitDirection(value === "national" ? "left" : "right");
    try {
      const result = await supabase.from("products").update({
        origin_type: value, origin_type_source: "manual", origin_source: "manual_override", origin_country: null,
      }).eq("id", item.id).select("id").single();
      if (result.error) throw result.error;
      setItems(prev => prev.map(x => x.id === item.id ? { ...x, origin_type: value, origin_type_source: "manual" } : x));
      setHistory(prev => [...prev, { id: item.id, previous: item.origin_type, next: value }].slice(-30));
      setSkipped(prev => prev.filter(id => id !== item.id));
      window.setTimeout(() => {
        setCurrentId(nextItem(item.id));
        setExitDirection(null); setDrag(null); setBusy(false);
        setNotice(value === "national" ? "Salvo como nacional." : "Salvo como importado.");
      }, 260);
    } catch (e) {
      setExitDirection(null); setDrag(null); setBusy(false);
      setError(e instanceof Error ? e.message : "Não foi possível salvar a classificação. O produto foi mantido na tela.");
    }
  };

  const skip = () => {
    if (!current || busy) return;
    setSkipped(prev => [...new Set([...prev, current.id])]);
    setCurrentId(nextItem(current.id));
    setNotice("Produto pulado sem alterar sua classificação.");
    setError("");
  };

  const undo = async () => {
    if (busy || !history.length) return;
    const entry = history[history.length - 1];
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await supabase.from("products").update({
        origin_type: entry.previous,
        origin_type_source: entry.previous === "unknown" ? "automatic" : "manual",
        origin_source: entry.previous === "unknown" ? null : "manual_override",
        origin_country: null,
      }).eq("id", entry.id).select("id").single();
      if (result.error) throw result.error;
      setItems(prev => prev.map(x => x.id === entry.id ? { ...x, origin_type: entry.previous, origin_type_source: entry.previous === "unknown" ? "automatic" : "manual" } : x));
      setHistory(prev => prev.slice(0, -1));
      setSkipped(prev => prev.filter(id => id !== entry.id));
      setCurrentId(entry.id);
      setNotice("Última classificação desfeita.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível desfazer a classificação.");
    } finally { setBusy(false); }
  };

  const openMarketplace = (item: Item) => {
    if (!item.product_url) { setError("Este produto não possui link do marketplace."); return; }
    // Replica o comportamento dos links do catálogo: abre a URL diretamente em nova navegação,
    // permitindo ao iOS interceptar o universal link e encaminhar para o app instalado.
    window.open(item.product_url, "_blank", "noopener,noreferrer");
  };

  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (busy || !canAction(access, "products.origin.update")) return;
    startRef.current = { x: event.clientX, y: event.clientY };
    setDrag({ x: 0, y: 0, pointerId: event.pointerId });
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (!startRef.current || !drag || drag.pointerId !== event.pointerId || exitDirection) return;
    setDrag({ x: event.clientX - startRef.current.x, y: event.clientY - startRef.current.y, pointerId: event.pointerId });
  };
  const onPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    if (!startRef.current || !current) return;
    const dx = event.clientX - startRef.current.x;
    const dy = event.clientY - startRef.current.y;
    startRef.current = null;
    if (Math.abs(dy) > 95 && Math.abs(dy) > Math.abs(dx) * 1.12 && dy < 0) {
      setDrag(null);
      openMarketplace(current);
    } else if (Math.abs(dx) > 105 && Math.abs(dx) > Math.abs(dy) * 1.12) {
      void classify(current, dx < 0 ? "national" : "imported");
    } else { setDrag(null); }
  };
  const onPointerCancel = () => { startRef.current = null; setDrag(null); };

  const market = current ? markets.find(x => x.id === current.marketplace_id) : null;
  const canEdit = canAction(access, "products.origin.update");
  const transform = exitDirection === "left" ? "translate(-125vw, 5vh) rotate(-24deg)"
    : exitDirection === "right" ? "translate(125vw, 5vh) rotate(24deg)"
    : exitDirection === "up" ? "translate(0, -125vh) rotate(5deg)"
    : drag ? `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x * 0.055}deg)` : "translate(0,0) rotate(0deg)";
  const swipeLabel = drag && Math.abs(drag.x) > Math.abs(drag.y) ? (drag.x < 0 ? "NACIONAL" : "IMPORTADO") : drag && drag.y < -35 ? "ABRIR ANÚNCIO" : "";

  return <div className="page ops-page origin-tinder-page">
    <PageIntro eyebrow="OPERAÇÃO DE CATÁLOGO" title="Classificação de origem" description="Arraste os produtos para classificar a origem do envio. Suas escolhas manuais são preservadas pelas sincronizações." actions={<button className="ops-button ops-button-secondary" onClick={() => void load()} disabled={loading || busy}>Atualizar</button>} />
    {error && <div className="ops-alert" role="alert">{error}</div>}
    {notice && <div className="approval-notice"><Check size={16}/>{notice}</div>}
    <section className="origin-tinder-stats">
      <div><strong>{counts.unknown}</strong><span>Pendentes</span></div>
      <div><strong>{counts.national}</strong><span>Nacionais</span></div>
      <div><strong>{counts.imported}</strong><span>Importados</span></div>
      <div><strong>{counts.skipped}</strong><span>Pulados</span></div>
    </section>
    <section className="ops-surface origin-tinder-workspace">
      <div className="origin-tinder-toolbar">
        <label className="ops-search"><span>⌕</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar produto"/></label>
        <label className="ops-select"><select value={filter} onChange={e => { setFilter(e.target.value); setCurrentId(null); }}><option value="unknown">Aguardando classificação</option><option value="national">Nacionais</option><option value="imported">Importados</option><option value="all">Todos</option></select></label>
      </div>
      {loading ? <div className="ops-empty"><p>Carregando produtos…</p></div> : !current ? <div className="origin-tinder-empty"><Sparkles size={30}/><h2>Você chegou ao fim!</h2><p>Não há mais produtos nesta seleção. Os itens pulados continuam sem classificação.</p><button className="ops-button ops-button-secondary" onClick={() => { setSkipped([]); setCurrentId(filtered[0]?.id || null); }}>Revisar produtos pulados</button></div> : <>
        <div className="origin-tinder-progress"><span>Produto {currentIndex + 1} de {filtered.length}</span><span>{Math.round(((currentIndex + 1) / Math.max(filtered.length, 1)) * 100)}%</span></div>
        <div className="origin-tinder-progress-track"><span style={{ width: `${((currentIndex + 1) / Math.max(filtered.length, 1)) * 100}%` }}/></div>
        <div className="origin-tinder-stage">
          <a ref={marketplaceLinkRef} href={current.product_url || "#"} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden="true" className="origin-tinder-marketplace-link"/>
          {swipeLabel && <div className={`origin-tinder-stamp ${swipeLabel === "NACIONAL" ? "is-national" : swipeLabel === "IMPORTADO" ? "is-imported" : "is-open"}`}>{swipeLabel}</div>}
          <article ref={cardRef} className={`origin-tinder-card ${exitDirection ? `is-exiting-${exitDirection}` : ""}`} style={{ transform, transition: drag && !exitDirection ? "none" : "transform .26s cubic-bezier(.2,.75,.25,1), opacity .26s ease" }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}>
            <div className="origin-tinder-image">{current.image_url ? <img src={current.image_url} alt={current.title}/> : <Package size={48}/>}</div>
            <div className="origin-tinder-card-content">
              <div className="origin-tinder-meta">{market && <MarketplaceTag name={market.name} slug={market.slug}/>}<span>{current.origin_type_source === "manual" ? "Classificação manual" : "Classificação automática"}</span>{!current.active && <span>Inativo</span>}</div>
              <h2>{current.title}</h2>
              <p>Qual é a origem logística deste produto?</p>
              <button type="button" className="origin-tinder-open" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); openMarketplace(current); }} disabled={!current.product_url}><ExternalLink size={16}/> Abrir anúncio no marketplace</button>
            </div>
          </article>
        </div>
        <div className="origin-tinder-actions">
          <button type="button" className="origin-action national" onClick={() => void classify(current, "national")} disabled={busy || !canEdit}><ArrowLeft/><span>Nacional</span></button>
          <button type="button" className="origin-action imported" onClick={() => void classify(current, "imported")} disabled={busy || !canEdit}><ArrowRight/><span>Importado</span></button>
        </div>
        <div className="origin-tinder-secondary">
          <button type="button" onClick={skip} disabled={busy}><SkipForward size={16}/> Pular sem classificar</button>
          <button type="button" onClick={undo} disabled={busy || !history.length}><RotateCcw size={16}/> Desfazer última</button>
        </div>
        <p className="origin-tinder-hint"><ArrowUp size={15}/> Arraste o card para cima para abrir o anúncio. Ao voltar, o mesmo produto estará aqui.</p>
      </>}
    </section>
  </div>;
}
