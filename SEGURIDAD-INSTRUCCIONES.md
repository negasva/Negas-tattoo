# Guía de seguridad operativa

Estado tras cerrar la auditoría `docs/audits/02-seguridad.md` (2026-07-26).
Lo que este documento afirma está verificado contra el código; si cambias algo,
cámbialo también aquí. Un documento de seguridad que miente es peor que no
tenerlo.

## Protecciones activas

- **RLS activa sobre `leads` y `gallery_images`, sin ninguna política.** Ni
  `anon` ni `authenticated` leen o escriben esas tablas por PostgREST. La
  service role del backend ignora RLS, así que `/api/lead/*` y `/api/admin/*`
  siguen funcionando. Lo declara `migrations/EJECUTAR-ESTE-EN-SUPABASE.sql`.
- **El navegador ya no lee la base.** Leads, estadísticas y galería del panel
  pasan por `/api/admin/*` con el JWT del admin verificado server-side.
- **`ADMIN_EMAILS` falla cerrado**: si la lista está vacía no entra nadie.
- **reCAPTCHA v3** validado en el backend antes de crear un lead
  (`action: lead_start`). Sin secret configurado rechaza todo.
- **Rate limiting** server-side: `/api/config` y `/api/gallery` (200 / 15 min),
  `/api/lead/start` (10 / hora), `/api/lead/complete` (30 / hora).
- **Token de actualización**: el paso final solo modifica el lead si presenta
  `leadId` + `update_token`. Un teléfono repetido **no** da acceso al lead de
  esa persona: no se le reescribe el token ni se devuelve su id.
- **`reference_img_url` solo acepta URLs del propio Storage**; cualquier otra
  cosa se descarta.
- **Precio recalculado en el servidor**: el navegador no puede inyectar un
  valor falso.
- **La service role key nunca sale del servidor.**
- **Buckets privados** para `reference-images` y `signed-documents`: se sirven
  con URLs firmadas de 1 hora que emite el backend. `gallery` es público a
  propósito, es el portafolio.
- **CSP, HSTS, X-Frame-Options, nosniff y Referrer-Policy** en `vercel.json`,
  que es donde importan: el CDN sirve el HTML y el estático **sin pasar por
  Express**, así que Helmet solo cubría las rutas de API. La misma CSP está en
  los dos sitios y `npm test` verifica que no se separen.
- **CSP sin `'unsafe-inline'` en `script-src`**: no queda ningún script inline
  en `public/`.
- **`/api/keepalive` exige `CRON_SECRET`**; `/api/health` exige
  `HEALTH_DEBUG_KEY` y si no está definida responde 404.
- **CORS**: el comodín de `localhost` solo aplica fuera de producción.
- **Consentimiento de datos** (Ley 1581) registrado con marca de tiempo, y
  borrado lógico real con `deleted_at` para poder atender una supresión.

## Variables sensibles

Nunca deben aparecer en el repositorio ni en el frontend:

- `SUPABASE_SERVICE_ROLE_KEY`
- `RECAPTCHA_SECRET_KEY`
- `CRON_SECRET`
- `HEALTH_DEBUG_KEY`

## Configuración manual obligatoria

Nada de esto se puede hacer desde el código. Sin ello, parte de lo de arriba
no protege realmente:

1. **Variables en Vercel** → Project Settings → Environment Variables:
   - `ADMIN_EMAILS` — sin ella nadie puede administrar.
   - `CRON_SECRET` — sin ella el keepalive devuelve 401 y el proyecto de
     Supabase se puede pausar por inactividad.
   - `HEALTH_DEBUG_KEY` — opcional; solo si quieres poder abrir `/api/health`.
2. **Correr la migración** `migrations/EJECUTAR-ESTE-EN-SUPABASE.sql` en el SQL
   Editor de Supabase y comprobar en la tabla de resultados que
   `rls_activa_en_leads = true`, `politicas_en_leads = 0` y
   `buckets_privados_mal = 0`.
3. **Límites de Storage** → Supabase → Storage → cada bucket → Settings:
   - `file_size_limit = 10MB`
   - `allowed_mime_types = image/jpeg, image/png, image/webp`

   El archivo va directo del navegador a Storage, así que el servidor nunca lo
   ve: los chequeos de tipo y tamaño del cliente son comodidad para el usuario,
   **no** un control de seguridad. El control está aquí.

## Recomendaciones

- Poner el sitio detrás de Cloudflare o un WAF equivalente.
- Desactivar el registro por email en Supabase Auth si no lo usas: con
  `ADMIN_EMAILS` bien puesto ya no basta para administrar, pero es una puerta
  menos.
- Rotar la anon key si te importa que esté en el historial de git. Con RLS
  bien puesta no da acceso a nada, así que el orden correcto es: primero
  verificar RLS, luego rotar si aun así se quiere.
- Revisar periódicamente las respuestas 429 y los errores de proveedores.

## Deuda técnica resuelta

- `multer` y `form-data` fuera de `package.json` (no se usaban en ninguna
  parte). `npm audit --omit=dev`: 0 vulnerabilidades.
- `/api/health/insert` eliminado: escribía en la tabla de producción sin
  autenticación y perseguía un bug ya resuelto.
- Los leads eliminados en el admin ya no viven en el `localStorage` del
  navegador: se escribe `deleted_at` en la base.
- El SDK de Supabase se carga con `import()` dinámico, así un fallo del CDN ya
  no tumba el cotizador completo.
