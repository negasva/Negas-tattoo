-- ════════════════════════════════════════════════════════════════════════
--
--   DIAGNÓSTICO DEL FORMULARIO — "No pudimos guardar tus datos"
--
--   /api/health ya sale todo en verde, así que las variables y las columnas
--   están bien. Lo que falla es el INSERT en la tabla leads. Este archivo
--   NO modifica nada: solo mira. Pégalo en el SQL Editor de Supabase y dale
--   RUN. Salen 5 tablas de resultados; mándamelas o revísalas con las notas
--   que hay debajo de cada una.
--
-- ════════════════════════════════════════════════════════════════════════


-- ─── 1 · ¿Hay columnas obligatorias que el servidor no está mandando? ────
-- El backend inserta exactamente: name, phone, email, description,
-- reference_img_url, status, stage, consent, consent_at, update_token,
-- source, utm_source, utm_medium, utm_campaign, created_at.
--
-- Si aquí aparece CUALQUIER otra columna, ese es el error (código 23502):
-- es obligatoria, no tiene valor por defecto y el servidor no la manda.

SELECT
  '1. COLUMNAS OBLIGATORIAS NO ENVIADAS' AS revision,
  column_name                            AS columna,
  data_type                              AS tipo,
  column_default                         AS valor_por_defecto
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'leads'
  AND is_nullable  = 'NO'
  AND column_default IS NULL
  AND is_identity = 'NO'
  AND column_name NOT IN (
    'id','name','phone','email','description','reference_img_url','status',
    'stage','consent','consent_at','update_token','source',
    'utm_source','utm_medium','utm_campaign','created_at'
  );
-- ESPERADO: 0 filas. Si sale algo → esa columna es la culpable.


-- ─── 2 · ¿Hay un CHECK que rechace los valores que manda el servidor? ────
-- El servidor guarda status = 'lead' y stage = 'partial'. Si tu tabla tiene
-- un CHECK que solo permite otros valores, el INSERT revienta (código 23514).

SELECT
  '2. CONSTRAINTS (CHECK / UNIQUE / FK)' AS revision,
  con.conname                            AS nombre,
  CASE con.contype
    WHEN 'c' THEN 'CHECK'
    WHEN 'u' THEN 'UNIQUE'
    WHEN 'f' THEN 'FOREIGN KEY'
    WHEN 'p' THEN 'PRIMARY KEY'
    ELSE con.contype::text
  END                                    AS tipo,
  pg_get_constraintdef(con.oid)          AS definicion
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace ns ON ns.oid = rel.relnamespace
WHERE ns.nspname = 'public' AND rel.relname = 'leads'
ORDER BY con.contype;
-- REVISA: que ningún CHECK sobre "status" excluya 'lead',
--         ni ningún CHECK sobre "stage" excluya 'partial'.


-- ─── 3 · ¿La columna id genera su propio valor? ──────────────────────────
-- Si id es uuid o bigint SIN default y sin identity, ningún INSERT funciona.

SELECT
  '3. COLUMNA ID' AS revision,
  column_name     AS columna,
  data_type       AS tipo,
  is_identity     AS es_identity,
  column_default  AS valor_por_defecto
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'id';
-- ESPERADO: is_identity = 'YES'  o  valor_por_defecto con nextval(...)
--           o gen_random_uuid(). Si sale NULL y 'NO' → ese es el problema.


-- ─── 4 · Estado de RLS ───────────────────────────────────────────────────
-- La service role key IGNORA RLS. Pero si la variable
-- SUPABASE_SERVICE_ROLE_KEY de Vercel tiene por error la anon key
-- (o una "publishable key" sb_publishable_...), entonces sí aplica RLS
-- y el INSERT se bloquea con el código 42501.
--
-- Ojo: en ese escenario /api/health igual sale verde, porque un SELECT
-- bloqueado por RLS devuelve una lista vacía, no un error.

SELECT
  '4. RLS EN LEADS'  AS revision,
  relrowsecurity     AS rls_activado,
  relforcerowsecurity AS rls_forzado
FROM pg_class
WHERE oid = 'public.leads'::regclass;

SELECT
  '4b. POLÍTICAS DE LEADS' AS revision,
  policyname               AS politica,
  cmd                      AS operacion,
  roles::text              AS roles,
  qual                     AS using_expr,
  with_check               AS with_check_expr
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'leads';


-- ─── 5 · Índices únicos sobre phone ──────────────────────────────────────
-- Si existe un índice único sobre phone, el flujo de "duplicado" se activa
-- y el mensaje sería otro — pero conviene verlo para descartar.

SELECT
  '5. ÍNDICES' AS revision,
  indexname    AS indice,
  indexdef     AS definicion
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'leads';


-- ════════════════════════════════════════════════════════════════════════
--   PRUEBA FINAL — reproduce el INSERT exacto del servidor
--
--   Esto inserta una fila igual a la que manda el backend y la borra
--   enseguida (ROLLBACK, no queda nada en la tabla). Si falla, el mensaje
--   de error que salga en rojo ES la causa del formulario roto.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO public.leads (
  name, phone, email, description, reference_img_url, status, stage,
  consent, consent_at, update_token, source,
  utm_source, utm_medium, utm_campaign, created_at
) VALUES (
  'PRUEBA DIAGNOSTICO', '3000000000', NULL, NULL, NULL, 'lead', 'partial',
  true, now(), 'token-de-prueba-diagnostico', 'diagnostico',
  NULL, NULL, NULL, now()
);

ROLLBACK;
-- Si llegaste hasta aquí sin error rojo: el INSERT en sí funciona, y el
-- problema está en la key de Vercel (RLS) → revisa el punto 4.
