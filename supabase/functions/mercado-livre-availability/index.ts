import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MARKETPLACE_SLUG = "mercado_livre";
const BATCH_SIZE = 10;
const LISTING_FRESHNESS_MINUTES = 120;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function authorized(req: Request) {
  const provided = req.headers.get("x-ofertix-cron-secret") ?? "";
  if (!provided) return false;

  const { data, error } = await supabaseAdmin
    .from("automation_secrets")
    .select("secret")
    .eq("name", "mercado_livre_availability")
    .maybeSingle();

  return !error && !!data?.secret && provided === data.secret;
}

async function getConnection() {
  const { data, error } = await supabaseAdmin
    .from("marketplace_connections")
    .select("id,marketplace_id,access_token,refresh_token,token_expires_at,active,marketplaces!inner(id,name,slug,active)")
    .eq("marketplaces.slug", MARKETPLACE_SLUG)
    .eq("active", true)
    .maybeSingle();

  if (error) throw new Error("Erro ao buscar conexão: " + error.message);
  if (!data) throw new Error("Nenhuma conexão ativa com o Mercado Livre.");
  return data;
}

async function accessToken(c: any) {
  const expires = c.token_expires_at ? new Date(c.token_expires_at).getTime() : 0;

  if (c.access_token && expires > Date.now() + 5 * 60 * 1000) {
    return c.access_token;
  }

  const clientId = Deno.env.get("MERCADO_LIVRE_CLIENT_ID") ?? "";
  const clientSecret = Deno.env.get("MERCADO_LIVRE_CLIENT_SECRET") ?? "";

  if (!clientId || !clientSecret || !c.refresh_token) {
    throw new Error("Credenciais/refresh token do Mercado Livre não configurados.");
  }

  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: c.refresh_token,
    }),
  });

  const payload = await response.json();

  if (!response.ok || !payload?.access_token) {
    throw new Error(
      "Erro ao renovar token: " +
        (payload?.message ?? payload?.error ?? response.status),
    );
  }

  const expiresAt = new Date(
    Date.now() + Number(payload.expires_in ?? 21600) * 1000,
  ).toISOString();

  const update: Record<string, unknown> = {
    access_token: payload.access_token,
    token_expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  };

  if (payload.refresh_token) update.refresh_token = payload.refresh_token;

  const { error } = await supabaseAdmin
    .from("marketplace_connections")
    .update(update)
    .eq("id", c.id);

  if (error) throw new Error("Erro ao salvar token: " + error.message);

  return payload.access_token;
}

async function ml(url: string, token: string) {
  const response = await fetch(url, {
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/json",
    },
  });

  const text = await response.text();

  let payload: any = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    // Diagnóstico estruturado sem registrar headers, tokens ou credenciais.
    const details = {
      message: payload?.message ?? null,
      error: payload?.error ?? null,
      code: payload?.code ?? null,
      status: payload?.status ?? null,
      cause: Array.isArray(payload?.cause)
        ? payload.cause.slice(0, 5)
        : payload?.cause ?? null,
      raw: payload?.raw ? String(payload.raw).slice(0, 500) : null,
    };
    throw new Error(
      "Mercado Livre HTTP " + response.status + ": " + JSON.stringify(details),
    );
  }

  return payload;
}

async function checkProduct(product: any, token: string) {
  const productId = String(product.external_id ?? "").trim();

  if (!productId) {
    throw new Error("Produto sem external_id do Mercado Livre.");
  }

  // IDs MLB... representam anúncios, não produtos de catálogo.
  // O endpoint /items/{id} exige autorização compatível com o proprietário
  // do anúncio. Evitamos chamadas sabidamente incompatíveis para anúncios
  // de terceiros e registramos a causa como disponibilidade não confirmada.
  if (/^MLB\d+$/i.test(productId)) {
    const { data: listingOwner, error: ownerError } = await supabaseAdmin
      .from("marketplace_listings")
      .select("seller_id")
      .eq("product_id", product.id)
      .eq("marketplace_id", product.marketplace_id)
      .eq("external_item_id", productId)
      .maybeSingle();

    if (ownerError) {
      throw new Error("Não foi possível identificar o vendedor do anúncio: " + ownerError.message);
    }

    const { data: connection, error: connectionError } = await supabaseAdmin
      .from("marketplace_connections")
      .select("external_user_id")
      .eq("marketplace_id", product.marketplace_id)
      .eq("active", true)
      .maybeSingle();

    if (connectionError) {
      throw new Error("Não foi possível identificar a conta conectada: " + connectionError.message);
    }

    if (listingOwner?.seller_id && connection?.external_user_id &&
        String(listingOwner.seller_id) !== String(connection.external_user_id)) {
      // Primeiro tentamos o endpoint oficial bulk por ID conhecido. Diferente
      // da busca pública por vendedor, ele não exige descobrir a publicação.
      // available_quantity em recurso público é apenas uma faixa referencial.
      try {
        const bulkUrl = new URL("https://api.mercadolibre.com/items/bulk");
        bulkUrl.searchParams.set("ids", productId);
        bulkUrl.searchParams.set(
          "attributes",
          "body.id,body.status,body.available_quantity,body.sub_status",
        );
        const bulkResponse = await ml(bulkUrl.toString(), token);
        const bulkEntry = Array.isArray(bulkResponse) ? bulkResponse[0] : null;
        const bulkStatusCode = Number(bulkEntry?.status_code ?? bulkEntry?.code ?? 0);
        const bulkItem = bulkEntry?.body ?? null;
        const bulkItemStatus = String(bulkItem?.status ?? "").trim().toLowerCase();
        const bulkQuantity = Number(bulkItem?.available_quantity);
        const bulkHasPublicQuantity =
          bulkItem?.available_quantity !== null &&
          bulkItem?.available_quantity !== undefined &&
          Number.isFinite(bulkQuantity);

        if (bulkStatusCode >= 200 && bulkStatusCode < 300 && bulkItem?.id) {
          if (bulkItemStatus === "active" &&
              (!bulkHasPublicQuantity || bulkQuantity > 0)) {
            const now = new Date().toISOString();
            const { error: bulkListingUpdateError } = await supabaseAdmin
              .from("marketplace_listings")
              .update({ active: true, last_seen_at: now, updated_at: now })
              .eq("product_id", product.id)
              .eq("marketplace_id", product.marketplace_id)
              .eq("external_item_id", productId);
            if (bulkListingUpdateError) {
              throw new Error("Falha ao atualizar anúncio confirmado pelo bulk: " + bulkListingUpdateError.message);
            }
            return {
              available: true,
              catalogStatus: null,
              listingsCount: 1,
              activeListings: 1,
              reason: bulkHasPublicQuantity
                ? "Anúncio de terceiro confirmado ativo pelo endpoint /items/bulk; quantidade pública é referencial, não estoque exato."
                : "Anúncio de terceiro confirmado com status ativo pelo endpoint /items/bulk; estoque exato não é exposto para terceiros.",
            };
          }

          if (bulkItemStatus === "paused" || bulkItemStatus === "closed" ||
              (bulkHasPublicQuantity && bulkQuantity <= 0)) {
            const now = new Date().toISOString();
            const { error: bulkListingUpdateError } = await supabaseAdmin
              .from("marketplace_listings")
              .update({ active: false, last_seen_at: now, updated_at: now })
              .eq("product_id", product.id)
              .eq("marketplace_id", product.marketplace_id)
              .eq("external_item_id", productId);
            if (bulkListingUpdateError) {
              throw new Error("Falha ao atualizar anúncio indisponível confirmado pelo bulk: " + bulkListingUpdateError.message);
            }
            return {
              available: false,
              catalogStatus: null,
              listingsCount: 0,
              activeListings: 0,
              reason: "Anúncio de terceiro confirmado indisponível pelo endpoint /items/bulk: status=" +
                (bulkItemStatus || "não informado") +
                (bulkHasPublicQuantity ? "; quantidade pública referencial=0." : "."),
            };
          }
        }
      } catch (bulkError) {
        console.warn("Consulta /items/bulk não conseguiu confirmar anúncio de terceiro:", {
          product_id: product.id,
          item_id: productId,
          seller_id: String(listingOwner.seller_id),
          error: bulkError instanceof Error ? bulkError.message : String(bulkError),
        });
      }

      // A busca pública por vendedor é uma segunda tentativa. Em algumas
      // aplicações o Mercado Livre responde 403; isso não invalida o item.
      // A API pode retornar
      // results como strings (IDs), não como objetos. Não filtramos por título:
      // percorremos páginas do vendedor e comparamos o ID exato do anúncio.
      let publicItemFound = false;
      let publicSearchFailed = false;
      try {
        let offset = 0;
        let total = 0;
        const pageSize = 100;
        const maxPages = 10; // até 1.000 resultados por execução
        for (let page = 0; page < maxPages; page++) {
          const publicSearchUrl = new URL("https://api.mercadolibre.com/sites/MLB/search");
          publicSearchUrl.searchParams.set("seller_id", String(listingOwner.seller_id));
          publicSearchUrl.searchParams.set("limit", String(pageSize));
          publicSearchUrl.searchParams.set("offset", String(offset));
          const publicSearch = await ml(publicSearchUrl.toString(), token);
          const publicItems = Array.isArray(publicSearch?.results) ? publicSearch.results : [];
          const ids = publicItems.map((item: any) =>
            String(typeof item === "string" ? item : item?.id ?? "").trim().toUpperCase()
          );
          if (ids.includes(productId.toUpperCase())) {
            publicItemFound = true;
            break;
          }
          total = Number(publicSearch?.paging?.total ?? 0);
          if (!publicItems.length || offset + publicItems.length >= total || publicItems.length < pageSize) {
            break;
          }
          offset += publicItems.length;
        }
      } catch (publicSearchError) {
        publicSearchFailed = true;
        console.warn("Busca pública não conseguiu consultar anúncios do vendedor:", {
          product_id: product.id,
          seller_id: String(listingOwner.seller_id),
          error: publicSearchError instanceof Error ? publicSearchError.message : String(publicSearchError),
        });
      }

      if (publicItemFound) {
        const now = new Date().toISOString();
        const { error: listingUpdateError } = await supabaseAdmin
          .from("marketplace_listings")
          .update({
            active: true,
            last_seen_at: now,
            updated_at: now,
          })
          .eq("product_id", product.id)
          .eq("marketplace_id", product.marketplace_id)
          .eq("external_item_id", productId);
        if (listingUpdateError) {
          throw new Error("Falha ao atualizar cache da publicação encontrada na busca pública: " + listingUpdateError.message);
        }
        return {
          available: true,
          catalogStatus: null,
          listingsCount: 1,
          activeListings: 1,
          reason: "Anúncio de terceiro encontrado na busca pública do vendedor e confirmado ativo. A quantidade exata de estoque não é disponibilizada nessa consulta.",
        };
      }

      return {
        unverified: true,
        catalogStatus: null,
        listingsCount: null,
        reason:
          "Anúncio de terceiro (seller_id " + String(listingOwner.seller_id) +
          "). O detalhe privado é restrito e o ID não apareceu nas páginas públicas consultadas" +
          (publicSearchFailed ? " porque a consulta pública falhou" : " (até 1.000 resultados)") +
          "; disponibilidade permanece não confirmada e nova tentativa agendada.",
      };
    }
    const item = await ml("https://api.mercadolibre.com/items/" + encodeURIComponent(productId), token);
    const itemStatus = String(item?.status ?? "").trim().toLowerCase();
    const itemSubStatus = Array.isArray(item?.sub_status)
      ? item.sub_status.map((value: unknown) => String(value)).join(", ")
      : String(item?.sub_status ?? "").trim();
    const quantity = Number(item?.available_quantity ?? 0);
    const hasStock = Number.isFinite(quantity) && quantity > 0;
    const available = itemStatus === "active" && hasStock;
    const now = new Date().toISOString();
    const { error: listingError } = await supabaseAdmin.from("marketplace_listings")
      .update({ active: available, available_quantity: Number.isFinite(quantity) ? quantity : 0, last_seen_at: now, updated_at: now })
      .eq("product_id", product.id)
      .eq("marketplace_id", product.marketplace_id)
      .eq("external_item_id", productId);
    if (listingError) throw new Error("Falha ao atualizar status do anúncio: " + listingError.message);
    return {
      available,
      catalogStatus: null,
      listingsCount: available ? 1 : 0,
      activeListings: available ? 1 : 0,
      reason: available
        ? "Anúncio confirmado ativo e com estoque disponível diretamente no Mercado Livre."
        : "Anúncio indisponível confirmado pela API: status=" +
          (itemStatus || "não informado") +
          "; sub_status=" + (itemSubStatus || "não informado") +
          "; estoque=" + (Number.isFinite(quantity) ? quantity : "não informado") + ".",
    };
  }

  /*
   * Não dependemos mais de marketplace_listings.last_seen_at para decidir
   * disponibilidade. Esse campo depende da última sincronização do catálogo
   * e podia gerar falso negativo quando o sincronizador demorava ou era
   * executado em outra cadência.
   *
   * A disponibilidade agora é validada diretamente no Mercado Livre:
   * 1. /products/{id} confirma o estado do produto de catálogo;
   * 2. /products/{id}/items retorna as publicações atuais desse produto.
   */
  let catalog: any = null;
  let catalogStatus: string | null = null;
  let catalogNotFound = false;

  try {
    catalog = await ml(
      "https://api.mercadolibre.com/products/" +
        encodeURIComponent(productId),
      token,
    );
    catalogStatus =
      String(catalog?.status ?? "").trim().toLowerCase() || null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/Mercado Livre HTTP 404/i.test(message)) {
      // O produto de catálogo pode ter sido removido, mas anúncios podem continuar ativos.
      catalogNotFound = true;
    } else {
      throw error;
    }
  }

  if (catalogNotFound) {
    const { data: knownListings, error: listingsQueryError } = await supabaseAdmin
      .from("marketplace_listings")
      .select("external_item_id")
      .eq("product_id", product.id)
      .eq("marketplace_id", product.marketplace_id)
      .not("external_item_id", "is", null)
      .limit(20);

    if (listingsQueryError) {
      throw new Error(
        "Catálogo retornou 404 e não foi possível consultar anúncios conhecidos: " +
          listingsQueryError.message,
      );
    }

    const itemIds: string[] = Array.from(
      new Set<string>(
        (knownListings ?? [])
          .map((row: any) => String(row.external_item_id ?? "").trim())
          .filter((id: string) => /^MLB\d+$/i.test(id)),
      ),
    );

    const activeKnownListings: any[] = [];
    for (const itemId of itemIds) {
      try {
        const item = await ml(
          "https://api.mercadolibre.com/items/" + encodeURIComponent(itemId),
          token,
        );
        const itemStatus = String(item?.status ?? "").trim().toLowerCase();
        const quantity = Number(item?.available_quantity ?? 0);
        if (itemStatus === "active" && Number.isFinite(quantity) && quantity > 0) {
          activeKnownListings.push({
            item_id: item.id ?? itemId,
            status: itemStatus,
            available_quantity: quantity,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/Mercado Livre HTTP 404/i.test(message)) continue;
        throw new Error(
          "Catálogo 404; falha ao verificar anúncio " + itemId + ": " + message,
        );
      }
    }

    const now = new Date().toISOString();
    for (const listing of activeKnownListings) {
      const { error } = await supabaseAdmin
        .from("marketplace_listings")
        .update({ active: true, last_seen_at: now, updated_at: now })
        .eq("marketplace_id", product.marketplace_id)
        .eq("external_item_id", String(listing.item_id));
      if (error) {
        console.warn("Falha ao atualizar cache de anúncio:", error.message);
      }
    }

    return {
      available: activeKnownListings.length > 0,
      catalogStatus: null,
      listingsCount: activeKnownListings.length,
      activeListings: activeKnownListings.length,
      reason:
        activeKnownListings.length > 0
          ? "O produto de catálogo retornou 404, mas anúncios conhecidos foram confirmados ativos diretamente no Mercado Livre."
          : "O produto de catálogo retornou 404 e nenhum anúncio conhecido foi confirmado ativo após consulta direta.",
    };
  }

  let listingsData: any;

  try {
    listingsData = await ml(
      "https://api.mercadolibre.com/products/" +
        encodeURIComponent(productId) +
        "/items",
      token,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    /*
     * 404 significa que não existem publicações para esse produto.
     * Outros erros continuam sendo tratados como erro temporário pelo
     * fluxo externo e não como indisponibilidade confirmada.
     */
    if (/HTTP 404/i.test(message)) {
      listingsData = { results: [] };
    } else {
      throw error;
    }
  }

  const listings: any[] =
    Array.isArray(listingsData?.results)
      ? listingsData.results
      : [];

  const activeListings = listings.filter((listing) => {
    const status = String(listing?.status ?? "")
      .trim()
      .toLowerCase();

    // Só status explicitamente ativo e estoque positivo confirmam disponibilidade.
    const quantity = Number(listing?.available_quantity ?? 0);
    return status === "active" && Number.isFinite(quantity) && quantity > 0;
  });

  const available =
    catalogStatus === "active" &&
    activeListings.length > 0;

  let reason = "";

  if (available) {
    reason =
      "Produto de catálogo ativo e com publicação ativa encontrada diretamente no Mercado Livre.";
  } else if (catalogStatus !== "active") {
    reason =
      "Produto de catálogo indisponível confirmado pela API: status=" +
      (catalogStatus ?? "não informado") + ".";
  } else {
    const observedStates = listings.slice(0, 10).map((listing) => {
      const status = String(listing?.status ?? "não informado").trim().toLowerCase();
      const subStatus = Array.isArray(listing?.sub_status)
        ? listing.sub_status.map((value: unknown) => String(value)).join(", ")
        : String(listing?.sub_status ?? "").trim();
      const quantity = Number(listing?.available_quantity ?? 0);
      return "status=" + status + "; sub_status=" + (subStatus || "não informado") +
        "; estoque=" + (Number.isFinite(quantity) ? quantity : "não informado");
    });
    reason =
      "Produto de catálogo ativo, mas nenhuma publicação com status ativo e estoque positivo foi encontrada." +
      (observedStates.length ? " Estados observados: " + observedStates.join(" | ") : " Nenhuma publicação retornada.");
  }

  /*
   * Mantemos marketplace_listings como cache/registro histórico, mas a
   * decisão de disponibilidade não depende mais da sua data de atualização.
   * Quando houver publicação, sincronizamos as publicações encontradas.
   */
  const now = new Date().toISOString();

  await supabaseAdmin.from("marketplace_listings")
    .update({ active: false, updated_at: now })
    .eq("product_id", product.id)
    .eq("marketplace_id", product.marketplace_id);

  for (const listing of activeListings) {
    if (!listing?.item_id) continue;

    const { error } = await supabaseAdmin
      .from("marketplace_listings")
      .update({
        active: true,
        available_quantity: Number(listing.available_quantity ?? 0),
        last_seen_at: now,
        updated_at: now,
      })
      .eq("marketplace_id", product.marketplace_id)
      .eq("external_item_id", String(listing.item_id));

    if (error) {
      console.warn(
        "Não foi possível atualizar cache da publicação:",
        error.message,
      );
    }
  }

  return {
    available,
    catalogStatus,
    listingsCount: activeListings.length,
    activeListings: activeListings.length,
    reason,
  };
}

async function saveResult(product: any, result: any) {
  const now = new Date().toISOString();
  const newStatus = result.available
    ? "available"
    : "unavailable";

  /*
   * "active" continua representando o registro do produto no Ofertix.
   * A disponibilidade no marketplace é representada por
   * availability_status. Assim o produto nunca é apagado e pode
   * voltar automaticamente quando o Mercado Livre o reencontrar.
   */
  const { error } = await supabaseAdmin
    .from("products")
    .update({
      availability_status: newStatus,
      last_availability_check: now,
      availability_error: null,
      availability_retry_count: 0,
      availability_next_retry_at: null,
      availability_review_required: false,
      availability_review_status: null,
      availability_reviewed_at: null,
      availability_reviewed_by: null,
      availability_review_note: null,
      last_available_at:
        result.available
          ? now
          : product.last_available_at ?? null,
      // Registrar o início da indisponibilidade, sem mover a data a cada
      // verificação repetida do mesmo estado.
      last_unavailable_at:
        result.available
          ? product.last_unavailable_at ?? null
          : product.availability_status === "unavailable"
            ? product.last_unavailable_at ?? now
            : now,
      updated_at: now,
    })
    .eq("id", product.id);

  if (error) {
    throw new Error(
      "Erro ao atualizar disponibilidade: " +
        error.message,
    );
  }

  const { error: historyError } = await supabaseAdmin
    .from("product_availability_history")
    .insert({
      product_id: product.id,
      status: newStatus,
      catalog_status: result.catalogStatus,
      listings_count: result.listingsCount,
      reason: result.reason,
      checked_at: now,
    });

  // O histórico é requisito para elegibilidade de ofertas: não mascarar falha.
  if (historyError) {
    throw new Error(
      "Erro ao registrar histórico de disponibilidade: " +
        historyError.message,
    );
  }
}

async function saveUnverified(product: any, reason: string) {
  const now = new Date();
  const nowIso = now.toISOString();
  const nextAttempt = Number(product.availability_retry_count ?? 0) + 1;
  const nextRetryAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const preserveUnavailable = product.availability_status === "unavailable";

  const { error: updateError } = await supabaseAdmin
    .from("products")
    .update({
      availability_status: preserveUnavailable ? "unavailable" : "unknown",
      last_availability_check: nowIso,
      availability_error: reason,
      availability_retry_count: nextAttempt,
      availability_next_retry_at: preserveUnavailable ? null : nextRetryAt,
      availability_review_required: false,
      availability_review_status: null,
      availability_reviewed_at: null,
      availability_reviewed_by: null,
      availability_review_note: null,
      updated_at: nowIso,
    })
    .eq("id", product.id);

  if (updateError) {
    throw new Error("Erro ao registrar disponibilidade não confirmada: " + updateError.message);
  }

  const { error: historyError } = await supabaseAdmin
    .from("product_availability_history")
    .insert({
      product_id: product.id,
      status: preserveUnavailable ? "unavailable" : "unknown",
      reason,
      checked_at: nowIso,
    });

  if (historyError) {
    throw new Error("Erro ao registrar histórico de disponibilidade não confirmada: " + historyError.message);
  }
}

async function saveError(product: any, error: unknown) {
  const now = new Date();
  const nowIso = now.toISOString();
  const message = error instanceof Error ? error.message : String(error);
  const sellerRestricted = /SELLER_ACCESS_RESTRICTED/i.test(message);
  const nextAttempt = Number(product.availability_retry_count ?? 0) + 1;
  const retryHours = [1, 3, 12, 24];
  const requiresReview = sellerRestricted || nextAttempt > retryHours.length;

  // Indisponibilidade já confirmada não é sobrescrita por uma falha posterior.
  const preserveUnavailable = product.availability_status === "unavailable";
  const resultingStatus = preserveUnavailable ? "unavailable" : "error";
  const nextRetryAt = !requiresReview && !preserveUnavailable
    ? new Date(now.getTime() + retryHours[Math.min(nextAttempt - 1, retryHours.length - 1)] * 3600000).toISOString()
    : null;
  const { error: updateError } = await supabaseAdmin
    .from("products")
    .update({
      availability_status: resultingStatus,
      last_availability_check: nowIso,
      availability_error: message,
      availability_retry_count: nextAttempt,
      availability_next_retry_at: nextRetryAt,
      availability_review_required: requiresReview && !preserveUnavailable,
      availability_review_status: requiresReview && !preserveUnavailable ? "pending" : null,
      updated_at: nowIso,
    })
    .eq("id", product.id);

  if (updateError) {
    throw new Error("Erro ao registrar falha de disponibilidade: " + updateError.message);
  }

  const { error: historyError } = await supabaseAdmin
    .from("product_availability_history")
    .insert({
      product_id: product.id,
      status: "error",
      listings_count: null,
      reason: preserveUnavailable
        ? "Falha na nova consulta; a indisponibilidade anteriormente confirmada foi preservada."
        : "Falha na consulta; disponibilidade não confirmada e produto bloqueado para ofertas.",
      error_message: message,
      checked_at: now,
    });

  if (historyError) {
    throw new Error(
      "Erro ao registrar histórico da falha de disponibilidade: " +
        historyError.message,
    );
  }
}

Deno.serve(async (req) => {
  const runStartedAt = Date.now();
  const { data: runRow } = await supabaseAdmin
    .from("automation_runs")
    .insert({ function_name: "mercado-livre-availability", status: "running" })
    .select("id")
    .single();
  const runId = runRow?.id ?? null;

  try {
    if (req.method !== "POST") {
      return jsonResponse(
        {
          success: false,
          error: "Use POST.",
        },
        405,
      );
    }

    if (!(await authorized(req))) {
      return jsonResponse(
        {
          success: false,
          error: "Não autorizado.",
        },
        401,
      );
    }

    const body =
      await req.json().catch(() => ({}));

    const requestedLimit = Number(
      body?.limit ?? BATCH_SIZE,
    );

    const limit = Math.min(
      Math.max(
        Number.isFinite(requestedLimit)
          ? requestedLimit
          : BATCH_SIZE,
        1,
      ),
      25,
    );

    const connection =
      await getConnection();

    const token =
      await accessToken(connection);

    const requestedProductId = String(body?.product_id ?? "").trim();
    let productsQuery = supabaseAdmin
      .from("products")
      .select(
        "id,marketplace_id,external_id,title,active,affiliate_url,product_url,availability_status,last_availability_check,last_available_at,last_unavailable_at,availability_retry_count",
      )
      .eq("marketplace_id", connection.marketplace_id)
      // Evita consumir o lote com produtos inativos que não podem ser publicados.
      .eq("active", true);

    if (requestedProductId) {
      productsQuery = productsQuery.eq("id", requestedProductId);
    } else {
      // Anúncios já confirmados indisponíveis não entram na fila horária.
      // Podem ser reconsultados sob demanda usando product_id explícito.
      productsQuery = productsQuery
        .neq("availability_status", "unavailable")
        .eq("availability_review_required", false)
        .or("availability_next_retry_at.is.null,availability_next_retry_at.lte." + new Date().toISOString())
        .order("last_availability_check", {
          ascending: true,
          nullsFirst: true,
        }).limit(limit);
    }

    const { data: products, error } = await productsQuery;

    if (error) {
      throw new Error(
        "Erro ao buscar produtos: " +
          error.message,
      );
    }

    let available = 0;
    let unavailable = 0;
    let unverified = 0;
    let errors = 0;

    const results: any[] = [];

    for (const product of products ?? []) {
      await supabaseAdmin
        .from("products")
        .update({
          availability_status:
            "checking",
          availability_error: null,
        })
        .eq("id", product.id);

      try {
        const result =
          await checkProduct(
            product,
            token,
          );

        if (result.unverified) {
          await saveUnverified(product, result.reason);
          unverified++;
          results.push({
            product_id: product.id,
            external_id: product.external_id,
            title: product.title,
            status: "unknown",
            reason: result.reason,
          });
          continue;
        }

        await saveResult(
          product,
          result,
        );

        let offerGeneration: Record<string, unknown> | null = null;
        if (result.available && String(product.affiliate_url ?? "").trim()) {
          // Um link associado pode ter sido adiado pelo offer-generator
          // enquanto faltava disponibilidade recente. Após salvar a nova
          // confirmação e seu histórico, tentamos gerar a oferta novamente.
          try {
            const generationResponse = await fetch(
              SUPABASE_URL + "/functions/v1/offer-generator",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
                },
                body: JSON.stringify({
                  product_id: product.id,
                  affiliate_url: String(product.affiliate_url).trim(),
                }),
              },
            );
            const generationBody = await generationResponse.json().catch(() => null);
            offerGeneration = {
              attempted: true,
              status: generationResponse.status,
              success: generationResponse.ok && generationBody?.success === true,
              deferred: generationResponse.status === 409,
              error: generationBody?.error ?? null,
              created: generationBody?.created === true,
              duplicate: generationBody?.duplicate === true,
            };
            if (!generationResponse.ok || generationBody?.success !== true) {
              console.warn("Geração automática de oferta não concluída", {
                product_id: product.id,
                status: generationResponse.status,
                error: generationBody?.error ?? null,
              });
            }
          } catch (generationError) {
            offerGeneration = {
              attempted: true,
              success: false,
              error: generationError instanceof Error
                ? generationError.message
                : String(generationError),
            };
            console.warn("Falha ao chamar offer-generator", {
              product_id: product.id,
              error: offerGeneration.error,
            });
          }
        }

        if (result.available) {
          available++;
        } else {
          unavailable++;
        }

        results.push({
          product_id:
            product.id,
          external_id:
            product.external_id,
          title:
            product.title,
          status:
            result.available
              ? "available"
              : "unavailable",
          catalog_status:
            result.catalogStatus,
          listings_count:
            result.listingsCount,
          reason:
            result.reason,
          offer_generation:
            offerGeneration,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (/SELLER_ACCESS_RESTRICTED/i.test(errorMessage)) {
          const reason =
            "Anúncio de terceiro. A API do Mercado Livre restringiu a consulta pela conta conectada. " +
            "Disponibilidade mantida como não confirmada; nova tentativa agendada.";
          await saveUnverified(product, reason);
          unverified++;
          results.push({
            product_id: product.id,
            external_id: product.external_id,
            title: product.title,
            status: "unknown",
            reason,
          });
          continue;
        }

        errors++;

        await saveError(
          product,
          error,
        );

        results.push({
          product_id:
            product.id,
          external_id:
            product.external_id,
          title:
            product.title,
          status: "error",
          error:
            error instanceof Error
              ? error.message
              : String(error),
        });
      }
    }

    if (runId) {
      if (results.length) {
        const itemRows = results.map((item: any) => ({
          run_id: runId,
          function_name: "mercado-livre-availability",
          item_type: "product",
          item_id: item.product_id,
          external_id: item.external_id,
          title: item.title,
          status: item.status === "error" ? "failed" : item.status === "unknown" ? "skipped" : item.status,
          action: item.status === "error" ? "availability_check_failed" : item.status === "unknown" ? "availability_not_verified" : "availability_checked",
          message: item.error ?? item.reason ?? null,
          details: { catalog_status: item.catalog_status ?? null, listings_count: item.listings_count ?? null, offer_generation: item.offer_generation ?? null, product_url: (products ?? []).find((p: any) => p.id === item.product_id)?.product_url ?? null, review_required: /SELLER_ACCESS_RESTRICTED|availability_retry_count/i.test(item.error ?? "") },
        }));
        const { error: itemError } = await supabaseAdmin.from("automation_run_items").insert(itemRows);
        if (itemError) console.error("Falha ao salvar detalhes da disponibilidade:", itemError.message);
      }
      if (errors > 0) {
        const errorItems = results.filter((item: any) => item.status === "error");
        const { data: recipients, error: recipientsError } = await supabaseAdmin
          .from("user_profiles").select("user_id").eq("is_active", true);
        if (recipientsError) {
          console.error("Falha ao buscar destinatários das notificações:", recipientsError.message);
        } else if ((recipients ?? []).length > 0) {
          const notificationRows = recipients!.map((profile: any) => ({
            user_id: profile.user_id,
            notification_type: "availability_errors",
            title: "Falhas na verificação de produtos",
            message: errorItems.length + " produto(s) precisam de atenção. Abra o relatório para consultar os motivos.",
            run_id: runId,
            metadata: {
              function_name: "mercado-livre-availability",
              errors_count: errorItems.length,
              product_ids: errorItems.map((item: any) => item.product_id),
              items: errorItems.map((item: any) => ({
                product_id: item.product_id,
                external_id: item.external_id,
                title: item.title,
                error: item.error,
                product_url: (products ?? []).find((p: any) => p.id === item.product_id)?.product_url ?? null,
                review_required: /SELLER_ACCESS_RESTRICTED/i.test(item.error ?? ""),
              })),
            },
          }));
          const { error: notificationError } = await supabaseAdmin.from("user_notifications").insert(notificationRows);
          if (notificationError) console.error("Falha ao criar notificações:", notificationError.message);
        }
      }
      await supabaseAdmin.from("automation_runs").update({
        status: errors === (products ?? []).length && errors > 0 ? "failed" : "succeeded",
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - runStartedAt,
        products_processed: (products ?? []).length,
        errors_count: errors,
        metrics: { products_processed: (products ?? []).length, available, unavailable, unverified, errors }
      }).eq("id", runId);
    }

    return jsonResponse({
      success: true,
      marketplace:
        "Mercado Livre",
      products_processed:
        (products ?? []).length,
      available,
      unavailable,
      unverified,
      errors,
      results,
    });
  } catch (error) {
    if (runId) {
      await supabaseAdmin.from("automation_runs").update({
        status: "failed",
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - runStartedAt,
        errors_count: 1,
        error_message: error instanceof Error ? error.message : String(error)
      }).eq("id", runId);
    }
    console.error(
      "mercado-livre-availability error",
      error,
    );

    return jsonResponse(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      500,
    );
  }
});