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

-- Borrado lógico. El admin marca aquí en vez de esconder el lead solo en el
-- localStorage del navegador: así el borrado sobrevive al cambio de equipo y
-- una solicitud de supresión (Ley 1581) se puede atender de verdad.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS deleted_at      timestamptz;

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
CREATE INDEX IF NOT EXISTS leads_deleted_at_idx ON public.leads (deleted_at);

-- Quitamos cualquier UNIQUE sobre `phone`. Una persona que vuelve a cotizar es
-- una fila nueva, no una toma de control de la vieja: era ese UNIQUE el que
-- obligaba al servidor a "reutilizar" el lead existente, y de ahí salía que
-- con solo saber un teléfono se pudiera pedir el update_token de otra persona.
DO $$
DECLARE
  con record;
BEGIN
  FOR con IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'public.leads'::regclass
      AND c.contype = 'u'
      AND a.attname = 'phone'
      AND array_length(c.conkey, 1) = 1
  LOOP
    EXECUTE format('ALTER TABLE public.leads DROP CONSTRAINT %I', con.conname);
    RAISE NOTICE 'Constraint UNIQUE sobre phone eliminado: %', con.conname;
  END LOOP;

  FOR con IN
    SELECT i.indexrelid::regclass::text AS conname
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
    WHERE i.indrelid = 'public.leads'::regclass
      AND i.indisunique
      AND NOT i.indisprimary
      AND a.attname = 'phone'
      AND i.indnatts = 1
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %s', con.conname);
    RAISE NOTICE 'Índice UNIQUE sobre phone eliminado: %', con.conname;
  END LOOP;
END $$;


-- ─────────────────────────────────────────────────────────────────────
-- PARTE 1b · RLS sobre leads — datos personales, cero acceso público
--
-- `leads` guarda nombre, teléfono, email, la descripción del tatuaje y la
-- foto de referencia de cada persona. Sin RLS, cualquiera con la anon key
-- (que es pública por diseño: viaja al navegador en /api/config) podía
-- hacer GET /rest/v1/leads?select=* y llevarse la base entera.
--
-- Activamos RLS y NO creamos ninguna política: sin política, `anon` y
-- `authenticated` no leen ni escriben nada. La service role del backend
-- ignora RLS, así que /api/lead/* y /api/admin/* siguen funcionando.
-- El panel admin ya no lee esta tabla desde el navegador.
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Por si alguna quedó de antes: ninguna política debe sobrevivir aquí.
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
             WHERE schemaname = 'public' AND tablename = 'leads'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.leads', pol.policyname);
    RAISE NOTICE 'Política eliminada de leads: %', pol.policyname;
  END LOOP;
END $$;


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

-- Medidas reales del archivo. Se leen en /admin al subir la pieza y sirven
-- para dos cosas: los width/height de los <img> (elimina CLS) y el
-- ImageObject de la galeria en JSON-LD.
ALTER TABLE public.gallery_images ADD COLUMN IF NOT EXISTS img_width  integer;
ALTER TABLE public.gallery_images ADD COLUMN IF NOT EXISTS img_height integer;

CREATE INDEX IF NOT EXISTS gallery_active_order_idx
  ON public.gallery_images (active, sort_order, id);

-- Nadie escribe la galería desde el navegador: todo pasa por el backend,
-- que usa la service role key (y la service role ignora RLS).
ALTER TABLE public.gallery_images ENABLE ROW LEVEL SECURITY;

-- Sin políticas, a propósito. La que había ("gallery admin manage", FOR ALL
-- TO authenticated USING true) dejaba a CUALQUIER usuario autenticado
-- escribir la tabla por PostgREST, saltándose el requireAdmin del servidor y
-- la lista de ADMIN_EMAILS. La lectura pública la sirve /api/gallery.
DROP POLICY IF EXISTS "gallery admin manage" ON public.gallery_images;


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
-- PARTE 4 · Storage — los tres buckets, declarados aquí
--
-- Va dentro de bloques con captura de errores: en algunos proyectos de
-- Supabase el editor no tiene permiso de tocar storage.objects. Si eso
-- pasa, NO se cae la migración — te avisa y lo creas a mano desde
-- Storage → New bucket.
--
--   gallery           PÚBLICO   el portafolio, para eso está.
--   reference-images  PRIVADO   fotos que suben los clientes (partes del
--                               cuerpo, tatuajes previos).
--   signed-documents  PRIVADO   cédulas y documentos de acudientes de
--                               menores de edad.
--
-- Los dos privados no se sirven por URL pública: el admin los abre con
-- URLs firmadas de 1 hora que emite el backend (/api/admin/leads firma la
-- foto de referencia; /api/admin/signed-url el resto).
--
--
--   ⚠️  CONFIGURACIÓN MANUAL PENDIENTE — el SQL no la puede hacer
--
--   El tamaño y el tipo de archivo hoy se validan SOLO en el navegador, y
--   el archivo va directo del navegador a Storage: el servidor nunca lo ve.
--   Sin el límite puesto en el bucket, cualquiera con la anon key sube lo
--   que quiera, del tamaño que quiera, bajo tu dominio.
--
--   Supabase → Storage → (cada bucket) → Settings:
--
--     file_size_limit     = 10MB
--     allowed_mime_types  = image/jpeg, image/png, image/webp
--
--   Aplícalo a los tres buckets. Los chequeos del cliente se quedan como
--   comodidad para el usuario, no como control de seguridad.
-- ─────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('gallery', 'gallery', true)
  ON CONFLICT (id) DO UPDATE SET public = true;

  -- Privados: `public = false` hace que getPublicUrl() no sirva de nada y
  -- que solo valga una URL firmada.
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('reference-images', 'reference-images', false),
         ('signed-documents', 'signed-documents', false)
  ON CONFLICT (id) DO UPDATE SET public = false;

  RAISE NOTICE 'Buckets listos: gallery (público), reference-images y signed-documents (privados).';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'No se pudieron crear los buckets automáticamente (%). Créalos a mano en Storage → New bucket: "gallery" (Public), "reference-images" y "signed-documents" (SIN marcar Public).', SQLERRM;
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "gallery public read"         ON storage.objects;
  DROP POLICY IF EXISTS "gallery authenticated write" ON storage.objects;
  DROP POLICY IF EXISTS "gallery authenticated del"   ON storage.objects;
  DROP POLICY IF EXISTS "reference anon upload"       ON storage.objects;
  DROP POLICY IF EXISTS "documents admin upload"      ON storage.objects;

  -- gallery: lectura pública (es el portafolio), escritura autenticada.
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

  -- reference-images: el visitante del cotizador sube (no está logueado),
  -- pero NADIE lee. Ni anon ni authenticated tienen SELECT: la lectura sale
  -- solo por URL firmada del backend.
  CREATE POLICY "reference anon upload"
    ON storage.objects FOR INSERT
    TO anon, authenticated
    WITH CHECK (bucket_id = 'reference-images');

  -- signed-documents: sube el admin desde el panel. Tampoco se lee desde el
  -- navegador; para verlos, /api/admin/signed-url.
  CREATE POLICY "documents admin upload"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'signed-documents');

  RAISE NOTICE 'Políticas de storage listas. Sin SELECT para los buckets privados: solo URLs firmadas.';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'No se pudieron crear las políticas de storage (%). Revísalas a mano en Storage → Policies.', SQLERRM;
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
  (SELECT count(*) FROM public.leads)                               AS leads_existentes,
  -- Seguridad: esto es lo que hay que mirar de verdad.
  (SELECT relrowsecurity FROM pg_class
     WHERE oid = 'public.leads'::regclass)                          AS rls_activa_en_leads,
  (SELECT count(*) FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'leads')           AS politicas_en_leads,
  (SELECT count(*) FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'gallery_images')  AS politicas_en_galeria,
  (SELECT count(*) FROM storage.buckets
     WHERE id IN ('reference-images','signed-documents') AND public)
                                                                    AS buckets_privados_mal;

-- Debe decir:
--   fotos_en_galeria      = 20
--   columnas_nuevas_de_6  = 6
--   rls_activa_en_leads   = true   ← si sale false, la base está expuesta
--   politicas_en_leads    = 0      ← 0 es lo correcto: nadie entra con anon
--   politicas_en_galeria  = 0
--   buckets_privados_mal  = 0      ← si sale 1 o 2, quedó un bucket público
--
-- Falta todavía la parte que el SQL no puede hacer: los file_size_limit y
-- allowed_mime_types de la PARTE 4, que van a mano en el dashboard.
