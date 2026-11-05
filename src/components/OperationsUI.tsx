import type { ReactNode } from "react";

type Tone = "neutral" | "success" | "warning" | "danger" | "shopee" | "meli";

export function PageIntro({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <div className="ops-page-intro"><div><p className="ops-eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{actions && <div className="ops-page-actions">{actions}</div>}</div>;
}

export function Metric({ icon, label, value, detail }: { icon: ReactNode; label: string; value: ReactNode; detail: string }) {
  return <article className="ops-metric"><span className="ops-metric-icon">{icon}</span><strong>{value}</strong><span>{label}</span><small>{detail}</small></article>;
}

export function StatusPill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={"ops-pill ops-pill-" + tone}>{children}</span>;
}

export function MarketplaceTag({ name, slug }: { name: string; slug?: string | null }) {
  const tone = (slug ?? name).toLowerCase().includes("shopee") ? "shopee" : (slug ?? name).toLowerCase().includes("mercado") ? "meli" : "neutral";
  return <StatusPill tone={tone}>{name}</StatusPill>;
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="ops-empty"><strong>{title}</strong><p>{detail}</p></div>;
}

export function formatCurrency(value: number | null | undefined) {
  return value == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}