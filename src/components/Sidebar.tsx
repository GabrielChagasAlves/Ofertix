import {
  Boxes,
  Cable,
  ChevronRight,
  Gauge,
  Globe2,
  Link2,
  LogOut,
  Megaphone,
  MousePointerClick,
  PlayCircle,
  Settings,
  Tags,
} from "lucide-react";

import {
  NavLink,
  useNavigate,
} from "react-router-dom";

import { supabase } from "../lib/supabase";

const menuItems = [
  {
    label: "Dashboard",
    path: "/",
    icon: Gauge,
  },
  {
    label: "Produtos",
    path: "/produtos",
    icon: Boxes,
  },
  {
    label: "Integrações",
    path: "/marketplaces",
    icon: Cable,
  },
  {
    label: "Regras",
    path: "/regras",
    icon: Tags,
  },
  {
    label: "Links de Afiliado",
    path: "/links-afiliado",
    icon: Link2,
  },
  {
    label: "Execuções",
    path: "/execucoes",
    icon: PlayCircle,
  },
  {
    label: "Publicações",
    path: "/publicacoes",
    icon: Megaphone,
  },
  {
    label: "Canais",
    path: "/canais",
    icon: Globe2,
  },
  {
    label: "Cliques",
    path: "/cliques",
    icon: MousePointerClick,
  },
];

export function Sidebar() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();

    navigate("/");
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="sidebar-brand">
          <div className="brand-mark">
            <span>O</span>
          </div>

          <div className="brand-content">
            <strong>Ofertix</strong>

            <span>
              Automação de ofertas
            </span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-label">
            PRINCIPAL
          </div>

          {menuItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
                className={({ isActive }) =>
                  `sidebar-link ${
                    isActive ? "active" : ""
                  }`
                }
              >
                <Icon
                  size={18}
                  strokeWidth={1.9}
                />

                <span>{item.label}</span>

                <ChevronRight
                  className="sidebar-link-arrow"
                  size={15}
                  strokeWidth={1.8}
                />
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="sidebar-bottom">
        <div className="sidebar-section-label">
          SISTEMA
        </div>

        <NavLink
          to="/configuracoes"
          className={({ isActive }) =>
            `sidebar-link ${
              isActive ? "active" : ""
            }`
          }
        >
          <Settings
            size={18}
            strokeWidth={1.9}
          />

          <span>Configurações</span>

          <ChevronRight
            className="sidebar-link-arrow"
            size={15}
            strokeWidth={1.8}
          />
        </NavLink>

        <button
          type="button"
          className="sidebar-link sidebar-logout"
          onClick={handleLogout}
        >
          <LogOut
            size={18}
            strokeWidth={1.9}
          />

          <span>Sair</span>
        </button>

        <div className="sidebar-version">
          <div>
            <span>Ofertix</span>

            <small>v1.0</small>
          </div>
        </div>
      </div>
    </aside>
  );
}