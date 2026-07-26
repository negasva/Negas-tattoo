# PENDIENTE — datos que solo Negas puede aportar

**Generado:** 2026-07-26 · deriva de `03-seo.md` §5.1 y §5.2
**Rama:** `claude/negas-seo-audit-execution-68341k`

> ⛔ **Esta rama NO se despliega tal cual.**
> Contiene 27 placeholders `<<...>>` repartidos en `public/`. La regla dura de
> la auditoría (§4.5) es **cero placeholders en producción**: un `telephone`
> falso o una `geo` inventada rompen la consistencia con Google Business
> Profile y hacen más daño que no tener schema.
> Comprobar antes de mergear a `main`:
> ```bash
> grep -rn '<<' public/ && echo "NO DESPLEGAR" || echo "limpio"
> ```

---

## 1. Datos bloqueantes (sin esto no hay SEO local)

| # | Dato | Formato exacto | Dónde se pega |
|---|---|---|---|
| 1 | **Dirección del estudio** | Calle/Carrera, número, local, barrio | `public/contacto.html` (bloque `.nap`), footer de `public/index.html`, `streetAddress` del JSON-LD |
| 2 | **Código postal** | 6 dígitos (Sabaneta es `0554xx`) | `postalCode` del JSON-LD, `contacto.html` |
| 3 | **Teléfono en E.164** | `+573001234567` — sin espacios, sin guiones, con `+57` | `href="tel:..."` en `index.html` y `contacto.html`, `telephone` y `contactPoint` del JSON-LD |
| 4 | **Teléfono legible** | `+57 300 123 4567` | texto visible de esos mismos enlaces |
| 5 | **Coordenadas del pin de GBP** | `latitude` / `longitude` con 6 decimales, **copiadas del panel de Google Business Profile**, no medidas a ojo en un mapa | `geo` del JSON-LD |
| 6 | **URL corta de la ficha de GBP** | `https://maps.app.goo.gl/XXXXXXXX` | `hasMap` y `sameAs` del JSON-LD, footer de `index.html`, `contacto.html` |
| 7 | **URL de "Insertar un mapa" de GBP** | el `src` del iframe que da Google | `<iframe class="map-frame">` de `contacto.html` |
| 8 | **Métodos de pago aceptados** | lista separada por comas: efectivo, transferencia, Nequi, Daviplata, tarjeta… | `paymentAccepted` del JSON-LD |
| 9 | **Confirmación del horario** | debe coincidir **carácter por carácter** con GBP. Hoy el sitio dice: Lun–Vie 10:00–19:00 · Sáb 11:00–16:00 · Dom cerrado | `openingHoursSpecification` del JSON-LD, footer, `contacto.html` |
| 10 | **TikTok** (si existe) | URL del perfil, o decir que no hay para borrar la línea | `sameAs` del JSON-LD |

## 2. Imagen social (og:image)

| # | Qué | Detalle |
|---|---|---|
| 11 | **Una foto del estudio o pieza insignia** | 1200×630 px, alojada en el dominio propio (`/img/og-negas-tattoo-1200x630.jpg`). Hoy el `og:image` de las 4 páginas es un placeholder. |
| 12 | **Su pie de foto (`og:image:alt`)** | texto humano, lo escribe Negas |

## 3. Los 20 `alt` de las piezas

15 de 20 están duplicados (hallazgo P1-7). Cada uno describe **esa** pieza:
qué es, en qué parte del cuerpo va, qué técnica. Nadie más que el tatuador
lo sabe; un alt generado sería falso.

Se editan uno por uno en `/admin` → panel **Piezas** → campo *Texto
alternativo* → **Guardar**.

Duplicados actuales a reescribir:

- ×4 «Tatuaje de ángel blackwork — Negas Tattoo Sabaneta»
- ×3 «Tatuaje de pierna completa blackwork — Negas Tattoo»
- ×2 «Tatuaje de máscara blackwork — Negas Tattoo Sabaneta»
- ×2 «Tatuaje de letras fine line — Negas Tattoo Sabaneta»
- ×4 «Tatuaje blackwork — Negas Tattoo Sabaneta» (las `IMG-006x.png`)

> Conviene hacerlo **antes** de correr la migración de imágenes: los nombres
> de archivo WebP salen del `alt`, y con alts duplicados salen
> `...-2.webp`, `...-3.webp` en lugar de nombres descriptivos.

## 4. Tareas que solo puede hacer Negas (fuera del código)

| # | Tarea | Por qué |
|---|---|---|
| 13 | **Crear o reclamar la ficha de Google Business Profile** y verificarla | Sin ficha verificada no hay paquete local ni Maps. Es el punto #5 del plan de ejecución. |
| 14 | **Escribir la descripción del negocio para GBP** (250–750 caracteres) | Campo obligatorio de la ficha. Debe sonar a la persona. |
| 15 | **Pedir reseñas reales a los clientes** tras cada sesión, en GBP | `AggregateRating` **solo** es legítimo con reseñas reales detrás. Este trabajo **no** añadió `AggregateRating` a propósito: inventarlo es motivo de acción manual de Google. |
| 16 | **Sección "sobre el artista"** — trayectoria, formación, años tatuando | Señal E-E-A-T. Tatuar perfora la piel: la experiencia demostrable pesa. |
| 17 | **Protocolo de bioseguridad y esterilización** del estudio | Confianza + E-E-A-T. Debe reflejar lo que de verdad se hace. |
| 18 | **Confirmar redirección www → apex** en el panel de Vercel / DNS | P3-7, es configuración de infra, no de repo. |

---

## 5. Cómo activar el JSON-LD principal

Está **comentado a propósito** en `public/index.html`, justo antes de
`</head>`, dentro de un bloque `<!-- ... -->` con la explicación.

1. Rellenar los datos 1–10 de arriba dentro del bloque.
2. Borrar las dos líneas de comentario (`<!-- ═══…` y `═══… -->`).
3. `grep -n '<<' public/index.html` → debe salir vacío.
4. Validar en <https://validator.schema.org/> y en
   <https://search.google.com/test/rich-results>.
5. Desplegar.

## 6. Cómo correr la migración de imágenes

Saca las 20 piezas de `i.ibb.co` (hallazgo P1-2), las convierte a WebP q82 en
dos tamaños (480 y 1080 px) y las sube al bucket público `gallery`.

**No se pudo ejecutar desde el entorno de la auditoría**: la política de red
bloquea las conexiones salientes a `i.ibb.co` (403 del proxy). El script queda
listo para correrse desde una máquina con salida a internet.

```bash
npm i -D sharp

# 1) Ensayo en seco: convierte a ./tmp-webp/ y escribe el SQL, no sube nada
node scripts/migrate-images.mjs

# 2) De verdad: sube al bucket `gallery` y escribe el SQL con las URLs reales
SUPABASE_URL=https://TUPROYECTO.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=... \
node scripts/migrate-images.mjs
```

Después:

1. Abrir `migrations/UPDATE-GALERIA-WEBP.sql` (lo genera el script) y correrlo
   en el editor SQL de Supabase. Reapunta `gallery_images.url` y rellena
   `img_width` / `img_height`.
2. Verificar la galería: los `<img>` deben salir con `srcset` de dos
   variantes y con `width`/`height`.
3. Quitar de las 4 páginas el `<link rel="preconnect" href="https://i.ibb.co">`
   y quitar `i.ibb.co` del `img-src` de la CSP (`vercel.json` **y**
   `server.js` — `npm test` comprueba que las dos coincidan).

> Requisito previo: correr `migrations/EJECUTAR-ESTE-EN-SUPABASE.sql`, que ya
> incluye las columnas `img_width` / `img_height`.

## 7. Nota sobre `Cache-Control` (P3-6)

Se dejó en `max-age=3600, must-revalidate`, **a propósito**. Subirlo a
`max-age=31536000, immutable` solo es seguro si los nombres de archivo llevan
versión (`style.a1b2c3.css`) o query string de versión. Hoy `style.css` y
`script.js` no la llevan: con `immutable` un cambio quedaría cacheado un año
en los navegadores de los visitantes. Cuando se añada versionado, cambiar el
header en `vercel.json`.

## 8. Verificación post-despliegue

Los comandos de la §7 de `03-seo.md` **no se pudieron correr** desde el
entorno de la auditoría: la política de red bloquea las salidas tanto a
`negas.tattoo` como a la URL de preview de Vercel (403 del proxy en el
`CONNECT`, antes de llegar al servidor).

Lo más rápido es correrlos primero contra la **preview de la PR** —ahí ya se
puede comprobar que `cleanUrls` resuelve `/contacto`, `/cuidados` y
`/privacidad` con 200, y que los tres `/admin*` devuelven `noindex`— y
repetirlos contra producción tras el merge:

```bash
U=https://negas-tattoo-git-claude-negas-seo-audi-dfbaaa-negasvas-projects.vercel.app
for p in / /contacto /cuidados /privacidad /cotizar /admin /admin/ /admin/index.html; do
  printf "%-20s " "$p"; curl -sI "$U$p" | grep -iE '^HTTP|^x-robots' | tr -d '\r' | paste -sd' '
done
```

Contra producción, después de desplegar:

```bash
# Indexabilidad — todos deben dar 200 (cleanUrls ya está activo)
curl -sI https://negas.tattoo/            | grep -iE 'HTTP|x-robots'
curl -sI https://negas.tattoo/contacto    | grep -iE 'HTTP|x-robots'
curl -sI https://negas.tattoo/cuidados    | grep -iE 'HTTP|x-robots'
curl -sI https://negas.tattoo/privacidad  | grep -iE 'HTTP|x-robots'
curl -sI https://negas.tattoo/cotizar     | grep -iE 'HTTP|x-robots'

# /admin, /admin/ y /admin/index.html: los tres deben decir noindex
curl -sI https://negas.tattoo/admin            | grep -i x-robots
curl -sI https://negas.tattoo/admin/           | grep -i x-robots
curl -sI https://negas.tattoo/admin/index.html | grep -i x-robots

curl -s https://negas.tattoo/robots.txt  | head
curl -s https://negas.tattoo/sitemap.xml | head

# Schema
curl -s https://negas.tattoo/ | grep -c 'application/ld+json'   # >= 1 tras activar el @graph
curl -s https://negas.tattoo/ | grep -o '<<[^>]*>>'             # DEBE salir vacío

# Canonical de /cotizar (debe apuntar a la home)
curl -s https://negas.tattoo/cotizar | grep -o '<link rel="canonical"[^>]*>'
```

Luego: Search Console → Inspección de URL → «Probar URL publicada» → pestaña
**HTML renderizado**, y confirmar que las 20 piezas de la galería aparecen.
Enviar `https://negas.tattoo/sitemap.xml` en Search Console → Sitemaps.
