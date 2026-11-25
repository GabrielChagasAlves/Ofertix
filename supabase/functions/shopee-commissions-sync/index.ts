import { createClient } from "npm:@supabase/supabase-js@2";

// Sincroniza as conversões/comissões do programa de afiliados da Shopee (somente leitura na Shopee).
// Chamada por pg_cron com o header x-ofertix-cron-secret. Idempotente: upsert por conversionId.
const FUNCTION_NAME = "shopee-commissions-sync";
const SHOPEE_URL = "https://open-api.affiliate.shopee.com.br/graphql";
const SHOPEE_MARKETPLACE_ID = "8d40bd91-f317-421a-942d-1d3af0bdd25c";
const PAGE_LIMIT = 100;
const MAX_PAGES = 20;
const MAX_DAYS = 89;

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json; charset=utf-8" } });
const sha256 = async (v: string) => {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
};
const num = (v: unknown): number | null => {
  const n = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : n;
};
const iso = (v: unknown): string | null => {
  const n = num(v);
  if (n === null || n <= 0) return null;
  return new Date((n > 1e12 ? n : n * 1000)).toISOString();
};

async function shopeeQuery(query: string, appId: string, appSecret: string) {
  const payload = JSON.stringify({ query });
  const ts = Math.floor(Date.now() / 1000).toString();
  const signature = await sha256(`${appId}${ts}${payload}${appSecret}`);
  const res = await fetch(SHOPEE_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `SHA256 Credential=${appId}, Timestamp=${ts}, Signature=${signature}` },
    body: payload,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (Array.isArray(data?.errors) && data.errors.length)) {
    const msg = data?.errors?.[0]?.message ?? `HTTP ${res.status}`;
    throw new Error("Shopee: " + String(msg).slice(0, 300));
  }
  return data?.data;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = (JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>).default ?? "";
  if (!url || !key) return json({ error: "SERVER_CONFIGURATION_ERROR" }, 503);
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: stored } = await db.from("automation_secrets").select("secret").eq("name", "shopee_commissions").maybeSingle();
  const supplied = req.headers.get("x-ofertix-cron-secret") ?? "";
  if (!stored?.secret || supplied.length !== stored.secret.length || (await sha256(supplied)) !== (await sha256(stored.secret))) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const days = Math.max(1, Math.min(MAX_DAYS, Math.floor(Number(body?.days) || 14)));
  const appId = Deno.env.get("SHOPEE_APP_ID")?.trim();
  const appSecret = Deno.env.get("SHOPEE_APP_SECRET")?.trim();
  if (!appId || !appSecret) return json({ error: "SHOPEE_CREDENTIALS_NOT_CONFIGURED" }, 503);

  const startedAt = Date.now();
  const { data: run } = await db.from("automation_runs").insert({
    function_name: FUNCTION_NAME, status: "running", started_at: new Date(startedAt).toISOString(), metrics: { days },
  }).select("id").single();

  try {
    const end = Math.floor(Date.now() / 1000);
    const start = end - days * 86400;
    const rows: Record<string, unknown>[] = [];
    let scrollId = "";
    let pages = 0;
    let truncated = false;
    while (true) {
      const scroll = scrollId ? `, scrollId: ${JSON.stringify(scrollId)}` : "";
      const q = `{ conversionReport(purchaseTimeStart: ${start}, purchaseTimeEnd: ${end}, limit: ${PAGE_LIMIT}${scroll}) { nodes { purchaseTime clickTime conversionId conversionStatus totalCommission netCommission utmContent orders { orderId orderStatus items { itemId itemName itemPrice qty actualAmount itemTotalCommission } } } pageInfo { hasNextPage scrollId } } }`;
      const data = await shopeeQuery(q, appId, appSecret);
      const report = data?.conversionReport;
      for (const n of report?.nodes ?? []) {
        const id = String(n?.conversionId ?? "").trim();
        const purchase = iso(n?.purchaseTime);
        if (!id || !purchase) continue;
        const items = (n?.orders ?? []).flatMap((o: any) => (o?.items ?? []).map((i: any) => ({ order_id: o?.orderId ?? null, order_status: o?.orderStatus ?? null, ...i })));
        rows.push({
          marketplace_id: SHOPEE_MARKETPLACE_ID,
          external_id: id,
          purchase_time: purchase,
          click_time: iso(n?.clickTime),
          status: String(n?.conversionStatus ?? "pending").trim().toLowerCase() || "pending",
          total_commission: num(n?.totalCommission) ?? 0,
          net_commission: num(n?.netCommission),
          sub_ids: n?.utmContent ? String(n.utmContent) : null,
          items,
          raw: n,
          synced_at: new Date().toISOString(),
        });
      }
      pages++;
      if (!report?.pageInfo?.hasNextPage || !report?.pageInfo?.scrollId) break;
      if (pages >= MAX_PAGES) { truncated = true; break; }
      scrollId = String(report.pageInfo.scrollId);
    }

    let upserted = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { error } = await db.from("affiliate_commissions").upsert(chunk, { onConflict: "marketplace_id,external_id" });
      if (error) throw new Error("Falha ao gravar comissões: " + error.message);
      upserted += chunk.length;
    }

    const metrics = { days, pages, fetched: rows.length, upserted, truncated };
    if (run?.id) await db.from("automation_runs").update({ status: "succeeded", finished_at: new Date().toISOString(), duration_ms: Date.now() - startedAt, items_processed: upserted, metrics }).eq("id", run.id);
    return json({ ok: true, ...metrics });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    console.error(FUNCTION_NAME, message);
    if (run?.id) await db.from("automation_runs").update({ status: "failed", finished_at: new Date().toISOString(), duration_ms: Date.now() - startedAt, errors_count: 1, error_message: message.slice(0, 2000) }).eq("id", run.id);
    return json({ ok: false, error: message }, 500);
  }
});
