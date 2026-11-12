import { withSupabase } from "npm:@supabase/server";

const json = (body: unknown, status = 200) => Response.json(body, { status });
const hash = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
};
const allowedActivationHosts: Record<string, string[]> = {
  shopee: ["shopee.com.br", "s.shopee.com.br", "shp.ee"],
  mercado_livre: ["mercadolivre.com.br", "meli.la", "mercadolivre.com"],
};
const validHttpsUrl = (value: unknown) => {
  if (typeof value !== "string") return null;
  try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password ? u : null; }
  catch { return null; }
};
const hostAllowed = (host: string, allowed: string[]) => allowed.some((d) => host === d || host.endsWith("." + d));

Deno.serve(withSupabase({ auth: "secret" }, async (req, ctx) => {
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const body = await req.json();
    const sourceId = typeof body?.source_id === "string" ? body.source_id : "";
    const records = Array.isArray(body?.coupons) ? body.coupons : [];
    if (!sourceId || records.length < 1 || records.length > 100) return json({ error: "INVALID_BATCH", detail: "Informe source_id e de 1 a 100 cupons." }, 400);

    const { data: source, error: sourceError } = await ctx.supabaseAdmin
      .from("coupon_sources").select("id,marketplace,source_name,base_url,enabled")
      .eq("id", sourceId).maybeSingle();
    if (sourceError) throw sourceError;
    if (!source || !source.enabled) return json({ error: "SOURCE_DISABLED_OR_NOT_FOUND" }, 409);

    const base = validHttpsUrl(source.base_url);
    if (!base) return json({ error: "SOURCE_URL_INVALID" }, 409);
    const runResult = await ctx.supabaseAdmin.from("coupon_collection_runs")
      .insert({ source_id: sourceId, status: "running", items_seen: records.length })
      .select("id").single();
    if (runResult.error) throw runResult.error;
    const runId = runResult.data.id;

    let inserted = 0, updated = 0, queued = 0, rejected = 0;
    const errors: string[] = [];
    for (const raw of records) {
      const r = raw && typeof raw === "object" ? raw : {};
      const code = typeof r.coupon_code === "string" ? r.coupon_code.trim().toUpperCase() : "";
      const discountType = r.discount_type;
      const discountValue = Number(r.discount_value);
      const expiresAt = typeof r.expires_at === "string" ? new Date(r.expires_at) : null;
      const activation = validHttpsUrl(r.activation_url);
      const sourceUrl = validHttpsUrl(r.source_url);
      const startsAt = typeof r.starts_at === "string" ? new Date(r.starts_at) : null;
      const minPurchase = r.min_purchase_amount == null ? null : Number(r.min_purchase_amount);
      const maxDiscount = r.max_discount_amount == null ? null : Number(r.max_discount_amount);
      const now = new Date();
      const codeValid = /^[A-Z0-9_-]{3,40}$/.test(code);
      const timeValid = expiresAt && Number.isFinite(expiresAt.getTime()) && expiresAt > now &&
        (!startsAt || (Number.isFinite(startsAt.getTime()) && startsAt < expiresAt && startsAt <= now));
      const amountValid = Number.isFinite(discountValue) && discountValue > 0 &&
        (minPurchase === null || (Number.isFinite(minPurchase) && minPurchase >= 0)) &&
        (maxDiscount === null || (Number.isFinite(maxDiscount) && maxDiscount >= 0));
      const sourceHostValid = sourceUrl && (sourceUrl.hostname === base.hostname || sourceUrl.hostname.endsWith("." + base.hostname));
      const activationHostValid = activation && hostAllowed(activation.hostname, allowedActivationHosts[source.marketplace] ?? []);
      if (!codeValid || !["fixed_amount","percentage"].includes(discountType) || !amountValid ||
          !timeValid || !sourceHostValid || !activationHostValid) {
        rejected++;
        errors.push("Registro rejeitado: código, desconto, datas ou domínios não passaram na validação.");
        continue;
      }
      const externalId = typeof r.external_coupon_id === "string" ? r.external_coupon_id.slice(0,200) : null;
      const terms = typeof r.terms_text === "string" ? r.terms_text.slice(0,1500) : null;
      const contentHash = await hash(JSON.stringify({ code, discountType, discountValue, minPurchase, maxDiscount, startsAt: startsAt?.toISOString() ?? null, expiresAt: expiresAt.toISOString(), activation: activation.toString(), sourceUrl: sourceUrl.toString(), terms }));
      const payload = {
        source_id: sourceId, marketplace: source.marketplace, external_coupon_id: externalId,
        coupon_code: code, discount_type: discountType, discount_value: discountValue,
        min_purchase_amount: minPurchase, max_discount_amount: maxDiscount,
        starts_at: startsAt?.toISOString() ?? null, expires_at: expiresAt.toISOString(),
        activation_url: activation.toString(), source_url: sourceUrl.toString(),
        source_name: source.source_name, terms_text: terms, status: "active",
        verified_at: now.toISOString(), last_seen_at: now.toISOString(), content_hash: contentHash,
        updated_at: now.toISOString()
      };
      let existingQuery = ctx.supabaseAdmin.from("coupons").select("id,content_hash")
        .eq("source_id", sourceId).eq("marketplace", source.marketplace).eq("coupon_code", code).maybeSingle();
      const { data: existing, error: findError } = await existingQuery;
      if (findError) throw findError;
      let couponId: string;
      if (existing) {
        couponId = existing.id;
        if (existing.content_hash !== contentHash) {
          const { error } = await ctx.supabaseAdmin.from("coupons").update(payload).eq("id", couponId);
          if (error) throw error;
          updated++;
        } else {
          const { error } = await ctx.supabaseAdmin.from("coupons")
            .update({ verified_at: now.toISOString(), last_seen_at: now.toISOString(), expires_at: expiresAt.toISOString(), status: "active", updated_at: now.toISOString() })
            .eq("id", couponId);
          if (error) throw error;
        }
      } else {
        const { data, error } = await ctx.supabaseAdmin.from("coupons").insert(payload).select("id").single();
        if (error) throw error;
        couponId = data.id;
        inserted++;
      }
      const { data: channels, error: channelsError } = await ctx.supabaseAdmin.from("channels")
        .select("id").eq("type","telegram").eq("active",true).eq("auto_publish",true);
      if (channelsError) throw channelsError;
      if (channels?.length) {
        const rows = channels.map((c: {id:string}) => ({ coupon_id: couponId, channel_id: c.id, status: "pending" }));
        const { error: queueError } = await ctx.supabaseAdmin.from("coupon_publications")
          .upsert(rows, { onConflict: "coupon_id,channel_id", ignoreDuplicates: true });
        if (queueError) throw queueError;
        queued += rows.length;
      }
    }
    const status = rejected === records.length ? "failed" : rejected > 0 ? "partial" : "succeeded";
    await ctx.supabaseAdmin.from("coupon_collection_runs").update({
      status, finished_at: new Date().toISOString(), coupons_inserted: inserted,
      coupons_updated: updated, publications_queued: queued,
      error_message: errors.length ? errors.slice(0,5).join(" | ") : null
    }).eq("id", runId);
    await ctx.supabaseAdmin.from("coupon_sources").update({
      last_checked_at: new Date().toISOString(),
      last_success_at: rejected < records.length ? new Date().toISOString() : null,
      last_error: errors.length ? errors.slice(0,5).join(" | ") : null,
      updated_at: new Date().toISOString()
    }).eq("id", sourceId);
    return json({ ok: rejected < records.length, run_id: runId, seen: records.length, inserted, updated, queued, rejected });
  } catch (error) {
    console.error("coupon-ingest", error);
    return json({ error: error instanceof Error ? error.message : "INTERNAL_ERROR" }, 500);
  }
}));
