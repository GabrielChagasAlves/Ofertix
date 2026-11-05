import { createClient } from "npm:@supabase/supabase-js@2";

const FUNCTION_NAME = "mercado-livre-product-discovery";
const SECRET_NAME = "mercado_livre_product_discovery";
const TOKEN_URL = "https://api.mercadolibre.com/oauth/token";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-ofertix-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const rawKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!url || !rawKeys) throw new Error("Configuração administrativa do Supabase ausente.");
  let keys: Record<string, string>;
  try { keys = JSON.parse(rawKeys); } catch { throw new Error("SUPABASE_SECRET_KEYS não contém JSON válido."); }
  const key = keys.default;
  if (!key) throw new Error("Chave secreta padrão do Supabase não encontrada.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function numberOrNull(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : fallback;
}

async function readRunSecret(db: ReturnType<typeof createClient>) {
  const { data, error } = await db.from("automation_secrets")
    .select("secret").eq("name", SECRET_NAME).maybeSingle();
  if (error) throw new Error("Não foi possível validar a chave interna de execução.");
  if (!data?.secret) throw new Error("Chave interna de execução não configurada.");
  return String(data.secret);
}

async function refreshAccessToken(db: ReturnType<typeof createClient>, connection: Record<string, any>) {
  const clientId = Deno.env.get("MERCADO_LIVRE_CLIENT_ID");
  const clientSecret = Deno.env.get("MERCADO_LIVRE_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("Credenciais OAuth do Mercado Livre não configuradas.");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: String(connection.refresh_token),
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    console.error("Falha ao renovar token do Mercado Livre", { status: res.status, error: data?.error });
    throw new Error("Não foi possível renovar o token do Mercado Livre. Reconecte a conta nas configurações.");
  }

  const expiresAt = new Date(Date.now() + Number(data.expires_in || 21600) * 1000).toISOString();
  const update = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || connection.refresh_token,
    token_expires_at: expiresAt,
    scope: data.scope || connection.scope || null,
    active: true,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db.from("marketplace_connections").update(update).eq("id", connection.id);
  if (error) throw new Error("Token renovado, mas não foi possível salvar a conexão.");
  return { ...connection, ...update };
}

async function getUsableConnection(db: ReturnType<typeof createClient>, marketplaceId: string) {
  const { data, error } = await db.from("marketplace_connections")
    .select("id, marketplace_id, external_user_id, access_token, refresh_token, token_expires_at, scope, active")
    .eq("marketplace_id", marketplaceId).eq("active", true).maybeSingle();
  if (error) throw new Error("Erro ao consultar a conexão OAuth do Mercado Livre.");
  if (!data) throw new Error("Mercado Livre não está conectado. Conecte a conta nas configurações do Ofertix.");
  if (new Date(data.token_expires_at).getTime() < Date.now() + 5 * 60 * 1000) {
    return await refreshAccessToken(db, data);
  }
  return data;
}

async function searchTerm(term: string, limit: number, accessToken: string) {
  // O buscador de catálogo retorna produtos, não necessariamente anúncios.
  // Para cada produto, consultar as publicações associadas; nunca contornar 403.
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
  const url = new URL("https://api.mercadolibre.com/products/search");
  url.searchParams.set("status", "active");
  url.searchParams.set("site_id", "MLB");
  url.searchParams.set("q", term);
  url.searchParams.set("limit", String(Math.min(limit, 50)));
  const res = await fetch(url, { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(`Busca de catálogo Mercado Livre falhou (HTTP ${res.status}).`);
    (error as any).status = res.status;
    throw error;
  }
  const products = Array.isArray(data.results) ? data.results : [];
  const enriched: any[] = [];
  let candidatesWithListings = 0;
  let listingDetailsForbidden = 0;
  for (const candidate of products) {
    if (enriched.length >= limit) break;
    if (!candidate?.id) continue;
    let detail = candidate;
    if (!candidate.status || !Array.isArray(candidate.pictures)) {
      const dr = await fetch(`https://api.mercadolibre.com/products/${encodeURIComponent(candidate.id)}`, { headers });
      detail = await dr.json().catch(() => ({}));
      if (!dr.ok) {
        const error = new Error(`Detalhe do catálogo falhou (HTTP ${dr.status}).`);
        (error as any).status = dr.status;
        throw error;
      }
    }
    if (String(detail.status || "").toLowerCase() !== "active") continue;
    const ir = await fetch(`https://api.mercadolibre.com/products/${encodeURIComponent(candidate.id)}/items`, { headers });
    const idata = await ir.json().catch(() => ({}));
    let catalogItems: any[] = [];
    if (ir.ok) catalogItems = Array.isArray(idata.results) ? idata.results : [];
    else if (ir.status === 403) { listingDetailsForbidden++; continue; }
    else if (ir.status !== 404) {
      const error = new Error(`Consulta de publicações do catálogo falhou (HTTP ${ir.status}).`);
      (error as any).status = ir.status;
      throw error;
    }
    const activeItems = catalogItems.filter((x: any) =>
      String(x?.status || "active").toLowerCase() === "active" && (x?.item_id || x?.id)
    );
    // O detalhe do catálogo pode trazer preço e vendedor do buy_box_winner mesmo
    // quando /items/{id} está bloqueado. Mesclar esses campos ao ID real da publicação.
    const winner = detail.buy_box_winner?.item_id
      ? { ...detail.buy_box_winner, item_id: String(detail.buy_box_winner.item_id), status: "active" }
      : null;
    if (winner) {
      const winnerIndex = activeItems.findIndex((x: any) => String(x.item_id || x.id) === winner.item_id);
      if (winnerIndex >= 0) activeItems[winnerIndex] = { ...activeItems[winnerIndex], ...winner };
      else if (!activeItems.length) activeItems.push(winner);
    }
    candidatesWithListings += activeItems.length;
    for (const item of activeItems) {
      if (enriched.length >= limit) break;
      const itemId = String(item.item_id || item.id);
      let listing: any = item;
      // Só pedir o detalhe do anúncio quando o preço realmente não veio no catálogo.
      // O título pode ser recuperado do produto de catálogo sem outra chamada.
      if (numberOrNull(listing.price) === null) {
        const lr = await fetch(`https://api.mercadolibre.com/items/${encodeURIComponent(itemId)}`, { headers });
        const ld = await lr.json().catch(() => ({}));
        if (!lr.ok) {
          if (lr.status === 403) { listingDetailsForbidden++; }
          else if (lr.status !== 404) {
            const error = new Error(`Detalhe da publicação falhou (HTTP ${lr.status}).`);
            (error as any).status = lr.status;
            throw error;
          }
        } else {
          listing = { ...item, ...ld };
        }
      }
      const price = numberOrNull(listing.price);
      // Se a API não devolver permalink, usar o endereço canônico da publicação
      // a partir do ID real MLB, sem alterar nem fabricar link de afiliado.
      const permalinkSource = listing.permalink ? "api" : "canonical_from_item_id";
      const permalink = listing.permalink ||
        (/^MLB\d+$/i.test(itemId) ? `https://produto.mercadolivre.com.br/MLB-${itemId.slice(3)}` : null);
      if (price === null || price <= 0 || !permalink) continue;
      const picture = Array.isArray(listing.pictures) ? listing.pictures[0] : (Array.isArray(detail.pictures) ? detail.pictures[0] : null);
      enriched.push({
        id: itemId, title: listing.title || detail.name || candidate.name || itemId,
        permalink_source: permalinkSource,
        category_id: listing.category_id || item.category_id || null,
        seller: { id: listing.seller_id ?? item.seller_id ?? null },
        price, original_price: numberOrNull(listing.original_price),
        currency_id: listing.currency_id || "BRL",
        available_quantity: numberOrNull(listing.available_quantity),
        sold_quantity: numberOrNull(listing.sold_quantity), shipping: listing.shipping ?? null,
        condition: listing.item_condition || listing.condition || null,
        listing_type_id: listing.listing_type_id || null, permalink,
        thumbnail: listing.thumbnail || picture?.secure_url || picture?.url || null,
        attributes: listing.attributes || detail.attributes || candidate.attributes || [],
      });
    }
  }
  Object.assign(enriched, { catalogCandidates: products.length, candidatesWithWinner: candidatesWithListings, listingDetailsForbidden });
  return enriched;
}
function getBrand(item: Record<string, any>, existing: Record<string, any> | undefined) {
  const attributes = Array.isArray(item.attributes) ? item.attributes : [];
  const attr = attributes.find((a: any) => ["BRAND", "MARCA"].includes(String(a.id || "").toUpperCase())
    || ["brand", "marca"].includes(String(a.name || "").toLowerCase()));
  return attr?.value_name || existing?.brand || null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ ok: false, error: "Use POST para executar a sincronização." }, 405);

  const startedAt = Date.now();
  let db: ReturnType<typeof createClient>;
  try {
    db = adminClient();
  } catch (error) {
    return response({ ok: false, error: error instanceof Error ? error.message : "Falha de configuração." }, 500);
  }

  try {
    const expectedSecret = await readRunSecret(db);
    const suppliedSecret = req.headers.get("x-ofertix-cron-secret") || "";
    if (!suppliedSecret || suppliedSecret.length !== expectedSecret.length || suppliedSecret !== expectedSecret) {
      return response({ ok: false, error: "Não autorizado." }, 401);
    }
  } catch (error) {
    console.error("Falha de autenticação da função", error);
    return response({ ok: false, error: error instanceof Error ? error.message : "Falha de autenticação." }, 503);
  }

  let body: Record<string, any> = {};
  try { body = await req.json(); } catch { /* corpo opcional */ }
  const termLimit = clamp(body.term_limit, 12, 1, 30);
  const resultLimit = clamp(body.result_limit, 30, 10, 50);
  const dryRun = body.dry_run === true;

  let runId: string | null = null;
  const metrics: Record<string, any> = {
    source: body.source || "manual",
    dry_run: dryRun,
    term_limit: termLimit,
    result_limit: resultLimit,
    terms_selected: 0,
    terms_succeeded: 0,
    terms_failed: 0,
    items_seen: 0,
    unique_items: 0,
    products_created: 0,
    products_updated: 0,
    listings_upserted: 0,
    term_diagnostics: [],
  };
  const termErrors: Array<{ term: string; error: string }> = [];

  try {
    const { data: run, error: runError } = await db.from("automation_runs").insert({
      function_name: FUNCTION_NAME,
      status: "running",
      started_at: new Date(startedAt).toISOString(),
      metrics,
    }).select("id").single();
    if (runError) throw new Error("Não foi possível registrar a execução da automação.");
    runId = run.id;

    const { data: marketplace, error: marketplaceError } = await db.from("marketplaces")
      .select("id").eq("slug", "mercado_livre").eq("active", true).maybeSingle();
    if (marketplaceError || !marketplace) throw new Error("Marketplace Mercado Livre não encontrado ou inativo.");

    const connection = await getUsableConnection(db, marketplace.id);
    let termsQuery = db.from("search_terms")
      .select("id, term, category_id, discovery_count, last_discovered_at")
      .eq("active", true);
    if (Array.isArray(body.term_ids) && body.term_ids.length > 0) {
      termsQuery = termsQuery.in("id", body.term_ids.slice(0, termLimit));
    } else {
      termsQuery = termsQuery
        .order("last_discovered_at", { ascending: true, nullsFirst: true })
        .order("discovery_count", { ascending: true });
    }
    const { data: terms, error: termsError } = await termsQuery.limit(termLimit);
    if (termsError) throw new Error("Não foi possível carregar os termos ativos de busca.");
    if (!terms?.length) {
      metrics.message = "Nenhum termo de busca ativo.";
    } else {
      metrics.terms_selected = terms.length;
      const resultsByTerm = new Map<string, any[]>();
      let next = 0;
      const workers = Array.from({ length: Math.min(3, terms.length) }, async () => {
        while (true) {
          const index = next++;
          if (index >= terms.length) return;
          const term = terms[index];
          try {
            let results: any[];
            try {
              results = await searchTerm(term.term, resultLimit, connection.access_token);
            } catch (error) {
              if ((error as any)?.status === 401) {
                const refreshed = await refreshAccessToken(db, connection);
                connection.access_token = refreshed.access_token;
                connection.refresh_token = refreshed.refresh_token;
                connection.token_expires_at = refreshed.token_expires_at;
                results = await searchTerm(term.term, resultLimit, connection.access_token);
              } else throw error;
            }
            resultsByTerm.set(term.id, results);
            (metrics.term_diagnostics as any[]).push({ term: term.term, catalog_candidates: (results as any).catalogCandidates ?? results.length, candidates_with_listings: (results as any).candidatesWithWinner ?? results.length, listing_detail_forbidden: (results as any).listingDetailsForbidden ?? 0, usable_listings: results.length });
            metrics.terms_succeeded++;
            metrics.items_seen += results.length;
          } catch (error) {
            metrics.terms_failed++;
            termErrors.push({
              term: term.term,
              error: error instanceof Error ? error.message : "Erro desconhecido na busca.",
            });
          }
        }
      });
      await Promise.all(workers);

      const uniqueItems = new Map<string, { item: Record<string, any>; termIds: Set<string> }>();
      for (const term of terms) {
        for (const raw of resultsByTerm.get(term.id) || []) {
          const externalId = String(raw.id || "");
          if (!externalId || !raw.title || numberOrNull(raw.price) === null) continue;
          const found = uniqueItems.get(externalId);
          if (found) found.termIds.add(term.id);
          else uniqueItems.set(externalId, { item: raw, termIds: new Set([term.id]) });
        }
      }
      metrics.unique_items = uniqueItems.size;
      if (dryRun) {
        const sample = [...uniqueItems.values()].slice(0, 10).map(({ item }: any) => item);
        metrics.validation_sample = sample.map((item: any) => ({
          id: String(item.id || ""),
          title: item.title || null,
          price: numberOrNull(item.price),
          currency_id: item.currency_id || null,
          permalink: item.permalink || null,
          permalink_source: item.permalink_source || null,
          valid_price: numberOrNull(item.price) !== null && numberOrNull(item.price)! > 0,
          valid_item_id: /^MLB\d+$/i.test(String(item.id || "")),
          valid_permalink: typeof item.permalink === "string" && item.permalink.startsWith("https://"),
        }));
        // Diagnóstico somente leitura: testar se a busca pública oficial de anúncios permite
        // confirmar preço/link exatos quando /items/{id} e /items/bulk retornam 403.
        // Não usar resultados aproximados: só aceitar correspondência pelo ID exato do anúncio.
        if (sample.length) {
          const searchChecks: any[] = [];
          for (const candidate of sample.slice(0, 5)) {
            const id = String(candidate.id || "");
            const title = String(candidate.title || "").slice(0, 100);
            const searchUrl = new URL("https://api.mercadolibre.com/sites/MLB/search");
            searchUrl.searchParams.set("q", title);
            searchUrl.searchParams.set("limit", "50");
            try {
              const sr = await fetch(searchUrl, {
                headers: { Authorization: `Bearer ${connection.access_token}`, Accept: "application/json" },
              });
              const sd = await sr.json().catch(() => ({}));
              const found = Array.isArray(sd.results) ? sd.results.find((x: any) => String(x.id || "") === id) : null;
              searchChecks.push({
                requested_id: id,
                http_status: sr.status,
                query: title,
                exact_id_found: !!found,
                search_price: found ? numberOrNull(found.price) : null,
                catalog_price: numberOrNull(candidate.price),
                price_match: !!found && numberOrNull(found.price) === numberOrNull(candidate.price),
                api_permalink_present: !!found?.permalink,
                permalink_host: found?.permalink ? (() => { try { return new URL(found.permalink).hostname; } catch { return null; } })() : null,
                search_result_count: Array.isArray(sd.results) ? sd.results.length : 0,
                error: sr.ok ? null : (sd?.message || sd?.error || `HTTP ${sr.status}`),
              });
            } catch (e) {
              searchChecks.push({ requested_id: id, http_status: 0, exact_id_found: false, error: String(e) });
            }
          }
          metrics.site_search_validation = {
            endpoint: "/sites/MLB/search",
            checked_at: new Date().toISOString(),
            exact_id_matches: searchChecks.filter(x => x.exact_id_found).length,
            checked: searchChecks,
          };

          const ids = sample.map((item: any) => String(item.id)).filter((id: string) => /^MLB\d+$/i.test(id));
          const bulkUrl = new URL("https://api.mercadolibre.com/items/bulk");
          bulkUrl.searchParams.set("ids", ids.join(","));
          const bulkResponse = await fetch(bulkUrl, {
            headers: { Authorization: `Bearer ${connection.access_token}`, Accept: "application/json" },
          });
          const bulkPayload = await bulkResponse.json().catch(() => ({}));
          metrics.listing_validation = {
            endpoint_http_status: bulkResponse.status,
            checked_at: new Date().toISOString(),
            results: Array.isArray(bulkPayload) ? bulkPayload.map((entry: any) => {
              const expected = sample.find((item: any) => String(item.id) === String(entry.id || entry.body?.id));
              const body = entry.body || {};
              const itemStatus = Number(entry.status_code ?? entry.code ?? bulkResponse.status);
              return {
                id: String(entry.id || body.id || ""),
                http_status: itemStatus,
                title_match: itemStatus === 200 && Boolean(expected?.title) && String(body.title || "").trim() === String(expected.title).trim(),
                catalog_price: numberOrNull(expected?.price),
                api_price: numberOrNull(body.price),
                price_match: itemStatus === 200 && numberOrNull(expected?.price) !== null && numberOrNull(body.price) === numberOrNull(expected?.price),
                api_status: body.status || null,
                api_permalink: body.permalink || null,
                api_permalink_present: typeof body.permalink === "string" && body.permalink.startsWith("https://"),
                constructed_permalink: expected?.permalink_source === "canonical_from_item_id" ? expected?.permalink : null,
                error: itemStatus === 200 ? null : (body.message || body.error || entry.message || "A API não autorizou a consulta do anúncio."),
              };
            }) : [],
          };
        }
      }

      if (!dryRun && uniqueItems.size) {
        const externalIds = [...uniqueItems.keys()];
        const { data: oldProducts, error: oldProductsError } = await db.from("products")
          .select("*").eq("marketplace_id", marketplace.id).in("external_id", externalIds);
        if (oldProductsError) throw new Error("Não foi possível consultar produtos já cadastrados.");
        const oldProductMap = new Map((oldProducts || []).map((p: any) => [String(p.external_id), p]));
        const now = new Date().toISOString();

        const productRows = [...uniqueItems.entries()].map(([externalId, entry]) => {
          const item = entry.item;
          const old: any = oldProductMap.get(externalId);
          const price = numberOrNull(item.price);
          const originalPrice = numberOrNull(item.original_price) ?? old?.original_price ?? null;
          const discount = originalPrice && price !== null && originalPrice > price
            ? Math.round(((originalPrice - price) / originalPrice) * 10000) / 100
            : null;
          return {
            id: old?.id || crypto.randomUUID(),
            marketplace_id: marketplace.id,
            external_id: externalId,
            title: String(item.title).slice(0, 1000),
            description: old?.description ?? null,
            category: item.category_id || old?.category || null,
            brand: getBrand(item, old),
            price,
            original_price: originalPrice,
            discount_percent: discount,
            image_url: item.thumbnail || old?.image_url || null,
            product_url: item.permalink || old?.product_url || null,
            affiliate_url: old?.affiliate_url ?? null,
            currency: item.currency_id || old?.currency || "BRL",
            active: old?.active ?? true,
            last_seen_at: now,
            created_at: old?.created_at || now,
            updated_at: now,
            availability_status: old?.availability_status || "unknown",
            last_availability_check: old?.last_availability_check ?? null,
            last_available_at: old?.last_available_at ?? null,
            last_unavailable_at: old?.last_unavailable_at ?? null,
            availability_error: old?.availability_error ?? null,
          };
        });

        const { data: savedProducts, error: saveProductsError } = await db.from("products")
          .upsert(productRows, { onConflict: "marketplace_id,external_id" })
          .select("id, external_id");
        if (saveProductsError) {
          console.error("Erro ao salvar produtos", saveProductsError);
          throw new Error("Falha ao salvar produtos no banco.");
        }
        const productIdByExternal = new Map((savedProducts || []).map((p: any) => [String(p.external_id), p.id]));
        metrics.products_created = externalIds.filter((id) => !oldProductMap.has(id)).length;
        metrics.products_updated = externalIds.length - metrics.products_created;

        const { data: activeRules, error: rulesError } = await db.from("offer_rules")
          .select("id, category, marketplace_id, min_price, max_price, min_discount_percent")
          .eq("active", true)
          .or(`marketplace_id.is.null,marketplace_id.eq.${marketplace.id}`);
        const { data: categories, error: categoriesError } = await db.from("offer_categories")
          .select("id, name").eq("active", true);
        if (rulesError || categoriesError) throw new Error("Não foi possível carregar as regras do Ofertix.");

        const categoryIdByName = new Map((categories || []).map((category: any) => [String(category.name), String(category.id)]));
        const termsById = new Map((terms || []).map((term: any) => [String(term.id), term]));
        const ruleMatches: Array<Record<string, unknown>> = [];
        for (const [externalId, entry] of uniqueItems.entries()) {
          const productId = productIdByExternal.get(externalId);
          if (!productId) continue;
          const item = entry.item;
          const price = numberOrNull(item.price);
          const originalPrice = numberOrNull(item.original_price);
          const discount = originalPrice && price !== null && originalPrice > price
            ? Math.round(((originalPrice - price) / originalPrice) * 10000) / 100
            : 0;
          const matchedCategoryIds = new Set(
            [...entry.termIds].map((termId) => termsById.get(String(termId))?.category_id).filter(Boolean).map(String),
          );
          for (const rule of activeRules || []) {
            const ruleCategoryId = rule.category ? categoryIdByName.get(String(rule.category)) : undefined;
            const minPrice = numberOrNull(rule.min_price);
            const maxPrice = numberOrNull(rule.max_price);
            const minDiscount = numberOrNull(rule.min_discount_percent) ?? 0;
            const qualifies = Boolean(ruleCategoryId && matchedCategoryIds.has(ruleCategoryId))
              && (minPrice === null || (price ?? 0) >= minPrice)
              && (maxPrice === null || (price ?? 0) <= maxPrice)
              && discount >= minDiscount;
            if (qualifies) ruleMatches.push({
              product_id: productId,
              rule_id: rule.id,
              status: "pending_affiliate",
              reason: "Produto do Mercado Livre compatível com termo e critérios da regra.",
              matched_at: now,
              updated_at: now,
            });
          }
        }
        if (ruleMatches.length) {
          const { error: matchesError } = await db.from("product_rule_matches").upsert(ruleMatches, {
            onConflict: "product_id,rule_id",
            ignoreDuplicates: true,
          });
          if (matchesError) throw new Error("Não foi possível registrar os vínculos de regra.");
        }
        metrics.rule_matches_created = ruleMatches.length;

        const { data: oldListings, error: oldListingsError } = await db.from("marketplace_listings")
          .select("*").eq("marketplace_id", marketplace.id).in("external_item_id", externalIds);
        if (oldListingsError) throw new Error("Não foi possível consultar anúncios já cadastrados.");
        const oldListingMap = new Map((oldListings || []).map((l: any) => [String(l.external_item_id), l]));

        const listingRows = [...uniqueItems.entries()].map(([externalId, entry]) => {
          const item = entry.item;
          const old: any = oldListingMap.get(externalId);
          const price = numberOrNull(item.price);
          const originalPrice = numberOrNull(item.original_price) ?? old?.original_price ?? null;
          const discount = originalPrice && price !== null && originalPrice > price
            ? Math.round(((originalPrice - price) / originalPrice) * 10000) / 100
            : null;
          return {
            id: old?.id || crypto.randomUUID(),
            product_id: productIdByExternal.get(externalId),
            marketplace_id: marketplace.id,
            external_item_id: externalId,
            seller_id: item.seller?.id != null ? String(item.seller.id) : old?.seller_id ?? null,
            price,
            original_price: originalPrice,
            discount_percent: discount,
            currency: item.currency_id || old?.currency || "BRL",
            category_id: item.category_id || old?.category_id || null,
            condition: item.condition || old?.condition || null,
            listing_type_id: item.listing_type_id || old?.listing_type_id || null,
            product_url: item.permalink || old?.product_url || null,
            image_url: item.thumbnail || old?.image_url || null,
            available_quantity: numberOrNull(item.available_quantity) ?? old?.available_quantity ?? null,
            sold_quantity: numberOrNull(item.sold_quantity) ?? old?.sold_quantity ?? null,
            shipping: item.shipping ?? old?.shipping ?? null,
            active: true,
            last_seen_at: now,
            created_at: old?.created_at || now,
            updated_at: now,
            seller_reputation_level: old?.seller_reputation_level ?? null,
            seller_power_seller_status: old?.seller_power_seller_status ?? null,
            seller_transactions_total: old?.seller_transactions_total ?? null,
            seller_transactions_completed: old?.seller_transactions_completed ?? null,
            seller_transactions_canceled: old?.seller_transactions_canceled ?? null,
            seller_positive_rating: old?.seller_positive_rating ?? null,
            seller_neutral_rating: old?.seller_neutral_rating ?? null,
            seller_negative_rating: old?.seller_negative_rating ?? null,
            quality_score: old?.quality_score ?? null,
            quality_reason: old?.quality_reason ?? {},
          };
        }).filter((row) => Boolean(row.product_id));

        if (listingRows.length) {
          const { error: listingsError } = await db.from("marketplace_listings")
            .upsert(listingRows, { onConflict: "marketplace_id,external_item_id" });
          if (listingsError) {
            console.error("Erro ao salvar anúncios", listingsError);
            throw new Error("Falha ao salvar anúncios do Mercado Livre.");
          }
        }
        metrics.listings_upserted = listingRows.length;

        for (const term of terms) {
          if (!resultsByTerm.has(term.id)) continue;
          const count = (resultsByTerm.get(term.id) || []).length;
          const { error } = await db.from("search_terms").update({
            discovery_count: Number(term.discovery_count || 0) + count,
            last_discovered_at: now,
            updated_at: now,
          }).eq("id", term.id);
          if (error) console.error("Não foi possível atualizar a data do termo", term.term, error);
        }
      }
    }

    metrics.term_errors = termErrors;
    const status = (metrics.terms_succeeded === 0 && metrics.terms_failed > 0) || (metrics.terms_selected > 0 && metrics.unique_items === 0) ? "failed" : "succeeded";
    if (metrics.terms_selected > 0 && metrics.unique_items === 0) metrics.message = "Nenhuma publicação utilizável foi encontrada; verifique as permissões/403 do Mercado Livre antes de ativar a rotina automática.";
    if (runId) {
      await db.from("automation_runs").update({
        status,
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        products_processed: metrics.unique_items,
        products_created: metrics.products_created,
        products_updated: metrics.products_updated,
        items_processed: metrics.items_seen,
        errors_count: metrics.terms_failed,
        metrics,
        error_message: termErrors.length ? termErrors.map((e) => `${e.term}: ${e.error}`).join(" | ").slice(0, 2000) : null,
      }).eq("id", runId);
    }
    return response({ ok: true, function: FUNCTION_NAME, status, ...metrics, duration_ms: Date.now() - startedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido na sincronização.";
    console.error("Falha na descoberta de produtos", message);
    if (runId) {
      await db.from("automation_runs").update({
        status: "failed",
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        errors_count: Math.max(1, metrics.terms_failed || 0),
        metrics: { ...metrics, fatal_error: message, term_errors: termErrors },
        error_message: message.slice(0, 2000),
      }).eq("id", runId);
    }
    return response({ ok: false, function: FUNCTION_NAME, error: message, metrics }, 500);
  }
});