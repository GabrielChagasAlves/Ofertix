import {
  BarChart3,
  ShoppingBag,
  Tags,
  Store,
  ListFilter,
  Send,
  MessageCircle,
  MousePointerClick,
  Settings,
  Link2,
  LogOut,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { supabase } from "../lib/supabase";

export function Sidebar() {
  const menuItems = [
    {
      label: "Dashboard",
      icon: BarChart3,
      path: "/",
    },
    {
      label: "Produtos",
      icon: ShoppingBag,
      path: "/produtos",
    },
    {
      label: "Ofertas",
      icon: Tags,
      path: "/ofertas",
    },
    {
      label: "Marketplaces",
      icon: Store,
      path: "/marketplaces",
    },
    {
      label: "Regras",
      icon: ListFilter,
      path: "/regras",
    },
    {
      label: "Links de Afiliado",
      icon: Link2,
      path: "/links-afiliado",
    },
    {
      label: "Publicações",
      icon: Send,
      path: "/publicacoes",
    },
    {
      label: "WhatsApp",
      icon: MessageCircle,
      path: "/whatsapp",
    },
    {
      label: "Cliques",
      icon: MousePointerClick,
      path: "/cliques",
    },
  ];

  async function handleLogout() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("Erro ao sair:", error);
      alert("Não foi possível sair da conta.");
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-icon">
          <span>O</span>
        </div>

        <div>
          <strong>Ofertix</strong>
          <span>Automação de ofertas</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {menuItems.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <Icon size={18} strokeWidth={2} />

              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar-bottom">
        <NavLink
          to="/configuracoes"
          className={({ isActive }) =>
            `nav-item ${isActive ? "active" : ""}`
          }
        >
          <Settings size={18} strokeWidth={2} />

          <span>Configurações</span>
        </NavLink>

        <button
          type="button"
          className="sidebar-logout"
          onClick={handleLogout}
        >
          <LogOut size={18} strokeWidth={2} />

          <span>Sair</span>
        </button>
      </div>
    </aside>
  );
}