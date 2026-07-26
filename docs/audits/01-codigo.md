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

---

# RESUELTO EL 2026-07-26

Ejecutado en tres commits, uno por nivel de riesgo, sobre la rama
`claude/audit-01-cleanup-40tv2h`. La auditoría 02 (seguridad) se ejecutó
antes: varios ítems ya no existían y se marcan como tal.

**Neto: −270 líneas** (363 añadidas, 633 borradas sobre 9 archivos).

| archivo | + | − | neto |
|---|---|---|---|
| `migrations/DIAGNOSTICO-LEADS.sql` | 0 | 141 | **−141** |
| `public/script.js` | 69 | 151 | **−82** |
| `server.js` | 239 | 279 | **−40** |
| `public/supabase.js` | 17 | 36 | **−19** |
| `public/admin/admin.js` | 24 | 12 | −12* |
| `public/admin/index.html` | 3 | 11 | **−8** |
| `public/index.html` | 5 | 1 | +4* |
| `package.json` | 1 | 2 | −1 |
| `README.md` | 5 | 0 | +5* |

\* `admin.js` y `index.html` suben en bruto pero bajan en duplicación
(categorías y errores generales); `README.md` documenta `--env-file`.

En `server.js` buena parte del `+239/−279` es re-indentación al quitar los
`try/catch`: el conteo neto (−40) es el real.

## Estado ítem por ítem

### Grupo 1 — SEGURO (commit `4c17971`)

| # | ítem | estado |
|---|---|---|
| 1 | `upload(bucket, file, name?)` en `supabase.js` | ✅ hecho, + `storageUrl()`; 3 callers al día |
| 2 | `asyncRoute` + error handler global | ✅ hecho, en 10 rutas |
| 3 | `limiter(limit, windowMs, message)` | ✅ hecho |
| 4 | middleware `requireSupabase` | ⚠️ parcial — ver nota A |
| 5 | `getStats()` con `count: 'exact'` | ✅ ya resuelto en fase de seguridad |
| 6 | un solo camino para revelar `.reveal-item` | ✅ hecho — ver nota B |
| 7 | `shuffle` en una línea | ✅ hecho |
| 8 | `SUPABASE_KEEPALIVE_TABLES` constante | ✅ hecho |
| 9 | `try/catch` inalcanzable en `readUtm` | ✅ hecho |
| 10 | `window.openLightbox` / `closeLightbox` | ✅ hecho |
| 11 | ancla invisible `#portfolio` | ✅ hecho |
| 12 | `console.log('[DEBUG]')` por request | ✅ hecho |
| 13 | handler 404 manual | ✅ hecho |
| 14 | `optionsSuccessStatus: 200` | ✅ hecho |
| 15 | allowlist de CORS fuera del closure | ✅ hecho |
| 16 | `formatCop` con `Intl.NumberFormat` | ✅ hecho — ver nota C |
| 17 | `#qm-drop` sin drag & drop | ✅ implementado (8 líneas) — ver nota D |

### Grupo 2 — REVISAR (commit `d8c0a5b`)

| # | ítem | estado |
|---|---|---|
| 18 | borrar `DIAGNOSTICO-LEADS.sql` | ✅ hecho |
| 19 | borrar `GALLERY_FALLBACK` | ✅ hecho, queda `#galEmpty` |
| 20 | borrar rutas `sendFile` | ⚠️ parcial — ver nota E |
| 21 | `GALLERY_CATEGORIES/SPANS` por `/api/config` | ⚠️ parcial — ver nota F |
| 22 | `PRICING` a constantes | ✅ hecho, las 9 env vars fuera |
| 23 | quitar `dotenv` | ✅ hecho, `node --env-file=.env` + README |
| 24 | reemplazar `cors` por middleware propio | ❌ evaluado y descartado — ver nota G |
| 25 | `console.warn` en los `catch` vacíos | ✅ hecho (3 vivos; 2 ya no existían) |
| 26 | error general del formulario | ✅ hecho, `data-error-for="form"` |
| 27 | `console.error(err)` en el admin | ✅ hecho (3 sitios, hoy en `admin.js`) |
| 28 | unificar `computePriceRange` | ✅ hecho, `label` incluido |

### Grupo 3 — RIESGOSO (commit `073417a`)

| # | ítem | estado |
|---|---|---|
| 29 | máquina de deep links | ⚠️ hecho salvo `isMobileDevice` — ver nota H |

### Ya resueltos en la fase de seguridad (auditoría 02)

`/api/health/insert`, `describeServiceKey()`, `getStats()` bajando todas las
filas, `multer`, `form-data`, los scripts inline del pixel en
`privacidad.html` y `cuidados.html` (hoy `public/pixel.js` +
`public/page-config.js`), `.agent.md` y el archivo `python` de la raíz.

## Notas

**A · `requireSupabase`.** Aplicado en `/api/lead/start`, `/api/lead/complete`
y `/api/gallery`. `/api/keepalive` conserva su chequeo inline a propósito: un
middleware corre *antes* que la verificación del `CRON_SECRET` y le contaría
el estado de la configuración a quien no trae el secreto. Las rutas de
`/api/admin/*` pasan todas por `requireAdmin`, que ya lo comprueba una vez.
El `try/catch` de `requireAdmin` tampoco se toca: responde 401, no 500, y
plegarlo en el handler global cambiaría el código de estado.

**B · revelado de `.reveal-item`.** Queda solo el barrido de 3 s. En el camino
normal (GSAP carga) no cambia nada. Si el CDN de GSAP cae, el contenido
aparece a los 3 s en vez de al instante.

**C · formato de moneda.** `Intl.NumberFormat('es-CO')` imprime `$ 180.000`
(con espacio) donde antes salía `$180.000`. Afecta al precio en pantalla y,
por el ítem 28, al `estimated_price` que se guarda en la base de los leads
nuevos. Es solo formato: `estimated_min` y `estimated_max` son numéricos y no
cambian.

**D · drag & drop.** El archivo soltado entra por el mismo `<input type=file>`
y dispara su `change`, así que pasa por la misma validación de tipo y tamaño.
Sin feedback visual al arrastrar: eso pedía tocar `style.css`, que la
auditoría declaró limpio y el encargo dejó fuera.

**E · rutas de página.** Se borraron `/`, `/admin`, `/privacidad` y
`/cuidados`; `express.static` con `extensions: ['html']` las sirve.
**`/cotizar` se queda** (una línea): no tiene archivo propio y sin ella la URL
que usa Google Ads da 404 en local. En producción la reescribe `vercel.json` y
esa línea nunca se ejecuta. Efecto secundario: en local `/admin` ahora
redirige 301 a `/admin/`.

**F · categorías de la galería.** `server.js` es la única definición y las
sirve en `/api/config`; el admin las lee de ahí para sus dos `<select>`. Los
cuatro botones de filtro de `index.html` **siguen escritos en el HTML**:
`index.html` lo sirve el CDN de Vercel como estático y sacarlos a `/api/config`
dejaría la barra de filtros vacía hasta que responda la función serverless —
un cambio visible, y el encargo pedía no tener ninguno. Si se acepta ese
flash, es un cambio de ~6 líneas en `script.js`.

**G · `cors`.** Se queda. Las 17 líneas de configuración no son la parte
difícil: el preflight sí lo es. Cambiar una dependencia ya instalada y probada
por una reimplementación propia de CORS no deja el código más claro, lo deja
más frágil. El ítem 24 decía "solo si el resultado queda más claro".

**H · deep links.** Borrados `getInstagramUsername`, `openAppOrFallback` y
`bindDeepLinkAnchors`, con el cableado de `dataset.appHref/webHref`. Sobrevive
el listener de tracking de los `.js-wa-track`. **`isMobileDevice()` NO se
borra**: la usan el foco automático del paso visible del cotizador
(`script.js`) y el pulso del CTA flotante. Verificado que los 7 enlaces
`.js-wa` y los 3 `.js-ig` conservan su `href`.

## Fuera del alcance, encontrado de paso

El commit `b741516` ("Add Meta Pixel tracking code to index.html") volvió a
meter el bootstrap del pixel **inline y con el ID escrito a mano** en
`index.html`, deshaciendo lo que la fase de seguridad había sacado a
`public/pixel.js`. Ese `<script>` inline **está bloqueado por la CSP** (no hay
`'unsafe-inline'` en `script-src`, ni en `server.js` ni en `vercel.json`), así
que hoy el pixel no dispara en la landing. No se tocó: es el commit más
reciente y deliberado del repositorio. Para arreglarlo: devolver
`<script src="/pixel.js" defer></script>` y poner `META_PIXEL_ID` en el
entorno de Vercel, como ya hacen `privacidad.html` y `cuidados.html`.

## Verificación

```
npm install         → ok
npm test            → CSP idéntica en server.js y vercel.json · reference_img_url ok
npm start           → puerto 3780
```

| ruta | código |
|---|---|
| `/` | 200 |
| `/cotizar` | 200 |
| `/admin/` | 200 |
| `/privacidad` | 200 |
| `/cuidados` | 200 |
| `/api/config` | 200 (sirve ya `gallery.categories` y `gallery.spans`) |
| `/api/gallery` | 500 · sin `SUPABASE_SERVICE_ROLE_KEY` en local, es la respuesta correcta |
| `/api/health?key=…` | 503 · enumera lo que falta configurar, correcto |
| `/api/keepalive` | 401 · sin `CRON_SECRET`, falla cerrado, correcto |
