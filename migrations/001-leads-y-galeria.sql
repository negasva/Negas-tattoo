-- ════════════════════════════════════════════════════════════════════════
-- Negas Tattoo — migración para el nuevo cotizador y la galería editable
--
-- CÓMO EJECUTARLO
--   1. Entra a tu proyecto en supabase.com
--   2. Menú lateral → SQL Editor → New query
--   3. Pega TODO este archivo y dale RUN
--
-- Es idempotente: puedes correrlo varias veces sin romper nada.
-- ════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────
-- 1. TABLA leads — captura en dos fases
--    El lead se guarda en el paso 1 (nombre + WhatsApp) y se enriquece
--    al final. Por eso email, tamaño y descripción deben poder ser NULL.
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS stage           text    DEFAULT 'complete';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS consent         boolean DEFAULT false;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS consent_at      timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS update_token    text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS estimated_min   bigint;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS estimated_max   bigint;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS estimated_price text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS completed_at    timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS source          text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS utm_source      text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS utm_medium      text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS utm_campaign    text;

-- El email ahora es opcional, y zona/tamaño/descripción llegan después
-- del primer guardado. Quitamos los NOT NULL si existían.
ALTER TABLE public.leads ALTER COLUMN email       DROP NOT NULL;
ALTER TABLE public.leads ALTER COLUMN description DROP NOT NULL;
ALTER TABLE public.leads ALTER COLUMN size        DROP NOT NULL;

-- tattoo_zone ya no se pide en el formulario. La columna se conserva por
-- historial, pero deja de ser obligatoria.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'tattoo_zone'
  ) THEN
    EXECUTE 'ALTER TABLE public.leads ALTER COLUMN tattoo_zone DROP NOT NULL';
  END IF;
END $$;

-- Los leads viejos quedan marcados como completos.
UPDATE public.leads SET stage = 'complete' WHERE stage IS NULL;

CREATE INDEX IF NOT EXISTS leads_stage_idx      ON public.leads (stage);
CREATE INDEX IF NOT EXISTS leads_created_at_idx ON public.leads (created_at DESC);
CREATE INDEX IF NOT EXISTS leads_phone_idx      ON public.leads (phone);


-- ─────────────────────────────────────────────────────────────────────
-- 2. TABLA gallery_images — el portafolio, editable desde /admin
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.gallery_images (
  id          bigserial PRIMARY KEY,
  url         text NOT NULL,
  category    text NOT NULL DEFAULT 'Blackwork',
  alt         text,
  span        text DEFAULT '',
  sort_order  integer DEFAULT 0,
  active      boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gallery_active_order_idx
  ON public.gallery_images (active, sort_order, id);


-- ─────────────────────────────────────────────────────────────────────
-- 3. RLS — nadie escribe desde el navegador
--    Todas las lecturas y escrituras de la galería pasan por el backend,
--    que usa la service role key (la service role ignora RLS).
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.gallery_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gallery admin manage" ON public.gallery_images;
CREATE POLICY "gallery admin manage"
  ON public.gallery_images
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);


-- ─────────────────────────────────────────────────────────────────────
-- 4. STORAGE — bucket público para las piezas del portafolio
-- ─────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('gallery', 'gallery', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "gallery public read"        ON storage.objects;
DROP POLICY IF EXISTS "gallery authenticated write" ON storage.objects;
DROP POLICY IF EXISTS "gallery authenticated del"   ON storage.objects;

CREATE POLICY "gallery public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'gallery');

CREATE POLICY "gallery authenticated write"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'gallery');

CREATE POLICY "gallery authenticated del"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'gallery');


-- ─────────────────────────────────────────────────────────────────────
-- 5. SEED — las 20 piezas que ya estaban en el código
--    "Lettering" pasa a "Fineline" según lo acordado. Si luego quieres
--    reclasificar las dos piezas de letras, hazlo desde /admin.
-- ─────────────────────────────────────────────────────────────────────

INSERT INTO public.gallery_images (url, category, alt, span, sort_order)
SELECT * FROM (VALUES
  ('https://i.ibb.co/3ykPPk25/Tatttoo-Angel-copy-5.jpg',            'Blackwork', 'Tatuaje de ángel blackwork — Negas Tattoo Sabaneta',      'gal-cs2rs2', 0),
  ('https://i.ibb.co/fdPRjPvm/Tatttoo-pierna-completa-copy.jpg',     'Blackwork', 'Tatuaje de pierna completa blackwork — Negas Tattoo',      '',           0),
  ('https://i.ibb.co/C5xgJLXY/Tatttoo-Angel.jpg',                    'Blackwork', 'Tatuaje de ángel blackwork — Negas Tattoo Sabaneta',      '',           0),
  ('https://i.ibb.co/s93WWvNq/Tatttoo-Angel-copy-7.jpg',             'Blackwork', 'Tatuaje de ángel blackwork — Negas Tattoo Sabaneta',      'gal-rs2',    0),
  ('https://i.ibb.co/35ggTM1t/Tatttoo-pierna-completa-copy-2.jpg',   'Blackwork', 'Tatuaje de pierna completa blackwork — Negas Tattoo',      '',           0),
  ('https://i.ibb.co/x8MJ4tW3/Tatttoo-mask-copy.jpg',                'Blackwork', 'Tatuaje de máscara blackwork — Negas Tattoo Sabaneta',    '',           0),
  ('https://i.ibb.co/CKMdBXVC/Tatttoo-mask.jpg',                     'Blackwork', 'Tatuaje de máscara blackwork — Negas Tattoo Sabaneta',    '',           0),
  ('https://i.ibb.co/4n31ng5r/Tatttoo-Angel-copy-2.jpg',             'Blackwork', 'Tatuaje de ángel blackwork — Negas Tattoo Sabaneta',      'gal-cs2',    0),
  ('https://i.ibb.co/Z6LmS5WK/Tatttoo-tigre.jpg',                    'Blackwork', 'Tatuaje de tigre blackwork — Negas Tattoo Sabaneta',      '',           0),
  ('https://i.ibb.co/C3MCJJFW/Tatttoo-pierna-completa.jpg',          'Blackwork', 'Tatuaje de pierna completa blackwork — Negas Tattoo',      '',           0),
  ('https://i.ibb.co/dFYtWP4/tatuaje-mariposa.jpg',                  'Botánico',  'Tatuaje de mariposa botánico — Negas Tattoo Sabaneta',    'gal-rs2',    0),
  ('https://i.ibb.co/FLGJ9Q23/tatuaje-bebe.jpg',                     'Botánico',  'Tatuaje botánico fine line — Negas Tattoo Sabaneta',      '',           0),
  ('https://i.ibb.co/6RCSYkN4/tatuaje-letras.jpg',                   'Fineline',  'Tatuaje de letras fine line — Negas Tattoo Sabaneta',     'gal-cs2',    0),
  ('https://i.ibb.co/wZhYZ7TN/tatuaje-letras-copy.jpg',              'Fineline',  'Tatuaje de letras fine line — Negas Tattoo Sabaneta',     '',           0),
  ('https://i.ibb.co/FLhCmFhg/Tatttoo-eye.jpg',                      'Blackwork', 'Tatuaje de ojo blackwork — Negas Tattoo Sabaneta',        '',           0),
  ('https://i.ibb.co/fdPZLNzG/Tatttoo-Elefante.jpg',                 'Blackwork', 'Tatuaje de elefante blackwork — Negas Tattoo Sabaneta',   '',           0),
  ('https://i.ibb.co/tMJQbKZW/IMG-0066.png',                         'Blackwork', 'Tatuaje blackwork — Negas Tattoo Sabaneta',               '',           0),
  ('https://i.ibb.co/hF1pjnd9/IMG-0067.png',                         'Blackwork', 'Tatuaje blackwork — Negas Tattoo Sabaneta',               'gal-cs2',    0),
  ('https://i.ibb.co/ynWN6Cj1/IMG-0065.png',                         'Blackwork', 'Tatuaje blackwork — Negas Tattoo Sabaneta',               '',           0),
  ('https://i.ibb.co/pBjNrfVs/IMG-0063.png',                         'Blackwork', 'Tatuaje blackwork — Negas Tattoo Sabaneta',               '',           0)
) AS seed(url, category, alt, span, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.gallery_images);


-- ════════════════════════════════════════════════════════════════════════
-- LISTO. Verifica con:
--   SELECT count(*) FROM public.gallery_images;   -- debería dar 20
--   SELECT stage, count(*) FROM public.leads GROUP BY stage;
-- ════════════════════════════════════════════════════════════════════════
