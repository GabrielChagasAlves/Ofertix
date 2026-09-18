export function Publicacoes() {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">DIVULGAÇÃO</p>
          <h1>Publicações</h1>
          <p className="page-description">
            Histórico das ofertas publicadas.
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="empty-state">
          <h3>Nenhuma publicação</h3>
          <p>O histórico de publicações aparecerá aqui.</p>
        </div>
      </div>
    </div>
  );
}