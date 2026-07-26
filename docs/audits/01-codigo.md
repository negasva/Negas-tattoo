# Auditoría 01 · Código

Alcance: `server.js`, `api/`, `public/`, `migrations/`, `package.json`, `vercel.json`.
Fecha: 2026-07-25 · Solo reporte. Nada arreglado.

Nota: la skill `ponytail-audit` no existe en este repo ni en la cuenta. Auditoría manual con el alcance pedido.

---

## Hallazgos

Ordenado por líneas borradas.

| archivo:línea | qué sobra | qué lo reemplaza | líneas | riesgo |
|---|---|---|---|---|
| `migrations/DIAGNOSTICO-LEADS.sql:1-141` | Script de diagnóstico de un bug puntual ("No pudimos guardar tus datos"). No lo llama nada. Duplica lo que ya hace `/api/health/insert`. | Borrar. Está en el historial de git si vuelve el bug. | 141 | REVISAR |
| `server.js:247-330` | Endpoint `/api/health/insert`. Diagnóstico de un bug ya cazado: inserta fila de prueba, la borra, traduce 8 códigos de Postgres. | Borrar. `/api/health` + Runtime Logs de Vercel. | 84 | REVISAR |
| `script.js:176-234` + `script.js:119-141` | Máquina de deep links: `isMobileDevice`, `getInstagramUsername`, `openAppOrFallback` (timer + `visibilitychange`), `bindDeepLinkAnchors`, y el cableado de `dataset.appHref/webHref`. | `https://wa.me/…` y `https://instagram.com/…` ya abren la app nativa en iOS y Android desde 2019. `<a href>` plano. | 65 | RIESGOSO |
| `server.js:336-364` | `describeServiceKey()`: parsea a mano el payload del JWT para adivinar el rol. Solo lo consumen los dos endpoints de diagnóstico. | Cae solo al borrar `/api/health/insert`. Deja el chequeo booleano de `/api/health`. | 33 | REVISAR |
| `public/supabase.js:41-81` | `uploadReferenceImage`, `uploadGalleryImage`, `uploadDocument`: tres funciones idénticas salvo el nombre del bucket. | Una `upload(bucket, file, name?)`. | 29 | SEGURO |
| `server.js:644-659, 724-738, 746-759, 770-785, 788-800, 608-636` | Mismo `try { … if (error) throw error } catch (e) { console.error(…); res.status(500).json({ok:false, error:'…'}) }` seis veces. | Un `asyncRoute(fn)` que envuelve el handler + error handler de Express. | 25 | SEGURO |
| `script.js:258-279` | `GALLERY_FALLBACK`: las 20 URLs de ibb.co hardcodeadas. Ya están en `migrations/EJECUTAR-ESTE-EN-SUPABASE.sql:108-127` y en la tabla `gallery_images`. | Tercera copia de la misma lista. Si la API falla, `galEmpty` ya existe. | 22 | REVISAR |
| `privacidad.html:12-22`, `cuidados.html:15-25`, `index.html:23-32` | Bootstrap del Meta Pixel copiado literal en 3 archivos. | `public/pixel.js` + `<script src>`. | 19 | SEGURO |
| `privacidad.html` (tail ~21), `cuidados.html` (tail ~21) | Bloque `fetch('/api/config')` → cablear `a.js-wa` + init del pixel. Idéntico en ambas páginas. | `public/page-config.js` compartido. | 21 | SEGURO |
| `server.js:89-115` | Tres `rateLimit({…})` con los mismos 4 campos, cambia el `limit` y el `windowMs`. | `const limiter = (limit, windowMs, message) => rateLimit({…})`. | 17 | SEGURO |
| `server.js:262-264, 374-378, 487-489, 582-584, 640-642, 666-668` | `if (!supabaseAdmin) return res.status(500)…` copiado seis veces. | Un middleware `requireSupabase` en la cadena de esas rutas. | 16 | SEGURO |
| `server.js:154-173` | `app.get('/')`, `/cotizar`, `/admin`, `/privacidad`, `/cuidados` con `sendFile`. `vercel.json:6` ya reescribe `/cotizar → /index.html`, y `express.static` sirve el resto. | `express.static` sin `index:false`; borrar `/cotizar` (muerta en prod). | 12 | REVISAR |
| `public/supabase.js:103-125` | `getStats()`: cuatro `select('id')` que bajan **todas** las filas al navegador para hacer `.length`. Crece linealmente con los leads. | `select('id', { count: 'exact', head: true })` — cuenta en Postgres, transfiere 0 filas. | 11 | SEGURO |
| `script.js:927-949` | Tres caminos redundantes para revelar `.reveal-item`: rama `else` sin GSAP, `revealEverything()`, y el barrido a los 3 s. El tercero ya cubre a los otros dos. | Dejar solo el `setTimeout`. | 10 | SEGURO |
| `server.js:58-59` + `admin/index.html:636-642` | `GALLERY_CATEGORIES` / `GALLERY_SPANS` definidos en el server y otra vez en el admin. Las mismas categorías salen una tercera vez en `index.html:161-164`. | Servirlos en `/api/config`. | 7 | REVISAR |
| `script.js:245-252` | `shuffle()`: Fisher-Yates escrito a mano para barajar ≤20 fotos. | `arr.map(v => [Math.random(), v]).sort((a,b) => a[0]-b[0]).map(p => p[1])`. | 7 | SEGURO |
| `server.js:47-56` | `PRICING`: 9 tarifas leídas de 9 variables de entorno "para ajustar sin desplegar". Ninguna está puesta en ningún lado — todas caen al default. | Constantes. | 3 | REVISAR |
| `server.js:23-26` | `SUPABASE_KEEPALIVE_TABLES` parseado de env con `split/map/filter`. Nadie lo sobreescribe. | `['leads', 'gallery_images']`. | 3 | SEGURO |
| `script.js:519-530` | `try/catch` alrededor de `new URLSearchParams(location.search)` + `.get()`. Ninguno de los dos lanza. | El `catch` es inalcanzable. | 3 | SEGURO |
| `script.js:400-401` | `window.openLightbox = …` / `window.closeLightbox = …`. No hay ni un `onclick=` en todo `public/`. | Nada. | 2 | SEGURO |
| `index.html:152` | `<a id="portfolio">` invisible. Nada enlaza a `#portfolio` (el enlace real es `#work`). | Nada. | 1 | SEGURO |
| `server.js:16` | `console.log('[DEBUG]', …)` en cada request. El comentario dice "borrar cuando el bug esté resuelto". | Nada. | 1 | SEGURO |
| `server.js:802` | `app.use((_req,res) => res.status(404).send('Not Found'))`. Express ya responde 404 solo. | Nada. | 1 | SEGURO |
| `server.js:81` | `optionsSuccessStatus: 200` — knob para IE11. | Default (204). | 1 | SEGURO |
| `server.js:1` | `require('dotenv').config()`. En Vercel es no-op; en local Node ≥20.6 tiene `--env-file`. | `node --env-file=.env server.js` en el script `start`. | 1 | REVISAR |

---

## Sin líneas, pero mal

| archivo:línea | problema | riesgo |
|---|---|---|
| `server.js:213-224`, `server.js:286-290` | `await` sin `try/catch` dentro de un handler de Express 4. Si Supabase tira (DNS, timeout, socket), la promesa rechaza sin dueño: **la request se cuelga hasta el timeout de Vercel**, sin respuesta ni log útil. Es el único sitio del archivo sin `try/catch`. | RIESGOSO |
| `server.js:69-70` | El allowlist de CORS hace `process.env.ALLOWED_ORIGINS.split(',').map(trim)` **en cada request**, y compila el regex de localhost también en cada request. | SEGURO (subir 2 líneas fuera del closure) |
| `script.js:49, 55, 65, 187, 528` | Cinco `catch (_) {}` vacíos. Tracking y UTM fallan en silencio total — no hay forma de saber si el pixel dejó de disparar. | REVISAR |
| `script.js:616` | Cualquier fallo del paso 1 (red caída, 500, reCAPTCHA) se pinta con `setError('name', …)`: el usuario ve "Servicio no disponible" debajo del campo **Nombre**. | REVISAR |
| `script.js:864` | Mismo patrón: todo error del envío final aterriza en `setError('file', …)`, aunque no haya imagen. | REVISAR |
| `admin/index.html:495-497`, `admin/index.html:788-792` | `catch (err)` que descarta `err` y muestra un texto fijo. Sin `console.error`, el error real se pierde. Contrasta con `:408`, `:574`, `:650` que sí loguean — manejo inconsistente dentro del mismo archivo. | REVISAR |
| `script.js:655-665` vs `server.js:456-473` | `computePriceRange` duplicado cliente/servidor. Es deliberado (feedback en vivo del slider) pero son dos fórmulas que hay que mantener sincronizadas a mano; ya divergen en el manejo del `label`. | REVISAR |
| `script.js:649-651` | `formatCop` reimplementa formato de moneda con `'$' + toLocaleString`. | `Intl.NumberFormat('es-CO', { style:'currency', currency:'COP', maximumFractionDigits:0 })` |
| `admin/index.html:328-330` | `escapeHtml` a mano porque todo el render es `innerHTML` con template strings. El DOM escapa gratis con `textContent`. | REVISAR (implica reescribir el render) |
| `script.js:177-179` | `isMobileDevice()` por sniffing de user-agent. | `matchMedia('(pointer: coarse)')` |
| `index.html:451` (`qm-drop`) | Se llama "drop zone" y tiene `role="button"`, pero no hay handler de `dragover`/`drop` en ningún lado. Solo abre el file picker. | SEGURO (renombrar o implementar) |
| `python` (raíz, 7 bytes) | Archivo con el texto `main.py` dentro. Basura. Fuera del alcance pedido, se reporta igual. | SEGURO |

---

## Totales

**Líneas eliminables: ~534**

| marca | líneas |
|---|---|
| SEGURO | 166 |
| REVISAR | 303 |
| RIESGOSO | 65 |

Sobre ~5.409 líneas auditadas (excluyendo `style.css`, que salió limpio: 0 clases muertas, 0 IDs muertos).

**Dependencias que se pueden quitar**

| paquete | por qué | riesgo |
|---|---|---|
| `multer` | Cero referencias en todo el repo. Las imágenes van del navegador directo a Supabase Storage; el server nunca ve un `multipart/form-data`. | SEGURO |
| `form-data` | Cero referencias. Node trae `FormData` global desde v18 de todas formas. | SEGURO |
| `dotenv` | No-op en Vercel; en local lo cubre `node --env-file=.env`. | REVISAR |
| `cors` | 17 líneas de config (`server.js:67-83`) para un allowlist de 3 orígenes. Un middleware propio de 6 líneas hace lo mismo. | REVISAR |

Quedan en uso reales: `express`, `helmet`, `express-rate-limit`, `@supabase/supabase-js`.

---

## CSS

`public/style.css` (1.993 líneas) se revisó por selectores muertos: **no hay**. La única clase sin uso en el markup es `.grecaptcha-badge`, que la inyecta Google en runtime. Los 10 selectores que aparecen dos veces están dentro de las 16 media queries — legítimo.
