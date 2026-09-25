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
        <div className="nav-section-title">
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
                `nav-item ${
                  isActive ? "active" : ""
                }`
              }
            >
              <Icon
                size={17}
                strokeWidth={1.9}
              />

              <span>{item.label}</span>

              <ChevronRight
                size={14}
                strokeWidth={1.8}
                style={{
                  marginLeft: "auto",
                  opacity: 0.5,
                }}
              />
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar-bottom">
        <div className="nav-section-title">
          SISTEMA
        </div>

        <NavLink
          to="/configuracoes"
          className={({ isActive }) =>
            `nav-item ${
              isActive ? "active" : ""
            }`
          }
        >
          <Settings
            size={17}
            strokeWidth={1.9}
          />

          <span>Configurações</span>

          <ChevronRight
            size={14}
            strokeWidth={1.8}
            style={{
              marginLeft: "auto",
              opacity: 0.5,
            }}
          />
        </NavLink>

        <button
          type="button"
          className="sidebar-logout"
          onClick={handleLogout}
        >
          <LogOut
            size={17}
            strokeWidth={1.9}
          />

          <span>Sair</span>
        </button>

        <div className="sidebar-version">
          Ofertix 1.0
        </div>
      </div>
    </aside>
  );
}