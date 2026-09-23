import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  BrowserRouter,
  Routes,
  Route,
} from "react-router-dom";

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
import { Cliques } from "./pages/Cliques";
import { Configuracoes } from "./pages/Configuracoes";
import { LinksAfiliado } from "./pages/LinksAfiliado";
import { Execucoes } from "./pages/Execucoes";

function App() {
  const [session, setSession] =
    useState<Session | null>(null);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      const { data, error } =
        await supabase.auth.getSession();

      if (error) {
        console.error(
          "Erro ao carregar sessão:",
          error
        );
      }

      if (mounted) {
        setSession(data.session);
        setLoading(false);
      }
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, currentSession) => {
        if (mounted) {
          setSession(currentSession);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="auth-loading">
        <div className="auth-loading-logo">
          O
        </div>

        <span>
          Carregando Ofertix...
        </span>
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  return (
    <BrowserRouter>
      <div className="app-shell">
        <Sidebar />

        <main className="main-content">
          <Routes>
            <Route
              path="/"
              element={<Dashboard />}
            />

            <Route
              path="/produtos"
              element={<Produtos />}
            />

            <Route
              path="/ofertas"
              element={<Ofertas />}
            />

            <Route
              path="/marketplaces"
              element={<Marketplaces />}
            />

            <Route
              path="/regras"
              element={<Regras />}
            />

            <Route
              path="/links-afiliado"
              element={<LinksAfiliado />}
            />

            <Route
              path="/execucoes"
              element={<Execucoes />}
            />

            <Route
              path="/publicacoes"
              element={<Publicacoes />}
            />

            <Route
              path="/whatsapp"
              element={<WhatsApp />}
            />

            <Route
              path="/cliques"
              element={<Cliques />}
            />

            <Route
              path="/configuracoes"
              element={<Configuracoes />}
            />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;