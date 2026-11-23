import { withSupabase } from "npm:@supabase/server";

function safeMessage(value: unknown): string {
  return String(value ?? "Falha técnica ao gerar link de afiliado.")
    .replace(/(cookie|authorization|token|session|secret|password)\s*[:=]\s*[^,;\s]+/gi, "$1=[REDACTED]")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, 300);
}

export default {
  fetch: withSupabase({ auth: "secret" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ success: false, error: "Use POST." }, { status: 405 });
    let body: Record<string, unknown>;
    try { body = await req.json(); }
    catch { return Response.json({ success: false, error: "JSON inválido." }, { status: 400 }); }

    const status = Number(body.http_status ?? 0) || null;
    const detail = safeMessage(body.error_message);
    const suppliedType = String(body.failure_type ?? "technical_error");
    const authEvidence = suppliedType === "authentication_error" ||
      [401, 403].includes(status ?? 0) || !!body.invalid_secrets ||
      /invalid[_ -]?secret|invalid[_ -]?token|unauthorized|forbidden|cookie.{0,20}(expired|invalid)|token.{0,20}(expired|invalid)/i.test(detail);
    const transientNetwork = /ETIMEDOUT|ECONNRESET|EAI_AGAIN|ENETUNREACH|ECONNREFUSED|network|timeout|fetch failed/i.test(detail);
    const failureType = authEvidence ? "authentication_error" : transientNetwork ? "connection_error" :
      (["technical_error", "connection_error"].includes(suppliedType) ? suppliedType : "technical_error");

    const title = authEvidence ? "Mercado Livre: autenticação necessária" :
      transientNetwork ? "Mercado Livre: instabilidade temporária" : "Geração de link: falha técnica";
    const message = authEvidence
      ? detail + (status ? " HTTP " + status + "." : "") + " A autenticação precisa ser verificada."
      : transientNetwork
        ? detail + (status ? " HTTP " + status + "." : "") + " Houve uma falha temporária de comunicação durante a geração/salvamento do link. Não há evidência de cookie ou token expirado. Tente novamente na próxima execução."
        : detail + (status ? " HTTP " + status + "." : "") + " A geração foi interrompida para evitar encaminhar produtos sem validação. Verifique o detalhe técnico antes de alterar credenciais.";

    const db = ctx.supabaseAdmin;
    const { data: profiles, error: profilesError } = await db.from("user_profiles").select("user_id").eq("is_active", true);
    if (profilesError) return Response.json({ success: false, error: "Não foi possível localizar os destinatários do alerta." }, { status: 500 });

    const now = new Date().toISOString();
    const alertKey = authEvidence ? "mercado_livre_affiliate_authentication" :
      transientNetwork ? "mercado_livre_affiliate_transient_network" : "affiliate_link_generation_technical";
    const recipients = (profiles ?? []).map((row: { user_id: string }) => row.user_id);
    let created = 0;

    for (const userId of recipients) {
      const { data: recent, error: recentError } = await db.from("user_notifications")
        .select("id").eq("user_id", userId).eq("title", title)
        .gte("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString()).limit(1);
      if (recentError) return Response.json({ success: false, error: "Não foi possível verificar alertas existentes." }, { status: 500 });
      if (recent?.length) continue;

      const { error: insertError } = await db.from("user_notifications").insert({
        user_id: userId, notification_type: "system", title, message,
        metadata: { alert_key: alertKey, failure_type: failureType, http_status: status, source: "n8n-affiliate-link-generation", occurred_at: now }
      });
      if (insertError) return Response.json({ success: false, error: "Não foi possível registrar o alerta." }, { status: 500 });
      created++;
    }
    return Response.json({ success: true, action: "system_alert_recorded", failure_type: failureType,
      recipients: recipients.length, notifications_created: created, deduplicated: recipients.length - created });
  })
};
