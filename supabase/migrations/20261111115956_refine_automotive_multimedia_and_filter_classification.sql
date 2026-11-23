-- Refine the automotive classifier for product titles seen in the channel examples.
UPDATE public.offer_categories
SET keywords = ARRAY(
  SELECT DISTINCT keyword
  FROM unnest(COALESCE(keywords, ARRAY[]::text[]) || ARRAY[
    'filtro de ar esportivo','filtro esportivo k&n','multimídia mp5','multimídia carplay','mp5 carplay automotivo'
  ]) AS keyword
  ORDER BY keyword
)
WHERE slug='automotivo';

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
  -- Strong automotive product signals take precedence over broad source categories.
  IF v_title ~ '(abafador|ponteira.*escapamento|escapamento|coletor.*escape|kit rosca|molas esportivas|mola esportiva|intake|filtro esportivo|filtro de ar esportivo|filtro.*esportivo|kit lavagem automotiva|kit de lavagem automotiva|desengraxante automotivo|shampoo automotivo|cera automotiva|politriz automotiva|vonixx|jogo de rodas|rodas esportivas|aerof.lio|spoiler automotivo|body kit|multim.dia automotiva|multim.dia.*(mp5|carplay)|mp5.*(multim.dia|carplay)|carplay automotivo|c.mera de r.|c.mera veicular|auxiliar de partida|compressor.*automotivo|apoio de bra.o automotivo|forro de cap.|filtro esportivo k.n|projetor de farol|farol retrofit|chave de impacto|kit ferramentas gedore|ferramentas para oficina|tapete porta.malas automotivo|acess.rios internos automotivos|acess.rios externos automotivos|tapete automotivo|acessorios automotivos|acessórios automotivos|pecas automotivas|peças automotivas|pecas para carros|peças para carros|pecas para motos|peças para motos|suporte para celular veicular|ferramenta automotiva|ferramentas automotivas|scanner automotivo|macaco hidraulico para carro|macaco hidráulico para carro|pastilhas de freio|amortecedor|pneu automotivo|camera veicular|câmera veicular|veiculo|veículo|motocicleta)' THEN
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

COMMENT ON FUNCTION public.classify_product_commercial_category(text, text) IS
  'Classifies automotive products using expanded accessory, detailing, workshop, suspension, exhaust, wheel and performance signals while preserving marketplace mappings.';
