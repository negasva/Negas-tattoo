-- ════════════════════════════════════════════════════════════════════════
--
--   ⚠️  ESTE ES EL ÚNICO ARCHIVO QUE VA EN EL SQL EDITOR DE SUPABASE
--
--   NO pegues public/supabase.js (ese es JavaScript, empieza con "import").
--   Si ves el error  42601: syntax error at or near "{"  es que pegaste
--   el archivo equivocado.
--
--   CÓMO EJECUTARLO
--     1. supabase.com  →  tu proyecto
--     2. Menú lateral  →  SQL Editor  →  New query
--     3. Pega TODO este archivo (Ctrl+A, Ctrl+C aquí; Ctrl+V allá)
--     4. Botón RUN (o Ctrl+Enter)
--     5. Abajo debe salir una tabla con "TODO LISTO ✓"
--
--   Se puede correr varias veces sin romper nada.
--
-- ════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────
-- PARTE 1 · Tabla leads — captura en dos fases
--
-- El lead se guarda en el paso 1 (nombre + WhatsApp) y se completa al
-- final. Por eso email, tamaño y descripción tienen que aceptar NULL.
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

-- Quitamos el NOT NULL de las columnas que ahora llegan después del
-- primer guardado. Se hace en bucle para que no falle si alguna columna
-- no existe en tu tabla.
DO $$
DECLARE
  col text;
BEGIN
  FOREACH col IN ARRAY ARRAY['email', 'description', 'size', 'tattoo_zone', 'phone']
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = col
    ) THEN
      EXECUTE format('ALTER TABLE public.leads ALTER COLUMN %I DROP NOT NULL', col);
    END IF;
  END LOOP;
END $$;

-- Los leads viejos quedan marcados como completos.
UPDATE public.leads SET stage = 'complete' WHERE stage IS NULL;

CREATE INDEX IF NOT EXISTS leads_stage_idx      ON public.leads (stage);
CREATE INDEX IF NOT EXISTS leads_created_at_idx ON public.leads (created_at DESC);
CREATE INDEX IF NOT EXISTS leads_phone_idx      ON public.leads (phone);


-- ─────────────────────────────────────────────────────────────────────
-- PARTE 2 · Tabla gallery_images — el portafolio editable desde /admin
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

-- Nadie escribe la galería desde el navegador: todo pasa por el backend,
-- que usa la service role key (y la service role ignora RLS).
ALTER TABLE public.gallery_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gallery admin manage" ON public.gallery_images;
CREATE POLICY "gallery admin manage"
  ON public.gallery_images
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);


-- ─────────────────────────────────────────────────────────────────────
-- PARTE 3 · Las 20 fotos que ya tenías
--
-- Son las mismas que estaban escritas a mano en el código. "Lettering"
-- pasó a "Fineline". Solo se insertan si la tabla está vacía, así que
-- correr esto de nuevo no te va a duplicar nada.
-- ─────────────────────────────────────────────────────────────────────

INSERT INTO public.gallery_images (url, category, alt, span, sort_order)
SELECT * FROM (VALUES
  ('https://i.ibb.co/3ykPPk25/Tatttoo-Angel-copy-5.jpg',          'Blackwork', 'Tatuaje de ángel blackwork — Negas Tattoo Sabaneta',     'gal-cs2rs2',  1),
  ('https://i.ibb.co/fdPRjPvm/Tatttoo-pierna-completa-copy.jpg',   'Blackwork', 'Tatuaje de pierna completa blackwork — Negas Tattoo',    '',            2),
  ('https://i.ibb.co/C5xgJLXY/Tatttoo-Angel.jpg',                  'Blackwork', 'Tatuaje de ángel blackwork — Negas Tattoo Sabaneta',     '',            3),
  ('https://i.ibb.co/s93WWvNq/Tatttoo-Angel-copy-7.jpg',           'Blackwork', 'Tatuaje de ángel blackwork — Negas Tattoo Sabaneta',     'gal-rs2',     4),
  ('https://i.ibb.co/35ggTM1t/Tatttoo-pierna-completa-copy-2.jpg', 'Blackwork', 'Tatuaje de pierna completa blackwork — Negas Tattoo',    '',            5),
  ('https://i.ibb.co/x8MJ4tW3/Tatttoo-mask-copy.jpg',              'Blackwork', 'Tatuaje de máscara blackwork — Negas Tattoo Sabaneta',   '',            6),
  ('https://i.ibb.co/CKMdBXVC/Tatttoo-mask.jpg',                   'Blackwork', 'Tatuaje de máscara blackwork — Negas Tattoo Sabaneta',   '',            7),
  ('https://i.ibb.co/4n31ng5r/Tatttoo-Angel-copy-2.jpg',           'Blackwork', 'Tatuaje de ángel blackwork — Negas Tattoo Sabaneta',     'gal-cs2',     8),
  ('https://i.ibb.co/Z6LmS5WK/Tatttoo-tigre.jpg',                  'Blackwork', 'Tatuaje de tigre blackwork — Negas Tattoo Sabaneta',     '',            9),
  ('https://i.ibb.co/C3MCJJFW/Tatttoo-pierna-completa.jpg',        'Blackwork', 'Tatuaje de pierna completa blackwork — Negas Tattoo',    '',           10),
  ('https://i.ibb.co/dFYtWP4/tatuaje-mariposa.jpg',                'Botánico',  'Tatuaje de mariposa botánico — Negas Tattoo Sabaneta',   'gal-rs2',    11),
  ('https://i.ibb.co/FLGJ9Q23/tatuaje-bebe.jpg',                   'Botánico',  'Tatuaje botánico fine line — Negas Tattoo Sabaneta',     '',           12),
  ('https://i.ibb.co/6RCSYkN4/tatuaje-letras.jpg',                 'Fineline',  'Tatuaje de letras fine line — Negas Tattoo Sabaneta',    'gal-cs2',    13),
  ('https://i.ibb.co/wZhYZ7TN/tatuaje-letras-copy.jpg',            'Fineline',  'Tatuaje de letras fine line — Negas Tattoo Sabaneta',    '',           14),
  ('https://i.ibb.co/FLhCmFhg/Tatttoo-eye.jpg',                    'Blackwork', 'Tatuaje de ojo blackwork — Negas Tattoo Sabaneta',       '',           15),
  ('https://i.ibb.co/fdPZLNzG/Tatttoo-Elefante.jpg',               'Blackwork', 'Tatuaje de elefante blackwork — Negas Tattoo Sabaneta',  '',           16),
  ('https://i.ibb.co/tMJQbKZW/IMG-0066.png',                       'Blackwork', 'Tatuaje blackwork — Negas Tattoo Sabaneta',              '',           17),
  ('https://i.ibb.co/hF1pjnd9/IMG-0067.png',                       'Blackwork', 'Tatuaje blackwork — Negas Tattoo Sabaneta',              'gal-cs2',    18),
  ('https://i.ibb.co/ynWN6Cj1/IMG-0065.png',                       'Blackwork', 'Tatuaje blackwork — Negas Tattoo Sabaneta',              '',           19),
  ('https://i.ibb.co/pBjNrfVs/IMG-0063.png',                       'Blackwork', 'Tatuaje blackwork — Negas Tattoo Sabaneta',              '',           20)
) AS seed(url, category, alt, span, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.gallery_images);


-- ─────────────────────────────────────────────────────────────────────
-- PARTE 4 · Storage para subir fotos nuevas desde /admin
--
-- Va dentro de un bloque con captura de errores: en algunos proyectos
-- de Supabase el editor no tiene permiso de tocar storage.objects. Si
-- eso pasa, NO se cae la migración — te avisa y creas el bucket a mano
-- desde Storage → New bucket → nombre "gallery" → marcar "Public".
--
-- Nada de esto afecta al formulario ni a las 20 fotos de arriba.
-- ─────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('gallery', 'gallery', true)
  ON CONFLICT (id) DO UPDATE SET public = true;

  RAISE NOTICE 'Bucket "gallery" listo.';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'No se pudo crear el bucket automáticamente (%). Créalo a mano: Storage → New bucket → "gallery" → Public.', SQLERRM;
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "gallery public read"         ON storage.objects;
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

  RAISE NOTICE 'Políticas de storage listas.';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'No se pudieron crear las políticas de storage (%). Solo afecta a SUBIR fotos nuevas desde el admin; pegar una URL sigue funcionando.', SQLERRM;
END $$;


-- ════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN — esto es lo que debe salir en la pestaña "Results"
-- ════════════════════════════════════════════════════════════════════════

SELECT
  'TODO LISTO ✓'                                                    AS resultado,
  (SELECT count(*) FROM public.gallery_images)                      AS fotos_en_galeria,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'leads'
       AND column_name IN ('stage','consent','update_token',
                           'estimated_min','estimated_max','estimated_price'))
                                                                    AS columnas_nuevas_de_6,
  (SELECT count(*) FROM public.leads)                               AS leads_existentes;

-- Debe decir:  fotos_en_galeria = 20   ·   columnas_nuevas_de_6 = 6
