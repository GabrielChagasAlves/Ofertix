import { NavLink } from "react-router-dom";
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
  Zap,
} from "lucide-react";

const menuItems = [
  {
    label: "Dashboard",
    path: "/",
    icon: BarChart3,
  },
  {
    label: "Produtos",
    path: "/produtos",
    icon: ShoppingBag,
  },
  {
    label: "Ofertas",
    path: "/ofertas",
    icon: Tags,
  },
  {
    label: "Marketplaces",
    path: "/marketplaces",
    icon: Store,
  },
  {
    label: "Regras",
    path: "/regras",
    icon: ListFilter,
  },
  {
    label: "Publicações",
    path: "/publicacoes",
    icon: Send,
  },
  {
    label: "WhatsApp",
    path: "/whatsapp",
    icon: MessageCircle,
  },
  {
    label: "Cliques",
    path: "/cliques",
    icon: MousePointerClick,
  },
];

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-icon">
          <Zap size={21} />
        </div>

        <div>
          <strong>Ofertix</strong>
          <span>Ofertas inteligentes</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-title">MENU</div>

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
              <Icon size={19} />
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
          <Settings size={19} />
          <span>Configurações</span>
        </NavLink>

        <div className="sidebar-version">
          Ofertix v0.1.0
        </div>
      </div>
    </aside>
  );
}