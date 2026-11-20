import { useState, type FormEvent } from "react";
import {
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
} from "lucide-react";
import { supabase } from "../lib/supabase";

export function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      setErrorMessage("Informe seu e-mail e sua senha.");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) throw error;
    } catch (error) {
      console.error("Falha na autenticação do Ofertix.");

      const message = error instanceof Error ? error.message.toLowerCase() : "";

      if (message.includes("too many") || message.includes("rate limit")) {
        setErrorMessage("Muitas tentativas. Aguarde alguns minutos e tente novamente.");
      } else if (message.includes("email not confirmed")) {
        setErrorMessage("A conta ainda precisa ter o e-mail confirmado. Contate um administrador.");
      } else {
        // Resposta uniforme para não revelar se um e-mail está cadastrado.
        setErrorMessage("Não foi possível entrar. Confira suas credenciais ou contate um administrador.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-logo">O</div>
          <div>
            <strong>Ofertix</strong>
            <span>Automação de ofertas</span>
          </div>
        </div>

        <div className="auth-header">
          <h1>Acesso restrito</h1>
          <p>Entre com as credenciais da sua conta autorizada no Ofertix.</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="email">E-mail</label>
            <div className="auth-input-wrapper">
              <Mail size={18} />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="seu@email.com"
                autoComplete="username"
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="auth-field">
            <label htmlFor="password">Senha</label>
            <div className="auth-input-wrapper">
              <LockKeyhole size={18} />
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Digite sua senha"
                autoComplete="current-password"
                required
                disabled={loading}
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                disabled={loading}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {errorMessage && (
            <div className="auth-message auth-message-error" role="alert">
              {errorMessage}
            </div>
          )}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? (
              <span className="auth-submit-loading">
                <span className="auth-spinner" />
                Validando acesso...
              </span>
            ) : (
              <>
                <LockKeyhole size={18} />
                Entrar no Ofertix
              </>
            )}
          </button>
        </form>

        <div className="auth-switch">
          <span>Acesso somente por convite de um administrador.</span>
        </div>
      </div>
    </div>
  );
}
