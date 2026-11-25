import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleDollarSign, Clock3, BadgeCheck, Ban } from "lucide-react";
import { supabase } from "../lib/supabase";
import { MarketplaceTag, Metric } from "./OperationsUI";

type Marketplace = { id: string; name: string; slug: string };
type SummaryRow = { marketplace_id: string; status: string; conversions: number; total_commission: number };
type Bucket = "pending" | "confirmed" | "cancelled";

const PERIODS = [{ days: 7, label: "7 dias" }, { days: 30, label: "30 dias" }, { days: 90, label: "90 dias" }];
const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// A Shopee devolve o status em texto. Qualquer status desconhecido fica em "pendente"
// (o valor ainda não é garantido), para nunca superestimar o ganho confirmado.
function bucketFor(status: string): Bucket {
  const s = status.toLowerCase();
  if (/cancel|invalid|fraud|reject|void|refund/.test(s)) return "cancelled";
  if (/complet|paid|confirm|settle|approved|success/.test(s)) return "confirmed";
  return "pending";
}

export function CommissionsPanel({ marketplaces }: { marketplaces: Marketplace[] }) {
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [live, setLive] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc("affiliate_commission_summary", { p_days: days });
    if (rpcError) { setError(rpcError.message); setLoading(false); return; }
    setError("");
    setRows(((data ?? []) as SummaryRow[]).map((row) => ({ ...row, conversions: Number(row.conversions), total_commission: Number(row.total_commission) })));
    setUpdatedAt(new Date());
    setLoading(false);
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  // Tempo real: qualquer inclusão ou mudança de status na tabela refaz o resumo (com debounce).
  useEffect(() => {
    const channel = supabase.channel("affiliate-commissions-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "affiliate_commissions" }, () => {
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => void load(), 800);
      })
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => { window.clearTimeout(timer.current); void supabase.removeChannel(channel); };
  }, [load]);

  const totals = useMemo(() => {
    const base: Record<Bucket, { value: number; count: number }> = { pending: { value: 0, count: 0 }, confirmed: { value: 0, count: 0 }, cancelled: { value: 0, count: 0 } };
    const byMarketplace = new Map<string, Record<Bucket, number>>();
    for (const row of rows) {
      const bucket = bucketFor(row.status);
      base[bucket].value += row.total_commission; base[bucket].count += row.conversions;
      const current = byMarketplace.get(row.marketplace_id) ?? { pending: 0, confirmed: 0, cancelled: 0 };
      current[bucket] += row.total_commission; byMarketplace.set(row.marketplace_id, current);
    }
    return { ...base, expected: base.pending.value + base.confirmed.value, byMarketplace };
  }, [rows]);

  const shown = marketplaces.filter((marketplace) => /shopee/i.test(marketplace.slug || marketplace.name));

  return <section className="ops-surface ops-commissions">
    <div className="ops-section-head">
      <div><p className="ops-eyebrow">GANHOS · {live ? "AO VIVO" : "ATUALIZA A CADA 10 MIN"}</p><h2>Comissões dos marketplaces</h2></div>
      <div className="ops-commission-periods" role="group" aria-label="Período">
        {PERIODS.map((period) => <button key={period.days} type="button" className={period.days === days ? "active" : ""} onClick={() => { setLoading(true); setDays(period.days); }}>{period.label}</button>)}
      </div>
    </div>
    {error && <div className="ops-alert">{error}</div>}
    <div className="ops-metrics ops-commission-metrics">
      <Metric icon={<CircleDollarSign size={19} />} value={loading ? "…" : brl(totals.expected)} label="Previsto (pendente + confirmado)" detail={`Últimos ${days} dias`} />
      <Metric icon={<Clock3 size={19} />} value={loading ? "…" : brl(totals.pending.value)} label="Pendente" detail={`${totals.pending.count} conversões aguardando confirmação`} />
      <Metric icon={<BadgeCheck size={19} />} value={loading ? "…" : brl(totals.confirmed.value)} label="Confirmado" detail={`${totals.confirmed.count} conversões confirmadas`} />
      <Metric icon={<Ban size={19} />} value={loading ? "…" : brl(totals.cancelled.value)} label="Cancelado" detail={`${totals.cancelled.count} conversões fora do total`} />
    </div>
    <div className="ops-marketplace-list">
      {shown.map((marketplace) => {
        const values = totals.byMarketplace.get(marketplace.id) ?? { pending: 0, confirmed: 0, cancelled: 0 };
        return <div className="ops-marketplace-row ops-commission-row" key={marketplace.id}>
          <MarketplaceTag name={marketplace.name} slug={marketplace.slug} />
          <strong>{brl(values.pending + values.confirmed)}</strong><span>previsto</span>
          <span>{brl(values.confirmed)} confirmado</span>
        </div>;
      })}
      <div className="ops-marketplace-row ops-commission-row">
        <MarketplaceTag name="Mercado Livre" slug="mercado_livre" />
        <strong>—</strong><span>sem integração</span><span>painel do Mercado Livre</span>
      </div>
    </div>
    <p className="ops-commission-note">A comissão só é confirmada depois da entrega e do prazo de devolução, então o valor previsto pode diminuir. {updatedAt ? `Atualizado às ${updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}.` : ""}</p>
  </section>;
}
