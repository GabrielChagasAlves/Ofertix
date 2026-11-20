import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const authorization = req.headers.get("Authorization");
    if (!authorization) return new Response(JSON.stringify({ connected: false, error: "Sessão necessária." }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: userError } = await caller.auth.getUser();
    if (userError || !user) return new Response(JSON.stringify({ connected: false, error: "Sessão inválida." }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: assurance, error: assuranceError } = await caller.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError || assurance?.currentLevel !== "aal2") return new Response(JSON.stringify({ connected: false, error: "MFA administrativo necessário." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const secretKeys = JSON.parse(
      Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}"
    );

    const secretKey = secretKeys["default"];

    if (!secretKey) {
      throw new Error(
        "SUPABASE_SECRET_KEYS não configurada."
      );
    }

    const supabase = createClient(
      supabaseUrl,
      secretKey
    );
    const { data: profile, error: profileError } = await supabase.from("user_profiles").select("role,is_active").eq("user_id", user.id).maybeSingle();
    if (profileError || profile?.role !== "admin" || !profile.is_active) {
      return new Response(JSON.stringify({ connected: false, error: "Apenas administradores ativos podem consultar a conexão." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data, error } = await supabase
      .from("marketplace_connections")
      .select(`
        external_user_id,
        token_expires_at,
        active,
        marketplaces (
          name,
          slug
        )
      `)
      .eq("active", true)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(error);

      return new Response(
        JSON.stringify({
          connected: false,
          error: "Erro ao consultar conexão.",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (!data) {
      return new Response(
        JSON.stringify({
          connected: false,
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const marketplace = Array.isArray(data.marketplaces)
      ? data.marketplaces[0]
      : data.marketplaces;

    return new Response(
      JSON.stringify({
        connected: true,
        marketplace: marketplace?.name ?? "Marketplace",
        token_expires_at: data.token_expires_at,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error(error);

    return new Response(
      JSON.stringify({
        connected: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro desconhecido.",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});