# PENDIENTE — datos que solo Negas puede aportar

**Generado:** 2026-07-26 · deriva de `03-seo.md` §5.1 y §5.2
**Actualizado:** 2026-07-26 — Negas aportó los datos; **cero placeholders `<<>>`**

> ✅ **La rama ya se puede desplegar.**
> ```bash
> grep -rn '<<' public/ && echo "NO DESPLEGAR" || echo "limpio"
> ```

---

## 0. El negocio es un SAB, no un local visitable

Dato clave que llegó con las respuestas y que cambió el diseño del schema:
**no hay dirección pública.** Es un estudio privado y en Google la ficha
figura como *servicio a domicilio*. En consecuencia, y a propósito:

- **sin `streetAddress`** — el `PostalAddress` declara solo localidad, región,
  código postal y país
- **sin `geo`** — no hay pin público que declarar
- **sin `hasMap`** ni mapa embebido en `/contacto`
- **con `areaServed`** — Sabaneta, Envigado, Itagüí, La Estrella, Medellín y
  Valle de Aburrá. Es lo que Google espera de un service-area business
- `"publicAccess": false` y la nota visible «Estudio privado: la dirección se
  indica una vez agendada la cita»

## 1. Datos ya incorporados

| Dato | Valor | Dónde quedó |
|---|---|---|
| Teléfono | `+573337589442` (visible: `+57 333 758 9442`) | `tel:` en el footer de la home y en `/contacto`; `telephone` y `contactPoint` del JSON-LD |
| Código postal | `055450` | `postalCode` del JSON-LD y `/contacto` |
| Métodos de pago | Efectivo, Transferencia Bancolombia, Nequi | `paymentAccepted` |
| Ficha de Google | `https://share.google/Q0QXb30nNSbFShhjb` | `sameAs`, footer y `/contacto` |
| TikTok | `https://www.tiktok.com/@negasva` | `sameAs` |
| Horario | **10:00–21:00 todos los días** | `openingHoursSpecification`, footer de la home y `/contacto` |
| Nombre alternativo | «Negas Tattoo - Estudio Privado» | `alternateName` |
| Precio mínimo | $180.000 COP — tomado de la FAQ que ya estaba en la home | `minPrice` de los 3 `Service` |

> ⚠️ El horario del footer cambió: antes decía Lun–Vie 10–19, Sáb 11–16,
> Dom cerrado. Ahora dice **Lun–Dom 10:00–21:00** en las tres páginas y en el
> schema. Debe coincidir **exactamente** con lo que diga la ficha de Google.

## 2. Lo que sigue pendiente

| # | Qué | Por qué importa |
|---|---|---|
| 1 | **Confirmar que el link de Google es el definitivo** | `share.google/Q0QXb30nNSbFShhjb` es un enlace de compartir. Si el panel de Google Business Profile ofrece el corto `maps.app.goo.gl/...`, ese es preferible: es estable y canónico. Cambiarlo en `sameAs`, footer y `/contacto` |
| 2 | **Los 20 `alt` de las piezas** | 15 de 20 están duplicados (P1-7). Se editan en `/admin` → panel **Piezas** → *Texto alternativo* → **Guardar**. Ver §3 |
| 3 | **Una imagen social propia de 1200×630** | Hoy el `og:image` de las 4 páginas apunta a una pieza del portafolio (el ángel blackwork, la destacada del archivo) alojada en `i.ibb.co`. Funciona, pero es vertical: en Facebook y WhatsApp se recorta. Una imagen horizontal propia se vería mejor |
| 4 | **Correr la migración de imágenes** | Ver §5. Saca las 20 piezas de `i.ibb.co` |
| 5 | **Verificar la ficha de Google** y completarla | Sin ficha verificada no hay paquete local ni Maps |
| 6 | **Descripción del negocio para GBP** (250–750 caracteres) | Campo obligatorio de la ficha. Debe sonar a la persona |
| 7 | **Pedir reseñas reales** tras cada sesión | `AggregateRating` **solo** es legítimo con reseñas reales detrás. Este trabajo **no** lo añadió a propósito: inventarlo es motivo de acción manual de Google |
| 8 | **Sección "sobre el artista"** — trayectoria, formación, años tatuando | Señal E-E-A-T. Tatuar perfora la piel: la experiencia demostrable pesa |
| 9 | **Protocolo de bioseguridad y esterilización** | Confianza + E-E-A-T. Debe reflejar lo que de verdad se hace |
| 10 | **Confirmar redirección www → apex** en Vercel / DNS | P3-7, configuración de infra |

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

## 4. El JSON-LD ya está activo

Está en `public/index.html`, antes de `</head>`, **sin comentar y sin
placeholders**. Validarlo tras desplegar:

- <https://validator.schema.org/>
- <https://search.google.com/test/rich-results>

## 5. Cómo correr la migración de imágenes

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

## 6. Nota sobre `Cache-Control` (P3-6)

Se dejó en `max-age=3600, must-revalidate`, **a propósito**. Subirlo a
`max-age=31536000, immutable` solo es seguro si los nombres de archivo llevan
versión (`style.a1b2c3.css`) o query string de versión. Hoy `style.css` y
`script.js` no la llevan: con `immutable` un cambio quedaría cacheado un año
en los navegadores de los visitantes. Cuando se añada versionado, cambiar el
header en `vercel.json`.

## 7. Verificación post-despliegue

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
curl -s https://negas.tattoo/ | grep -c 'application/ld+json'   # esperado: 1
curl -s https://negas.tattoo/ | grep -o '<<[^>]*>>'             # DEBE salir vacío

# Canonical de /cotizar (debe apuntar a la home)
curl -s https://negas.tattoo/cotizar | grep -o '<link rel="canonical"[^>]*>'
```

Luego: Search Console → Inspección de URL → «Probar URL publicada» → pestaña
**HTML renderizado**, y confirmar que las 20 piezas de la galería aparecen.
Enviar `https://negas.tattoo/sitemap.xml` en Search Console → Sitemaps.
