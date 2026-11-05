import { createClient } from "npm:@supabase/supabase-js@2";

type RecordValue = Record<string, unknown>;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
const SERVICE_KEY = secretKeys.default ?? "";
const SHOPEE_URL = "https://open-api.affiliate.shopee.com.br/graphql";
const BATCH_SIZE = 250;

const FEEDS_QUERY = `query ListItemFeeds {
  listItemFeeds(feedMode: FULL) {
    feeds { datafeedId datafeedName totalCount date feedMode }
  }
}`;

const DATA_QUERY = `query GetItemFeedData($datafeedId: String!, $offset: Int!, $limit: Int!) {
  getItemFeedData(datafeedId: $datafeedId, offset: $offset, limit: $limit) {
    rows { columns }
    pageInfo { offset limit totalCount hasMore }
  }
}`;

const json = (body: RecordValue, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const asRecord = (value: unknown): RecordValue =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as RecordValue
    : {};

const asText = (value: unknown, maxLength = 2_000) =>
  typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : null;

const asNumber = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const raw = value.replace(/[^0-9,.-]/g, "").trim();
  if (!raw) return null;
  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  const normalized = comma > dot
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalKey = (value: string) => value.replace(/[^a-z0-9]/gi, "").toLowerCase();

const pick = (record: RecordValue, names: string[]) => {
  const values = new Map(Object.entries(record).map(([key, value]) => [normalKey(key), value]));
  for (const name of names) {
    const value = values.get(normalKey(name));
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
};

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const safeEquals = async (left: string, right: string) =>
  left.length === right.length && (await sha256(left)) === (await sha256(right));

const shopeeRequest = async (
  appId: string,
  appSecret: string,
  query: string,
  variables?: RecordValue,
) => {
  const payload = JSON.stringify(variables ? { query, variables } : { query });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await sha256(`${appId}${timestamp}${payload}${appSecret}`);
  const response = await fetch(SHOPEE_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`,
    },
    body: payload,
  });
  const body = asRecord(await response.json().catch(() => ({})));
  return { ok: response.ok && !Array.isArray(body.errors), status: response.status, body };
};

const parseRow = (value: unknown): RecordValue => {
  if (typeof value !== "string") return asRecord(value);
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return {};
  }
};


const normalText = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase();

const isIncluded = (text: string, values: unknown) =>
  Array.isArray(values) && values.some((value) => {
    const term = typeof value === "string" ? normalText(value).trim() : "";
    return term.length >= 2 && text.includes(term);
  });

const asNullableNumber = (value: unknown) => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "SERVER_CONFIGURATION_ERROR" }, 503);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const suppliedSecret = request.headers.get("x-ofertix-cron-secret") ?? "";
  const { data: cronSecret, error: secretError } = await admin
    .from("automation_secrets")
    .select("secret")
    .eq("name", "shopee_sync")
    .maybeSingle();

  if (secretError || !cronSecret?.secret || !(await safeEquals(cronSecret.secret, suppliedSecret))) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  const { data: activeRun, error: activeError } = await admin
    .from("automation_runs")
    .select("id")
    .eq("function_name", "shopee-sync")
    .eq("status", "running")
    .limit(1)
    .maybeSingle();

  if (activeError) return json({ error: "LOCK_CHECK_FAILED" }, 500);
  if (activeRun) return json({ status: "skipped", reason: "RUN_ALREADY_ACTIVE" }, 409);

  const startedAt = new Date().toISOString();
  const { data: run, error: runError } = await admin
    .from("automation_runs")
    .insert({ function_name: "shopee-sync", status: "running", started_at: startedAt })
    .select("id")
    .single();

  if (runError || !run) return json({ error: "RUN_CREATION_FAILED" }, 500);

  const finish = async (status: "succeeded" | "failed", details: RecordValue) => {
    const finishedAt = new Date().toISOString();
    const started = new Date(startedAt).getTime();
    await admin.from("automation_runs").update({
      status,
      finished_at: finishedAt,
      duration_ms: Date.now() - started,
      products_processed: Number(details.rowsReceived ?? 0),
      products_created: Number(details.productsCreated ?? 0),
      products_updated: Number(details.productsUpdated ?? 0),
      errors_count: status === "failed" ? 1 : 0,
      error_message: typeof details.error === "string" ? details.error.slice(0, 500) : null,
      metrics: details,
    }).eq("id", run.id);
  };

  try {
    const appId = Deno.env.get("SHOPEE_APP_ID")?.trim();
    const appSecret = Deno.env.get("SHOPEE_APP_SECRET")?.trim();
    if (!appId || !appSecret) throw new Error("SHOPEE_SECRETS_NOT_CONFIGURED");

    const { data: marketplace, error: marketplaceError } = await admin
      .from("marketplaces")
      .select("id")
      .eq("slug", "shopee")
      .eq("active", true)
      .maybeSingle();
    if (marketplaceError || !marketplace) throw new Error("SHOPEE_MARKETPLACE_NOT_FOUND");

    const { data: state, error: stateError } = await admin
      .from("shopee_sync_state")
      .select("feed_id, next_offset")
      .eq("singleton", true)
      .single();
    if (stateError || !state) throw new Error("SYNC_STATE_NOT_FOUND");

    const feedsResult = await shopeeRequest(appId, appSecret, FEEDS_QUERY);
    const feeds = asRecord(asRecord(feedsResult.body.data).listItemFeeds).feeds;
    if (!feedsResult.ok || !Array.isArray(feeds) || feeds.length === 0) {
      throw new Error(`SHOPEE_FEEDS_UNAVAILABLE_${feedsResult.status}`);
    }

    const selectedFeed = feeds
      .map(asRecord)
      .find((feed) => asText(feed.datafeedId, 256) === state.feed_id)
      ?? asRecord(feeds[0]);
    const feedId = asText(selectedFeed.datafeedId, 256);
    if (!feedId) throw new Error("SHOPEE_FEED_ID_MISSING");

    const offset = feedId === state.feed_id ? Math.max(0, Number(state.next_offset) || 0) : 0;
    const dataResult = await shopeeRequest(appId, appSecret, DATA_QUERY, {
      datafeedId: feedId,
      offset,
      limit: BATCH_SIZE,
    });
    const result = asRecord(asRecord(dataResult.body.data).getItemFeedData);
    const rows = result.rows;
    if (!dataResult.ok || !Array.isArray(rows)) {
      throw new Error(`SHOPEE_DATA_UNAVAILABLE_${dataResult.status}`);
    }

    const mapped = rows.map((row) => {
      const source = parseRow(asRecord(row).columns);
      const externalId = asText(pick(source, ["item_id", "itemId", "product_id", "productId", "id"]), 128);
      const title = asText(pick(source, ["item_name", "itemName", "product_name", "productName", "title", "name"]), 1_000);
      const price = asNumber(pick(source, ["sale_price", "salePrice", "price", "price_min", "priceMin"]));
      const originalPrice = asNumber(pick(source, ["price_before_discount", "priceBeforeDiscount", "original_price", "originalPrice", "price"]));
      const explicitDiscount = asNumber(pick(source, ["discount_percentage", "discount_percent", "discountPercent"]));
      const discountPercent = originalPrice !== null && price !== null && originalPrice > price
        ? Math.round(((originalPrice - price) / originalPrice) * 10_000) / 100
        : explicitDiscount;
      return {
        externalId,
        title,
        price,
        originalPrice,
        discountPercent,
        imageUrl: asText(pick(source, ["image_link", "imageLink", "image_url", "imageUrl", "image"]), 2_000),
        productUrl: asText(pick(source, ["item_link", "itemLink", "product_link", "productLink", "original_link", "originalLink", "url"]), 2_000),
        category: asText(pick(source, ["global_category2", "global_category1", "category_name", "categoryName", "category"]), 500),
        brand: asText(pick(source, ["brand_name", "brandName", "brand"]), 500),
        currency: asText(pick(source, ["currency", "currency_code", "currencyCode"]), 12) ?? "BRL",
      };
    }).filter((item) => item.externalId && /^\d+$/.test(item.externalId) && item.title && item.price !== null);

    const [rulesResult, categoriesResult, termsResult] = await Promise.all([
      admin.from("offer_rules")
        .select("id, marketplace_id, category, min_price, max_price, min_discount_percent")
        .eq("active", true)
        .or(`marketplace_id.is.null,marketplace_id.eq.${marketplace.id}`),
      admin.from("offer_categories")
        .select("id, name, keywords, excluded_keywords")
        .eq("active", true),
      admin.from("search_terms")
        .select("category_id, term")
        .eq("active", true),
    ]);
    if (rulesResult.error || categoriesResult.error || termsResult.error) {
      throw new Error("RULES_LOOKUP_FAILED");
    }

    const categoriesByName = new Map(
      (categoriesResult.data ?? []).map((category) => [category.name, category]),
    );
    const termsByCategory = new Map<string, string[]>();
    for (const term of termsResult.data ?? []) {
      if (!term.category_id || !term.term) continue;
      const terms = termsByCategory.get(term.category_id) ?? [];
      terms.push(term.term);
      termsByCategory.set(term.category_id, terms);
    }

    const eligible = mapped.map((item) => {
      const title = normalText(item.title ?? "");
      const matchedRuleIds = (rulesResult.data ?? []).flatMap((rule) => {
        const category = rule.category ? categoriesByName.get(rule.category) : undefined;
        if (!category) return [];
        const allowedTerms = [
          ...(Array.isArray(category.keywords) ? category.keywords : []),
          ...(termsByCategory.get(category.id) ?? []),
        ];
        const meetsTextRule = isIncluded(title, allowedTerms);
        const isExcluded = isIncluded(title, category.excluded_keywords);
        const minPrice = asNullableNumber(rule.min_price);
        const maxPrice = asNullableNumber(rule.max_price);
        const minDiscount = asNullableNumber(rule.min_discount_percent) ?? 0;
        const meetsPrice = (minPrice === null || (item.price ?? 0) >= minPrice)
          && (maxPrice === null || (item.price ?? 0) <= maxPrice);
        const meetsDiscount = (item.discountPercent ?? 0) >= minDiscount;
        return meetsTextRule && !isExcluded && meetsPrice && meetsDiscount
          ? [rule.id]
          : [];
      });
      return { ...item, matchedRuleIds };
    }).filter((item) => item.matchedRuleIds.length > 0);

    const externalIds = eligible.map((item) => item.externalId as string);
    const { data: existing, error: existingError } = externalIds.length
      ? await admin.from("products").select("id, external_id, affiliate_url").eq("marketplace_id", marketplace.id).in("external_id", externalIds)
      : { data: [], error: null };
    if (existingError) throw new Error("EXISTING_PRODUCT_LOOKUP_FAILED");

    const existingById = new Map((existing ?? []).map((item) => [item.external_id, item]));
    const now = new Date().toISOString();
    const productRows = eligible.map((item) => ({
      marketplace_id: marketplace.id,
      external_id: item.externalId,
      title: item.title,
      category: item.category,
      brand: item.brand,
      price: item.price,
      original_price: item.originalPrice,
      discount_percent: item.discountPercent,
      image_url: item.imageUrl,
      product_url: item.productUrl,
      affiliate_url: existingById.get(item.externalId as string)?.affiliate_url ?? null,
      currency: item.currency,
      active: true,
      last_seen_at: now,
      updated_at: now,
    }));

    const { data: savedProducts, error: productError } = productRows.length
      ? await admin.from("products").upsert(productRows, { onConflict: "marketplace_id,external_id" }).select("id, external_id")
      : { data: [], error: null };
    if (productError) throw new Error("PRODUCT_UPSERT_FAILED");

    const productIds = new Map((savedProducts ?? []).map((item) => [item.external_id, item.id]));
    const ruleMatches = eligible.flatMap((item) =>
      item.matchedRuleIds.map((ruleId) => ({
        product_id: productIds.get(item.externalId as string),
        rule_id: ruleId,
        status: "pending_affiliate",
        reason: "Produto Shopee compatível com termos e critérios da regra.",
        matched_at: now,
        updated_at: now,
      })),
    ).filter((item) => Boolean(item.product_id));

    if (ruleMatches.length) {
      const { error: matchError } = await admin
        .from("product_rule_matches")
        .upsert(ruleMatches, {
          onConflict: "product_id,rule_id",
          ignoreDuplicates: true,
        });
      if (matchError) throw new Error("RULE_MATCH_UPSERT_FAILED");
    }

    const listingRows = eligible.map((item) => ({
      product_id: productIds.get(item.externalId as string),
      marketplace_id: marketplace.id,
      external_item_id: item.externalId,
      price: item.price,
      original_price: item.originalPrice,
      discount_percent: item.discountPercent,
      currency: item.currency,
      category_id: item.category,
      product_url: item.productUrl,
      image_url: item.imageUrl,
      active: true,
      last_seen_at: now,
      updated_at: now,
    })).filter((item) => Boolean(item.product_id));

    if (listingRows.length) {
      const { error: listingError } = await admin
        .from("marketplace_listings")
        .upsert(listingRows, { onConflict: "marketplace_id,external_item_id" });
      if (listingError) throw new Error("LISTING_UPSERT_FAILED");
    }

    const pageInfo = asRecord(result.pageInfo);
    const hasMore = pageInfo.hasMore === true;
    const nextOffset = hasMore ? offset + rows.length : 0;
    const { error: stateUpdateError } = await admin.from("shopee_sync_state").update({
      feed_id: feedId,
      next_offset: nextOffset,
      last_success_at: now,
      updated_at: now,
    }).eq("singleton", true);
    if (stateUpdateError) throw new Error("SYNC_STATE_UPDATE_FAILED");

    const details = {
      feedId,
      feedName: asText(selectedFeed.datafeedName, 160),
      offset,
      nextOffset,
      hasMore,
      rowsReceived: rows.length,
      rowsValid: productRows.length,
      rowsRejectedByRules: mapped.length - productRows.length,
      ruleMatchesCreated: ruleMatches.length,
      productsCreated: productRows.filter((item) => !existingById.has(item.external_id as string)).length,
      productsUpdated: productRows.filter((item) => existingById.has(item.external_id as string)).length,
      listingsUpserted: listingRows.length,
      affiliateLinksCreated: 0,
      internationalAndNationalSupported: true,
    };
    await finish("succeeded", details);
    return json({ status: "completed", ...details });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SHOPEE_SYNC_FAILED";
    await finish("failed", { error: message });
    return json({ error: "SHOPEE_SYNC_FAILED" }, 500);
  }
});
