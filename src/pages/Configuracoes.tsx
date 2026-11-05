import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, RefreshCw, Settings2, ShieldCheck, Tags } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { MarketplaceTag, Metric, PageIntro, StatusPill } from "../components/OperationsUI";

type Marketplace = { id: string; name: string; slug: string; active: boolean };
type Connection = { marketplace_id: string; token_expires_at: string | null };

export function Configuracoes() {
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [rulesCount, setRulesCount] = useState(0);
  const [channelsCount, setChannelsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const [marketplaceResult, connectionResult, ruleResult, channelResult] = await Promise.all([
      supabase.from("marketplaces").select("id,name,slug,active").order("name"),
      supabase.from("marketplace_connections").select("marketplace_id,token_expires_at"),
      supabase.from("offer_rules").select("id", { count: "exact", head: true }).eq("active", true),
      supabase.from("channels").select("id", { count: "exact", head: true }).eq("active", true),
    ]);
    const requestError = marketplaceResult.error || connectionResult.error || ruleResult.error || channelResult.error;
    if (requestError) setError(requestError.message);
    setMarketplaces(marketplaceResult.data ?? []); setConnections(connectionResult.data ?? []); setRulesCount(ruleResult.count ?? 0); setChannelsCount(channelResult.count ?? 0);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  return <div className="page ops-page">
    <PageIntro eyebrow="CONFIGURAÇÕES" title="Estrutura da operação" description="Configurações gerais, conexões e atalhos para manter o Ofertix organizado conforme novos marketplaces forem adicionados." actions={<button className="ops-button ops-button-secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16} /> Atualizar</button>} />
    {error && <div className="ops-alert">{error}</div>}
    <section className="ops-metrics"><Metric icon={<CheckCircle2 size={19} />} value={loading ? "…" : marketplaces.filter((item) => item.active).length} label="Integrações ativas" detail="Conexões disponíveis" /><Metric icon={<Tags size={19} />} value={loading ? "…" : rulesCount} label="Regras ativas" detail="Controlam as buscas" /><Metric icon={<ShieldCheck size={19} />} value="Automático" label="Proteção de fluxo" detail="Regras antes da importação" /><Metric icon={<Settings2 size={19} />} value={loading ? "…" : channelsCount} label="Canais ativos" detail="Destinos de publicação" /></section>
    <section className="ops-settings-grid"><article className="ops-surface"><div className="ops-section-head"><div><p className="ops-eyebrow">CONEXÕES</p><h2>Marketplaces</h2></div><Link to="/marketplaces">Gerenciar</Link></div><div className="ops-marketplace-list">{marketplaces.map((marketplace) => { const connection = connections.find((item) => item.marketplace_id === marketplace.id); return <div className="ops-marketplace-row" key={marketplace.id}><MarketplaceTag name={marketplace.name} slug={marketplace.slug} /><StatusPill tone={marketplace.active ? "success" : "neutral"}>{marketplace.active ? "Ativo" : "Pausado"}</StatusPill><span>{connection ? "Conexão registrada" : marketplace.slug === "shopee" ? "Sincronização automática" : "Sem conexão de usuário"}</span></div>; })}</div></article><article className="ops-surface"><div className="ops-section-head"><div><p className="ops-eyebrow">ORGANIZAÇÃO</p><h2>Onde configurar cada item</h2></div></div><div className="ops-settings-links"><Link to="/regras"><Tags size={17} /><span><strong>Regras e termos</strong><small>Definem o que pode entrar no catálogo.</small></span><ExternalLink size={14} /></Link><Link to="/canais"><Settings2 size={17} /><span><strong>Canais de publicação</strong><small>Escolha onde as ofertas serão distribuídas.</small></span><ExternalLink size={14} /></Link><Link to="/execucoes"><ShieldCheck size={17} /><span><strong>Histórico de automações</strong><small>Acompanhe ciclos e possíveis falhas.</small></span><ExternalLink size={14} /></Link></div></article></section>
  </div>;
}