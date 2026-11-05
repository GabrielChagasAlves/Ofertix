import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const allowedOrigins = new Set([
  "https://ofertix-theta.vercel.app",
  "https://ofertix-ofertix.vercel.app",
  "https://ofertix-git-main-ofertix.vercel.app",
]);
function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://ofertix-theta.vercel.app",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
  };
}
function response(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(req) });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return response(req, { success: false, error: "Use POST." }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return response(req, { success: false, error: "Sessão autenticada necessária para controlar automações." }, 401);
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return response(req, { success: false, error: "Sessão inválida. Entre novamente no sistema." }, 401);

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "");

  if (action === "start") {
    // Não ignorar execuções antigas: o status running precisa ser resolvido explicitamente.
    const { data: active, error } = await admin
      .from("automation_runs").select("id,started_at")
      .eq("function_name", "mercado-livre-product-discovery").eq("status", "running")
      .order("started_at", { ascending: false })
      .limit(1).maybeSingle();
    if (error) return response(req, { success: false, error: error.message }, 500);
    if (active) return response(req, { success: false, error: "Já existe uma sincronização em andamento.", run: active }, 409);

    const task = fetch(SUPABASE_URL + "/functions/v1/mercado-livre-product-discovery", {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
      body: JSON.stringify({ source: "manual", requested_by: user.id }),
    }).then(async (res) => {
      if (!res.ok) console.error("Falha ao iniciar sync manual:", res.status, (await res.text()).slice(0, 500));
    }).catch((error) => console.error("Falha ao chamar sync manual:", error));
    // @ts-ignore Supabase Edge Runtime fornece EdgeRuntime.waitUntil.
    EdgeRuntime.waitUntil(task);
    return response(req, { success: true, accepted: true, message: "Solicitação de sincronização enviada." }, 202);
  }

  if (action === "cancel") {
    // Permitir cancelar também uma execução antiga que ficou presa em running.
    const { data: active, error: findError } = await admin
      .from("automation_runs").select("id,started_at")
      .eq("function_name", "mercado-livre-product-discovery").eq("status", "running")
      .order("started_at", { ascending: false })
      .limit(1).maybeSingle();
    if (findError) return response(req, { success: false, error: findError.message }, 500);
    if (!active) return response(req, { success: false, error: "Não há sincronização ativa para cancelar." }, 409);
    const { error: updateError } = await admin.from("automation_runs")
      .update({ cancel_requested_at: new Date().toISOString(), cancel_requested_by: user.id })
      .eq("id", active.id).eq("status", "running");
    if (updateError) return response(req, { success: false, error: updateError.message }, 500);
    return response(req, { success: true, accepted: true, run_id: active.id, message: "Cancelamento solicitado; a rotina vai parar no próximo ponto seguro." }, 202);
  }
  return response(req, { success: false, error: "Ação inválida. Use start ou cancel." }, 400);
});