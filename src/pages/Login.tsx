import { useState, type FormEvent } from "react";
import {
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  UserPlus,
} from "lucide-react";
import { supabase } from "../lib/supabase";

export function Login() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");

    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setErrorMessage("Informe seu e-mail.");
      return;
    }

    if (!password) {
      setErrorMessage("Informe sua senha.");
      return;
    }

    if (password.length < 6) {
      setErrorMessage("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setLoading(true);

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
        });

        if (error) {
          throw error;
        }

        if (data.session) {
          setSuccessMessage("Conta criada com sucesso.");
        } else {
          setSuccessMessage(
            "Conta criada! Verifique seu e-mail para confirmar o cadastro."
          );
        }

        setPassword("");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        if (error) {
          throw error;
        }
      }
    } catch (error) {
      console.error("Erro na autenticação:", error);

      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível realizar a autenticação.";

      if (
        message.toLowerCase().includes("invalid login credentials")
      ) {
        setErrorMessage("E-mail ou senha incorretos.");
      } else if (
        message.toLowerCase().includes("email not confirmed")
      ) {
        setErrorMessage(
          "Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada."
        );
      } else if (
        message.toLowerCase().includes("user already registered")
      ) {
        setErrorMessage(
          "Este e-mail já possui uma conta. Faça login."
        );
      } else {
        setErrorMessage(message);
      }
    } finally {
      setLoading(false);
    }
  }

  function toggleMode() {
    setIsSignUp((current) => !current);
    setErrorMessage("");
    setSuccessMessage("");
    setPassword("");
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-logo">
            O
          </div>

          <div>
            <strong>Ofertix</strong>
            <span>Automação de ofertas</span>
          </div>
        </div>

        <div className="auth-header">
          <h1>
            {isSignUp ? "Criar sua conta" : "Bem-vindo de volta"}
          </h1>

          <p>
            {isSignUp
              ? "Crie sua conta para começar a utilizar o Ofertix."
              : "Entre na sua conta para acessar o painel do Ofertix."}
          </p>
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
                autoComplete="email"
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
                autoComplete={
                  isSignUp ? "new-password" : "current-password"
                }
                disabled={loading}
              />

              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={
                  showPassword
                    ? "Ocultar senha"
                    : "Mostrar senha"
                }
                disabled={loading}
              >
                {showPassword ? (
                  <EyeOff size={18} />
                ) : (
                  <Eye size={18} />
                )}
              </button>
            </div>
          </div>

          {errorMessage && (
            <div className="auth-message auth-message-error">
              {errorMessage}
            </div>
          )}

          {successMessage && (
            <div className="auth-message auth-message-success">
              {successMessage}
            </div>
          )}

          <button
            type="submit"
            className="auth-submit"
            disabled={loading}
          >
            {loading ? (
              <span className="auth-submit-loading">
                <span className="auth-spinner" />
                {isSignUp
                  ? "Criando conta..."
                  : "Entrando..."}
              </span>
            ) : (
              <>
                {isSignUp ? (
                  <UserPlus size={18} />
                ) : (
                  <LockKeyhole size={18} />
                )}

                {isSignUp
                  ? "Criar conta"
                  : "Entrar no Ofertix"}
              </>
            )}
          </button>
        </form>

        <div className="auth-switch">
          <span>
            {isSignUp
              ? "Já possui uma conta?"
              : "Ainda não possui uma conta?"}
          </span>

          <button
            type="button"
            onClick={toggleMode}
            disabled={loading}
          >
            {isSignUp ? "Fazer login" : "Criar conta"}
          </button>
        </div>
      </div>
    </div>
  );
}