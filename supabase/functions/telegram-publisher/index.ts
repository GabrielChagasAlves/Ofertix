import { withSupabase } from "npm:@supabase/server";

type Publication = {
  id: string;
  offer_id: string;
  channel_id: string;
  status: "pending" | "publishing" | "published" | "failed" | "cancelled";
  attempts: number;
};

type Offer = {
  id: string;
  title: string | null;
  message: string | null;
  affiliate_url: string | null;
  status: string;
  approval_status: string;
  product_id: string;
  price_snapshot?: number | null;
  original_price_snapshot?: number | null;
  variation_label?: string | null;
};

type Product = {
  id: string;
  title: string;
  price: number | null;
  original_price: number | null;
  discount_percent: number | null;
  origin_type: "national" | "imported" | "unknown";
};

type Channel = {
  id: string;
  name: string;
  type: "telegram" | "facebook" | "instagram" | "tiktok" | "whatsapp";
  identifier: string | null;
  active: boolean;
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(),
  });
}

function formatBRL(value: number | null) {
  if (value === null || !Number.isFinite(Number(value))) return null;
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function cleanTitle(value: string) {
  return value.replace(/\s+/g, " ").replace(/\s*[-|•]+\s*/g, " ").trim();
}

function buildMessage(offer: Offer, product: Product) {
  const title = cleanTitle(product.title || offer.title || "Oferta");
  const lines: string[] = ["🔥 OFERTA ENCONTRADA!", "", "🛍️ " + title, "", product.origin_type === "national" ? "🇧🇷 Envio nacional" : "🌎 Envio internacional"];

  const selectedPrice = offer.price_snapshot !== null && offer.price_snapshot !== undefined ? Number(offer.price_snapshot) : product.price;
  const selectedOriginalPrice = offer.original_price_snapshot !== null && offer.original_price_snapshot !== undefined ? Number(offer.original_price_snapshot) : product.original_price;
  const currentPrice = formatBRL(selectedPrice);
  const originalPrice = selectedOriginalPrice !== null && selectedPrice !== null && Number(selectedOriginalPrice) > Number(selectedPrice)
    ? formatBRL(selectedOriginalPrice) : null;

  if (offer.message && offer.message.trim() && offer.message.trim() !== title) {
    lines.push("", offer.message.trim());
  }
  if (offer.variation_label) lines.push("📦 Opção: " + offer.variation_label);

  if (originalPrice && currentPrice) {
    lines.push("", "💸 De: " + originalPrice, "🔥 Por: " + currentPrice);
  } else if (currentPrice) {
    lines.push("", "💰 Por: " + currentPrice);
  }

  const discount = originalPrice && selectedPrice !== null && selectedOriginalPrice !== null && Number(selectedOriginalPrice) > 0
    ? ((Number(selectedOriginalPrice) - Number(selectedPrice)) / Number(selectedOriginalPrice)) * 100
    : product.discount_percent !== null && Number(product.discount_percent) > 0
      ? Number(product.discount_percent)
      : 0;

  if (discount > 0) {
    lines.push("🏷️ " + discount.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + "% OFF");
  }

  if (offer.affiliate_url) {
    lines.push("", "🛒 COMPRAR AGORA", offer.affiliate_url);
  }

  lines.push("", "⚡ Aproveite enquanto estiver disponível.", "", "#Ofertix #Oferta");

  const text = lines.join("\n").trim();
  return text.length > 4096 ? text.slice(0, 4093).trimEnd() + "..." : text;
}

export default {
  fetch: withSupabase(
    { auth: "user" },
    async (req, ctx) => {
      if (req.method === "OPTIONS") {
        return new Response("ok", {
          headers: corsHeaders(),
        });
      }

      if (req.method !== "POST") {
        return json(
          { error: "Método não permitido." },
          405,
        );
      }

      try {
        const body = await req.json();
        const publicationId = body?.publication_id;
        const testMode = body?.test === true;
        const testChannelId = body?.channel_id;

        const botToken = Deno.env.get(
          "TELEGRAM_BOT_TOKEN",
        );

        if (!botToken) {
          return json(
            {
              error:
                "TELEGRAM_BOT_TOKEN não configurado no Supabase.",
            },
            500,
          );
        }

        if (testMode) {
          if (!testChannelId || typeof testChannelId !== "string") {
            return json(
              { error: "Informe channel_id para o teste." },
              400,
            );
          }

          if (!botToken) {
            return json(
              { error: "TELEGRAM_BOT_TOKEN não configurado no Supabase." },
              500,
            );
          }

          const { data: testChannel, error: testChannelError } =
            await ctx.supabaseAdmin
              .from("channels")
              .select("id,name,type,identifier,active")
              .eq("id", testChannelId)
              .maybeSingle();

          if (testChannelError) throw testChannelError;

          if (!testChannel) {
            return json({ error: "Canal não encontrado." }, 404);
          }

          if (!testChannel.active) {
            return json({ error: "O canal está inativo." }, 409);
          }

          if (testChannel.type !== "telegram") {
            return json({ error: "O canal selecionado não é Telegram." }, 400);
          }

          if (!testChannel.identifier) {
            return json({ error: "O canal Telegram não possui identificador." }, 400);
          }

          const testMessage =
            "🤖 TESTE DO OFERTIX\n\n" +
            "O bot Ofertix está conectado corretamente ao Telegram.\n\n" +
            "Este é apenas um teste de integração.";

          const telegramResponse = await fetch(
            `https://api.telegram.org/bot${botToken}/sendMessage`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: testChannel.identifier,
                text: testMessage,
                disable_web_page_preview: true,
              }),
            },
          );

          const telegramData = await telegramResponse.json();

          if (!telegramResponse.ok || !telegramData?.ok) {
            const errorMessage =
              telegramData?.description ||
              `Telegram HTTP ${telegramResponse.status}`;

            return json(
              {
                ok: false,
                test: true,
                channel_id: testChannelId,
                error: errorMessage,
              },
              502,
            );
          }

          return json({
            ok: true,
            test: true,
            channel_id: testChannelId,
            channel: testChannel.name,
            external_post_id:
              String(telegramData.result?.message_id ?? "") || null,
            message: "Teste enviado ao Telegram com sucesso.",
          });
        }

        const { data: publication, error: publicationError } =
          await ctx.supabaseAdmin
            .from("channel_publications")
            .select(
              "id,offer_id,channel_id,status,attempts",
            )
            .eq("id", publicationId)
            .maybeSingle();

        if (publicationError) {
          throw publicationError;
        }

        if (!publication) {
          return json(
            {
              error:
                "Publicação não encontrada.",
            },
            404,
          );
        }

        const typedPublication =
          publication as Publication;

        if (
          typedPublication.status === "published"
        ) {
          return json({
            ok: true,
            already_published: true,
            publication_id: publicationId,
          });
        }

        if (
          typedPublication.status === "cancelled"
        ) {
          return json(
            {
              error:
                "A publicação está cancelada.",
            },
            409,
          );
        }

        const [
          channelResult,
          offerResult,
        ] = await Promise.all([
          ctx.supabaseAdmin
            .from("channels")
            .select(
              "id,name,type,identifier,active",
            )
            .eq("id", typedPublication.channel_id)
            .maybeSingle(),

          ctx.supabaseAdmin
            .from("offers")
            .select(
              "id,title,message,affiliate_url,status,approval_status,product_id,price_snapshot,original_price_snapshot,variation_label",
            )
            .eq("id", typedPublication.offer_id)
            .maybeSingle(),
        ]);

        if (channelResult.error) {
          throw channelResult.error;
        }

        if (offerResult.error) {
          throw offerResult.error;
        }

        const channel =
          channelResult.data as Channel | null;

        const offer =
          offerResult.data as Offer | null;

        if (!channel) {
          return json(
            {
              error:
                "Canal da publicação não encontrado.",
            },
            404,
          );
        }

        if (!channel.active) {
          return json(
            {
              error:
                "O canal está inativo.",
            },
            409,
          );
        }

        if (channel.type !== "telegram") {
          return json(
            {
              error:
                "Esta função aceita somente canais Telegram.",
            },
            400,
          );
        }

        if (!channel.identifier) {
          return json(
            {
              error:
                "O canal Telegram não possui identificador.",
            },
            400,
          );
        }

        if (!offer) {
          return json(
            {
              error:
                "Oferta da publicação não encontrada.",
            },
            404,
          );
        }

        if (offer.approval_status !== "approved" || (offer.status !== "approved" && offer.status !== "scheduled")) {
          return json(
            {
              error:
                "A oferta precisa estar aprovada ou agendada para ser publicada.",
              offer_status: offer.status,
            },
            409,
          );
        }

        if (!offer.affiliate_url) {
          return json(
            {
              error:
                "A oferta não possui link de afiliado válido.",
            },
            409,
          );
        }

        const { data: product, error: productError } =
          await ctx.supabaseAdmin
            .from("products")
            .select(
              "id,title,price,original_price,discount_percent,origin_type",
            )
            .eq("id", offer.product_id)
            .maybeSingle();

        if (productError) {
          throw productError;
        }

        if (!product) {
          return json(
            {
              error:
                "Produto da oferta não encontrado.",
            },
            404,
          );
        }

        if (product.origin_type !== "national" && product.origin_type !== "imported") {
          return json({
            error: "Publicação bloqueada: origem do produto não identificada. Defina Nacional ou Importado na tela de Aprovação.",
            origin_type: product.origin_type ?? "unknown",
          }, 409);
        }

        const { data: readyAffiliateLink, error: readyLinkError } = await ctx.supabaseAdmin
          .from("affiliate_links")
          .select("id")
          .eq("product_id", product.id)
          .eq("affiliate_url", offer.affiliate_url)
          .eq("status", "ready")
          .maybeSingle();
        if (readyLinkError) throw readyLinkError;
        if (!readyAffiliateLink) {
          return json({ error: "Publicação bloqueada: link de afiliado não está registrado como pronto." }, 409);
        }

        const nextAttempts =
          Number(typedPublication.attempts || 0) + 1;

        await ctx.supabaseAdmin
          .from("channel_publications")
          .update({
            status: "publishing",
            attempts: nextAttempts,
            error_message: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", publicationId);

        const message = buildMessage(
          offer,
          product as Product,
        );

        const telegramResponse = await fetch(
          `https://api.telegram.org/bot${botToken}/sendMessage`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              chat_id: channel.identifier,
              text: message,
              disable_web_page_preview: true,
            }),
          },
        );

        const telegramData =
          await telegramResponse.json();

        if (
          !telegramResponse.ok ||
          !telegramData?.ok
        ) {
          const errorMessage =
            telegramData?.description ||
            `Telegram HTTP ${telegramResponse.status}`;

          await ctx.supabaseAdmin
            .from("channel_publications")
            .update({
              status: "failed",
              error_message: errorMessage,
              updated_at: new Date().toISOString(),
            })
            .eq("id", publicationId);

          return json(
            {
              ok: false,
              publication_id: publicationId,
              status: "failed",
              error: errorMessage,
            },
            502,
          );
        }

        const externalPostId = String(
          telegramData.result?.message_id ?? "",
        );

        await ctx.supabaseAdmin
          .from("channel_publications")
          .update({
            status: "published",
            external_post_id:
              externalPostId || null,
            published_at:
              new Date().toISOString(),
            error_message: null,
            next_retry_at: null,
            updated_at:
              new Date().toISOString(),
          })
          .eq("id", publicationId);

        return json({
          ok: true,
          publication_id: publicationId,
          status: "published",
          external_post_id:
            externalPostId || null,
        });
      } catch (error) {
        console.error(
          "telegram-publisher error:",
          error,
        );

        return json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Erro interno ao publicar no Telegram.",
          },
          500,
        );
      }
    },
  ),
};
