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
function isAllowedOrigin(origin: string) {
  if (allowedOrigins.has(origin)) return true;
  try {
    const url = new URL(origin);
    // Permite previews e aliases do projeto Ofertix, sem liberar outros projetos Vercel.
    return url.protocol === "https:" &&
      /^ofertix(?:-[a-z0-9-]+)?-ofertix\\.vercel\\.app$/.test(url.hostname);
  } catch {
    return false;
  }
}
function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = isAllowedOrigin(origin);
  return {
    ...(allowed ? { "Access-Control-Allow-Origin": origin } : {}),
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
  };
}
function response(req: Request, body: unknown, status = 200) {
return new Response(JSON.stringify(body), { status, headers: corsHeaders(req) });
}

function aalFromVerifiedJwt(authorization: string): string | null {
  try {
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : authorization.trim();
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")));
    return typeof decoded.aal === "string" ? decoded.aal : null;
  } catch {
    return null;
  }
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


  if (action === "list_crons" || action === "run_cron") {
    const { data: profile, error: profileError } = await admin
      .from("user_profiles").select("role,is_active").eq("user_id", user.id).maybeSingle();
    if (profileError) return response(req, { success: false, error: profileError.message }, 500);
    if (!profile || profile.role !== "admin" || !profile.is_active) {
      return response(req, { success: false, error: "Apenas administradores ativos podem gerenciar execuções manuais." }, 403);
    }
    // getUser() above validates the JWT; inspect its signed AAL claim directly.
    if (aalFromVerifiedJwt(authorization) !== "aal2") {
      return response(req, { success: false, code: "MFA_REQUIRED", error: "Confirme o MFA para executar ações administrativas." }, 403);
    }
    if (action === "list_crons") {
      const { data, error } = await admin.rpc("list_automation_crons");
      if (error) return response(req, { success: false, error: error.message }, 500);
      return response(req, { success: true, crons: data ?? [] });
    }
    const jobName = String(body?.job_name ?? "");
    const jobs: Record<string, { functionName: string; secretName: string; payload: Record<string, unknown> }> = {
      "ofertix-mercado-livre-availability": { functionName: "mercado-livre-availability", secretName: "mercado_livre_availability", payload: { limit: 10 } },
      "ofertix-mercado-livre-sync": { functionName: "mercado-livre-product-discovery", secretName: "mercado_livre_product_discovery", payload: { source: "manual", term_limit: 10, result_limit: 50, requested_by: user.id } },
      "ofertix-mercado-livre-sync-offset": { functionName: "mercado-livre-product-discovery", secretName: "mercado_livre_product_discovery", payload: { source: "manual", term_limit: 10, result_limit: 50, requested_by: user.id } },
      "ofertix-product-price-refresh": { functionName: "product-price-refresh-scheduler", secretName: "product_price_refresh_scheduler", payload: { limit: 10 } },
      "ofertix-publication-worker": { functionName: "publication-worker", secretName: "publication_worker", payload: {} },
      "ofertix-publication-worker-every-30-minutes": { functionName: "publication-worker", secretName: "publication_worker", payload: {} },
      "ofertix-publication-worker-offset-every-90-minutes": { functionName: "publication-worker", secretName: "publication_worker", payload: {} },
      "ofertix-shopee-sync": { functionName: "shopee-sync", secretName: "shopee_sync", payload: {} },
      "ofertix-shopee-sync-offset": { functionName: "shopee-sync", secretName: "shopee_sync", payload: {} },
    };
    const job = jobs[jobName];
    if (!job) return response(req, { success: false, error: "Cron não reconhecido ou não autorizado." }, 400);
    const { data: cronRows, error: cronError } = await admin.rpc("list_automation_crons");
    if (cronError) return response(req, { success: false, error: cronError.message }, 500);
    if (!(cronRows ?? []).some((row: { jobname: string }) => row.jobname === jobName)) {
      return response(req, { success: false, error: "Cron não encontrado." }, 404);
    }
    const { data: secretRow, error: secretError } = await admin.from("automation_secrets")
      .select("secret").eq("name", job.secretName).maybeSingle();
    if (secretError) return response(req, { success: false, error: secretError.message }, 500);
    if (!secretRow?.secret) return response(req, { success: false, error: "Segredo da automação não configurado." }, 500);
    // Encerrar somente locks antigos: Edge Functions não permanecem ativas por horas.
    const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { error: staleError } = await admin.from("automation_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_message: "Execução marcada como travada automaticamente: permaneceu em running por mais de 15 minutos.",
        errors_count: 1,
      })
      .eq("function_name", job.functionName).eq("status", "running").lt("started_at", staleBefore);
    if (staleError) return response(req, { success: false, error: "Não foi possível verificar execuções antigas: " + staleError.message }, 500);

    const { data: activeRun, error: activeError } = await admin.from("automation_runs")
      .select("id,started_at").eq("function_name", job.functionName).eq("status", "running")
      .gte("started_at", staleBefore)
      .order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (activeError) return response(req, { success: false, error: activeError.message }, 500);
    if (activeRun) return response(req, {
      success: false,
      code: "RUN_ALREADY_ACTIVE",
      error: "Esta rotina já está em andamento desde " + activeRun.started_at + ". Aguarde a conclusão antes de iniciar outra.",
      run: activeRun,
    }, 409);

    let upstream: Response;
    try {
      upstream = await fetch(SUPABASE_URL + "/functions/v1/" + job.functionName, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-ofertix-cron-secret": secretRow.secret },
        body: JSON.stringify(job.payload),
      });
    } catch (error) {
      return response(req, {
        success: false,
        code: "UPSTREAM_UNREACHABLE",
        error: "Não foi possível alcançar a rotina " + job.functionName + ".",
        details: error instanceof Error ? error.message : String(error),
      }, 502);
    }
    const rawBody = await upstream.text();
    let upstreamBody: unknown = rawBody.slice(0, 1800);
    try { upstreamBody = JSON.parse(rawBody); } catch { /* manter texto */ }
    if (!upstream.ok) {
      const detail = typeof upstreamBody === "object" && upstreamBody !== null
        ? String((upstreamBody as Record<string, unknown>).error ?? (upstreamBody as Record<string, unknown>).message ?? rawBody)
        : String(upstreamBody);
      return response(req, {
        success: false,
        code: "CRON_EXECUTION_REJECTED",
        error: "A rotina " + job.functionName + " recusou a execução (HTTP " + upstream.status + ").",
        upstream_status: upstream.status,
        details: detail.slice(0, 1800),
      }, 502);
    }
    return response(req, {
      success: true,
      accepted: true,
      job_name: jobName,
      target_function: job.functionName,
      upstream_status: upstream.status,
      result: upstreamBody,
      message: "A rotina respondeu com sucesso. Consulte o histórico para ver os itens processados.",
    }, 202);
  }

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
  return response(req, { success: false, error: "Ação inválida. Use start, cancel, list_crons ou run_cron." }, 400);
});