export type ProductPriority = 1 | 2 | 3;

type PriorityInput = {
  title: string;
  categorySlug?: string | null;
  marketplaceCategory?: string | null;
  discountPercent?: number | null;
};

const essentialTerms: Record<string, string[]> = {
  automotivo: [
    "pneu", "bateria automotiva", "filtro de oleo", "filtro de ar",
    "pastilha de freio", "disco de freio", "amortecedor", "vela de ignicao",
    "correia dentada", "bomba de combustivel", "alternador", "motor de partida",
    "embreagem", "radiador", "palheta limpador", "macaco hidraulico",
    "scanner obd", "ferramenta automotiva", "jogo de soquetes"
  ],
  perfumes: [
    "eau de parfum", "eau de toilette", "parfum", "perfume masculino",
    "perfume feminino", "perfume unissex", "perfume importado"
  ],
  tecnologia: [
    "smartphone", "iphone", "notebook", "ssd", "memoria ram",
    "processador", "placa de video", "monitor", "roteador",
    "tablet", "smartwatch", "impressora", "headset", "fone bluetooth",
    "carregador usb c", "power bank", "webcam"
  ],
  "casa-e-utilidades": [
    "air fryer", "fritadeira eletrica", "geladeira", "refrigerador",
    "maquina de lavar", "lava loucas", "microondas", "micro ondas",
    "cafeteira", "liquidificador", "aspirador", "ventilador",
    "ar condicionado", "purificador de agua", "panela de pressao eletrica",
    "forno eletrico", "batedeira", "cooktop"
  ],
};

const complementaryTerms: Record<string, string[]> = {
  automotivo: ["camera de re", "central multimidia", "tapete automotivo", "capa para banco", "suporte veicular", "lampada automotiva", "polidor automotivo"],
  perfumes: ["body splash", "desodorante", "hidratante", "kit perfume", "pos barba"],
  tecnologia: ["teclado", "mouse", "microfone", "caixa de som", "hub usb", "adaptador", "controle gamer", "cabo usb"],
  "casa-e-utilidades": ["panela", "frigideira", "mixer", "sanduicheira", "escorredor", "jogo de cama", "toalha", "organizador", "fechadura digital"],
};

const normalize = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const containsTerm = (text: string, terms: string[]) =>
  terms.some((term) => text.includes(normalize(term)));

export function getProductPriority(input: PriorityInput): ProductPriority {
  const text = normalize([input.title, input.marketplaceCategory ?? ""].join(" "));
  const category = input.categorySlug ?? "";
  if (category && containsTerm(text, essentialTerms[category] ?? [])) return 1;
  if (category && containsTerm(text, complementaryTerms[category] ?? [])) return 2;

  // For products not yet categorized, only use unambiguous essential signals.
  const allEssential = Object.values(essentialTerms).flat();
  if (!category && containsTerm(text, allEssential)) return 1;
  return 3;
}

export function getProductPriorityLabel(priority: ProductPriority): string {
  if (priority === 1) return "Essencial";
  if (priority === 2) return "Complementar";
  return "Demais ofertas";
}
