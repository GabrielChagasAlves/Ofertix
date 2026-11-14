import { createClient } from "npm:@supabase/supabase-js@2";



type Offer = {
  id: string;
  title: string | null;
  message: string | null;
  affiliate_url: string | null;
  status: string;
  approval_status: string;
  scheduled_at: string | null;
  product_id: string;
  rule_id: string | null;
};

type Product = {
  id: string;
  title: string;
  price: number | null;
  original_price: number | null;
  discount_percent: number | null;
  category: string | null;
  image_url?: string | null;
  commercial_category_id?: string | null;
};

type Rule = {
  id: string;
  category: string | null;
};

type Channel = {
  id: string;
  name: string;
  type: "telegram" | "facebook" | "instagram" | "tiktok" | "whatsapp";
  category_id: string | null;
  identifier: string | null;
  active: boolean;
  auto_publish: boolean;
};

type Publication = {
  id: string;
  offer_id: string;
  channel_id: string;
  status: "pending" | "publishing" | "published" | "failed" | "cancelled";
  attempts: number;
  next_retry_at: string | null;
};

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "content-type, x-ofertix-cron-secret",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}

function normalizeMessageText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, " ")
    .replace(/\\s+/g, " ")
    .trim();
}

function cleanTitle(value: string | null): string {
  return String(value ?? "")
    .replace(/\\s+/g, " ")
    .replace(/^oferta(?: em destaque)?[:\\-]?/i, "")
    .trim()
    .slice(0, 180);
}

function stableIndex(seed: string, length: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return length > 0 ? hash % length : 0;
}

function formatBRL(value: number): string {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function buildMessage(offer: Offer, product: Product, category?: string | null) {
  const title = cleanTitle(product.title || offer.title) || "Oferta";
  const normalizedTitle = normalizeMessageText(title);
  const normalizedCategory = normalizeMessageText(category || product.category || "");
  const discount = product.discount_percent !== null && product.discount_percent > 0 ? Number(product.discount_percent) : null;
  const price = product.price !== null ? Number(product.price) : null;
  const originalPrice = product.original_price !== null ? Number(product.original_price) : null;
  const hasRealDiscount = originalPrice !== null && price !== null && originalPrice > price;
  const savings = hasRealDiscount ? originalPrice - price : null;

  const isAutomotive = /automotivo|pecas para carros/.test(normalizedCategory);
  const isHome = /casa e utilidades|casa|utilidades/.test(normalizedCategory);
  const isTech = /tecnologia/.test(normalizedCategory);
  const isPerfume = /perfume/.test(normalizedCategory);
  const isTool = /ferramenta|chave|soquete|catraca|torquimetro|macaco|alicate/.test(normalizedTitle);
  const isMaintenance = /filtro|pastilha|amortecedor|correia|embreagem|rolamento|vela|palheta|oleo|bomba/.test(normalizedTitle);
  const isCarAccessory = /tapete|capa|camera|sensor|multimidia|led|lampada|suporte|friso|volante/.test(normalizedTitle);
  const isKitchen = /prato|jantar|copo|taca|caneca|faqueiro|talher|panela|frigideira|escorredor/.test(normalizedTitle);
  const isCleaning = /mop|vassoura|rodo|lixeira|pano|limpeza|escova/.test(normalizedTitle);
  const isBedding = /toalha|lencol|fronha|travesseiro|edredom|cobertor/.test(normalizedTitle);

  let hooks: string[];
  let benefit: string;

  if (isAutomotive && isTool) {
    hooks = ["🔧 Ferramenta certa faz diferença na hora de cuidar do carro", "🚗 Para quem gosta de manter o carro em dia", "🛠️ Um achado para sua caixa de ferramentas"];
    benefit = "Uma opção para equipar sua oficina ou facilitar os cuidados com o carro.";
  } else if (isAutomotive && isMaintenance) {
    hooks = ["🚗 Peça de manutenção com preço para conferir", "🔩 Está na hora de cuidar do carro? Veja esta opção", "🧰 Um item importante para sua próxima manutenção"];
    benefit = "Confira a aplicação e a compatibilidade com o modelo do seu veículo antes de comprar.";
  } else if (isAutomotive && isCarAccessory) {
    hooks = ["🚘 Um upgrade para deixar seu carro do seu jeito", "✨ Mais personalidade ou praticidade para o carro", "🚗 Olha esta opção para equipar seu veículo"];
    benefit = "Veja os detalhes do acessório e confirme a compatibilidade com seu veículo.";
  } else if (isHome && isKitchen) {
    hooks = ["🍽️ Daqueles itens que fazem falta na cozinha", "🏡 Um achado útil para equipar sua casa", "☕ Pequenos detalhes que deixam a rotina mais prática"];
    benefit = "Uma opção para completar sua cozinha e facilitar o dia a dia.";
  } else if (isHome && isCleaning) {
    hooks = ["🧹 Deixe a rotina da casa mais prática", "🏡 Um aliado para os cuidados do dia a dia", "✨ Mais praticidade para manter tudo em ordem"];
    benefit = "Confira esta opção para ajudar nas tarefas e na organização da casa.";
  } else if (isHome && isBedding) {
    hooks = ["🛏️ Um cuidado a mais com o conforto da casa", "🏡 Vale conferir para renovar os itens de casa", "✨ Um item útil para o dia a dia da família"];
    benefit = "Uma opção para renovar os itens de uso diário da sua casa.";
  } else if (isHome) {
    hooks = ["🏡 Um item útil que pode fazer falta em casa", "✨ Mais praticidade para sua rotina", "🛒 Achado para deixar a casa mais funcional"];
    benefit = "Confira os detalhes e veja se combina com o que você precisa em casa.";
  } else if (isTech) {
    hooks = ["⚡ Tecnologia útil para facilitar sua rotina", "📱 Vale dar uma olhada neste achado", "🔌 Um upgrade prático para seus dispositivos"];
    benefit = "Confira os recursos e a compatibilidade com seus aparelhos.";
  } else if (isPerfume) {
    hooks = ["✨ Um novo aroma para conhecer", "🌸 Perfume em destaque com preço reduzido", "💫 Vale conferir esta opção para sua coleção"];
    benefit = "Veja as informações da fragrância, volume e apresentação antes de escolher.";
  } else {
    hooks = ["👀 Olha o que encontramos para você", "💡 Uma oportunidade que vale conferir", "🛍️ Este produto entrou no radar do Ofertix", "📌 Salve esta opção para comparar depois"];
    benefit = "Confira os detalhes do produto e avalie se atende ao que você procura.";
  }

  // A variação é estável por oferta: uma nova tentativa mantém o mesmo texto.
  const hook = hooks[stableIndex(offer.id, hooks.length)];
  const lines: string[] = [hook, "", "🛍️ " + title, "", benefit];

  if (hasRealDiscount && originalPrice !== null && price !== null) {
    lines.push("", "De " + formatBRL(originalPrice) + " por " + formatBRL(price));
    if (discount !== null) lines.push("📉 " + discount.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "% OFF");
    if (savings !== null && savings > 0) lines.push("💸 Você economiza " + formatBRL(savings));
  } else if (price !== null) {
    lines.push("", "💰 Preço: " + formatBRL(price));
  }

  const extraMessage = String(offer.message ?? "").trim();
  const normalizedExtra = normalizeMessageText(extraMessage);
  const repeatsTitle = normalizedExtra.length > 0 && normalizedTitle.length >= 8 && normalizedExtra.includes(normalizedTitle);
  const repeatsDiscount = discount !== null && normalizedExtra.includes((discount.toFixed(2) + "% off").replace(".", ","));
  const isGeneratedBoilerplate = /% off/.test(normalizedExtra) && (normalizedExtra.includes("oferta") || normalizedExtra.includes("desconto"));
  if (extraMessage && !repeatsTitle && !repeatsDiscount && !isGeneratedBoilerplate && normalizedExtra.length > 12) {
    lines.push("", extraMessage.slice(0, 240));
  }

  if (offer.affiliate_url) lines.push("", "👇 Confira os detalhes e veja a oferta:", offer.affiliate_url);
  lines.push("", "ℹ️ Preço e disponibilidade podem mudar. Confira as condições no anúncio.", "", "#Ofertix");
  return lines.join("\n").slice(0, 4096);
}
function categoryMatches(
  channel: Channel,
  offerCategory: string | null,
  categoryById: Map<string, string>,
) {
  if (!channel.category_id) return true;

  const channelCategory = categoryById.get(channel.category_id);
  if (!channelCategory) return false;

  return (
    !!offerCategory &&
    channelCategory.trim().toLowerCase() ===
      offerCategory.trim().toLowerCase()
  );
}

export default {
  fetch: async (req) => {
    const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
    const secretKeys = secretKeysRaw ? JSON.parse(secretKeysRaw) : {};
    const adminKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!adminKey || !supabaseUrl) return json({ error: "Credenciais administrativas do Supabase não configuradas." }, 500);
    const supabaseAdmin = createClient(supabaseUrl, adminKey, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });

    // Consultas REST podem falhar transitoriamente (rede ou JWT com iat futuro).
    // Repetimos apenas erros transitórios e mantemos as falhas definitivas visíveis.
    const queryWithRetry = async (operation: () => PromiseLike<any>, label: string) => {
      let lastError: any = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const result = await operation();
          if (!result.error) return result;
          lastError = result.error;
        } catch (error) {
          lastError = error;
        }
        const message = String(lastError?.message ?? lastError ?? "");
        const transient = lastError instanceof TypeError ||
          /error sending request|fetch failed|connection reset|timed? out|JWT issued at future|PGRST303/i.test(message);
        if (!transient || attempt === 3) break;
        console.warn(`[publication-worker] tentativa ${attempt}/3 em ${label}: ${message.slice(0, 240)}`);
        await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
      }
      return { data: null, error: lastError ?? new Error(`Falha ao consultar ${label}`) };
    };

    const inBatches = <T>(items: T[], size = 100): T[][] => {
      const batches: T[][] = [];
      for (let index = 0; index < items.length; index += size) {
        batches.push(items.slice(index, index + size));
      }
      return batches;
    };

    const loadProducts = async (ids: string[]) => {
      const batches = inBatches([...new Set(ids)]);
      const results = await Promise.all(batches.map((batch, index) =>
        queryWithRetry(() => supabaseAdmin.from("products")
          .select("id,title,price,original_price,discount_percent,category,image_url,commercial_category_id")
          .in("id", batch), `products lote ${index + 1}/${batches.length}`)
      ));
      const failedResult = results.find((result) => result.error);
      return { data: results.flatMap((result) => result.data || []), error: failedResult?.error ?? null };
    };

    const loadAffiliateLinks = async (ids: string[]) => {
      const batches = inBatches([...new Set(ids)]);
      const results = await Promise.all(batches.map((batch, index) =>
        queryWithRetry(() => supabaseAdmin.from("affiliate_links")
          .select("product_id,affiliate_url,status")
          .in("product_id", batch)
          .eq("status", "ready"), `affiliate_links lote ${index + 1}/${batches.length}`)
      ));
      const failedResult = results.find((result) => result.error);
      return { data: results.flatMap((result) => result.data || []), error: failedResult?.error ?? null };
    };

    const loadRules = async (ids: string[]) => {
      const batches = inBatches([...new Set(ids)]);
      const results = await Promise.all(batches.map((batch, index) =>
        queryWithRetry(() => supabaseAdmin.from("offer_rules")
          .select("id,category")
          .in("id", batch), `offer_rules lote ${index + 1}/${batches.length}`)
      ));
      const failedResult = results.find((result) => result.error);
      return { data: results.flatMap((result) => result.data || []), error: failedResult?.error ?? null };
    };

    if (req.method === "OPTIONS") {
      return new Response("ok", {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers":
            "content-type, x-ofertix-cron-secret",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
      });
    }

    if (req.method !== "POST") {
      return json({ error: "Método não permitido." }, 405);
    }

    const startedAt = Date.now();

    try {
      const providedSecret =
        req.headers.get("x-ofertix-cron-secret") || "";

      const { data: secretRow, error: secretError } =
        await supabaseAdmin
          .from("automation_secrets")
          .select("secret")
          .eq("name", "publication_worker")
          .maybeSingle();

      if (secretError) throw secretError;

      if (
        !secretRow?.secret ||
        !providedSecret ||
        providedSecret !== secretRow.secret
      ) {
        return json({ error: "Não autorizado." }, 401);
      }

      const body = await req.json().catch(() => ({}));
      const requestedChannelId =
        typeof body?.channel_id === "string" && body.channel_id.trim()
          ? body.channel_id.trim()
          : null;

      const now = new Date();

      const { data: offersData, error: offersError } =
        await supabaseAdmin
          .from("offers")
          .select(
            "id,title,message,affiliate_url,status,approval_status,scheduled_at,product_id,rule_id",
          )
          .eq("approval_status", "approved")
          .in("status", ["approved", "scheduled"])
          .not("affiliate_url", "is", null)
          // Prioriza aprovações recentes e examina um lote amplo o suficiente para que
          // publicações antigas já existentes não monopolizem a fila.
          // A criação continua idempotente: cada par oferta/canal é conferido antes do insert.
          .order("created_at", { ascending: false })
          .limit(1000);

      if (offersError) throw offersError;

      const offers = (offersData || []) as Offer[];
      const eligibleOffers = offers.filter((offer) => {
        if (
          offer.status === "scheduled" &&
          offer.scheduled_at &&
          new Date(offer.scheduled_at) > now
        ) {
          return false;
        }

        return true;
      });

      const productIds = [...new Set(eligibleOffers.map((o) => o.product_id))];
      const ruleIds = [
        ...new Set(
          eligibleOffers
            .map((o) => o.rule_id)
            .filter((id): id is string => !!id),
        ),
      ];

      let channelsQuery = supabaseAdmin
        .from("channels")
        .select("id,name,type,category_id,identifier,active,auto_publish")
        .eq("active", true);
      if (requestedChannelId) {
        channelsQuery = channelsQuery.eq("id", requestedChannelId);
      }

      const [
        productsResult,
        rulesResult,
        channelsResult,
        affiliateLinksResult,
        categoriesResult,
      ] = await Promise.all([
        productIds.length
          ? loadProducts(productIds)
          : Promise.resolve({ data: [], error: null }),

        ruleIds.length
          ? loadRules(ruleIds)
          : Promise.resolve({ data: [], error: null }),

        channelsQuery,

        productIds.length
          ? loadAffiliateLinks(productIds)
          : Promise.resolve({ data: [], error: null }),

        supabaseAdmin
          .from("offer_categories")
          .select("id,name")
          .eq("active", true),
      ]);

      for (const result of [
        productsResult,
        rulesResult,
        channelsResult,
        affiliateLinksResult,
        categoriesResult,
      ]) {
        if (result.error) throw result.error;
      }

      const products = new Map(
        ((productsResult.data || []) as Product[]).map((p) => [
          p.id,
          p,
        ]),
      );

      const rules = new Map(
        ((rulesResult.data || []) as Rule[]).map((r) => [
          r.id,
          r,
        ]),
      );

      const channels = (channelsResult.data || []) as Channel[];

      const categoryById = new Map(
        ((categoriesResult.data || []) as CategoryRow[]).map((c) => [
          c.id,
          c.name,
        ]),
      );

      const readyAffiliateUrls = new Map<string, Set<string>>();

      for (const link of (affiliateLinksResult.data || []) as {
        product_id: string;
        affiliate_url: string;
        status: string;
      }[]) {
        if (!readyAffiliateUrls.has(link.product_id)) {
          readyAffiliateUrls.set(link.product_id, new Set());
        }

        readyAffiliateUrls
          .get(link.product_id)!
          .add(link.affiliate_url);
      }

      let queued = 0;
      let skippedAffiliate = 0;

      for (const offer of eligibleOffers) {
        const product = products.get(offer.product_id);

        if (!product) continue;
        // A aprovação manual substitui a checagem automática de estoque.
        const readyUrls =
          readyAffiliateUrls.get(offer.product_id) || new Set<string>();
        const resolvedAffiliateUrl = offer.affiliate_url && readyUrls.has(offer.affiliate_url)
          ? offer.affiliate_url
          : (readyUrls.values().next().value as string | undefined);

        if (!resolvedAffiliateUrl) {
          skippedAffiliate++;
          continue;
        }

        // Usa e persiste o link afiliado validado como fonte de verdade.
        if (offer.affiliate_url !== resolvedAffiliateUrl) {
          const { error: affiliateUrlUpdateError } = await supabaseAdmin
            .from("offers")
            .update({ affiliate_url: resolvedAffiliateUrl })
            .eq("id", offer.id);
          if (affiliateUrlUpdateError) throw affiliateUrlUpdateError;
          offer.affiliate_url = resolvedAffiliateUrl;
        }

        const rule = offer.rule_id
          ? rules.get(offer.rule_id)
          : undefined;

        const offerCategory =
          rule?.category ||
          (product.commercial_category_id
            ? categoryById.get(product.commercial_category_id)
            : null) ||
          product.category ||
          null;

        // WhatsApp entra na fila como rascunho manual: a Cloud API oficial
        // não oferece publicação em Canais. Os demais canais só entram quando
        // a publicação automática estiver explicitamente habilitada.
        const compatibleChannels = channels.filter((channel) =>
          (channel.auto_publish || channel.type === "whatsapp") &&
          categoryMatches(
            channel,
            offerCategory,
            categoryById,
          ),
        );

        for (const channel of compatibleChannels) {
          const { data: existing, error: existingError } =
            await supabaseAdmin
              .from("channel_publications")
              .select("id,status,error_message")
              .eq("offer_id", offer.id)
              .eq("channel_id", channel.id)
              .maybeSingle();

          if (existingError) throw existingError;

          if (existing) {
            // Reabre somente cancelamentos cujo registro informa que a publicação antiga
            // não foi encontrada no Telegram. A oferta já passou pelas verificações
            // de produto ativo, disponibilidade recente e link pronto acima.
            if (
              existing.status === "cancelled" &&
              existing.error_message === "Publicação antiga não encontrada no Telegram; sincronização encerrada."
            ) {
              const { error: reopenError } = await supabaseAdmin
                .from("channel_publications")
                .update({
                  status: "pending",
                  attempts: 0,
                  error_message: null,
                  next_retry_at: null,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", existing.id)
                .eq("status", "cancelled");
              if (reopenError) throw reopenError;
              queued++;
            }
            continue;
          }

          const { error: insertError } =
            await supabaseAdmin
              .from("channel_publications")
              .insert({
                offer_id: offer.id,
                channel_id: channel.id,
                status: "pending",
                attempts: 0,
              });

          if (insertError) {
            if (insertError.code === "23505") continue;
            throw insertError;
          }

          queued++;
        }
      }

      // Cada execução representa um ciclo sincronizado: até 5 publicações
      // para CADA canal Telegram ativo, sem cooldown individual entre grupos.
      let pendingQuery = supabaseAdmin
        .from("channel_publications")
        .select("id,offer_id,channel_id,status,attempts,next_retry_at")
        .in("status", ["pending", "failed"])
        .order("created_at", { ascending: true })
        .limit(1000);
      if (requestedChannelId) {
        pendingQuery = pendingQuery.eq("channel_id", requestedChannelId);
      }
      const { data: pendingData, error: pendingError } = await pendingQuery;

      if (pendingError) throw pendingError;

      const pendingCandidates = (pendingData || []) as Publication[];
      const activeTelegramChannelIds = new Set(
        channels
          .filter((channel) => channel.active && channel.auto_publish && channel.type === "telegram")
          .map((channel) => channel.id),
      );
      const pendingByChannel = new Map<string, Publication[]>();

      for (const publication of pendingCandidates) {
        if (!activeTelegramChannelIds.has(publication.channel_id)) continue;

        // Falhas com nova tentativa futura aguardam, sem ocupar uma das 5 vagas do canal.
        if (
          publication.status === "failed" &&
          publication.next_retry_at &&
          new Date(publication.next_retry_at) > now
        ) {
          continue;
        }

        const channelPending = pendingByChannel.get(publication.channel_id) || [];
        if (channelPending.length >= 5) continue;
        channelPending.push(publication);
        pendingByChannel.set(publication.channel_id, channelPending);
      }

      // Mantém todos os grupos no mesmo ciclo de execução, com até 5 itens por grupo.
      const pending = channels
        .filter((channel) => activeTelegramChannelIds.has(channel.id))
        .flatMap((channel) => pendingByChannel.get(channel.id) || []);

      const publicationOfferIds = [
        ...new Set(pending.map((p) => p.offer_id)),
      ];
      const publicationChannelIds = [
        ...new Set(pending.map((p) => p.channel_id)),
      ];

      const [pubOffersResult, pubChannelsResult] =
        await Promise.all([
          publicationOfferIds.length
            ? supabaseAdmin
                .from("offers")
                .select(
                  "id,title,message,affiliate_url,status,approval_status,scheduled_at,product_id,rule_id",
                )
                .in("id", publicationOfferIds)
            : Promise.resolve({ data: [], error: null }),

          publicationChannelIds.length
            ? supabaseAdmin
                .from("channels")
                .select(
                  "id,name,type,category_id,identifier,active,auto_publish",
                )
                .in("id", publicationChannelIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

      if (pubOffersResult.error) throw pubOffersResult.error;
      if (pubChannelsResult.error) throw pubChannelsResult.error;

      const pubOffers = new Map(
        ((pubOffersResult.data || []) as Offer[]).map((o) => [
          o.id,
          o,
        ]),
      );

      const pubChannels = new Map(
        ((pubChannelsResult.data || []) as Channel[]).map((c) => [
          c.id,
          c,
        ]),
      );

      const queuedOffers = [...pubOffers.values()];
      const queuedProductIds = [...new Set(queuedOffers.map((offer) => offer.product_id))];
      const missingProductIds = queuedProductIds.filter((id) => !products.has(id));
      if (missingProductIds.length) {
        const queuedProductsResult = await loadProducts(missingProductIds);
        if (queuedProductsResult.error) throw queuedProductsResult.error;
        for (const product of (queuedProductsResult.data || []) as Product[]) products.set(product.id, product);
      }

      const queuedAffiliateResult = await loadAffiliateLinks(queuedProductIds);
      if (queuedAffiliateResult.error) throw queuedAffiliateResult.error;
      for (const link of (queuedAffiliateResult.data || []) as { product_id: string; affiliate_url: string; status: string }[]) {
        if (!readyAffiliateUrls.has(link.product_id)) readyAffiliateUrls.set(link.product_id, new Set());
        readyAffiliateUrls.get(link.product_id)!.add(link.affiliate_url);
      }

      const queuedRuleIds = [...new Set(queuedOffers.map((offer) => offer.rule_id).filter((id): id is string => !!id))];
      const missingRuleIds = queuedRuleIds.filter((id) => !rules.has(id));
      if (missingRuleIds.length) {
        const queuedRulesResult = await loadRules(missingRuleIds);
        if (queuedRulesResult.error) throw queuedRulesResult.error;
        for (const rule of (queuedRulesResult.data || []) as Rule[]) rules.set(rule.id, rule);
      }

      let published = 0;
      let failed = 0;
      let skipped = 0;
      const runItems: Array<Record<string, unknown>> = [];
      const recordRunItem = (publication: Publication, offer: Offer | undefined, channel: Channel | undefined, product: Product | undefined, status: string, action: string, message: string | null, details: Record<string, unknown> = {}) => {
        runItems.push({
          function_name: "publication-worker", item_type: "publication",
          item_id: product?.id ?? offer?.product_id ?? null, external_id: publication.id,
          title: product?.title ?? offer?.title ?? "Oferta sem produto", status, action, message,
          details: { publication_id: publication.id, offer_id: publication.offer_id, channel_id: publication.channel_id, channel_name: channel?.name ?? null, attempts: publication.attempts, ...details },
        });
      };

      for (const publication of pending) {
        if (
          publication.status === "failed" &&
          publication.next_retry_at &&
          new Date(publication.next_retry_at) > now
        ) {
          skipped++;
          recordRunItem(publication, pubOffers.get(publication.offer_id), pubChannels.get(publication.channel_id), undefined, "skipped", "retry_deferred", "Nova tentativa agendada para " + publication.next_retry_at, { next_retry_at: publication.next_retry_at });
          continue;
        }

        const offer = pubOffers.get(publication.offer_id);
        const channel = pubChannels.get(publication.channel_id);

        if (!offer || !channel) {
          skipped++;
          recordRunItem(publication, offer, channel, undefined, "skipped", "missing_relation", !offer ? "Oferta não encontrada para esta publicação." : "Canal não encontrado para esta publicação.");
          continue;
        }

        if (
          !channel.active ||
          !channel.auto_publish ||
          channel.type !== "telegram"
        ) {
          skipped++;
          recordRunItem(publication, offer, channel, products.get(offer.product_id), "skipped", "channel_not_enabled", "Canal inativo, publicação automática desabilitada ou tipo de canal ainda não suportado.");
          continue;
        }

        if (offer.approval_status !== "approved") {
          skipped++;
          recordRunItem(publication, offer, channel, products.get(offer.product_id), "skipped", "offer_not_approved", "Oferta ainda não está aprovada.");
          continue;
        }

        if (
          offer.status !== "approved" &&
          offer.status !== "scheduled"
        ) {
          skipped++;
          recordRunItem(publication, offer, channel, products.get(offer.product_id), "skipped", "offer_status_blocked", "Status da oferta não permite publicação: " + offer.status);
          continue;
        }

        if (!offer.affiliate_url) {
          skipped++;
          recordRunItem(publication, offer, channel, products.get(offer.product_id), "skipped", "missing_affiliate_url", "Oferta sem link de afiliado.");
          continue;
        }

        const product = products.get(offer.product_id);

        if (!product) {
          skipped++;
          recordRunItem(publication, offer, channel, undefined, "skipped", "product_not_found", "Produto associado à oferta não foi encontrado.");
          continue;
        }

        const readyUrls = readyAffiliateUrls.get(offer.product_id);
        if (!readyUrls?.has(offer.affiliate_url || "")) {
          await supabaseAdmin.from("channel_publications").update({
            status: "cancelled",
            error_message: "Publicação bloqueada: link de afiliado não consta como pronto para este produto.",
            updated_at: new Date().toISOString(),
          }).eq("id", publication.id);
          skipped++;
          recordRunItem(publication, offer, channel, product, "rejected", "affiliate_link_not_ready", "Publicação bloqueada: link de afiliado não consta como pronto para este produto.");
          continue;
        }

        const rule = offer.rule_id
          ? rules.get(offer.rule_id)
          : undefined;

        const offerCategory =
          rule?.category || product.category || null;

        const attempts = Number(publication.attempts || 0) + 1;

        const { data: claimedPublication, error: claimError } = await supabaseAdmin
          .from("channel_publications")
          .update({
            status: "publishing",
            attempts,
            error_message: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", publication.id)
          .in("status", ["pending", "failed"])
          .select("id")
          .maybeSingle();

        if (claimError) throw claimError;
        if (!claimedPublication) {
          skipped++;
          recordRunItem(publication, offer, channel, product, "skipped", "already_claimed", "Publicação já foi assumida por outra execução.");
          continue;
        }

        const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");

        if (!botToken) {
          throw new Error(
            "TELEGRAM_BOT_TOKEN não configurado no Supabase.",
          );
        }

        const messageText = buildMessage(
          offer,
          product,
          offerCategory,
        );

        let telegramResponse: Response;
        let telegramData: any;
        try {
          if (product.image_url && messageText.length <= 1024) {
            const photoForm = new FormData();
            photoForm.append("chat_id", String(channel.identifier));
            photoForm.append("photo", String(product.image_url));
            photoForm.append("caption", messageText);
            telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, { method: "POST", body: photoForm });
            telegramData = await telegramResponse.json();

            // URL de imagem inacessível para o Telegram não deve bloquear
            // a publicação do texto com o link de afiliado.
            if (!telegramResponse.ok || !telegramData?.ok || telegramData?.result?.message_id == null) {
              const photoError = String(telegramData?.description ?? "");
              if (/failed to get http url content|wrong file identifier|failed to fetch/i.test(photoError)) {
                telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ chat_id: channel.identifier, text: messageText, disable_web_page_preview: false }),
                });
                telegramData = await telegramResponse.json();
              }
            }
          } else if (product.image_url) {
            // Legendas de fotos têm limite de 1024 caracteres; enviar foto e texto separados.
            const photoForm = new FormData();
            photoForm.append("chat_id", String(channel.identifier));
            photoForm.append("photo", String(product.image_url));
            telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, { method: "POST", body: photoForm });
            const photoData = await telegramResponse.json();
            if (!telegramResponse.ok || !photoData?.ok || photoData?.result?.message_id == null) {
              const photoError = String(photoData?.description ?? "");
              if (/failed to get http url content|wrong file identifier|failed to fetch/i.test(photoError)) {
                telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ chat_id: channel.identifier, text: messageText, disable_web_page_preview: false }),
                });
                telegramData = await telegramResponse.json();
              } else {
                telegramData = photoData;
              }
            } else {
              telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: channel.identifier, text: messageText, disable_web_page_preview: false }),
              });
              telegramData = await telegramResponse.json();
            }
          } else {
            telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: channel.identifier, text: messageText, disable_web_page_preview: false }),
            });
            telegramData = await telegramResponse.json();
          }
        } catch (sendError) {
          const reason = sendError instanceof Error ? sendError.message : String(sendError);
          const retrySeconds = Math.min(900, Math.max(60, attempts * 60));
          await supabaseAdmin.from("channel_publications").update({
            status: "failed",
            error_message: `Falha de comunicação com Telegram: ${reason.slice(0, 700)}`,
            next_retry_at: new Date(Date.now() + retrySeconds * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", publication.id);
          failed++;
          recordRunItem(publication, offer, channel, product, "failed", "telegram_transport_error", "Falha de comunicação com Telegram: " + reason.slice(0, 700), { attempt: attempts });
          continue;
        }

        if (!telegramResponse.ok || !telegramData?.ok) {
          const retryAfter =
            Number(telegramData?.parameters?.retry_after || 0);

          const retrySeconds =
            retryAfter > 0
              ? retryAfter
              : Math.min(900, Math.max(60, attempts * 60));

          await supabaseAdmin
            .from("channel_publications")
            .update({
              status: "failed",
              error_message:
                telegramData?.description ||
                `Telegram HTTP ${telegramResponse.status}`,
              next_retry_at: new Date(
                Date.now() + retrySeconds * 1000,
              ).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", publication.id);

          failed++;
          recordRunItem(publication, offer, channel, product, "failed", "telegram_rejected", String(telegramData?.description || ("Telegram HTTP " + telegramResponse.status)), { http_status: telegramResponse.status, telegram_error_code: telegramData?.error_code ?? null, attempt: attempts, retry_after: retrySeconds });
          // Nunca marcar como publicada uma chamada rejeitada pelo Telegram.
          continue;
        }

        const telegramMessageId = telegramData?.result?.message_id;
        if (telegramData?.ok !== true || telegramMessageId === undefined || telegramMessageId === null) {
          const retrySeconds = Math.min(900, Math.max(60, attempts * 60));
          await supabaseAdmin
            .from("channel_publications")
            .update({
              status: "failed",
              error_message: "Telegram não confirmou a mensagem (resposta sem message_id).",
              next_retry_at: new Date(Date.now() + retrySeconds * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", publication.id);
          failed++;
          recordRunItem(publication, offer, channel, product, "failed", "telegram_missing_message_id", "Telegram não confirmou a mensagem (resposta sem message_id).", { http_status: telegramResponse.status, attempt: attempts });
          continue;
        }

        await supabaseAdmin
          .from("channel_publications")
          .update({
            status: "published",
            external_post_id:
              String(telegramMessageId),
            published_at: new Date().toISOString(),
            error_message: null,
            next_retry_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", publication.id);

        published++;
        recordRunItem(publication, offer, channel, product, "published", "telegram_published", "Publicação confirmada pelo Telegram.", { external_post_id: String(telegramMessageId), attempt: attempts });
        // O limite é de cinco por canal, definido na montagem do lote.
      }

      const durationMs = Date.now() - startedAt;

      const { data: runRow, error: runInsertError } = await supabaseAdmin.from("automation_runs").insert({
        function_name: "publication-worker",
        status: "succeeded",
        started_at: new Date(startedAt).toISOString(),
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
        items_processed: pending.length,
        errors_count: failed,
        metrics: {
          eligible_offers: eligibleOffers.length,
          queued,
          published,
          failed,
          skipped,
          skipped_affiliate: skippedAffiliate,
          telegram_processed: pending.length,
        },
      }).select("id").single();

      if (runInsertError) throw runInsertError;
      if (runRow?.id && runItems.length) {
        const { error: itemInsertError } = await supabaseAdmin.from("automation_run_items").insert(
          runItems.map((item) => ({ ...item, run_id: runRow.id })),
        );
        if (itemInsertError) console.error("Falha ao salvar auditoria individual das publicações:", itemInsertError.message);
      }

      return json({
        ok: true,
        eligible_offers: eligibleOffers.length,
        queued,
        published,
        failed,
        skipped,
        skipped_affiliate: skippedAffiliate,
        duration_ms: durationMs,
      });
    } catch (error) {
      console.error("publication-worker error:", error);

      try {
        await supabaseAdmin.from("automation_runs").insert({
          function_name: "publication-worker",
          status: "failed",
          started_at: new Date(startedAt).toISOString(),
          finished_at: new Date().toISOString(),
          duration_ms: Date.now() - startedAt,
          errors_count: 1,
          error_message:
            error instanceof Error
              ? error.message
              : "Erro interno no publication-worker.",
        });
      } catch {
        // Não mascara o erro principal.
      }

      return json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Erro interno no publication-worker.",
        },
        500,
      );
    }
  },
};

type CategoryRow = {
  id: string;
  name: string;
};
