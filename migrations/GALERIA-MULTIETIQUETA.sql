-- ════════════════════════════════════════════════════════════════════════
--  Negas Tattoo · Galería con varias etiquetas por pieza
--
--  Córrelo UNA vez en Supabase → SQL Editor → New query → Run.
--  Es idempotente: correrlo dos veces no rompe ni duplica nada.
--
--  Qué hace:
--    1. Agrega la columna `categories` (lista de etiquetas).
--    2. Copia la etiqueta actual de cada pieza a la lista, para que nada
--       quede sin etiqueta.
--    3. Deja un índice para que filtrar por etiqueta siga siendo barato.
--
--  La columna vieja `category` NO se borra: el backend la mantiene
--  sincronizada con la primera etiqueta de la lista.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE public.gallery_images
  ADD COLUMN IF NOT EXISTS categories text[] NOT NULL DEFAULT '{}';

-- Las piezas que ya existían: su etiqueta única pasa a ser el primer
-- elemento de la lista. Solo toca las que todavía tienen la lista vacía.
UPDATE public.gallery_images
   SET categories = ARRAY[category]
 WHERE cardinality(categories) = 0
   AND category IS NOT NULL
   AND category <> '';

CREATE INDEX IF NOT EXISTS gallery_categories_idx
  ON public.gallery_images USING gin (categories);


-- ─── Verificación ───────────────────────────────────────────────────────
-- Debe salir 0 en `piezas_sin_etiqueta`.
SELECT
  'GALERÍA LISTA ✓'                                       AS resultado,
  count(*)                                                AS piezas,
  count(*) FILTER (WHERE cardinality(categories) = 0)     AS piezas_sin_etiqueta,
  count(*) FILTER (WHERE cardinality(categories) > 1)     AS piezas_con_varias_etiquetas
FROM public.gallery_images;
