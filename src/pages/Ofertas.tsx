export function Ofertas() {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">OFERTAS</p>
          <h1>Ofertas</h1>
          <p className="page-description">
            Gerencie preços, descontos e links de afiliados.
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="empty-state">
          <h3>Nenhuma oferta cadastrada</h3>
          <p>Suas ofertas serão exibidas aqui.</p>
        </div>
      </div>
    </div>
  );
}