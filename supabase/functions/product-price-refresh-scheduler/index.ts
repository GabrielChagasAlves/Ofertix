import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SECRET_KEYS_RAW = Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}";
let INTERNAL_REFRESH_KEY = "";
try {
  const secretKeys = JSON.parse(SECRET_KEYS_RAW);
  INTERNAL_REFRESH_KEY = String(secretKeys["default"] ?? "");
} catch {
  INTERNAL_REFRESH_KEY = "";
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

function json(body: unknown, status=200) {
  return Response.json(body, { status });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({success:false,error:"Use POST."},405);

  const { data: secretRow } = await supabase
    .from("automation_secrets")
    .select("secret")
    .eq("name","product_price_refresh_scheduler")
    .maybeSingle();

  const supplied = req.headers.get("x-ofertix-cron-secret");
  if (!secretRow?.secret || !supplied || supplied !== secretRow.secret) {
    return json({success:false,error:"Não autorizado."},401);
  }
  if (!INTERNAL_REFRESH_KEY) {
    return json({success:false,error:"A chave Supabase nomeada 'chave_n8n_24' não está disponível em SUPABASE_SECRET_KEYS."},500);
  }

  const body = await req.json().catch(() => ({}));
  const requestedLimit = Number(body?.limit ?? 50);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1,Math.min(10,Math.floor(requestedLimit))) : 10;

  const { data: marketplace, error: marketplaceError } = await supabase
    .from("marketplaces").select("id").eq("slug","mercado_livre").maybeSingle();
  if (marketplaceError || !marketplace) {
    return json({success:false,error:marketplaceError?.message ?? "Mercado Livre não cadastrado."},500);
  }

  const recentSince = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data: recentFailures, error: failuresError } = await supabase
    .from("automation_run_items").select("item_id,created_at,details")
    .eq("function_name","product-price-refresh-scheduler").eq("status","failed")
    .gte("created_at",recentSince).order("created_at",{ascending:false}).limit(5000);
  if (failuresError) return json({success:false,error:"Falha ao consultar tentativas recentes: "+failuresError.message},500);
  const retryAfterByProduct = new Map<string, number>();
  for (const failure of recentFailures ?? []) {
    const itemId = String(failure.item_id ?? "");
    if (!itemId || retryAfterByProduct.has(itemId)) continue;
    const status = Number(failure.details?.http_status ?? 0);
    retryAfterByProduct.set(itemId, new Date(failure.created_at).getTime() + (status === 429 ? 60 : 360) * 60 * 1000);
  }
  const selected: any[] = [];
  const pageSize = 250;
  for (let offset = 0; offset < 5000 && selected.length < limit; offset += pageSize) {
    const { data: page, error: pageError } = await supabase.from("products")
      .select("id,external_id,title,price,original_price,price_synced_at,updated_at")
      .eq("marketplace_id",marketplace.id).eq("active",true)
      .order("price_synced_at",{ascending:true,nullsFirst:true})
      .order("updated_at",{ascending:true}).range(offset,offset+pageSize-1);
    if (pageError) return json({success:false,error:"Falha ao selecionar produtos: "+pageError.message},500);
    if (!page?.length) break;
    const now = Date.now();
    for (const product of page) {
      if ((retryAfterByProduct.get(String(product.id)) ?? 0) > now) continue;
      selected.push(product);
      if (selected.length >= limit) break;
    }
    if (page.length < pageSize) break;
  }
  const startedAt = new Date().toISOString();
  const { data: run, error: runError } = await supabase.from("automation_runs").insert({
    function_name: "product-price-refresh-scheduler",
    status: "running",
    started_at: startedAt,
    metrics: { selected: selected.length, source: "supabase_scheduler" },
  }).select("id").single();
  if (runError || !run) return json({success:false,error:"Não foi possível registrar a execução do atualizador de preços."},500);
  if (!selected.length) {
    await supabase.from("automation_runs").update({
      status: "succeeded", finished_at: new Date().toISOString(), duration_ms: Date.now()-new Date(startedAt).getTime(),
      products_processed: 0, products_updated: 0, errors_count: 0,
      metrics: { selected: 0, updated: 0, failed: 0, source: "supabase_scheduler" },
    }).eq("id",run.id);
    return json({success:true,selected:0,updated:0,failed:0,results:[]});
  }

  let cursor=0, updated=0, failed=0;
  const results: any[]=[];
  const worker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= selected.length) return;
      const selectedProduct = selected[index];
      const productId = selectedProduct.id;
      try {
        const response = await fetch(SUPABASE_URL + "/functions/v1/n8n-product-refresh", {
          method:"POST",
          headers:{
            "Content-Type":"application/json",
            "apikey":INTERNAL_REFRESH_KEY
          },
          body:JSON.stringify({product_id:productId}),
          signal:AbortSignal.timeout(30000)
        });
        const payload = await response.json().catch(() => ({}));
        const ok = response.ok && payload?.success === true;
        if (ok) updated++; else failed++;
        results.push({product_id:productId,external_id:selectedProduct.external_id,title:selectedProduct.title,success:ok,status:response.status,error:ok?undefined:([payload?.error,payload?.item_endpoint_error].filter(Boolean).join(" | ") || "Falha sem detalhe"),http_status:response.status,previous_price:payload?.previous_price ?? selectedProduct.price,current_price:payload?.current_price ?? null,previous_original_price:payload?.previous_original_price ?? selectedProduct.original_price,current_original_price:payload?.current_original_price ?? null,listings_updated:payload?.listings_updated ?? 0,selected_item_id:payload?.selected_item_id ?? null});
      } catch (err) {
        failed++;
        results.push({product_id:productId,external_id:selectedProduct.external_id,title:selectedProduct.title,success:false,error:err instanceof Error?err.message:"Erro desconhecido",previous_price:selectedProduct.price,current_price:null});
      }
    }
  };
  await Promise.all(Array.from({length:2},()=>worker()));

  const itemRows = results.map((item) => ({
    run_id: run.id,
    function_name: "product-price-refresh-scheduler",
    item_type: "product",
    item_id: item.product_id,
    external_id: item.external_id,
    title: item.title,
    status: item.success ? "updated" : "failed",
    action: item.success ? "price_refreshed" : "price_refresh_failed",
    message: item.success ? "Preço consultado e atualizado." : item.error,
    details: {
      http_status: item.http_status ?? item.status ?? null,
      previous_price: item.previous_price ?? null,
      current_price: item.current_price ?? null,
      previous_original_price: item.previous_original_price ?? null,
      current_original_price: item.current_original_price ?? null,
      listings_updated: item.listings_updated ?? 0,
      selected_item_id: item.selected_item_id ?? null,
    },
  }));
  const { error: itemsError } = await supabase.from("automation_run_items").insert(itemRows);
  if (itemsError) console.error("Falha ao salvar auditoria individual dos preços:", itemsError.message);

  await supabase.from("automation_runs").update({
    status: failed === selected.length ? "failed" : "succeeded",
    finished_at: new Date().toISOString(),
    duration_ms: Date.now()-new Date(startedAt).getTime(),
    products_processed: selected.length,
    products_updated: updated,
    errors_count: failed,
    metrics: { selected: selected.length, updated, failed, concurrency: 2, source: "supabase_scheduler" },
    error_message: failed ? failed + " produto(s) não tiveram o preço atualizado." : null,
  }).eq("id",run.id);

  return json({
    success:true,
    selected:selected.length,
    updated,
    failed,
    concurrency:2,
    results
  });
});