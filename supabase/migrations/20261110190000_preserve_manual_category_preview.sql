-- Refine the read-only classification preview without changing product rows.
-- Manual classifications must display their current category as the suggestion.

DROP POLICY IF EXISTS "product screen users read categories for classification preview"
  ON public.offer_categories;

DROP POLICY IF EXISTS "users read offer categories by screen"
  ON public.offer_categories;
CREATE POLICY "users read offer categories by screen"
  ON public.offer_categories
  FOR SELECT
  TO authenticated
  USING (
    active = true
    AND (
      has_ofertix_permission('screen.rules'::text)
      OR has_ofertix_permission('screen.approval'::text)
      OR has_ofertix_permission('screen.products'::text)
    )
  );

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
  ON suggested.id = CASE
    WHEN p.commercial_category_source = 'manual' THEN p.commercial_category_id
    ELSE public.classify_product_commercial_category(p.title, p.category)
  END;

COMMENT ON VIEW public.product_category_classification_preview IS
  'Read-only preview of automatic commercial category suggestions. Manual classifications remain unchanged.';
