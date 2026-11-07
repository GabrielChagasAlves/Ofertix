import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Payload = {
  product_id?: string;
  affiliate_url?: string;
  affiliate_tag?: string | null;
};

type Category = {
  name: string;
  keywords: string[];
  excluded_keywords: string[];
  priority: number;
  active: boolean;
};

function normalize(value: string | null | undefined) {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function resolveCategory(title: string, categories: Category[]) {
  const normalizedTitle = normalize(title);

  const ordered = [...categories]
    .filter((category) => category.active)
    .sort((a, b) => a.priority - b.priority);

  for (const category of ordered) {
    const excluded = category.excluded_keywords.some((keyword) =>
      normalizedTitle.includes(normalize(keyword))
    );

    if (excluded) continue;

    const matches = category.keywords.some((keyword) => {
      const normalizedKeyword = normalize(keyword);
      if (normalizedKeyword.length < 5) return false;
      return normalizedTitle.includes(normalizedKeyword);
    });

    if (matches) return category.name;
  }

  return ordered.find((category) => normalize(category.name) === "outros")?.name ?? null;
}

function matchesRule(rule: any, product: any, resolvedCategory: string | null, selectedPrice: number) {
  if (!rule.active) return false;

  if (rule.marketplace_id && rule.marketplace_id !== product.marketplace_id) {
    return false;
  }

  if (rule.category && rule.category !== resolvedCategory) {
    return false;
  }

  const price = selectedPrice;
  const discount =
    product.discount_percent === null || product.discount_percent === undefined
      ? 0
      : Number(product.discount_percent);

  if (rule.min_price !== null && price < Number(rule.min_price)) return false;
  if (rule.max_price !== null && price > Number(rule.max_price)) return false;
  if (
    rule.min_discount_percent !== null &&
    discount < Number(rule.min_discount_percent)
  ) {
    return false;
  }

  return true;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Connection": "keep-alive",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Método não permitido." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Configuração interna ausente." }, 500);
  }

  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido." }, 400);
  }

  const productId = body.product_id?.trim();
  const affiliateUrl = body.affiliate_url?.trim();

  if (!productId || !affiliateUrl) {
    return json({ error: "product_id e affiliate_url são obrigatórios." }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: product, error: productError } = await admin
    .from("products")
    .select(
      "id,title,description,category,price,original_price,discount_percent,image_url,product_url,affiliate_url,marketplace_id,active,commercial_category_id,commercial_category_source"
    )
    .eq("id", productId)
    .maybeSingle();

  if (productError) {
    console.error(productError);
    return json({ error: "Não foi possível consultar o produto." }, 500);
  }

  if (!product) {
    return json({ error: "Produto não encontrado." }, 404);
  }

  const { data: readyLinks, error: readyLinksError } = await admin.from("affiliate_links")
    .select("affiliate_url").eq("product_id", product.id).eq("status", "ready");
  if (readyLinksError) return json({ error: "Não foi possível validar o link de afiliado." }, 500);
  if (!(readyLinks || []).some((link: any) => link.affiliate_url === affiliateUrl)) {
    return json({ error: "O link precisa estar registrado como pronto para este produto." }, 409);
  }

  const { data: categories, error: categoriesError } = await admin
    .from("offer_categories")
    .select("id,name,keywords,excluded_keywords,priority,active")
    .eq("active", true)
    .order("priority", { ascending: true });

  if (categoriesError) {
    console.error(categoriesError);
    return json({ error: "Não foi possível carregar as categorias de ofertas." }, 500);
  }

  const manualCategory = product.commercial_category_source === "manual"
    ? (categories || []).find((category: any) => category.id === product.commercial_category_id)?.name ?? null
    : null;
  const resolvedCategory = manualCategory || resolveCategory(product.title, categories || []) || null;

  const { data: variations, error: variationsError } = await admin
    .from("product_variations")
    .select("id,external_variation_id,name,unit_quantity,price,original_price,currency,attributes,is_default")
    .eq("product_id", product.id)
    .eq("active", true)
    .order("is_default", { ascending: false })
    .order("price", { ascending: true });
  if (variationsError) return json({ error: "Não foi possível carregar as variações do produto." }, 500);
  const selectedVariation = (variations || []).find((variation: any) => variation.is_default) || (variations || [])[0] || null;
  const selectedPrice = Number(selectedVariation?.price ?? product.price ?? 0);
  const selectedOriginalPrice = selectedVariation?.original_price != null ? Number(selectedVariation.original_price) : product.original_price != null ? Number(product.original_price) : null;
  const selectedVariationLabel = selectedVariation ? String(selectedVariation.name || (selectedVariation.unit_quantity ? "Kit com " + selectedVariation.unit_quantity : "Opção selecionada")) : null;

  const { data: rules, error: rulesError } = await admin
    .from("offer_rules")
    .select(
      "id,name,marketplace_id,category,min_discount_percent,min_price,max_price,auto_approve,auto_approve_max_price,active"
    )
    .eq("active", true)
    .order("created_at", { ascending: true });

  if (rulesError) {
    console.error(rulesError);
    return json({ error: "Não foi possível carregar as regras de ofertas." }, 500);
  }

  const matchingRules = (rules || []).filter((rule) =>
    matchesRule(rule, product, resolvedCategory, selectedPrice)
  );

  const rule = matchingRules[0] || null;
  const price = Number(product.price ?? 0);

  // Toda oferta aguarda aprovação humana, mesmo quando atende a uma regra.
  const autoApprove = false;
  const desiredStatus = "draft";

  const discount = selectedOriginalPrice !== null && selectedOriginalPrice > selectedPrice && selectedOriginalPrice > 0
    ? Math.round(((selectedOriginalPrice - selectedPrice) / selectedOriginalPrice) * 10000) / 100
    : product.discount_percent !== null && product.discount_percent !== undefined
      ? Number(product.discount_percent)
      : null;

  // A mensagem deve aproveitar apenas informações reais do cadastro do produto.
  // Evita introduções genéricas que não descrevem o item.
  const description = typeof product.description === "string"
    ? product.description.replace(/\s+/g, " ").replace(/<[^>]*>/g, " ").trim().slice(0, 360)
    : "";
  const message = description || "Confira as especificações, opções e condições diretamente no anúncio.";

  const { data: existingOffer, error: existingOfferError } = await admin
    .from("offers")
    .select("id,title,status,approval_status,affiliate_url,rule_id,created_at")
    .eq("product_id", product.id)
    .eq("affiliate_url", affiliateUrl)
    .maybeSingle();

  if (existingOfferError) {
    console.error(existingOfferError);
    return json({ error: "Não foi possível verificar ofertas existentes." }, 500);
  }

  if (existingOffer) {
    const { data: updatedOffer, error: updateError } = await admin.from("offers")
      .update({ rule_id: rule?.id || null, title: product.title, message, affiliate_url: affiliateUrl, product_variation_id: selectedVariation?.id ?? null, price_snapshot: selectedPrice > 0 ? selectedPrice : null, original_price_snapshot: selectedOriginalPrice, variation_label: selectedVariationLabel })
      .eq("id", existingOffer.id)
      .select("id,product_id,rule_id,title,message,affiliate_url,status,approval_status,created_at")
      .single();
    if (updateError) return json({ error: "Não foi possível atualizar a oferta existente." }, 500);
    return json({
      success: true,
      created: false,
      updated: true,
      duplicate: true,
      offer: updatedOffer,
      rule: rule ? { id: rule.id, name: rule.name, category: rule.category } : null,
      resolved_category: resolvedCategory,
      auto_approved: false,
      eligible: !!rule,
    });
  }

  const { data: offer, error: offerError } = await admin
    .from("offers")
    .insert({
      product_id: product.id,
      rule_id: rule?.id || null,
      title: product.title,
      message,
      affiliate_url: affiliateUrl,
      product_variation_id: selectedVariation?.id ?? null,
      price_snapshot: selectedPrice > 0 ? selectedPrice : null,
      original_price_snapshot: selectedOriginalPrice,
      variation_label: selectedVariationLabel,
      status: desiredStatus,
      approval_status: "pending",
      created_at: new Date().toISOString(),
    })
    .select("id,product_id,rule_id,title,message,affiliate_url,status,approval_status,created_at")
    .single();

  if (offerError) {
    console.error(offerError);
    return json(
      {
        error: "Não foi possível criar a oferta.",
        details: offerError.message,
      },
      500
    );
  }

  return json({
    success: true,
    created: true,
    offer,
    rule: rule
      ? { id: rule.id, name: rule.name, category: rule.category }
      : null,
    resolved_category: resolvedCategory,
    auto_approved: autoApprove,
    eligible: !!rule,
  });
});
