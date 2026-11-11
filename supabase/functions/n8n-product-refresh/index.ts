import { withSupabase } from "npm:@supabase/server";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ML_CLIENT_ID = Deno.env.get("MERCADO_LIVRE_CLIENT_ID") ?? "";
const ML_CLIENT_SECRET = Deno.env.get("MERCADO_LIVRE_CLIENT_SECRET") ?? "";
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE);

function json(body: unknown, status = 200) { return Response.json(body, { status }); }
function num(value: unknown): number | null {
  const n = Number(value); return Number.isFinite(n) ? n : null;
}
function discount(price: number | null, original: number | null) {
  if (price === null || original === null || original <= 0 || price >= original) return null;
  return Number((((original - price) / original) * 100).toFixed(2));
}
function brand(product: any): string | null {
  if (!Array.isArray(product?.attributes)) return null;
  const attr = product.attributes.find((x: any) => String(x?.id ?? "").toUpperCase() === "BRAND");
  return attr?.value_name ?? null;
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function categoryMatches(
  category: any,
  title: string,
  marketplaceCategoryId: string | null,
): boolean {
  const normalizedTitle = normalizeText(title);
  const normalizedMarketplaceCategory = normalizeText(marketplaceCategoryId);

  const excluded = Array.isArray(category?.excluded_keywords)
    ? category.excluded_keywords.map(normalizeText).filter(Boolean)
    : [];

  if (
    excluded.some(
      (keyword: string) =>
        keyword.length >= 3 && normalizedTitle.includes(keyword),
    )
  ) {
    return false;
  }

  const keywords = Array.isArray(category?.keywords)
    ? category.keywords.map(normalizeText).filter((x: string) => x.length >= 3)
    : [];

  const marketplaceIds = Array.isArray(category?.marketplace_category_ids)
    ? category.marketplace_category_ids
        .map(normalizeText)
        .filter(Boolean)
    : [];

  if (
    normalizedMarketplaceCategory &&
    marketplaceIds.includes(normalizedMarketplaceCategory)
  ) {
    return true;
  }

  return keywords.some((keyword: string) => normalizedTitle.includes(keyword));
}

function ruleCategoryMatches(
  ruleCategory: string | null,
  title: string,
  marketplaceCategoryId: string | null,
  categories: any[],
): boolean {
  if (!ruleCategory || !String(ruleCategory).trim()) return true;

  const wanted = normalizeText(ruleCategory);
  const category = categories.find(
    (item: any) =>
      normalizeText(item.name) === wanted ||
      normalizeText(item.slug) === wanted,
  );

  if (category) {
    return categoryMatches(category, title, marketplaceCategoryId);
  }

  return normalizeText(title).includes(wanted);
}

async function applyProductRuleFilter(
  product: any,
  marketplaceId: string,
): Promise<{ eligible: boolean; matched_rules: string[]; rejected_rules: string[] }> {
  const [{ data: rules, error: rulesError }, { data: categories, error: categoriesError }] =
    await Promise.all([
      supabaseAdmin
        .from("offer_rules")
        .select(
          "id,name,marketplace_id,category,min_discount_percent,min_price,max_price,active",
        )
        .eq("active", true),
      supabaseAdmin
        .from("offer_categories")
        .select(
          "id,name,slug,keywords,marketplace_category_ids,active,excluded_keywords,priority",
        )
        .eq("active", true),
    ]);

  if (rulesError) {
    throw new Error("Erro ao buscar regras: " + rulesError.message);
  }
  if (categoriesError) {
    throw new Error("Erro ao buscar categorias: " + categoriesError.message);
  }

  const { data: existingMatches, error: matchesError } = await supabaseAdmin
    .from("product_rule_matches")
    .select("rule_id,search_term_id")
    .eq("product_id", product.id);

  if (matchesError) {
    throw new Error("Erro ao buscar vínculos produto/regra: " + matchesError.message);
  }

  const searchTermByRule = new Map(
    (existingMatches ?? []).map((item: any) => [
      String(item.rule_id),
      item.search_term_id ?? null,
    ]),
  );

  const matchedRules: string[] = [];
  const rejectedRules: string[] = [];
  const now = new Date().toISOString();

  for (const rule of rules ?? []) {
    const reasons: string[] = [];
    const price = num(product.price);
    const discountPercent = num(product.discount_percent);

    if (rule.marketplace_id && String(rule.marketplace_id) !== String(marketplaceId)) {
      reasons.push("marketplace_diferente");
    }

    if (price === null) reasons.push("preco_indisponivel");

    if (
      price !== null &&
      rule.min_price !== null &&
      price < Number(rule.min_price)
    ) {
      reasons.push("abaixo_do_preco_minimo");
    }

    if (
      price !== null &&
      rule.max_price !== null &&
      price > Number(rule.max_price)
    ) {
      reasons.push("acima_do_preco_maximo");
    }

    if (
      rule.min_discount_percent !== null &&
      Number(rule.min_discount_percent) > 0 &&
      (discountPercent === null ||
        discountPercent < Number(rule.min_discount_percent))
    ) {
      reasons.push("desconto_insuficiente");
    }

    if (
      !ruleCategoryMatches(
        rule.category,
        String(product.title ?? ""),
        product.category ?? null,
        categories ?? [],
      )
    ) {
      reasons.push("categoria_nao_compativel");
    }

    const eligible = reasons.length === 0;

    if (eligible) matchedRules.push(String(rule.id));
    else rejectedRules.push(String(rule.id));

    await supabaseAdmin
      .from("product_rule_matches")
      .upsert(
        {
          product_id: product.id,
          rule_id: rule.id,
          search_term_id: searchTermByRule.get(String(rule.id)) ?? null,
          status: eligible
            ? (product.affiliate_url ? "matched" : "pending_affiliate")
            : "rejected",
          reason: eligible
            ? (product.affiliate_url
                ? "produto_atende_a_regra"
                : "produto_atende_a_regra_mas_nao_possui_link_afiliado")
            : reasons.join(","),
          matched_at: now,
          updated_at: now,
        },
        { onConflict: "product_id,rule_id" },
      );
  }

  const operationalEligible = matchedRules.length > 0;

  const { error: productStatusError } = await supabaseAdmin
    .from("products")
    .update({
      active: operationalEligible,
      updated_at: now,
    })
    .eq("id", product.id);

  if (productStatusError) {
    throw new Error(
      "Erro ao atualizar elegibilidade operacional: " +
        productStatusError.message,
    );
  }

  return {
    eligible: operationalEligible,
    matched_rules: matchedRules,
    rejected_rules: rejectedRules,
  };
}
async function ml<T>(url: string, accessToken: string, allowNotFound = false): Promise<T | null> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Authorization: "Bearer " + accessToken, Accept: "application/json" },
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw new Error("Mercado Livre timeout após 10s.");
      throw error;
    } finally { clearTimeout(timeout); }
    const text = await response.text();
    let data: any;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (response.ok) return data as T;
    if (response.status === 404 && allowNotFound) return null;
    const detail = data?.message ?? data?.error ?? data?.code ?? data?.cause ?? "Erro desconhecido";
    lastError = new Error("Mercado Livre HTTP " + response.status + " em " + url + ": " + detail + " | body=" + JSON.stringify(data));
    if (response.status !== 429 && response.status < 500) throw lastError;
    if (attempt === 2) throw lastError;
    const retryAfter = Number(response.headers.get("retry-after") ?? "");
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(30000, retryAfter * 1000)
      : Math.min(8000, 750 * (2 ** attempt));
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  throw lastError instanceof Error ? lastError : new Error("Falha temporária na API do Mercado Livre.");
}
async function getConnection() {
  const { data, error } = await supabaseAdmin.from("marketplace_connections")
    .select("id,marketplace_id,external_user_id,access_token,refresh_token,token_expires_at,active,marketplaces!inner(id,name,slug,active)")
    .eq("marketplaces.slug", "mercado_livre").eq("active", true).maybeSingle();
  if (error) throw new Error("Erro ao buscar conexão: " + error.message);
  if (!data) throw new Error("Nenhuma conexão ativa com o Mercado Livre foi encontrada.");
  return data;
}
async function getToken(connection: any, forceRefresh = false) {
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;
  if (!forceRefresh && connection.access_token && expiresAt > Date.now() + 5 * 60 * 1000) {
    return { accessToken: connection.access_token, expiresAt: connection.token_expires_at ?? null };
  }
  if (!connection.refresh_token) throw new Error("Refresh token do Mercado Livre não encontrado.");
  if (!ML_CLIENT_ID || !ML_CLIENT_SECRET) throw new Error("Credenciais do Mercado Livre não configuradas.");
  const body = new URLSearchParams({
    grant_type: "refresh_token", client_id: ML_CLIENT_ID, client_secret: ML_CLIENT_SECRET,
    refresh_token: connection.refresh_token,
  });
  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body,
  });
  const data = await response.json();
  if (!response.ok || !data?.access_token) throw new Error("Erro ao renovar token: " + (data?.message ?? data?.error ?? response.status));
  const newExpiresAt = new Date(Date.now() + Number(data.expires_in ?? 21600) * 1000).toISOString();
  const update: Record<string, unknown> = { access_token: data.access_token, token_expires_at: newExpiresAt, updated_at: new Date().toISOString() };
  if (data.refresh_token) update.refresh_token = data.refresh_token;
  const { error } = await supabaseAdmin.from("marketplace_connections").update(update).eq("id", connection.id);
  if (error) throw new Error("Erro ao atualizar token: " + error.message);
  return { accessToken: data.access_token, expiresAt: newExpiresAt };
}

export default {
  fetch: withSupabase({ auth: "secret:default" }, async (req) => {
    if (req.method !== "POST") return json({ success: false, error: "Use POST." }, 405);
    let body: any;
    try { body = await req.json(); } catch { return json({ success: false, error: "JSON inválido." }, 400); }
    const productId = String(body?.product_id ?? "").trim();
    if (!productId) return json({ success: false, error: "product_id é obrigatório." }, 400);
    if (!SERVICE_ROLE) return json({ success: false, error: "Configuração interna ausente." }, 500);

    try {
      const { data: product, error: productError } = await supabaseAdmin.from("products")
        .select("id,marketplace_id,external_id,title,price,original_price,discount_percent,category,brand,image_url,product_url,affiliate_url")
        .eq("id", productId).maybeSingle();
      if (productError) throw new Error("Erro ao buscar produto: " + productError.message);
      if (!product) return json({ success: false, error: "Produto não encontrado." }, 404);
      if (!product.external_id) return json({ success: false, error: "Produto sem external_id do Mercado Livre." }, 400);
      const externalId = String(product.external_id).trim();
      // IDs MLB são IDs de publicação (/items), não necessariamente IDs de catálogo (/products).
      
      const connection = await getConnection();
      let token = await getToken(connection);

      let detail: any;
      let listingsData: any;

      // URL /p/ identifica catálogo. Para catálogo, a fonte primária é
      // /products/{id} e /products/{id}/items, nunca uma linha antiga aleatória.
      const isCatalogProduct = String(product.product_url ?? "").includes("/p/");
      const isListingId = /^MLB[0-9]+$/i.test(externalId);

      const fetchKnownActiveListings = async (accessToken: string) => {
        const { data: knownListings, error: knownListingsError } = await supabaseAdmin
          .from("marketplace_listings")
          .select("external_item_id")
          .eq("product_id", productId)
          .eq("marketplace_id", connection.marketplace_id)
          .eq("active", true)
          .not("external_item_id", "is", null)
          .limit(10);
        if (knownListingsError) throw new Error("Erro ao consultar publicações vinculadas: " + knownListingsError.message);
        const liveCandidates: any[] = [];
        const lookupErrors: string[] = [];
        for (const known of (knownListings ?? [])) {
          const itemId = String(known.external_item_id ?? "").trim();
          if (!/^MLB[0-9]+$/i.test(itemId)) continue;
          try {
            const liveItem = await ml<any>("https://api.mercadolibre.com/items/" + encodeURIComponent(itemId), accessToken);
            if (isSellableListing(liveItem)) liveCandidates.push({
              item_id: liveItem.id, price: liveItem.price, original_price: liveItem.original_price,
              permalink: liveItem.permalink, category_id: liveItem.category_id, currency_id: liveItem.currency_id,
              available_quantity: liveItem.available_quantity, sold_quantity: liveItem.sold_quantity,
              condition: liveItem.condition, listing_type_id: liveItem.listing_type_id,
              seller_id: liveItem.seller_id, status: liveItem.status,
            });
          } catch (error) { lookupErrors.push(error instanceof Error ? error.message : String(error)); }
        }
        liveCandidates.sort((a: any, b: any) => num(a.price)! - num(b.price)!);
        return {
          listings: liveCandidates,
          errors: lookupErrors,
          result: liveCandidates.length ? {
            detail: {
              id: externalId, name: product.title,
              buy_box_winner: { item_id: liveCandidates[0].item_id, price: liveCandidates[0].price,
                original_price: liveCandidates[0].original_price ?? null, permalink: liveCandidates[0].permalink ?? null },
            },
            listingsData: { results: liveCandidates },
          } : null,
        };
      };

      const resolveListingThroughCatalog = async (accessToken: string) => {
        const searchUrl = new URL("https://api.mercadolibre.com/products/search");
        searchUrl.searchParams.set("status", "active");
        searchUrl.searchParams.set("site_id", "MLB");
        searchUrl.searchParams.set("q", String(product.title ?? "").slice(0, 180));
        searchUrl.searchParams.set("limit", "20");

        const searchData = await ml<any>(searchUrl.toString(), accessToken);
        const candidates = Array.isArray(searchData?.results) ? searchData.results : [];

        for (const candidate of candidates.slice(0, 20)) {
          if (!candidate?.id) continue;
          const catalogItems = await ml<any>(
            "https://api.mercadolibre.com/products/" + encodeURIComponent(String(candidate.id)) + "/items",
            accessToken,
            true,
          );
          const items = Array.isArray(catalogItems?.results) ? catalogItems.results : [];
          const exactListing = items.find((item: any) =>
            String(item?.item_id ?? item?.id ?? "").toUpperCase() === externalId.toUpperCase()
          );
          if (!exactListing || num(exactListing.price) === null) continue;

          return {
            detail: {
              id: candidate.id,
              name: candidate.name ?? product.title,
              buy_box_winner: {
                item_id: externalId,
                price: exactListing.price,
                original_price: exactListing.original_price ?? null,
              },
            },
            listingsData: { results: [exactListing] },
          };
        }
        return null;
      };

      const fetchCurrentProductData = async (accessToken: string) => {
        if (isCatalogProduct) {
          const catalog = await ml<any>(
            "https://api.mercadolibre.com/products/" + encodeURIComponent(externalId),
            accessToken,
          );
          const catalogItems = await ml<any>(
            "https://api.mercadolibre.com/products/" + encodeURIComponent(externalId) + "/items",
            accessToken,
            true,
          );
          return { detail: catalog, listingsData: catalogItems };
        }

        if (isListingId) {
          try {
            const itemData = await ml<any>(
              "https://api.mercadolibre.com/items/" + encodeURIComponent(externalId),
              accessToken,
            );
            return {
              detail: {
                id: itemData?.id, name: itemData?.title, permalink: itemData?.permalink,
                domain_id: itemData?.category_id,
                pictures: itemData?.thumbnail ? [{ url: itemData.thumbnail }] : [],
                attributes: [], price: itemData?.price, original_price: itemData?.original_price,
                buy_box_winner: {
                  item_id: itemData?.id, price: itemData?.price,
                  original_price: itemData?.original_price, permalink: itemData?.permalink,
                },
              },
              listingsData: { results: [{
                item_id: itemData?.id, price: itemData?.price,
                original_price: itemData?.original_price, permalink: itemData?.permalink,
                category_id: itemData?.category_id, currency_id: itemData?.currency_id,
                available_quantity: itemData?.available_quantity, sold_quantity: itemData?.sold_quantity,
                condition: itemData?.condition, listing_type_id: itemData?.listing_type_id,
                seller_id: itemData?.seller_id, status: itemData?.status,
              }] },
            };
          } catch (itemError) {
            const message = itemError instanceof Error ? itemError.message : String(itemError);
            if (/HTTP 403/i.test(message)) {
              // O endpoint /items pode bloquear anúncios de terceiros.
              // Resolver pelo catálogo e exigir correspondência exata do item_id.
              const catalogMatch = await resolveListingThroughCatalog(accessToken);
              if (catalogMatch) return catalogMatch;
              throw itemError;
            }
            if (!/HTTP 404|not found/i.test(message)) throw itemError;
          }
        }

        const catalog = await ml<any>(
          "https://api.mercadolibre.com/products/" + encodeURIComponent(externalId),
          accessToken,
        );
        const catalogItems = await ml<any>(
          "https://api.mercadolibre.com/products/" + encodeURIComponent(externalId) + "/items",
          accessToken,
          true,
        );
        return { detail: catalog, listingsData: catalogItems };
      };

      try {
        ({ detail, listingsData } = await fetchCurrentProductData(token.accessToken));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/Mercado Livre HTTP (401|403) em /i.test(message)) {
          token = await getToken(connection, true);
          try {
            ({ detail, listingsData } = await fetchCurrentProductData(token.accessToken));
          } catch (retryError) {
            const retryMessage = retryError instanceof Error ? retryError.message : String(retryError);
            if (!/Mercado Livre HTTP (403|404) em /i.test(retryMessage)) throw retryError;
            const linked = await fetchKnownActiveListings(token.accessToken);
            if (!linked.result) throw new Error(retryMessage + " | fallback marketplace_listings: " + linked.errors.slice(0,3).join(" || "));
            ({ detail, listingsData } = linked.result);
          }
        } else if (/Mercado Livre HTTP (403|404) em /i.test(message)) {
          const linked = await fetchKnownActiveListings(token.accessToken);
          if (!linked.result) throw new Error(message + " | fallback marketplace_listings: " + linked.errors.slice(0,3).join(" || "));
          ({ detail, listingsData } = linked.result);
        } else throw error;
      }

      const listings = Array.isArray(listingsData?.results) ? listingsData.results : [];

      const buyBox = detail?.buy_box_winner ?? null;
      const buyBoxItemId = buyBox?.item_id ? String(buyBox.item_id) : null;
      const buyBoxListing = buyBoxItemId ? listings.find((item: any) => String(item?.item_id ?? "") === buyBoxItemId) : null;

      // A resposta /products/{id} pode conter o preço atual no buy_box_winner,
      // mesmo quando /products/{id}/items não retorna listings.
      const isSellableListing = (item: any) => {
        if (num(item?.price) === null) return false;
        if (item?.status && String(item.status).toLowerCase() !== "active") return false;
        if (item?.available_quantity !== null && item?.available_quantity !== undefined &&
            Number(item.available_quantity) <= 0) return false;
        return true;
      };

      let selected =
        (buyBoxListing && isSellableListing(buyBoxListing) ? buyBoxListing : null) ??
        (buyBox && num(buyBox.price) !== null ? buyBox : null) ??
        [...listings].filter(isSellableListing)
          .sort((a: any, b: any) => num(a.price)! - num(b.price)!)[0] ??
        null;

      // Sem preço atual no catálogo, consultar as publicações associadas em tempo
      // real. Nunca tratar preço antigo armazenado como se fosse sincronização.
      if (!selected) {
        const linked = await fetchKnownActiveListings(token.accessToken);
        if (linked.listings.length) {
          listingsData = { results: linked.listings };
          selected = linked.listings[0];
        }
      }

      if (!selected) {
        // Fallback: external_id pode ser um item MLB... e não um catálogo de produto.
        // Consultar /items/{id} para obter o preço diretamente da publicação.
        try {
          const itemData = await ml<any>(
            "https://api.mercadolibre.com/items/" + encodeURIComponent(externalId),
            token.accessToken,
          );
          if (num(itemData?.price) !== null) {
            const itemPrice = num(itemData.price)!;
            const itemOriginalPrice = num(itemData.original_price);
            const itemNow = new Date().toISOString();
            const itemUpdate = {
              title: itemData?.title ?? product.title,
              category: itemData?.category_id ?? product.category ?? null,
              brand: product.brand ?? null,
              price: itemPrice,
              original_price: itemOriginalPrice,
              discount_percent: discount(itemPrice, itemOriginalPrice),
              image_url: itemData?.thumbnail ?? product.image_url,
              product_url: itemData?.permalink ?? product.product_url,
              active: product.active,
              price_synced_at: itemNow,
              availability_status: "available",
              last_availability_check: itemNow,
              last_available_at: itemNow,
              availability_error: null,
              last_seen_at: itemNow,
              updated_at: itemNow,
            };
            const { data: fallbackUpdated, error: fallbackError } = await supabaseAdmin
              .from("products").update(itemUpdate).eq("id", productId)
              .select("id,external_id,title,price,original_price,discount_percent,affiliate_url").single();
            if (fallbackError) throw new Error("Erro ao atualizar produto pelo endpoint /items: " + fallbackError.message);
            return json({
              success: true,
              product_id: productId,
              external_id: externalId,
              current_price: itemPrice,
              current_original_price: itemOriginalPrice,
              selected_source: "item_endpoint_fallback",
              selected_item_id: itemData?.id ?? externalId,
              selected_item_url: itemData?.permalink ?? null,
              listings_updated: 0,
              affiliate_url_preserved: Boolean(fallbackUpdated?.affiliate_url),
              note: "Preço obtido diretamente da publicação /items/{id}; sem reavaliar regras de elegibilidade.",
            });
          }
        } catch (fallbackError) {
          const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
          return json({
            success: false,
            error: "Sem preço utilizável nas APIs de catálogo e publicação.",
            product_id: productId,
            external_id: externalId,
            listings_found: listings.length,
            item_endpoint_error: fallbackMessage,
          }, 409);
        }
        return json({
          success: false,
          error: "Mercado Livre não retornou preço utilizável no produto nem nas publicações.",
          product_id: productId,
          external_id: externalId,
          listings_found: listings.length,
          product_has_buy_box: Boolean(buyBox),
          product_buy_box_has_price: num(buyBox?.price) !== null,
          product_price_field_present: num(detail?.price) !== null,
        }, 409);
      }

      const selectedItemId = selected?.item_id
        ? String(selected.item_id)
        : buyBoxItemId;

      let selectedItemUrl =
        selected?.permalink ??
        buyBox?.permalink ??
        null;

      // O endpoint /items/{id} pode devolver 403 mesmo quando a publicação
      // não é acessível com este token. O link é opcional para atualizar preço.
      // Não falhar a atualização de preço só porque não foi possível obter permalink.
      if (!selectedItemUrl && selectedItemId) {
        try {
          const selectedItem = await ml<any>(
            "https://api.mercadolibre.com/items/" + encodeURIComponent(selectedItemId),
            token.accessToken,
            true,
          );
          selectedItemUrl = selectedItem?.permalink ?? null;
        } catch (error) {
          // Registrar o endpoint no diagnóstico sem interromper a atualização.
          selectedItemUrl = null;
        }
      }

      const price = num(selected?.price);
      const originalPrice = num(selected?.original_price);
      if (price === null) throw new Error("Mercado Livre retornou preço inválido.");
      const now = new Date().toISOString();

      const productUpdate = {
        title: detail?.name ?? product.title,
        category: selected?.category_id ?? detail?.domain_id ?? product.category ?? null,
        brand: brand(detail) ?? product.brand ?? null,
        price, original_price: originalPrice, discount_percent: discount(price, originalPrice),
        image_url: Array.isArray(detail?.pictures)
          ? (detail.pictures.find((x: any) => x?.secure_url || x?.url)?.secure_url ??
             detail.pictures.find((x: any) => x?.secure_url || x?.url)?.url ?? product.image_url)
          : product.image_url,
        product_url: detail?.permalink ?? product.product_url ?? "https://www.mercadolivre.com.br/p/" + externalId,
        active: product.active,
        price_synced_at: now,
        availability_status: "available", last_availability_check: now,
        last_available_at: now, availability_error: null, last_seen_at: now, updated_at: now,
      };

      const { data: updatedProduct, error: updateError } = await supabaseAdmin.from("products")
        .update(productUpdate).eq("id", productId)
        .select("id,external_id,title,price,original_price,discount_percent,affiliate_url").single();
      if (updateError) throw new Error("Erro ao atualizar preço do produto: " + updateError.message);

      const listingRows = listings.filter((item: any) => item?.item_id).map((item: any) => {
        const itemPrice = num(item?.price), itemOriginal = num(item?.original_price);
        return {
          product_id: productId, marketplace_id: connection.marketplace_id,
          external_item_id: String(item.item_id),
          seller_id: item?.seller_id != null ? String(item.seller_id) : null,
          price: itemPrice, original_price: itemOriginal, discount_percent: discount(itemPrice, itemOriginal),
          currency: item?.currency_id ?? "BRL", category_id: item?.category_id ?? null,
          condition: item?.condition ?? null, listing_type_id: item?.listing_type_id ?? null,
          product_url: item?.permalink ?? detail?.permalink ?? product.product_url ?? null,
          image_url: productUpdate.image_url, available_quantity: num(item?.available_quantity),
          sold_quantity: num(item?.sold_quantity), active: true, price_synced_at: now, last_seen_at: now, updated_at: now,
        };
      });

      if (listingRows.length) {
        const { error: listingError } = await supabaseAdmin.from("marketplace_listings")
          .upsert(listingRows, { onConflict: "marketplace_id,external_item_id" });
        if (listingError) throw new Error("Erro ao atualizar publicações do Mercado Livre: " + listingError.message);
      }

      return json({
        success: true, product_id: productId, external_id: externalId,
        previous_price: product.price, current_price: price,
        previous_original_price: product.original_price, current_original_price: originalPrice,
        discount_percent: discount(price, originalPrice),
        selected_source: buyBoxItemId ? "buy_box_winner" : "lowest_active_price",
        selected_item_id: selectedItemId,
        selected_item_url: selectedItemUrl,
        listings_updated: listingRows.length,
        affiliate_url_preserved: Boolean(updatedProduct?.affiliate_url),
        token_expires_at: token.expiresAt,
      });
    } catch (error) {
      return json({ success: false, error: error instanceof Error ? error.message : String(error), product_id: productId }, 500);
    }
  }),
};