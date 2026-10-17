import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import {
  Bell,
  ChevronDown,
  Search,
  X,
} from "lucide-react";

import { Sidebar } from "./components/Sidebar";
import { Login } from "./pages/Login";
import { supabase } from "./lib/supabase";

import { Dashboard } from "./pages/Dashboard";
import { Produtos } from "./pages/Produtos";
import { Ofertas } from "./pages/Ofertas";
import { Marketplaces } from "./pages/Marketplaces";
import { Regras } from "./pages/Regras";
import { Publicacoes } from "./pages/Publicacoes";
import { WhatsApp } from "./pages/WhatsApp";
import { Canais } from "./pages/Canais";
import { Cliques } from "./pages/Cliques";
import { Configuracoes } from "./pages/Configuracoes";
import { LinksAfiliado } from "./pages/LinksAfiliado";
import { Execucoes } from "./pages/Execucoes";

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (mounted) {
        setSession(session);
        setLoading(false);
      }
    };

    void loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setSession(session);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="app-loading">
        <div className="loading-spinner" />
        <p>Carregando Ofertix...</p>
      </div>
    );
  }

  if (!session) return <Login />;

  const metadata = session.user.user_metadata ?? {};
  const displayName =
    (typeof metadata.full_name === "string" && metadata.full_name) ||
    (typeof metadata.name === "string" && metadata.name) ||
    session.user.email?.split("@")[0] ||
    "Usuário";
  const avatarUrl =
    (typeof metadata.avatar_url === "string" && metadata.avatar_url) ||
    (typeof metadata.picture === "string" && metadata.picture) ||
    "";

  return (
    <BrowserRouter>
      <div className="app-shell">
        <Sidebar />

        <main className="main-content">
          <header className="app-topbar">
            <label className="app-global-search">
              <Search size={18} aria-hidden="true" />
              <input
                type="search"
                placeholder="Buscar produtos (nome, marca, categoria...)"
                aria-label="Buscar no Ofertix"
              />
              <kbd>⌘ K</kbd>
            </label>

            <div className="app-topbar-actions">
              <div className="app-popover-anchor">
                <button
                  type="button"
                  className={`app-icon-button ${showNotifications ? "is-open" : ""}`}
                  aria-label="Notificações"
                  aria-expanded={showNotifications}
                  onClick={() => {
                    setShowNotifications((open) => !open);
                    setShowUserMenu(false);
                  }}
                >
                  <Bell size={20} />
                  <span className="app-notification-dot" aria-hidden="true" />
                </button>

                {showNotifications && (
                  <div className="app-popover app-notification-popover">
                    <div className="app-popover-heading">
                      <strong>Notificações</strong>
                      <button
                        type="button"
                        aria-label="Fechar notificações"
                        onClick={() => setShowNotifications(false)}
                      >
                        <X size={16} />
                      </button>
                    </div>
                    <div className="app-popover-empty">
                      <span className="app-popover-empty-icon">
                        <Bell size={20} />
                      </span>
                      <strong>Nenhuma notificação exibida</strong>
                      <p>
                        Quando houver alertas disponíveis, eles aparecerão aqui.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="app-popover-anchor">
                <button
                  type="button"
                  className={`app-user-trigger ${showUserMenu ? "is-open" : ""}`}
                  aria-expanded={showUserMenu}
                  onClick={() => {
                    setShowUserMenu((open) => !open);
                    setShowNotifications(false);
                  }}
                >
                  {avatarUrl ? (
                    <img className="app-user-avatar" src={avatarUrl} alt="" />
                  ) : (
                    <span className="app-user-avatar app-user-avatar-fallback">
                      {displayName.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="app-user-copy">
                    <strong>{displayName}</strong>
                    <small>Usuário</small>
                  </span>
                  <ChevronDown size={16} />
                </button>

                {showUserMenu && (
                  <div className="app-popover app-user-popover">
                    <div className="app-user-menu-profile">
                      {avatarUrl ? (
                        <img className="app-user-avatar" src={avatarUrl} alt="" />
                      ) : (
                        <span className="app-user-avatar app-user-avatar-fallback">
                          {displayName.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <span>
                        <strong>{displayName}</strong>
                        <small>{session.user.email || "Sessão autenticada"}</small>
                      </span>
                    </div>
                    <button
                      type="button"
                      className="app-user-menu-logout"
                      onClick={async () => {
                        await supabase.auth.signOut();
                        setShowUserMenu(false);
                      }}
                    >
                      Sair da conta
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          <div className="app-page-content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/produtos" element={<Produtos />} />
              {/* Mantida por compatibilidade. Não aparece no menu principal. */}
              <Route path="/ofertas" element={<Ofertas />} />
              {/* A página de marketplaces é apresentada como Integrações no menu. */}
              <Route path="/marketplaces" element={<Marketplaces />} />
              <Route path="/regras" element={<Regras />} />
              <Route path="/links-afiliado" element={<LinksAfiliado />} />
              <Route path="/execucoes" element={<Execucoes />} />
              <Route path="/publicacoes" element={<Publicacoes />} />
              <Route path="/canais" element={<Canais />} />
              {/* Mantida por compatibilidade. */}
              <Route path="/whatsapp" element={<WhatsApp />} />
              <Route path="/cliques" element={<Cliques />} />
              <Route path="/configuracoes" element={<Configuracoes />} />
            </Routes>
          </div>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
