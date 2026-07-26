# Auditoría 02 · Seguridad

Alcance: código y configuración. Sin pruebas contra el sitio en vivo.
Fecha: 2026-07-25 · Solo reporte. Nada arreglado.
Fixes propuestos en modo ponytail: lo más simple que funciona, sin librerías nuevas.

Ninguna clave real aparece aquí. `<REDACTADO>` en todos los casos.

---

## CRÍTICO

### C1 · `forceCreate` entrega el lead de otra persona con solo saber su teléfono

**Dónde:** `server.js:547-560`

**Qué se rompe:** si el teléfono ya existe, el servidor busca el lead de esa persona, **le reescribe el `update_token`** y devuelve al llamante `leadId` + token nuevo, más `name` y `email` sobreescritos con lo que mandó el atacante.

```js
const { data: existing } = await supabaseAdmin.from('leads')
  .select('id').eq('phone', phone).order('created_at',{ascending:false}).limit(1).single();
await supabaseAdmin.from('leads')
  .update({ update_token: newToken, name, email: email || null }).eq('id', existing.id);
return res.status(200).json({ ok: true, leadId: existing.id, token: newToken });
```

**Cómo se explota:**
1. `POST /api/lead/start` con el teléfono de la víctima → responde `{duplicate:true}`.
2. Repetir con `forceCreate:true` → responde `leadId` + `update_token` válidos del lead ajeno.
3. `POST /api/lead/complete` con esos dos valores → sobreescribe `description`, `size`, `estimated_*` y `reference_img_url` de la víctima.

El nombre y el email de la víctima ya quedaron pisados en el paso 2. reCAPTCHA v3 es puntaje, no reto: un navegador real lo pasa.

Contradice directamente `SEGURIDAD-INSTRUCCIONES.md:8-9` ("Nadie puede sobrescribir el lead de otro").

**Precondición:** que exista un índice UNIQUE sobre `phone` (es lo que dispara el 23505). `migrations/` no lo crea; verificar en la base.

**Fix mínimo:** borrar la rama `forceCreate` entera (14 líneas). Un segundo lead con el mismo teléfono es una fila nueva, no una toma de control de la vieja. Si de verdad hace falta permitir recotizar, que el INSERT duplicado simplemente se inserte — quitar el UNIQUE sobre `phone`, que es la restricción que fuerza todo este rodeo.

---

### C2 · `migrations/` nunca gestiona RLS sobre `leads`

**Dónde:** `migrations/EJECUTAR-ESTE-EN-SUPABASE.sql` (ausencia), `public/supabase.js:90-125`

**Qué se rompe:** la migración activa RLS y crea política **solo para `gallery_images`** (líneas 87-95). Sobre `leads` — nombre, teléfono, email, descripción, imagen de referencia de cada persona — no hay `ENABLE ROW LEVEL SECURITY` ni una sola `CREATE POLICY` en todo `migrations/`.

Y el panel admin **no lee los leads por el backend**: los lee desde el navegador con la anon key.

```js
// public/supabase.js:90
export async function getLeads() {
  const supabase = await getSupabase();
  const { data, error } = await supabase.from('leads').select('*')...
```

Así que el único control de acceso a la base de datos personales es una política que el repo no define, no versiona y no verifica.

**Cómo se explota:** si RLS está apagada sobre `leads` (el estado por defecto de una tabla creada a mano en Supabase), cualquiera con la anon key hace `GET /rest/v1/leads?select=*` contra el proyecto y se lleva la base completa. La anon key es pública por diseño: sale en `/api/config` y además está en el historial de git (ver M7).

`DIAGNOSTICO-LEADS.sql:89-104` existe precisamente para preguntarle a la base si RLS está activa — el propio repo no lo sabe.

**Fix mínimo:** que la migración lo declare, no que lo pregunte. Tres líneas al lado de las de `gallery_images`:

```sql
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
-- sin política = nadie lee ni escribe con anon/authenticated.
-- El servidor usa service role, que ignora RLS: /api/lead/* sigue funcionando.
```

Eso rompe `getLeads()`/`getStats()`/`updateLeadStatus()` del admin, que es lo correcto: deben pasar por `/api/admin/*` con `requireAdmin`, igual que ya hace la galería. Es el patrón que el repo **ya tiene implementado** para `gallery_images` — copiarlo, no inventar nada.

---

## ALTO

### A1 · `/api/health/insert` escribe en la tabla de producción sin autenticación

**Dónde:** `server.js:257-261`

```js
const debugKey = (process.env.HEALTH_DEBUG_KEY || '').trim();
if (debugKey && String(req.query.key || '') !== debugKey) { ...403... }
```

El guard es **opt-in**: si `HEALTH_DEBUG_KEY` no está puesta (no está en `.env.example`, así que por defecto no lo está), la condición es falsa y no se comprueba nada.

**Cómo se explota:** `GET /api/health/insert` desde cualquier IP inserta una fila real en `leads` y devuelve el error crudo de Postgres si algo falla. 200 peticiones cada 15 min por IP. Si el `DELETE` de limpieza falla (línea 320), las filas se quedan: contaminación del CRM del cliente.

**Fix mínimo:** invertir el guard — sin clave configurada, el endpoint no existe.

```js
if (!debugKey || String(req.query.key || '') !== debugKey) return res.status(404).end();
```

Mejor aún: borrarlo (ver auditoría 01, ya no hay bug que perseguir).

---

### A2 · CSP, HSTS y X-Frame-Options no existen en producción

**Dónde:** `server.js:118-149` vs `vercel.json:4-7`

**Qué se rompe:** Helmet está montado en Express. Pero en Vercel, `vercel.json` solo reescribe `/api/(.*)` y `/cotizar` hacia la función. **Todo lo demás — `/`, `/admin`, `/privacidad`, `/cuidados`, `style.css`, `script.js` — lo sirve el CDN estático, que nunca pasa por Express.**

Resultado: las páginas HTML se entregan sin CSP, sin HSTS, sin Permissions-Policy y sin `X-Frame-Options`. El bloque `headers` de `vercel.json:11-23` solo pone `Cache-Control` y `X-Robots-Tag`.

`SEGURIDAD-INSTRUCCIONES.md:16` afirma que están activos. En producción es falso.

**Cómo se explota:** `/admin` es embebible en un iframe → clickjacking sobre el panel (cambiar estado de leads, borrar piezas de galería). Sin HSTS, la primera visita por HTTP es interceptable. Sin CSP, cualquier XSS ejecuta sin fricción.

**Fix mínimo:** los headers van donde se sirve el archivo. Añadir a `vercel.json`, sin tocar código:

```json
{
  "source": "/(.*)",
  "headers": [
    { "key": "Content-Security-Policy", "value": "<misma cadena que Helmet>" },
    { "key": "Strict-Transport-Security", "value": "max-age=31536000; includeSubDomains; preload" },
    { "key": "X-Frame-Options", "value": "DENY" },
    { "key": "X-Content-Type-Options", "value": "nosniff" },
    { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
  ]
}
```

Feature nativa de la plataforma, cero dependencias, cero líneas de JS.

---

### A3 · `ADMIN_EMAILS` vacío = cualquier usuario de Supabase es administrador

**Dónde:** `server.js:40-43`, `server.js:683-685`

```js
if (ADMIN_EMAILS.length && !ADMIN_EMAILS.includes(email)) { ...403... }
```

Lista vacía → el `if` no entra → **todo usuario autenticado pasa**. `.env.example:36` lo deja en blanco.

**Cómo se explota:** si el proyecto Supabase tiene el registro por email habilitado (es el default), cualquiera se registra, obtiene un JWT `authenticated` y administra la galería. Con C2 encima, también lee los leads.

**Fix mínimo:** fallar cerrado. Un carácter de diferencia:

```js
if (!ADMIN_EMAILS.includes(email)) { ...403... }
```

Lista vacía = nadie entra, en lugar de todos.

---

### A4 · La política RLS de `gallery_images` puentea el control de admin del servidor

**Dónde:** `migrations/EJECUTAR-ESTE-EN-SUPABASE.sql:90-95`

```sql
CREATE POLICY "gallery admin manage" ON public.gallery_images
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

**Qué se rompe:** el servidor valida cuidadosamente el JWT y `ADMIN_EMAILS` en `requireAdmin` (`server.js:665-693`). Esta política deja que **cualquier usuario autenticado escriba la tabla directamente vía PostgREST**, saltándose el backend por completo. El comentario de la línea 85-86 dice "Nadie escribe la galería desde el navegador" — la política de abajo dice lo contrario.

**Cómo se explota:** JWT de cualquier cuenta + `POST /rest/v1/gallery_images` con la anon key → inserta o borra piezas del portafolio sin pasar por `ADMIN_EMAILS`.

**Fix mínimo:** borrar la política. Sin política, RLS bloquea a `anon` y `authenticated`, y la service role del backend sigue ignorando RLS. La lectura pública ya la sirve `/api/gallery`, no el navegador.

---

### A5 · Tipo y tamaño de imagen se validan solo en el cliente

**Dónde:** `script.js:714-739`, `admin/index.html:746`, `public/supabase.js:41-53`

**Qué se rompe:** los chequeos de `ALLOWED_TYPES` y `MAX_FILE_BYTES` están en JavaScript del navegador. Después el archivo va **directo del navegador a Supabase Storage** con la anon key. El servidor nunca ve el archivo, así que no puede validar nada.

**Cómo se explota:** saltarse la página y hablar con Storage directamente: `POST /storage/v1/object/reference-images/x.jpg` con la anon key y cualquier contenido, cualquier tamaño. Subida arbitraria sin autenticar a un bucket público = alojamiento gratis de lo que sea, bajo el dominio del cliente.

**Fix mínimo:** el límite va donde está el archivo, no donde está el formulario. En Supabase → Storage → bucket → `file_size_limit = 10MB` y `allowed_mime_types = image/jpeg,image/png,image/webp`. Configuración de la plataforma, cero código. Los chequeos del cliente se quedan como UX, no como control.

---

### A6 · Buckets públicos con datos personales, y sin política en `migrations/`

**Dónde:** `migrations/…:145-147`, `public/supabase.js:51, 67, 71-81`

- `gallery` se crea con `public = true`. Correcto, es el portafolio.
- `reference-images` **no se crea ni se politiza en ninguna migración**, y el código usa `getPublicUrl()` sobre él → es público. Contiene las fotos que suben los clientes: partes del cuerpo, tatuajes previos.
- `signed-documents` tampoco aparece en `migrations/`. Recibe `uploadDocument()`: **fotos de cédulas y documentos de acudientes de menores de edad** (`admin/index.html:521-538`).

Los nombres de archivo son `${Date.now()}-${Math.random().toString(36).slice(2,6)}` — no adivinables a la ligera, pero la URL queda guardada en `leads.reference_img_url` y ese campo se lee con la anon key (ver C2).

**Cómo se explota:** si `signed-documents` es público, una URL filtrada expone documentos de identidad de menores. Sin las políticas versionadas, nadie sabe en qué estado está.

**Fix mínimo:** `reference-images` y `signed-documents` privados; servirlos con URLs firmadas de vida corta (`createSignedUrl`, ya viene en el SDK que está instalado). Y declarar los tres buckets con sus políticas en la migración, junto a los de `gallery` que ya están.

---

## MEDIO

### M1 · `/api/health` sin autenticación filtra el mapa de la infraestructura

**Dónde:** `server.js:198-245`

Devuelve públicamente: qué proveedores están configurados (Supabase, reCAPTCHA, Meta Pixel, WhatsApp), el **formato y el rol declarado por la service role key** (`describeServiceKey`, línea 241), los nombres de tabla `leads` y `gallery_images`, los nombres de columna consultados en la línea 219, el nombre exacto del archivo de migración, y **mensajes de error crudos de Postgres**.

**Fix mínimo:** el mismo guard que debería tener `/api/health/insert` (A1). Sin `HEALTH_DEBUG_KEY` válida, 404.

### M2 · Enumeración de teléfonos

**Dónde:** `server.js:544-546`

`{duplicate: true}` responde si un número está o no en la base de clientes. Oráculo de datos personales; 10 intentos por hora e IP lo frena, no lo cierra.

**Fix mínimo:** desaparece solo al borrar la rama `forceCreate` de C1 — sin `forceCreate` que alimentar, el duplicado no necesita anunciarse: responder `{ok:true}` igual que un alta normal.

### M3 · CSP con `'unsafe-inline'` en `script-src`

**Dónde:** `server.js:134-136`

`'unsafe-inline'` en `script-src` y `script-src-elem`, más `script-src-attr: ['unsafe-inline']`, más los hosts `cdn.tailwindcss.com`, `cdnjs.cloudflare.com`, `cdn.jsdelivr.net`. Con eso la CSP no detiene un XSS. (Hoy es teórico: ver A2, no llega a aplicarse.)

**Fix mínimo:** los tres inline que la obligan son el bootstrap del Pixel y los `fetch('/api/config')` de las dos páginas legales. Sacarlos a `.js` externos (ya propuesto en la auditoría 01 por duplicación) y quitar `'unsafe-inline'`. Un cambio arregla las dos cosas.

### M4 · XSS residual en el panel admin

**Dónde:** `admin/index.html:458`

```js
<span class="px-2 py-1 ... stage-${stage}">${stageLabel}</span>
```

`stage` sale de la base sin pasar por `escapeHtml`, dentro de un atributo `class`. Todas las demás interpolaciones del archivo sí están escapadas. Un valor como `x" onmouseover="…` inyecta un handler.

Hoy el servidor solo escribe `partial`/`complete`. Deja de ser teórico si alguien puede escribir la tabla directo — que es exactamente C2.

**Fix mínimo:** `stage-${escapeHtml(stage)}`, o mejor `stage === 'partial' ? 'stage-partial' : 'stage-complete'`.

### M5 · CORS acepta cualquier `localhost` en producción

**Dónde:** `server.js:69-73`

```js
const isLocalOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
if (!origin || isLocalOrigin || allowedOrigins.includes(origin)) return callback(null, true);
```

Una página servida desde el localhost del atacante puede leer respuestas de la API de producción. Impacto acotado porque `credentials: false` y la auth es Bearer, no cookie.

**Fix mínimo:** condicionar a `process.env.NODE_ENV !== 'production'`. Los orígenes locales legítimos ya están en el default de `ALLOWED_ORIGINS` (línea 70).

### M6 · `reference_img_url` acepta cualquier URL

**Dónde:** `server.js:602`

Único filtro: `/^https?:\/\//i`, 600 caracteres. Se guarda en la fila del lead una URL arbitraria elegida por el cliente. No se renderiza en el admin hoy, así que no es XSS ni SSRF — pero es un campo controlado por el atacante guardado como dato de negocio.

**Fix mínimo:** exigir que sea del propio Storage. Una línea:

```js
if (!referenceImgUrl.startsWith(`${SUPABASE_URL}/storage/v1/object/public/reference-images/`)) referenceImgUrl = '';
```

### M7 · Anon key y ref del proyecto en el historial de git

**Dónde:** commit `a6c771e` (`public/supabase.js`), retirada en `8e43673`

En el historial quedan en claro:
- URL del proyecto: `https://<REDACTADO>.supabase.co`
- Anon key (JWT, `role=anon`, `exp` en 2036 → **sigue viva**)

Escaneado el historial completo (104 commits, todos los blobs): **no hay service role key, ni el secret de reCAPTCHA, ni `.env` commiteado en ningún momento.** El commit `a6c771e` también dejó credenciales de EmailJS (`ServiceId`, `TemplateId`, `PublicKey`) en un `index.html` viejo — todas públicas por diseño y el proveedor ya no se usa.

La anon key es pública por diseño y hoy se sirve en `/api/config`, así que exponerla no es el problema: **el problema es que su valor depende por completo de que RLS esté bien puesta** (C2). Con RLS correcta, filtrarla no importa. Sin RLS, es la base de datos entera.

**Fix mínimo:** arreglar C2 primero. Reescribir el historial (`filter-repo`) no aporta nada mientras la key siga siendo la que se sirve hoy en `/api/config`. Rotarla si se decide que sí importa — pero el orden es RLS, luego rotación.

### M8 · Dependencias con vulnerabilidades conocidas

`npm audit --omit=dev`: **6 vulnerabilidades (1 alta, 5 moderadas)**.

| paquete | versión | aviso | severidad |
|---|---|---|---|
| `form-data` | 4.0.5 | GHSA-hmw2-7cc7-3qxx — inyección CRLF en nombres de campo multipart | ALTA |
| `body-parser` | 1.20.4 | GHSA-v422-hmwv-36x6 — DoS, un `limit` inválido desactiva el control de tamaño | moderada |
| `qs` | vía express | GHSA-q8mj-m7cp-5q26 — DoS remoto en `qs.stringify` | moderada |
| `ip-address` | vía express-rate-limit | GHSA-v2v4-37r5-5v8g — XSS en métodos HTML de Address6 | moderada |
| `multer` | 1.4.5-lts.2 | rama 1.x sin soporte | — |

`form-data` y `multer` **no se usan en ninguna parte del código** (auditoría 01). `SEGURIDAD-INSTRUCCIONES.md:36-37` afirma que ya fueron eliminados; siguen en `package.json:12,15`.

**Fix mínimo:** borrar las dos líneas de `package.json` → se va la vulnerabilidad ALTA sin tocar código. Luego `npm audit fix` para el resto (son bumps de rango, no majors).

---

## BAJO

| # | dónde | qué | fix mínimo |
|---|---|---|---|
| B1 | `server.js:372` | `/api/keepalive` sin autenticación. Lo llama el cron de Vercel; lo puede llamar cualquiera. Impacto: un SELECT. | Comprobar `req.headers.authorization === 'Bearer ' + process.env.CRON_SECRET`, que es el mecanismo que Vercel ya provee. |
| B2 | `server.js:622` | `update_token` comparado con `.eq()` en Postgres, no en tiempo constante. Sobre HTTP y un índice de base de datos no es explotable en la práctica. | Ninguno. Anotado para descartarlo. |
| B3 | `admin/index.html:386-395` | "Borrar" un lead solo escribe en `localStorage`. El dato sigue en la base y reaparece en otro equipo. Riesgo de cumplimiento: no hay forma real de atender una solicitud de supresión (Ley 1581). | Columna `deleted_at` en `leads`. Ya está anotado en `SEGURIDAD-INSTRUCCIONES.md:43-45`. |
| B4 | `SEGURIDAD-INSTRUCCIONES.md` | Documento desactualizado en dos puntos verificables: la línea 16 afirma CSP/HSTS activos (falso en producción, A2) y las líneas 36-37 dan por eliminadas dos dependencias que siguen en `package.json` (M8). Un documento de seguridad que miente es peor que no tenerlo. | Corregir ambas al cerrar A2 y M8. |
| B5 | `.agent.md`, `python` (raíz) | Basura en el repo. `.agent.md` define un agente con permisos de escritura de archivos; `python` es un archivo de 7 bytes. Sin impacto directo. | Borrar. |

---

## Lo que está bien

Vale registrarlo para no tocarlo:

- **Sin inyección SQL.** Todo pasa por supabase-js/PostgREST con `.eq()` parametrizado. La migración usa `format('%I')` sobre un array literal (`…:48`), no sobre entrada de usuario.
- **reCAPTCHA falla cerrado.** Sin secret configurado, `verifyRecaptcha` devuelve `{ok:false}` (`server.js:408-411`), no lo contrario. Con timeout de 5 s y `AbortController`.
- **El precio se recalcula en el servidor** (`server.js:606`). El navegador no puede inyectar un valor.
- **La service role key no sale del servidor.** Verificado campo por campo en `/api/config` (`server.js:179-193`): no está.
- **El JWT del admin se verifica server-side** con `auth.getUser()` (`server.js:677`), no se confía en el payload sin validar.
- **`.env.example` está limpio**: ningún valor real, y `.env` nunca fue commiteado en los 104 commits del historial.
- **`escapeHtml` cubre casi todo el render del admin** — la única excepción es M4.

---

## Acciones por urgencia

| # | acción | severidad | esfuerzo |
|---|---|---|---|
| 1 | Verificar en Supabase si RLS está activa sobre `leads`. Es la respuesta a "¿está expuesta la base de datos personales?" y condiciona todo lo demás. | C2 | 2 min |
| 2 | Borrar la rama `forceCreate` de `server.js:547-560`. | C1 | 5 min |
| 3 | `ENABLE ROW LEVEL SECURITY` sobre `leads`, sin política; mover `getLeads`/`getStats`/`updateLeadStatus` a `/api/admin/*` copiando el patrón que ya existe para la galería. | C2 | 1-2 h |
| 4 | Invertir el guard de `/api/health/insert` (o borrar el endpoint). | A1 | 2 min |
| 5 | Cambiar `if (ADMIN_EMAILS.length && !…)` por `if (!ADMIN_EMAILS.includes(email))` y rellenar `ADMIN_EMAILS` en Vercel. | A3 | 5 min |
| 6 | Quitar `form-data` y `multer` de `package.json`; `npm audit fix` para el resto. | M8 | 5 min |
| 7 | Headers de seguridad en `vercel.json` (CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy). | A2 | 20 min |
| 8 | Borrar la política `gallery admin manage`. | A4 | 2 min |
| 9 | `file_size_limit` y `allowed_mime_types` en los buckets de Supabase. | A5 | 10 min |
| 10 | `reference-images` y `signed-documents` a privados + URLs firmadas; declarar los buckets y sus políticas en la migración. | A6 | 2-3 h |
| 11 | Guard en `/api/health`. | M1 | 5 min |
| 12 | Escapar `stage` en `admin/index.html:458`. | M4 | 1 min |
| 13 | Restringir el bypass de CORS de localhost a no-producción. | M5 | 5 min |
| 14 | Validar que `reference_img_url` apunte al propio Storage. | M6 | 5 min |
| 15 | Sacar los scripts inline a archivos y quitar `'unsafe-inline'` de la CSP. | M3 | 1 h |
| 16 | `CRON_SECRET` en `/api/keepalive`; `deleted_at` real para leads; corregir `SEGURIDAD-INSTRUCCIONES.md`; borrar `.agent.md` y `python`. | B1-B5 | 1 h |

Del 1 al 6: media hora larga en total, y cubre los dos CRÍTICO y dos de los ALTO.

---

## Nota sobre las skills

`ponytail-audit` **sí existe en este repositorio**, en la rama sin mergear `claude/install-skills-repo-b7t6kk` (commit `5d5395c`, junto con `ponytail`, `ponytail-review`, `ponytail-debt`, `ponytail-gain` y 24 skills de SEO). No carga desde `main` porque nunca se mergeó. La auditoría 01 se hizo a mano por eso. Conviene mergear esa rama.

---

# RESUELTO EL 2026-07-26

Correcciones aplicadas en el orden de la tabla "Acciones por urgencia".
Verificado: `npm audit --omit=dev` → **0 vulnerabilidades**; `npm test` → CSP
idéntica en `server.js` y `vercel.json`, sin `unsafe-inline` en `script-src`, y
`reference_img_url` acotada al propio Storage.

Nada de lo de abajo inventa claves ni valores: donde hace falta un secreto hay
un placeholder y una nota de qué configurar a mano.

## Estado por hallazgo

| # | hallazgo | estado | dónde |
|---|---|---|---|
| C1 | `forceCreate` entrega el lead de otra persona | **cerrado** | rama borrada de `server.js`; el cliente ya no la llama; la migración quita el UNIQUE sobre `phone` que la forzaba |
| C2 | RLS sobre `leads` | **cerrado en código · pendiente-manual verificar** | `ENABLE ROW LEVEL SECURITY` sin políticas en la migración; `getLeads`/`getStats`/`updateLeadStatus` movidos a `/api/admin/*` |
| A1 | `/api/health/insert` sin autenticación | **cerrado** | endpoint y `describeServiceKey()` eliminados |
| A2 | CSP/HSTS/X-Frame-Options ausentes en producción | **cerrado** | bloque `headers` en `vercel.json` sobre `/(.*)` |
| A3 | `ADMIN_EMAILS` vacío = todos admin | **cerrado en código · pendiente-manual rellenar** | guard invertido a fallo cerrado |
| A4 | política `gallery admin manage` | **cerrado** | `DROP POLICY`, sin reemplazo |
| A5 | tipo y tamaño validados solo en cliente | **pendiente-manual** | documentado en la migración y en `SEGURIDAD-INSTRUCCIONES.md`; requiere el dashboard |
| A6 | buckets públicos con datos personales | **cerrado en código · pendiente-manual verificar** | buckets declarados privados + URLs firmadas de 1 h |
| M1 | `/api/health` sin autenticación | **cerrado** | 404 sin `HEALTH_DEBUG_KEY` |
| M2 | enumeración de teléfonos | **cerrado** | el duplicado responde `{ok:true}` como un alta normal |
| M3 | `'unsafe-inline'` en `script-src` | **cerrado** | scripts inline extraídos; directiva eliminada |
| M4 | XSS residual en el panel admin | **cerrado** | la clase sale de una lista cerrada |
| M5 | CORS acepta cualquier `localhost` | **cerrado** | solo si `NODE_ENV !== 'production'` |
| M6 | `reference_img_url` acepta cualquier URL | **cerrado** | debe empezar por el prefijo del propio Storage |
| M7 | anon key en el historial de git | **mitigado** | depende de C2, que ya está puesto. Rotarla es decisión del dueño |
| M8 | dependencias vulnerables | **cerrado** | `form-data` y `multer` fuera; `npm audit fix` para el resto |
| B1 | `/api/keepalive` sin autenticación | **cerrado en código · pendiente-manual rellenar** | exige `Bearer $CRON_SECRET` |
| B2 | `update_token` sin comparación en tiempo constante | **sin acción** | la propia auditoría lo descarta |
| B3 | "borrar" un lead solo escribe en `localStorage` | **cerrado** | columna `deleted_at` + `DELETE /api/admin/leads/:id` |
| B4 | `SEGURIDAD-INSTRUCCIONES.md` desactualizado | **cerrado** | reescrito contra el código real |
| B5 | `.agent.md` y `python` en la raíz | **cerrado** | borrados |

## Pendiente-manual: lo que tiene que hacer el dueño

El código no puede tocar el dashboard de Supabase ni las variables de Vercel.
Hasta que esto esté hecho, cuatro de los arreglos de arriba no protegen nada:

1. **Variables en Vercel** → Project Settings → Environment Variables:
   - `ADMIN_EMAILS` — **obligatoria**. Sin ella nadie puede entrar al panel
     (falla cerrado, a propósito). Formato: `correo@dominio.com,otro@dominio.com`.
   - `CRON_SECRET` — **obligatoria** para que el keepalive siga funcionando.
     Genera un valor al azar (`openssl rand -hex 32`); Vercel lo manda solo en
     sus crons cuando la variable existe.
   - `HEALTH_DEBUG_KEY` — opcional. Sin ella `/api/health` responde 404.
2. **Correr `migrations/EJECUTAR-ESTE-EN-SUPABASE.sql`** en el SQL Editor y
   mirar la tabla de resultados. Tiene que decir:
   `rls_activa_en_leads = true`, `politicas_en_leads = 0`,
   `politicas_en_galeria = 0`, `buckets_privados_mal = 0`.
   Eso responde la acción #1 de la tabla de urgencia — la pregunta que el repo
   no sabía contestar.
3. **Límites de Storage** → Supabase → Storage → cada bucket → Settings:
   `file_size_limit = 10MB` y
   `allowed_mime_types = image/jpeg, image/png, image/webp`.
   El archivo va del navegador a Storage sin pasar por el servidor: este es el
   único sitio donde el límite es real.
4. **Opcional**: rotar la anon key. Con RLS bien puesta no da acceso a nada, así
   que el orden correcto es verificar el punto 2 primero.

## Decisiones que conviene conocer

- **La migración quita el UNIQUE sobre `phone`.** Era la restricción que
  obligaba al servidor a "reutilizar" el lead existente, y de ahí salía C1.
  Sin ella, una recotización es simplemente una fila nueva y el duplicado deja
  de ser un oráculo (M2). Si el UNIQUE volviera a aparecer, el servidor
  responde `{ok:true}` sin `leadId` y deja un aviso en los logs.
- **La CSP está duplicada a propósito** en `server.js` y `vercel.json`: el CDN
  sirve el estático sin pasar por Express. `npm test` falla si se separan.
- **`script-src-attr` pasó a `'none'`** y `frame-ancestors` a `'none'`: no hay
  ni un manejador `on*` inline en `public/`, y concuerda con
  `X-Frame-Options: DENY`.
- **El panel admin salió a `public/admin/admin.js`.** Su `<script type="module">`
  inline habría quedado bloqueado al quitar `'unsafe-inline'`.
- **No se tocó** lo que la auditoría marca como correcto: verificación
  server-side del JWT con `auth.getUser()`, recálculo del precio en el
  servidor, fail-closed de reCAPTCHA y manejo de la service role key.
