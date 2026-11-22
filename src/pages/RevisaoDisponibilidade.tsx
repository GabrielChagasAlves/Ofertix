import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, RefreshCw, CheckCircle2, XCircle, Clock3 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { PageIntro } from "../components/OperationsUI";
import "./RevisaoDisponibilidade.css";

type Product = {
  id: string; external_id: string; title: string; product_url: string | null;
  availability_error: string | null; affiliate_generation_error: string | null;
  affiliate_generation_status: string | null; availability_retry_count: number;
  updated_at: string; availability_review_status: string | null; active: boolean;
};

export function RevisaoDisponibilidade() {
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const { data, error: requestError } = await supabase.from("products")
      .select("id,external_id,title,product_url,availability_error,affiliate_generation_error,affiliate_generation_status,availability_retry_count,updated_at,availability_review_status,active")
      .eq("availability_review_required", true).order("updated_at", { ascending: false }).limit(300);
    if (requestError) setError(requestError.message);
    setItems((data ?? []) as Product[]);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const resolve = async (product: Product, status: "available" | "unavailable") => {
    setBusy(product.id); setError(""); setMessage("");
    const { data: auth } = await supabase.auth.getUser();
    const now = new Date().toISOString();
    const affiliateReview = product.affiliate_generation_status === "manual_review";
    const note = affiliateReview
      ? status === "available" ? "Produto aprovado na revisão de afiliados; devolvido à fila de geração do n8n." : "Produto reprovado na revisão de afiliados; exclusão lógica do catálogo."
      : status === "available" ? "Disponibilidade confirmada manualmente por usuário." : "Indisponibilidade confirmada manualmente por usuário.";
    const update = affiliateReview
      ? status === "available"
        ? { active: true, availability_status: "available", affiliate_generation_status: "pending", affiliate_generation_error: null, availability_review_required: false, availability_review_status: "affiliate_retry_approved", availability_reviewed_at: now, availability_reviewed_by: auth.user?.id ?? null, availability_review_note: note, updated_at: now }
        : { active: false, affiliate_generation_status: "rejected", availability_review_required: false, availability_review_status: "affiliate_rejected", availability_reviewed_at: now, availability_reviewed_by: auth.user?.id ?? null, availability_review_note: note, updated_at: now }
      : { availability_status: status, availability_error: null, last_availability_check: now, availability_retry_count: 0, availability_next_retry_at: null, availability_review_required: false, availability_review_status: status === "available" ? "confirmed_available" : "confirmed_unavailable", availability_reviewed_at: now, availability_reviewed_by: auth.user?.id ?? null, availability_review_note: note, ...(status === "available" ? { last_available_at: now } : { last_unavailable_at: now }), updated_at: now };
    const { error: updateError } = await supabase.from("products").update(update).eq("id", product.id);
    if (updateError) { setError("Não foi possível salvar a decisão: " + updateError.message); setBusy(null); return; }
    let feedback = affiliateReview
      ? status === "available" ? "Produto aprovado e devolvido à fila do n8n." : "Produto reprovado e removido do catálogo operacional."
      : status === "available" ? "Produto confirmado como ativo." : "Produto confirmado como indisponível.";
    if (!affiliateReview) {
      const { error: historyError } = await supabase.from("product_availability_history").insert({ product_id: product.id, status, reason: note, checked_at: now });
      if (historyError) feedback = "Status atualizado, mas não foi possível registrar o histórico: " + historyError.message;
    }
    setMessage(feedback);
    await load(); setBusy(null);
  };

  return <div className="page ops-page availability-review-page">
    <PageIntro eyebrow="MERCADO LIVRE" title="Revisão manual" description="Analise falhas específicas de produtos e confirme a disponibilidade dos anúncios. Produtos aprovados na revisão de afiliados retornam à fila do n8n." actions={<button className="ops-button ops-button-secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16}/> Atualizar</button>} />
    <div className="availability-review-note"><AlertTriangle size={18}/><span>Falhas específicas de produtos aguardam decisão manual. Problemas gerais de conexão ou cookie aparecem como alertas do sistema e não entram nesta fila.</span></div>
    {error && <div className="ops-alert">{error}</div>}
    {message && <div className="ops-alert availability-review-success">{message}</div>}
    {loading ? <div className="ops-empty">Carregando produtos para revisão…</div> :
      items.length === 0 ? <div className="ops-surface availability-review-empty"><CheckCircle2 size={28}/><strong>Nenhum produto aguardando revisão</strong><p>Falhas específicas de produtos aparecerão aqui automaticamente.</p></div> :
      <div className="availability-review-list">{items.map(product => {
        const affiliateReview = product.affiliate_generation_status === "manual_review";
        return <article className="availability-review-card" key={product.id}>
          <div className="availability-review-card-head"><div><span className="availability-review-id">{product.external_id}</span><h3>{product.title}</h3><small><Clock3 size={13}/> Última tentativa: {new Date(product.updated_at).toLocaleString("pt-BR")} · Tentativas: {product.availability_retry_count}</small></div>
            {product.product_url && <a href={product.product_url} target="_blank" rel="noreferrer" className="ops-button ops-button-secondary"><ExternalLink size={15}/> Abrir anúncio</a>}
          </div>
          {affiliateReview && <div className="availability-review-note"><strong>Revisão de link de afiliado</strong><span>Se aprovado, o produto volta para a fila de geração. Se reprovado, será ocultado do catálogo operacional.</span></div>}
          <div className="availability-review-error"><strong>Motivo da falha</strong><p>{product.affiliate_generation_error || product.availability_error || "A integração não conseguiu confirmar o resultado automaticamente."}</p></div>
          <div className="availability-review-actions"><span>Após conferir o anúncio:</span>
            <button disabled={busy===product.id} onClick={() => void resolve(product,"available")} className="ops-button ops-button-primary"><CheckCircle2 size={15}/>{affiliateReview ? "Aprovar e reenviar ao n8n" : "Confirmar ativo"}</button>
            <button disabled={busy===product.id} onClick={() => void resolve(product,"unavailable")} className="ops-button ops-button-danger"><XCircle size={15}/>{affiliateReview ? "Reprovar e excluir do catálogo" : "Confirmar indisponível"}</button>
          </div>
        </article>;
      })}</div>}
  </div>;
}
