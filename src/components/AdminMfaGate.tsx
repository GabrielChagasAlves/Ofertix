import { useEffect, useState } from "react";
import { ShieldCheck, Smartphone } from "lucide-react";
import { supabase } from "../lib/supabase";

type Factor = { id: string; status: string; factor_type: string; friendly_name?: string };

export function AdminMfaGate({ onVerified }: { onVerified: () => void }) {
  const [factor, setFactor] = useState<Factor | null>(null);
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function prepare() {
      try {
        const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (assuranceError) throw assuranceError;
        if (assurance.currentLevel === "aal2") { if (active) onVerified(); return; }
        const { data, error: listError } = await supabase.auth.mfa.listFactors();
        if (listError) throw listError;
        const verified = (data.totp ?? []).find((item) => item.status === "verified");
        if (verified) {
          if (!active) return;
          setFactor(verified);
          return;
        }
        const pending = (data.all ?? []).find((item) => item.factor_type === "totp" && item.status === "unverified");
        if (pending) {
          const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: pending.id });
          if (unenrollError) throw unenrollError;
        }
        const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: "Ofertix - Administrador",
        });
        if (enrollError) throw enrollError;
        if (!active) return;
        setFactor({ id: enrolled.id, status: "unverified", factor_type: "totp" });
        setQrCode(enrolled.totp.qr_code);
        setSecret(enrolled.totp.secret);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Não foi possível iniciar a configuração do MFA.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void prepare();
    return () => { active = false; };
  }, [onVerified]);

  async function verify() {
    if (!factor || code.trim().length < 6) return;
    setSubmitting(true);
    setError("");
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factor.id });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: factor.id,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (verifyError) throw verifyError;
      onVerified();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Código inválido. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="auth-page"><div className="auth-card">Preparando autenticação em duas etapas...</div></div>;

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand"><div className="auth-logo"><ShieldCheck size={22} /></div><div><strong>Ofertix</strong><span>Proteção da conta administrativa</span></div></div>
        <div className="auth-header">
          <h1>Verificação em duas etapas</h1>
          <p>O acesso administrativo exige um código temporário do seu aplicativo autenticador.</p>
        </div>
        {qrCode && <div className="auth-mfa-setup">
          <p>1. Abra um autenticador (Google Authenticator, Microsoft Authenticator ou 1Password) e leia o QR Code.</p>
          <img className="auth-mfa-qr" src={qrCode.startsWith("data:") ? qrCode : `data:image/svg+xml;utf8,${encodeURIComponent(qrCode)}`} alt="QR Code para configurar autenticação em duas etapas" />
          <p>Se não conseguir ler o QR Code, informe esta chave manualmente:</p>
          <code className="auth-mfa-secret">{secret}</code>
        </div>}
        <form className="auth-form" onSubmit={(event) => { event.preventDefault(); void verify(); }}>
          <div className="auth-field">
            <label htmlFor="mfa-code"><Smartphone size={15} /> {qrCode ? "2. Digite o código de 6 dígitos do autenticador" : "Digite o código do autenticador"}</label>
            <input id="mfa-code" className="auth-mfa-code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="000000" />
          </div>
          {error && <div className="auth-message auth-message-error" role="alert">{error}</div>}
          <button type="submit" className="auth-submit" disabled={submitting || code.trim().length < 6}>{submitting ? "Verificando..." : qrCode ? "Ativar e entrar" : "Verificar e entrar"}</button>
        </form>
        <div className="auth-switch"><span>Essa etapa é obrigatória para contas administradoras.</span></div>
      </div>
    </div>
  );
}
