import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import {
  Bell,
  ChevronDown,
  Menu,
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
import { Aprovacao } from "./pages/Aprovacao";
import { ClassificacaoOrigem } from "./pages/ClassificacaoOrigem";
import { Usuarios } from "./pages/Usuarios";
import { defaultAccess, canScreen, type AccessData } from "./lib/access";
import { Navigate } from "react-router-dom";

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [access, setAccess] = useState<AccessData>(defaultAccess);
  const [accessLoading, setAccessLoading] = useState(true);

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
      if (mounted) { setSession(session); setAccess(defaultAccess); setAccessLoading(true); }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadAccess = async () => {
      if (!session) { setAccess(defaultAccess); setAccessLoading(false); return; }
      setAccessLoading(true);
      const { data, error } = await supabase.rpc("get_my_access");
      if (!active) return;
      setAccess(error || !data ? defaultAccess : data as AccessData);
      setAccessLoading(false);
    };
    void loadAccess();
    return () => { active = false; };
  }, [session]);

  if (loading) {
    return (
      <div className="app-loading">
        <div className="loading-spinner" />
        <p>Carregando Ofertix...</p>
      </div>
    );
  }

  if (!session) return <Login />;

  // Busca as permissões efetivas no banco após autenticação.
  // A interface não considera permissões armazenadas apenas no navegador.
  // O backend também aplica RLS e valida as alterações de origem.
  if (accessLoading) {
    return <div className="app-loading"><div className="loading-spinner" /><p>Validando permissões...</p></div>;
  }
  if (!access.is_active) {
    void supabase.auth.signOut();
    return <Login />;
  }
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
        <Sidebar isOpen={showMobileNav} onNavigate={() => setShowMobileNav(false)} access={access} />
        {showMobileNav && (
          <button
            type="button"
            className="mobile-nav-backdrop"
            aria-label="Fechar menu"
            onClick={() => setShowMobileNav(false)}
          />
        )}

        <main className="main-content">
          <header className="app-topbar">
            <button
              type="button"
              className="mobile-menu-toggle"
              aria-label="Abrir menu de navegação"
              aria-expanded={showMobileNav}
              onClick={() => setShowMobileNav((open) => !open)}
            >
              <Menu size={21} />
            </button>
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
              <Route path="/" element={canScreen(access,"dashboard")?<Dashboard/>:<Navigate to={canScreen(access,"origin_classification")?"/classificacao-origem":"/acesso-restrito"} replace/>} />
              <Route path="/produtos" element={canScreen(access,"products")?<Produtos/>:<Navigate to="/acesso-restrito" replace/>} />
              <Route path="/classificacao-origem" element={canScreen(access,"origin_classification")?<ClassificacaoOrigem access={access}/>:<Navigate to="/acesso-restrito" replace/>} />
              <Route path="/usuarios" element={canScreen(access,"users")?<Usuarios/>:<Navigate to="/acesso-restrito" replace/>} />
              <Route path="/acesso-restrito" element={<div className="page ops-page"><h1>Acesso não autorizado</h1><p>Seu usuário não possui permissão para acessar esta área. Solicite acesso ao administrador.</p></div>} />
              {/* Mantida por compatibilidade. Não aparece no menu principal. */}
              <Route path="/ofertas" element={canScreen(access,"approval")?<Ofertas />:<Navigate to="/acesso-restrito" replace/>} />
              {/* A página de marketplaces é apresentada como Integrações no menu. */}
              <Route path="/marketplaces" element={canScreen(access,"integrations")?<Marketplaces />:<Navigate to="/acesso-restrito" replace/>} />
              <Route path="/regras" element={canScreen(access,"rules")?<Regras />:<Navigate to="/acesso-restrito" replace/>} />
              <Route path="/links-afiliado" element={canScreen(access,"affiliate_links")?<LinksAfiliado />:<Navigate to="/acesso-restrito" replace/>} />
              <Route path="/aprovacao" element={canScreen(access,"approval")?<Aprovacao />:<Navigate to="/acesso-restrito" replace/>} />
              <Route path="/execucoes" element={canScreen(access,"executions")?<Execucoes />:<Navigate to="/acesso-restrito" replace/>} />
              <Route path="/publicacoes" element={canScreen(access,"publications")?<Publicacoes />:<Navigate to="/acesso-restrito" replace/>} />
              <Route path="/canais" element={canScreen(access,"channels")?<Canais />:<Navigate to="/acesso-restrito" replace/>} />
              {/* Mantida por compatibilidade. */}
              <Route path="/whatsapp" element={canScreen(access,"channels")?<WhatsApp />:<Navigate to="/acesso-restrito" replace/>} />
              <Route path="/cliques" element={canScreen(access,"clicks")?<Cliques />:<Navigate to="/acesso-restrito" replace/>} />
              <Route path="/configuracoes" element={canScreen(access,"settings")?<Configuracoes />:<Navigate to="/acesso-restrito" replace/>} />
            </Routes>
          </div>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
