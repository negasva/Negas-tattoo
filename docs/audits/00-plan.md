# 00 · Plan — cruce de las tres auditorías

Fecha: 2026-07-26 · Entrada: `01-codigo.md`, `02-seguridad.md`, `03-seo.md`.
Solo plan. Cero código escrito, cero fixes aplicados.

Verificado hoy contra el repo: `vercel.json` sin `cleanUrls`, sin headers de
seguridad, `X-Robots-Tag` con `source: "/admin"`; `multer` y `form-data` siguen
en `package.json`; no existen `public/robots.txt` ni `public/sitemap.xml`;
`.agent.md` y `python` siguen en la raíz.

Corrección a las tres auditorías: la rama de skills **ya está mergeada**
(`a028a36`, PR #9). Las notas de método de 01 y 03 y la nota final de 02
("no existe la skill", "conviene mergear esa rama") están obsoletas.

---

## 1 · Hallazgos repetidos

Un problema, varias auditorías. Se arregla una vez.

| # | Hallazgo | Audits | Fix único |
|---|---|---|---|
| R1 | `/api/health/insert` + `DIAGNOSTICO-LEADS.sql` + `describeServiceKey` | 01 (258 líneas muertas) · 02 A1 (escritura sin auth) · 02 M1 (filtra infra) | Borrar los tres |
| R2 | `multer` + `form-data` sin usar | 01 (deps) · 02 M8 (vuln ALTA) · 02 B4 (el doc dice que ya se fueron) | Borrar 2 líneas de `package.json` |
| R3 | Scripts inline duplicados (Pixel ×3, `fetch('/api/config')` ×2) | 01 (40 líneas dup) · 02 M3 (`'unsafe-inline'`) · 03 P2-1 (bloqueantes) | Sacar a `pixel.js` + `page-config.js` |
| R4 | Deep links WhatsApp/IG por JS, `href="#"` en el HTML | 01 (65 líneas, RIESGOSO) · 03 P0-5 (teléfono inrastreable) · 03 P2-10 | `<a href="https://wa.me/…">` plano + `tel:` |
| R5 | `getLeads`/`getStats` leídos del navegador con anon key | 01 (`getStats` baja todas las filas) · 02 C2 (RLS ausente) | Moverlos a `/api/admin/*` |
| R6 | `vercel.json` mal configurado | 02 A2 (sin CSP/HSTS/XFO) · 03 P0-4 (`cleanUrls`) · 03 P2-11 (`/admin` sin cubrir) · 03 P3-6 (cache) | Un solo edit del archivo |
| R7 | Lista de galería triplicada (server, admin, `GALLERY_FALLBACK`, seed SQL) | 01 (3ª copia) · 03 P1-1/P1-7 (alts duplicados) | Fuente única: BD |
| R8 | Docs que mienten | 02 B4 (`SEGURIDAD-INSTRUCCIONES.md`) · 03 P0-4 (README dice `cleanUrls: true`) | Corregir al cerrar cada fix |
| R9 | Basura en raíz: `.agent.md`, `python` | 01 · 02 B5 | `rm` |

---

## 2 · Conflictos entre recomendaciones

| # | Choque | Resolución |
|---|---|---|
| K1 | **02 A2** dice copiar la cadena CSP de Helmet a `vercel.json`. **02 M3** dice que esa cadena lleva `'unsafe-inline'`. | No copiar. Escribir CSP limpia en `vercel.json` **después** de R3. Si R3 no está listo, poner la CSP en `Report-Only` y el resto de headers en firme. |
| K2 | **03 §4** mete JSON-LD inline; **02 M3** quita `'unsafe-inline'` de `script-src`. | `application/ld+json` no ejecuta, no debería caer bajo `script-src`. **Verificar en consola tras desplegar la CSP**. Si algún navegador lo bloquea: `script-src-elem` con hash. |
| K3 | **01** quiere borrar `app.get('/cotizar')`, `/privacidad`, `/cuidados` porque "ya lo hace `vercel.json`". **03 P0-4**: `vercel.json` NO reescribe esas rutas y no tiene `cleanUrls` → 404. | Orden obligatorio: arreglar `cleanUrls` primero (acción 1), verificar con `curl`, y solo entonces evaluar el borrado. Las rutas de Express siguen sirviendo en local. |
| K4 | **01** propone optimizar `getStats()` con `count: 'exact'`. **02 C2** lo mueve al backend entero. | No optimizar. Trabajo tirado. Hacer C2 (acción 10). |
| K5 | **01** borra `GALLERY_FALLBACK` (3ª copia). **03 P1-1** quiere galería en el HTML servido. | Compatible: borrar la copia hardcodeada. El fallback indexable lo genera el server desde la BD, no una lista en JS. |
| K6 | **03** quiere imágenes autoalojadas bajo el dominio. **02 A5/A6** quiere buckets cerrados. | Distintos buckets. `gallery` público (es el portafolio). `reference-images` y `signed-documents` privados. No mezclar. |
| K7 | **03 P0-5** exige teléfono visible en HTML. **02 M2** castiga el oráculo de teléfonos. | No es el mismo teléfono. El del estudio es público; los de clientes no se exponen. Sin conflicto. |
| K8 | **01** quiere servir `GALLERY_CATEGORIES` por `/api/config`. **02** vigila `/api/config` como superficie de filtración. | Inocuo, pero mantener la lista blanca de campos de `server.js:179-193`. Nada nuevo sin revisar. |

---

## 3 · Top 10 por impacto ÷ esfuerzo

| # | Acción | Pedida por | Archivos | Esf. | Riesgo |
|---:|---|---|---|:--:|---|
| 1 | `cleanUrls: true` + bloque de headers (CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy) + `X-Robots-Tag` con `source: "/admin(/.*)?"` + subir `max-age` de assets | 02 A2 · 03 P0-4, P2-11, P3-6 | `vercel.json` | S | Medio — `cleanUrls` cambia URLs; verificar los 5 `curl` de 03 §7 antes y después. CSP puede romper Tailwind/GSAP: desplegar en `Report-Only` 24 h |
| 2 | Verificar en Supabase si RLS está activa sobre `leads`. Borrar la política `gallery admin manage` | 02 C2 (verif.) · 02 A4 | Panel Supabase · `migrations/EJECUTAR-ESTE-EN-SUPABASE.sql` | S | Bajo — la lectura pública ya la sirve `/api/gallery`. **Es el dato que decide si hay incidente** |
| 3 | Borrar la rama `forceCreate` entera | 02 C1 · 02 M2 | `server.js:547-560` | S | Bajo — depende de si existe UNIQUE sobre `phone` (ver §5) |
| 4 | `ADMIN_EMAILS` fail-closed: `if (!ADMIN_EMAILS.includes(email))` + rellenar la env en Vercel | 02 A3 | `server.js:683-685`, env Vercel | S | **Alto si se despliega con la lista vacía → nadie entra al admin.** Poner la env primero |
| 5 | Quitar `multer` y `form-data` de `package.json`; `npm audit fix` | 02 M8 · 01 (deps) | `package.json`, `package-lock.json` | S | Bajo — cero referencias en el repo |
| 6 | Borrar `/api/health/insert`, `DIAGNOSTICO-LEADS.sql`, `describeServiceKey`; guard con `HEALTH_DEBUG_KEY` en `/api/health` | 02 A1 · 02 M1 · 01 | `server.js:247-364`, `migrations/DIAGNOSTICO-LEADS.sql` | S | Bajo — 258 líneas, todo en el historial de git |
| 7 | `file_size_limit` + `allowed_mime_types` en los buckets; `signed-documents` y `reference-images` a privados | 02 A5 · 02 A6 | Panel Supabase | S | Medio — poner privado `reference-images` rompe el render actual hasta migrar a URLs firmadas. Hacer `signed-documents` (cédulas de menores) primero |
| 8 | `robots.txt` + `sitemap.xml` | 03 P0-1, P0-2 | `public/robots.txt`, `public/sitemap.xml` (nuevos) | S | Bajo — hacer después de 1: las URLs del sitemap dependen de `cleanUrls` |
| 9 | Enlaces `wa.me` / `instagram.com` planos + `tel:` visible; borrar la máquina de deep links | 01 · 03 P0-5, P2-10 | `script.js:119-141, 176-234`, `index.html`, `cuidados.html`, `privacidad.html` | M | Medio — 01 lo marca RIESGOSO. Probar en iOS y Android reales. Necesita el teléfono de §5 |
| 10 | `ENABLE ROW LEVEL SECURITY` sobre `leads` sin política + mover `getLeads`/`getStats`/`updateLeadStatus` a `/api/admin/*` con `requireAdmin` | 02 C2 · 02 M7 · 01 (`getStats`) | `migrations/*.sql`, `public/supabase.js:90-125`, `public/admin/index.html`, `server.js` | L | **Alto — rompe el panel admin hasta que los endpoints existan.** Desplegar endpoints y admin en el mismo commit. Copiar el patrón que ya existe para la galería |

Notas de orden: **4 antes que 10** (si el admin queda abierto, mover los leads al backend no protege nada). **1 antes que 8**. **3 antes que cualquier cosa que toque `/api/lead`**.

De 1 a 8: ~1 hora. Cierra los dos CRÍTICO parcialmente, tres ALTO, y los dos P0 bloqueantes de SEO.

---

## 4 · Cuándo

### Hacer ya (hoy, ~1 h)

Acciones 1-8. Más dos de un minuto:

- Escapar `stage` en `admin/index.html:458` (02 M4).
- `rm .agent.md python` (02 B5 · 01).

### Esta semana

| Acción | Audits | Esf. |
|---|---|:--:|
| Acción 10 — RLS sobre `leads` + endpoints admin | 02 C2, M7 | L |
| Acción 9 — enlaces planos + `tel:` | 01 · 03 P0-5 | M |
| `pixel.js` + `page-config.js`; quitar `'unsafe-inline'` de la CSP (K1) | 01 · 02 M3 | M |
| JSON-LD de la home (03 §4.1) — **bloqueado por los datos de §5** | 03 P0-3 | S |
| CORS localhost solo fuera de producción | 02 M5 | S |
| `reference_img_url` restringido al propio Storage | 02 M6 | S |
| `CRON_SECRET` en `/api/keepalive` | 02 B1 | S |
| `try/catch` en `server.js:213-224, 286-290` (requests que se cuelgan) | 01 | S |
| Errores del formulario al campo correcto, no a `name`/`file` | 01 | S |
| Corregir `SEGURIDAD-INSTRUCCIONES.md` y el README (R8) | 02 B4 · 03 P0-4 | S |
| Borrados menores de 01: `[DEBUG]` log, 404 handler, `openLightbox` global, `#portfolio`, `SUPABASE_KEEPALIVE_TABLES`, `catch` inalcanzable, allowlist CORS fuera del closure | 01 | S |

### Algún día

| Acción | Audits | Esf. |
|---|---|:--:|
| Autoalojar imágenes + WebP/AVIF + `width`/`height` + `srcset` + columnas `img_width`/`img_height` | 03 P1-2, P1-5, P1-6, P2-5, §4.2 | L |
| Fallback HTML de la galería desde la BD (K5) | 03 P1-1 · 01 | M |
| Página `/contacto` con NAP completo | 03 P1-3, P1-4 | M + texto humano |
| `ImageObject` por pieza + `BreadcrumbList` en subpáginas | 03 §4.2, §4.3 | M |
| `deleted_at` real en `leads` (Ley 1581) | 02 B3 | M |
| Refactors de 01: `asyncRoute`, `limiter()`, `requireSupabase`, `upload(bucket,…)` | 01 | M |
| Limpieza P2/P3: `preconnect`, `defer` en GSAP, H2 en `#estilos`, `og:`/`twitter:` en subpáginas, `lang="es-CO"`, `apple-touch-icon` | 03 P2-1…P3-5 | M |
| `PRICING` a constantes, `formatCop` con `Intl`, `shuffle` en una línea, `dotenv` → `--env-file` | 01 | S |

### No hacer

| Qué | Motivo |
|---|---|
| `FAQPage` y `HowTo` schema | Google retiró ambos rich results en 2023. Cero estrella en el SERP. Lo dice la propia auditoría 03 (§4.4) |
| Reescribir el historial de git (`filter-repo`) | La anon key sigue sirviéndose hoy en `/api/config`. Reescribir no borra nada útil. Si importa: rotarla, y solo **después** de la acción 10 |
| B2 — comparación de `update_token` en tiempo constante | Sobre HTTP y un índice de BD no es explotable. Ya descartado en 02 |
| Reescribir el render del admin de `innerHTML` a `textContent` | L de esfuerzo para lo que M4 arregla en una línea. Reevaluar si el admin crece |
| Sustituir `cors` por middleware propio | Funciona, es la dependencia menos peligrosa del `package.json`. 17 líneas no justifican el riesgo |
| Landings por ciudad (Medellín/Envigado/Itagüí) sin local físico | Doorway pages. Penalizable. 03 §5.3 |
| `AggregateRating` en el schema | Sin reseñas reales verificables = acción manual de Google |
| Generar reseñas, testimonios, `alt`, `geo` o texto "sobre el artista" con IA | 03 §5.3. Un `telephone` o una `geo` inventada rompe la consistencia con GBP y hace más daño que no tener schema |
| `GALLERY_FALLBACK` como solución de indexación | Es la 3ª copia de la misma lista. El fallback sale de la BD (K5) |

---

## 5 · Requiere persona

Nada de esto lo puede resolver el repo.

### Datos que faltan (bloquean el JSON-LD y el SEO local)

| Dato | Bloquea |
|---|---|
| Dirección exacta: calle, número, barrio, código postal | `PostalAddress`, NAP, paquete local, página `/contacto` |
| Teléfono en E.164 (`+57…`) | `telephone`, `tel:`, acción 9 |
| Latitud/longitud del **pin real de GBP** (no de un mapa a ojo) | `geo` |
| URL corta de la ficha de Google Business Profile | `hasMap`, `sameAs`, vínculo web↔GBP |
| Confirmación del horario real (¿coincide con el footer?) | `openingHoursSpecification` |
| Métodos de pago aceptados | `paymentAccepted` |

### Decisiones

| Pregunta | De qué depende |
|---|---|
| ¿Existe un índice UNIQUE sobre `leads.phone`? | Acción 3. Si no existe, `forceCreate` nunca se dispara y el borrado es trivial |
| ¿Se permite recotizar con el mismo teléfono? Si sí → quitar el UNIQUE, fila nueva | Acción 3 |
| ¿Qué correos van en `ADMIN_EMAILS`? | Acción 4. Sin esto el admin queda cerrado |
| ¿El registro por email está abierto en el proyecto Supabase? | Gravedad real de A3 |
| ¿Se rota la anon key? | Solo después de la acción 10 |
| ¿Presupuesto/tiempo para autoalojar las 20 imágenes? | Todo el bloque de imágenes de 03 |
| ¿Cómo se atiende una solicitud de supresión hoy? (Ley 1581) | 02 B3 — hoy "borrar" solo escribe en `localStorage` |
| ¿Se conserva `/cotizar` como ruta? | K3, sitemap, canonicals |

### Texto que escribe Negas, no una IA

- Página `/contacto`: cómo llegar, referencias del barrio, parqueadero, transporte.
- `alt` únicos para las 20 piezas (15 están duplicados hoy) — pieza por pieza en `/admin`.
- Descripción del negocio para GBP (250-750 caracteres).
- Sección "sobre el artista": trayectoria, formación, años tatuando (E-E-A-T).
- Protocolo real de bioseguridad y esterilización.
- `og:image` propia alojada en el dominio, con su pie de foto.
- Descripciones por estilo, si se crean landings de Blackwork / Botánico / Fine line.

Regla dura de 03 §4.5: **cero placeholders `<<>>` al desplegar.**
