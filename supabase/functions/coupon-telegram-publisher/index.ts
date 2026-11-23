import { withSupabase } from "npm:@supabase/server";
const json = (body: unknown, status = 200) => Response.json(body, { status });
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const safeLink = (value: string, marketplace: string) => {
  try { const u = new URL(value); const allowed = marketplace === "shopee" ? ["shopee.com.br","s.shopee.com.br","shp.ee"] : ["mercadolivre.com.br","meli.la","mercadolivre.com"]; return u.protocol === "https:" && allowed.some((d) => u.hostname === d || u.hostname.endsWith("." + d)); }
  catch { return false; }
};
const buildText = (c: any) => {
  const title = c.marketplace === "shopee" ? "CUPOM SHOPEE" : "CUPOM MERCADO LIVRE";
  const discount = c.discount_type === "percentage" ? c.discount_value.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "% OFF" : brl(Number(c.discount_value)) + " OFF";
  const lines = ["🏁 " + title, "", "🏷️ " + discount];
  if (c.min_purchase_amount != null) lines.push("🛒 Em compras acima de " + brl(Number(c.min_purchase_amount)));
  if (c.max_discount_amount != null) lines.push("🔒 Desconto máximo: " + brl(Number(c.max_discount_amount)));
  lines.push("", "🎟️ Cupom: " + c.coupon_code, "", "👉 Ative aqui: " + c.activation_url);
  if (c.terms_text) lines.push("", "ℹ️ " + c.terms_text);
  lines.push("", "⏳ Válido até: " + new Date(c.expires_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }), "", "⚡ Consulte as condições no marketplace. Disponibilidade sujeita a alterações.", "", "#Ofertix #Cupom");
  return lines.join("\n").slice(0, 4096);
};
Deno.serve(withSupabase({ auth: "secret" }, async (req, ctx) => {
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!botToken) return json({ error: "TELEGRAM_BOT_TOKEN_NOT_CONFIGURED" }, 503);
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body?.limit) || 10, 1), 30);
    let query = ctx.supabaseAdmin.from("coupon_publications").select("id,coupon_id,channel_id,status,attempts,next_retry_at").in("status", ["pending","failed"]).order("created_at", { ascending: true }).limit(limit);
    if (typeof body?.publication_id === "string") query = ctx.supabaseAdmin.from("coupon_publications").select("id,coupon_id,channel_id,status,attempts,next_retry_at").eq("id", body.publication_id).in("status", ["pending","failed"]).limit(1);
    const { data: rows, error } = await query;
    if (error) throw error;
    const results = [];
    for (const row of rows ?? []) {
      const now = new Date();
      if (row.status === "failed" && row.next_retry_at && new Date(row.next_retry_at) > now) { results.push({ id: row.id, status: "deferred" }); continue; }
      // Atomic claim: concurrent workers cannot publish the same queue item.
      const { data: claimed, error: claimError } = await ctx.supabaseAdmin.from("coupon_publications")
        .update({ status: "publishing", attempts: Number(row.attempts || 0) + 1, error_message: null, updated_at: now.toISOString() })
        .eq("id", row.id).in("status", ["pending","failed"]).select("id").maybeSingle();
      if (claimError) throw claimError;
      if (!claimed) { results.push({ id: row.id, status: "skipped_already_claimed" }); continue; }
      const { data: coupon, error: couponError } = await ctx.supabaseAdmin.from("coupons")
        .select("id,marketplace,coupon_code,discount_type,discount_value,min_purchase_amount,max_discount_amount,expires_at,starts_at,activation_url,terms_text,status,verified_at,last_seen_at")
        .eq("id", row.coupon_id).maybeSingle();
      if (couponError) throw couponError;
      const { data: channel, error: channelError } = await ctx.supabaseAdmin.from("channels")
        .select("id,name,type,identifier,active").eq("id", row.channel_id).maybeSingle();
      if (channelError) throw channelError;
      const staleMs = now.getTime() - 48 * 60 * 60 * 1000;
      const valid = coupon && coupon.status === "active" && new Date(coupon.expires_at) > now &&
        (!coupon.starts_at || new Date(coupon.starts_at) <= now) &&
        new Date(coupon.verified_at).getTime() >= staleMs && new Date(coupon.last_seen_at).getTime() >= staleMs &&
        safeLink(coupon.activation_url, coupon.marketplace);
      if (!valid) {
        await ctx.supabaseAdmin.from("coupon_publications").update({ status: "cancelled", error_message: "Cupom expirado, desativado, desatualizado ou com link inválido.", updated_at: now.toISOString() }).eq("id", row.id);
        results.push({ id: row.id, status: "cancelled", reason: "coupon_not_current" }); continue;
      }
      if (!channel || !channel.active || channel.type !== "telegram" || !channel.identifier) {
        await ctx.supabaseAdmin.from("coupon_publications").update({ status: "failed", error_message: "Canal Telegram indisponível.", next_retry_at: new Date(now.getTime()+3600000).toISOString(), updated_at: new Date().toISOString() }).eq("id", row.id);
        results.push({ id: row.id, status: "failed", reason: "channel_unavailable" }); continue;
      }
      const response = await fetch("https://api.telegram.org/bot" + botToken + "/sendMessage", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: channel.identifier, text: buildText(coupon), disable_web_page_preview: false })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) {
        const attempt = Number(row.attempts || 0) + 1;
        const retryHours = Math.min(2 ** Math.min(attempt, 4), 24);
        const message = result?.description || "Telegram HTTP " + response.status;
        await ctx.supabaseAdmin.from("coupon_publications").update({ status: "failed", error_message: message, next_retry_at: new Date(Date.now() + retryHours * 3600000).toISOString(), updated_at: new Date().toISOString() }).eq("id", row.id);
        results.push({ id: row.id, status: "failed", error: message });
      } else {
        await ctx.supabaseAdmin.from("coupon_publications").update({ status: "published", external_post_id: String(result.result?.message_id ?? "") || null, published_at: new Date().toISOString(), error_message: null, next_retry_at: null, updated_at: new Date().toISOString() }).eq("id", row.id);
        results.push({ id: row.id, status: "published", channel: channel.name });
      }
    }
    return json({ ok: true, processed: results.length, results });
  } catch (error) {
    console.error("coupon-telegram-publisher", error);
    return json({ error: error instanceof Error ? error.message : "INTERNAL_ERROR" }, 500);
  }
}));
