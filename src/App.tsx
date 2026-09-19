import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";

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

function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <Sidebar />

        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />

            <Route path="/produtos" element={<Produtos />} />

            <Route path="/ofertas" element={<Ofertas />} />

            <Route path="/marketplaces" element={<Marketplaces />} />

            <Route path="/regras" element={<Regras />} />

            <Route path="/links-afiliado" element={<LinksAfiliado />} />

            <Route path="/publicacoes" element={<Publicacoes />} />

            <Route path="/whatsapp" element={<WhatsApp />} />

            <Route path="/cliques" element={<Cliques />} />

            <Route path="/configuracoes" element={<Configuracoes />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;