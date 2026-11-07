import { Boxes,Cable,ChevronRight,ClipboardCheck,Gauge,Globe2,Link2,LogOut,Megaphone,MousePointerClick,PlayCircle,Settings,Tags } from "lucide-react";
import { NavLink,useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
const menuItems=[
 {label:"Dashboard",path:"/",icon:Gauge},{label:"Produtos",path:"/produtos",icon:Boxes},
 {label:"Integrações",path:"/marketplaces",icon:Cable},{label:"Regras",path:"/regras",icon:Tags},
 {label:"Links de Afiliado",path:"/links-afiliado",icon:Link2},{label:"Aprovação",path:"/aprovacao",icon:ClipboardCheck},
 {label:"Execuções",path:"/execucoes",icon:PlayCircle},{label:"Publicações",path:"/publicacoes",icon:Megaphone},
 {label:"Canais",path:"/canais",icon:Globe2},{label:"Cliques",path:"/cliques",icon:MousePointerClick}
];
type SidebarProps = { isOpen?: boolean; onNavigate?: () => void };

export function Sidebar({ isOpen = false, onNavigate }: SidebarProps){
 const navigate=useNavigate();
 const handleLogout=async()=>{await supabase.auth.signOut();navigate("/");};
 return <aside className={`sidebar${isOpen ? " mobile-open" : ""}`}>
  <div className="sidebar-logo"><img className="logo-icon-image" src="/ofertix-mark.svg" alt="" /><div><strong>Ofertix</strong><span>Automação de ofertas</span></div></div>
  <nav className="sidebar-nav"><div className="nav-section-title">PRINCIPAL</div>{menuItems.map(item=>{const Icon=item.icon;return <NavLink key={item.path} to={item.path} end={item.path==="/"} onClick={onNavigate} className={({isActive})=>isActive?"nav-item active":"nav-item"}><Icon size={17} strokeWidth={1.9}/><span>{item.label}</span><ChevronRight size={14} strokeWidth={1.8} style={{marginLeft:"auto",opacity:.5}}/></NavLink>;})}</nav>
  <div className="sidebar-bottom"><div className="nav-section-title">SISTEMA</div><NavLink to="/configuracoes" onClick={onNavigate} className={({isActive})=>isActive?"nav-item active":"nav-item"}><Settings size={17} strokeWidth={1.9}/><span>Configurações</span><ChevronRight size={14} strokeWidth={1.8} style={{marginLeft:"auto",opacity:.5}}/></NavLink><button type="button" className="sidebar-logout" onClick={handleLogout}><LogOut size={17} strokeWidth={1.9}/><span>Sair</span></button><div className="sidebar-version">Ofertix 1.0</div></div>
 </aside>;
}
