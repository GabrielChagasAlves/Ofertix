-- Classification improvements are intentionally data-driven and non-destructive.
-- This migration adds source-category mappings and a read-only preview.
-- It does NOT rewrite existing products or change active/eligibility status.

ALTER TABLE public.offer_categories
  ADD COLUMN IF NOT EXISTS marketplace_category_names text[] NOT NULL DEFAULT '{}';

-- Add two distinct commercial categories rather than forcing unrelated products
-- into "Casa e Utilidades". Existing rows are preserved.
INSERT INTO public.offer_categories
  (name, slug, priority, keywords, excluded_keywords, marketplace_category_ids, marketplace_category_names, active)
SELECT
  'Pets', 'pets', 70,
  ARRAY['pet','pets','cachorro','cães','caes','gato','gatos','ração','racao','tapete higiênico pet','tapete higienico pet','areia para gatos','coleira','guia para cachorro','cama para pet','brinquedo para cachorro','brinquedo para gato','comedouro pet','bebedouro pet'],
  ARRAY['fantasia de cachorro','estampa de cachorro','estampa de gato','almofada decorativa'],
  ARRAY[]::text[],
  ARRAY['Pet Accessories','Litter & Toilet','Pet Food','Pet Supplies','Pet Toys','Pet Beds'],
  true
WHERE NOT EXISTS (SELECT 1 FROM public.offer_categories WHERE slug='pets');

INSERT INTO public.offer_categories
  (name, slug, priority, keywords, excluded_keywords, marketplace_category_ids, marketplace_category_names, active)
SELECT
  'Beleza', 'beleza', 60,
  ARRAY['maquiagem','maquiagens','batom','base facial','corretivo','rímel','rimel','cílios','cilios','unhas','esmalte','skincare','cuidados com a pele','cosmético','cosmetico','cosméticos','cosmeticos','pincel de maquiagem','necessaire de maquiagem','secador de cabelo','chapinha','modelador de cabelo','depilador','perfumeira'],
  ARRAY['porta maquiagem','organizador de maquiagem','espelho decorativo'],
  ARRAY[]::text[],
  ARRAY['Beauty Tools','Hand, Foot & Nail Care','Makeup','Skin Care','Hair Care','Bath & Body'],
  true
WHERE NOT EXISTS (SELECT 1 FROM public.offer_categories WHERE slug='beleza');

-- Register unambiguous marketplace category names on existing categories.
UPDATE public.offer_categories
SET marketplace_category_names = (
  SELECT ARRAY(SELECT DISTINCT x FROM unnest(
    COALESCE(offer_categories.marketplace_category_names, ARRAY[]::text[]) ||
    ARRAY['Internal Accessories for Automobiles','Accessories for Motorcycles','Vehicular Care','Automotive Parts','Car Electronics']
  ) x ORDER BY x)
)
WHERE slug='automotivo';

UPDATE public.offer_categories
SET marketplace_category_names = (
  SELECT ARRAY(SELECT DISTINCT x FROM unnest(
    COALESCE(offer_categories.marketplace_category_names, ARRAY[]::text[]) ||
    ARRAY['Desktop & Laptop Components','Computer Peripherals','Cell Phones & Accessories','Smartwatches','Audio','Cameras & Photography']
  ) x ORDER BY x)
)
WHERE slug='tecnologia';

UPDATE public.offer_categories
SET marketplace_category_names = (
  SELECT ARRAY(SELECT DISTINCT x FROM unnest(
    COALESCE(offer_categories.marketplace_category_names, ARRAY[]::text[]) ||
    ARRAY['Decoration','Home Care Supplies','Home Organizers','Furniture','Small Household Appliances','Lighting','Kitchen Appliances','Bedding','Bath','Kitchen & Dining']
  ) x ORDER BY x)
)
WHERE slug='casa-e-utilidades';

-- Normalize source category text for matching, but preserve the original value in products.
CREATE OR REPLACE FUNCTION public.classify_product_commercial_category(
  p_title text,
  p_source_category text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $function$
DECLARE
  v_title text := lower(coalesce(p_title,''));
  v_source text := lower(trim(coalesce(p_source_category,'')));
  v_id uuid;
BEGIN
  -- Strong title signals override broad or noisy source categories.
  IF v_title ~ '(tapete automotivo|acessorios automotivos|acessórios automotivos|pecas automotivas|peças automotivas|pecas para carros|peças para carros|pecas para motos|peças para motos|suporte para celular veicular|ferramenta automotiva|ferramentas automotivas|scanner automotivo|macaco hidraulico para carro|macaco hidráulico para carro|pastilhas de freio|amortecedor|embreagem|pneu automotivo|camera veicular|câmera veicular|veiculo|veículo|motocicleta)' THEN
    SELECT id INTO v_id FROM public.offer_categories WHERE slug='automotivo' AND active LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  -- A marketplace category is used only when its mapping is explicitly configured.
  IF v_source <> '' AND v_source !~ '^MLB[0-9]+$' THEN
    SELECT oc.id INTO v_id
    FROM public.offer_categories oc
    WHERE oc.active = true
      AND lower(trim(v_source)) = ANY (
        ARRAY(SELECT lower(trim(x)) FROM unnest(COALESCE(oc.marketplace_category_names, ARRAY[]::text[])) x)
      )
    ORDER BY oc.priority ASC
    LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  ELSIF v_source ~ '^MLB[0-9]+$' THEN
    SELECT oc.id INTO v_id
    FROM public.offer_categories oc
    WHERE oc.active = true AND upper(v_source) = ANY (
      ARRAY(SELECT upper(x) FROM unnest(COALESCE(oc.marketplace_category_ids, ARRAY[]::text[])) x)
    )
    ORDER BY oc.priority ASC
    LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  -- High-confidence title fallback; keep ambiguous terms out of category decisions.
  IF v_title ~ '(perfume|perfumes|eau de parfum|eau de toilette|parfum|colonia|colônia|fragr.ncia)' THEN
    SELECT id INTO v_id FROM public.offer_categories WHERE slug='perfumes' AND active LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;
  IF v_title ~ '(pet shop|para pets|para pet|cachorro|cães|caes|gato|gatos|ração|racao|areia para gatos|tapete higi.nico.*(pet|c.es|cachorro|gato)|coleira para|guia para cachorro|cama para pet|comedouro pet|bebedouro pet)' THEN
    SELECT id INTO v_id FROM public.offer_categories WHERE slug='pets' AND active LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;
  IF v_title !~ '(porta maquiagem|organizador de maquiagem|espelho decorativo)' AND v_title ~ '(maquiagem|batom|base facial|corretivo|r.mel|cilios|cílios|esmalte|skincare|cuidados com a pele|cosm.tico|pincel de maquiagem|secador de cabelo|chapinha|modelador de cabelo|depilador)' THEN
    SELECT id INTO v_id FROM public.offer_categories WHERE slug='beleza' AND active LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;
  IF v_title ~ '(automot|autom.vel|carro|veiculo|veículo|motocic|moto |pneu|freio|embreagem|retrovisor|farol|lanterna autom|bateria autom|oleo motor|óleo motor|pastilha de freio|suspens.o|amortecedor|acessorios para carro|acessórios para carro)' THEN
    SELECT id INTO v_id FROM public.offer_categories WHERE slug='automotivo' AND active LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;
  IF v_title ~ '(smartphone|celular|iphone|android|notebook|laptop|computador|pc gamer|monitor|teclado|mouse gamer|headset|fone de ouvido|fone bluetooth|smartwatch|tablet|televis|televisor|videogame|console|playstation|xbox|nintendo|camera digital|c.mera digital|impressora|microfone|roteador|wifi|placa de video|placa de v.deo|mem.ria ram|ssd |hd externo|drone|eletr.nic|eletronic)' THEN
    SELECT id INTO v_id FROM public.offer_categories WHERE slug='tecnologia' AND active LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;
  IF v_title ~ '(casa|cozinha|panelas|frigideira|talheres|utensilios|utensílios|organizador|decor|decora|moveis|móveis|mesa |cadeira|armario|armário|cama|banho|toalha|tapete|cortina|lumin.ria|luminaria|varal|cesto|passar roupa|tabua|t.bua|passadeira|prateleira|sapateira|cristaleira|eletrodom.stico|air fryer|fritadeira|liquidificador|cafeteira|aspirador|ventilador|bebedouro|caixa organizadora)' THEN
    SELECT id INTO v_id FROM public.offer_categories WHERE slug='casa-e-utilidades' AND active LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;
  RETURN NULL;
END;
$function$;

-- Preview only: no product/category rows are modified by this view.
CREATE OR REPLACE VIEW public.product_category_classification_preview
WITH (security_invoker = true)
AS
SELECT
  p.id AS product_id,
  p.title,
  p.category AS marketplace_category,
  p.commercial_category_id AS current_category_id,
  current_category.name AS current_category,
  p.commercial_category_source,
  suggested.id AS suggested_category_id,
  suggested.name AS suggested_category,
  CASE
    WHEN p.commercial_category_source = 'manual' THEN 'manual_override_preserved'
    WHEN p.category IS NOT NULL AND p.category <> ''
      AND EXISTS (
        SELECT 1 FROM public.offer_categories mapped
        WHERE mapped.active = true
          AND lower(trim(p.category)) = ANY (
            ARRAY(SELECT lower(trim(x)) FROM unnest(COALESCE(mapped.marketplace_category_names, ARRAY[]::text[])) x)
          )
      ) THEN 'marketplace_category_mapping'
    WHEN p.category ~* '^MLB[0-9]+$'
      AND EXISTS (
        SELECT 1 FROM public.offer_categories mapped
        WHERE mapped.active = true AND upper(p.category) = ANY (
          ARRAY(SELECT upper(x) FROM unnest(COALESCE(mapped.marketplace_category_ids, ARRAY[]::text[])) x)
        )
      ) THEN 'marketplace_category_id_mapping'
    WHEN suggested.id IS NOT NULL THEN 'title_keyword_fallback'
    ELSE 'no_confident_match'
  END AS classification_reason,
  CASE
    WHEN p.commercial_category_source = 'manual' THEN 1.00::numeric
    WHEN suggested.id IS NULL THEN 0.00::numeric
    WHEN p.category IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.offer_categories mapped
      WHERE mapped.id = suggested.id
        AND lower(trim(p.category)) = ANY (
          ARRAY(SELECT lower(trim(x)) FROM unnest(COALESCE(mapped.marketplace_category_names, ARRAY[]::text[])) x)
        )
    ) THEN 0.99::numeric
    WHEN lower(coalesce(p.title,'')) ~ '(tapete automotivo|acessorios automotivos|acessórios automotivos|pecas automotivas|peças automotivas|pecas para carros|peças para carros|suporte para celular veicular|ferramenta automotiva|scanner automotivo|pastilhas de freio|amortecedor)' THEN 0.95::numeric
    ELSE 0.78::numeric
  END AS confidence,
  p.active
FROM public.products p
LEFT JOIN public.offer_categories current_category ON current_category.id = p.commercial_category_id
LEFT JOIN public.offer_categories suggested
  ON suggested.id = public.classify_product_commercial_category(p.title, p.category);

GRANT SELECT ON public.product_category_classification_preview TO authenticated;

COMMENT ON VIEW public.product_category_classification_preview IS
  'Read-only preview of automatic commercial category suggestions. Does not modify products.';
