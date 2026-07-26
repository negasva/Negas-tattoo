# Auditoría SEO — Negas Tattoo

**Fecha:** 2026-07-26
**Alcance:** `public/index.html`, `public/cuidados.html`, `public/privacidad.html`, `public/admin/index.html`, `public/script.js`, `public/style.css`, `server.js`, `vercel.json`
**Tipo de negocio:** estudio de tatuaje local (Sabaneta, Antioquia) → prioridad **local + maps**
**Modo:** solo diagnóstico técnico/estructural. **No se escribió copy.** No se tocó `public/`.

> Nota de método: las skills `seo`, `seo-technical`, `seo-local`, `seo-maps`, `seo-schema`,
> `seo-images`, `seo-sitemap` no están instaladas en este repo ni en el entorno
> (`.claude/skills/` solo contiene `settings.local.json`; no existe `.claude/skills/seo/bin/claude-seo`).
> La auditoría se hizo con inspección directa del código, cubriendo el mismo alcance.

---

## 1. Health score

**31 / 100** — reprobado. El sitio está bien construido a nivel producto, pero es **casi invisible para SEO local**: cero datos estructurados, cero robots/sitemap, y el NAP no existe en el HTML.

| Área | Peso | Score | Estado |
|---|---:|---:|---|
| Indexabilidad y rastreo | 20 | 4 | 🔴 sin robots.txt ni sitemap.xml; riesgo de 404 en `/cuidados` y `/privacidad` |
| Datos estructurados (Schema) | 20 | 0 | 🔴 cero JSON-LD en todo el sitio |
| SEO local / Maps (NAP, GBP) | 20 | 5 | 🔴 sin dirección, sin teléfono en HTML, sin mapa, sin página de contacto |
| Imágenes | 15 | 6 | 🟠 host de terceros, sin WebP/AVIF, alts duplicados, render solo por JS |
| Metadatos técnicos | 10 | 7 | 🟡 home bien; subpáginas incompletas |
| Rendimiento / Core Web Vitals | 10 | 6 | 🟡 scripts bloqueantes, sin preconnect |
| Headings y enlazado interno | 5 | 3 | 🟡 un salto de jerarquía, sección sin H2, sin breadcrumbs |

---

## 2. Hallazgos por prioridad

### 🔴 P0 — bloqueantes

| # | Hallazgo | Dónde | Impacto |
|---|---|---|---|
| P0-1 | **No existe `robots.txt`** | falta `public/robots.txt`; `server.js` no tiene ruta | Sin directiva de rastreo ni declaración de sitemap |
| P0-2 | **No existe `sitemap.xml`** | falta `public/sitemap.xml` | Google descubre por enlaces solamente; peor cobertura |
| P0-3 | **Cero JSON-LD en todo el sitio** | `grep 'application/ld+json'` → 0 resultados | Sin `LocalBusiness`/`TattooParlor` no hay elegibilidad para paquete local, knowledge panel ni rich results |
| P0-4 | **`cleanUrls` NO está activo en `vercel.json`** — el README (línea 154) afirma que sí | `vercel.json:1-25` | Con Output Directory = `public`, `/cuidados` y `/privacidad` devuelven **404** en Vercel. Los canonicals, el footer y el sitemap propuesto apuntan a esas URLs sin `.html`. Verificar antes que nada. |
| P0-5 | **El teléfono no existe en el HTML de ninguna página** | `js-wa` → `href="#"`, se inyecta por JS desde `/api/config` | El "P" del NAP es inrastreable. Sin `tel:` en ningún lado. Señal local crítica ausente. |
| P0-6 | **No hay dirección postal en ningún lado** | solo "Sabaneta, Antioquia" (`index.html:531`, `privacidad.html:67`) | Sin calle/número no hay NAP verificable ni consistencia con Google Business Profile |

**Verificación de P0-4 (correr contra producción):**
```bash
curl -sI https://negas.tattoo/cuidados   | head -1
curl -sI https://negas.tattoo/privacidad | head -1
curl -sI https://negas.tattoo/cotizar    | head -1
```
Si dan `404`, añadir `"cleanUrls": true` a `vercel.json` **o** cambiar los canonicals y enlaces a `.html`. No ambas.

---

### 🟠 P1 — alto impacto

| # | Hallazgo | Dónde | Impacto |
|---|---|---|---|
| P1-1 | **Portafolio 100% renderizado por JS** sin fallback HTML ni `<noscript>` | `script.js:296-345` | 20 piezas de galería no están en el HTML servido. Dependen de que Googlebot renderice + de que `/api/gallery` responda. Para un tatuador, la galería *es* el contenido indexable. |
| P1-2 | **Todas las imágenes viven en `i.ibb.co`** (host de terceros) | `script.js:257-278`, `migrations/...sql:106+` | Google Imágenes atribuye al dominio del host, no a `negas.tattoo`. Cero valor de imagen para el dominio. Sin control de caché ni de formato. |
| P1-3 | **Sin ningún enlace ni señal hacia Google Business Profile / Maps** | todo el sitio | Falta el vínculo web↔GBP: sin `hasMap`, sin embed, sin enlace a la ficha, sin `geo` |
| P1-4 | **No existe página de contacto/ubicación** | rutas: `/`, `/cotizar`, `/privacidad`, `/cuidados`, `/admin` | No hay URL que Google pueda asociar a la ubicación física ni que enlazar desde GBP |
| P1-5 | **Formato de imagen: 0% WebP/AVIF** | 14 `.jpg` + 5 `.png` + `favicon.png` | Fotos servidas como PNG (`IMG-0063..0067.png`) = varios cientos de KB de más cada una |
| P1-6 | **Sin `srcset`/`sizes` en la galería** | `script.js:316-320` | Se descarga la imagen full-size en móvil, para una celda de 180 px de alto |
| P1-7 | **Alts duplicados en 15 de 20 piezas** | seed en `migrations/EJECUTAR-ESTE-EN-SUPABASE.sql:106-128` | 4× "Tatuaje de ángel blackwork…", 4× "Tatuaje blackwork…", 3× "Tatuaje de pierna completa…" — se anula el valor descriptivo |

---

### 🟡 P2 — medio

| # | Hallazgo | Dónde |
|---|---|---|
| P2-1 | GSAP: 2 `<script>` bloqueantes sin `defer`/`async` en el `<head>` | `index.html:35-36` |
| P2-2 | Sin `preconnect`/`dns-prefetch` a `fonts.gstatic.com`, `i.ibb.co`, `connect.facebook.net` | las 3 páginas |
| P2-3 | Salto de jerarquía H1→H3: la sección `#estilos` no tiene H2 | `index.html:110-148` |
| P2-4 | `alt` del lightbox es estático y no describe la pieza abierta | `index.html:328`, `script.js:355-383` |
| P2-5 | Galería sin `width`/`height` explícitos (CLS mitigado por `grid-auto-rows`, no eliminado) | `script.js:316-320` / `style.css:587-620` |
| P2-6 | El campo `alt` del admin es **opcional** → nuevas piezas caen al alt genérico por categoría | `admin/index.html:262, 686` |
| P2-7 | `cuidados.html` sin `twitter:card` ni `og:image` | `cuidados.html:12-15` |
| P2-8 | `privacidad.html` sin ningún `og:` ni `twitter:` | `privacidad.html:3-26` |
| P2-9 | `index.html` sin `<meta name="robots">` explícito (las otras dos sí lo tienen) | `index.html` |
| P2-10 | Enlaces `js-wa` con `href="#"` en el HTML servido | `index.html:224,512,532`, `cuidados.html:186`, `privacidad.html:68,153,187` |
| P2-11 | Header `X-Robots-Tag: noindex` con `source: "/admin"` (match exacto) no cubre `/admin/` ni `/admin/index.html` | `vercel.json:19` |
| P2-12 | Sin breadcrumbs (visuales ni schema) en `/cuidados` y `/privacidad` | ambas |
| P2-13 | `/cuidados` y `/privacidad` no se enlazan entre sí ni al portafolio (callejón sin salida) | ambas |

---

### 🔵 P3 — bajo / higiene

| # | Hallazgo | Dónde |
|---|---|---|
| P3-1 | `<meta name="keywords">` — obsoleto, Google lo ignora desde 2009 | `index.html:10` |
| P3-2 | `lang="es"` podría ser `lang="es-CO"` (señal regional menor) | las 3 páginas |
| P3-3 | Sin `apple-touch-icon`, `theme-color` ni `manifest.json` | las 3 páginas |
| P3-4 | Sin `og:site_name`, `og:locale`, `og:image:width/height`, `og:image:alt` | `index.html:13-18` |
| P3-5 | Sin `twitter:title` / `twitter:description` / `twitter:image` (hereda de `og:`, funciona, pero es implícito) | `index.html:18` |
| P3-6 | `Cache-Control: max-age=3600` para CSS/JS/imágenes — corto para assets versionables | `vercel.json:15` |
| P3-7 | Sin redirección declarada www → apex (verificar en el DNS/panel de Vercel) | infra |
| P3-8 | `/cotizar` es indexable; se autocanonicaliza a `/` vía el canonical de `index.html` — correcto, pero conviene confirmarlo tras arreglar P0-4 | `vercel.json:6` |

---

## 3. Tabla: qué falta por página

Leyenda: ✅ presente · ❌ falta · ⚠️ presente pero con problema · — no aplica

| Elemento | `/` (index) | `/cuidados` | `/privacidad` | `/admin` |
|---|:--:|:--:|:--:|:--:|
| `<html lang>` | ⚠️ `es` | ⚠️ `es` | ⚠️ `es` | ⚠️ `es` |
| `<title>` | ✅ | ✅ | ✅ | ✅ |
| `meta description` | ✅ | ✅ | ✅ | — |
| `meta viewport` | ✅ | ✅ | ✅ | ✅ |
| `link canonical` | ✅ | ✅ | ✅ | ❌ |
| `meta robots` | ❌ | ✅ | ✅ | ✅ noindex |
| `og:type` / `og:url` / `og:title` / `og:description` | ✅ | ✅ | ❌ | — |
| `og:image` | ✅ (ibb.co) | ❌ | ❌ | — |
| `og:site_name` / `og:locale` | ❌ | ❌ | ❌ | — |
| `og:image:width/height/alt` | ❌ | ❌ | ❌ | — |
| `twitter:card` | ✅ | ❌ | ❌ | — |
| `twitter:title/description/image` | ❌ | ❌ | ❌ | — |
| **JSON-LD `LocalBusiness`/`TattooParlor`** | ❌ | ❌ | ❌ | — |
| **JSON-LD `WebSite`** | ❌ | — | — | — |
| **JSON-LD `Service`** | ❌ | — | — | — |
| **JSON-LD `ImageObject`** | ❌ | — | — | — |
| **JSON-LD `BreadcrumbList`** | — | ❌ | ❌ | — |
| **JSON-LD `FAQPage`** | ❌ (7 Q&A sin marcar) | — | — | — |
| Exactamente 1 `<h1>` | ✅ | ✅ | ✅ | ⚠️ 2 |
| Jerarquía de headings sin saltos | ❌ H1→H3 | ✅ | ✅ | ⚠️ |
| Headings vacíos | ✅ ninguno | ✅ ninguno | ✅ ninguno | ✅ ninguno |
| NAP — Nombre | ✅ | ✅ | ✅ | — |
| NAP — Dirección (calle+número) | ❌ | ❌ | ❌ | — |
| NAP — Teléfono en HTML | ❌ | ❌ | ❌ | — |
| Enlace `tel:` | ❌ | ❌ | ❌ | — |
| Email de contacto | ❌ | ❌ | ✅ | — |
| Horario en HTML | ✅ footer | ❌ | ❌ | — |
| Mapa / enlace a GBP | ❌ | ❌ | ❌ | — |
| `sameAs` (IG/FB) rastreable | ✅ footer | ❌ | ❌ | — |
| Imágenes con `alt` | ⚠️ genérico/duplicado | — sin `<img>` | — sin `<img>` | ⚠️ `alt=""` |
| Imágenes `loading="lazy"` | ✅ (JS) | — | — | ✅ |
| Imágenes `width`/`height` | ❌ | — | — | ❌ |
| Formato WebP/AVIF | ❌ | — | — | — |
| `srcset` / `sizes` | ❌ | — | — | ❌ |
| Contenido principal en el HTML servido | ⚠️ galería solo por JS | ✅ | ✅ | — |
| `preconnect` a orígenes críticos | ❌ | ❌ | ❌ | ❌ |
| Enlaces internos salientes | ✅ 4 | ⚠️ 1 (solo `/`) | ⚠️ 1 (solo `/`) | — |
| Breadcrumbs | — | ❌ | ❌ | — |

### Faltantes a nivel sitio

| Archivo / config | Estado |
|---|---|
| `public/robots.txt` | ❌ no existe |
| `public/sitemap.xml` | ❌ no existe |
| Ruta `/robots.txt` en `server.js` | ❌ no existe |
| Ruta `/sitemap.xml` en `server.js` | ❌ no existe |
| `cleanUrls: true` en `vercel.json` | ❌ ausente (el README dice lo contrario) |
| Página de contacto/ubicación | ❌ no existe |
| Imágenes autoalojadas | ❌ todo en `i.ibb.co` |

---

## 4. JSON-LD listo para pegar

Sustituir todos los tokens `<<...>>` con los datos reales antes de publicar. **No inventar la geolocalización**: sacar `latitude`/`longitude` del pin real de Google Business Profile, y `hasMap` de la URL corta de la ficha.

### 4.1 Home — `public/index.html`, antes de `</head>`

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "https://negas.tattoo/#website",
      "url": "https://negas.tattoo/",
      "name": "Negas Tattoo",
      "inLanguage": "es-CO",
      "publisher": { "@id": "https://negas.tattoo/#studio" }
    },
    {
      "@type": ["TattooParlor", "LocalBusiness"],
      "@id": "https://negas.tattoo/#studio",
      "name": "Negas Tattoo",
      "alternateName": "Negas Tattoo Studio",
      "url": "https://negas.tattoo/",
      "email": "hola@negas.tattoo",
      "telephone": "<<+57XXXXXXXXXX>>",
      "image": {
        "@id": "https://negas.tattoo/#primaryimage"
      },
      "logo": "https://negas.tattoo/favicon.png",
      "priceRange": "$$",
      "currenciesAccepted": "COP",
      "paymentAccepted": "<<Efectivo, Transferencia, Nequi, Daviplata>>",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "<<Calle 00 #00-00, local 000>>",
        "addressLocality": "Sabaneta",
        "addressRegion": "Antioquia",
        "postalCode": "<<055450>>",
        "addressCountry": "CO"
      },
      "geo": {
        "@type": "GeoCoordinates",
        "latitude": "<<6.15XXXX>>",
        "longitude": "<<-75.61XXXX>>"
      },
      "hasMap": "<<https://maps.app.goo.gl/XXXXXXXX>>",
      "openingHoursSpecification": [
        {
          "@type": "OpeningHoursSpecification",
          "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
          "opens": "10:00",
          "closes": "19:00"
        },
        {
          "@type": "OpeningHoursSpecification",
          "dayOfWeek": "Saturday",
          "opens": "11:00",
          "closes": "16:00"
        },
        {
          "@type": "OpeningHoursSpecification",
          "dayOfWeek": "Sunday",
          "opens": "00:00",
          "closes": "00:00"
        }
      ],
      "publicAccess": false,
      "isAccessibleForFree": false,
      "smokingAllowed": false,
      "availableLanguage": { "@type": "Language", "name": "Spanish", "alternateName": "es" },
      "areaServed": [
        { "@type": "City", "name": "Sabaneta" },
        { "@type": "City", "name": "Envigado" },
        { "@type": "City", "name": "Itagüí" },
        { "@type": "City", "name": "La Estrella" },
        { "@type": "City", "name": "Medellín" },
        { "@type": "AdministrativeArea", "name": "Valle de Aburrá" }
      ],
      "sameAs": [
        "https://www.instagram.com/negas.tattoo",
        "https://www.facebook.com/negas.ink",
        "<<https://maps.app.goo.gl/XXXXXXXX>>",
        "<<https://www.tiktok.com/@negas.tattoo>>"
      ],
      "contactPoint": [
        {
          "@type": "ContactPoint",
          "contactType": "reservations",
          "telephone": "<<+57XXXXXXXXXX>>",
          "email": "hola@negas.tattoo",
          "availableLanguage": "es",
          "areaServed": "CO"
        }
      ],
      "makesOffer": [
        { "@type": "Offer", "itemOffered": { "@id": "https://negas.tattoo/#svc-blackwork" } },
        { "@type": "Offer", "itemOffered": { "@id": "https://negas.tattoo/#svc-botanico" } },
        { "@type": "Offer", "itemOffered": { "@id": "https://negas.tattoo/#svc-fineline" } }
      ],
      "potentialAction": {
        "@type": "ReserveAction",
        "target": {
          "@type": "EntryPoint",
          "urlTemplate": "https://negas.tattoo/cotizar",
          "inLanguage": "es-CO",
          "actionPlatform": [
            "http://schema.org/DesktopWebPlatform",
            "http://schema.org/MobileWebPlatform"
          ]
        },
        "result": { "@type": "Reservation", "name": "Cotización de tatuaje" }
      }
    },
    {
      "@type": "ImageObject",
      "@id": "https://negas.tattoo/#primaryimage",
      "url": "<<https://negas.tattoo/img/estudio-negas-tattoo-sabaneta.webp>>",
      "contentUrl": "<<https://negas.tattoo/img/estudio-negas-tattoo-sabaneta.webp>>",
      "width": "<<1200>>",
      "height": "<<630>>",
      "caption": "<<texto humano — ver sección 5>>"
    },
    {
      "@type": "Service",
      "@id": "https://negas.tattoo/#svc-blackwork",
      "name": "Blackwork",
      "serviceType": "Tatuaje blackwork",
      "provider": { "@id": "https://negas.tattoo/#studio" },
      "areaServed": { "@type": "AdministrativeArea", "name": "Valle de Aburrá" },
      "offers": {
        "@type": "Offer",
        "priceCurrency": "COP",
        "priceSpecification": {
          "@type": "PriceSpecification",
          "priceCurrency": "COP",
          "minPrice": 180000
        },
        "availability": "https://schema.org/InStock",
        "url": "https://negas.tattoo/cotizar"
      }
    },
    {
      "@type": "Service",
      "@id": "https://negas.tattoo/#svc-botanico",
      "name": "Botánico",
      "serviceType": "Tatuaje botánico",
      "provider": { "@id": "https://negas.tattoo/#studio" },
      "areaServed": { "@type": "AdministrativeArea", "name": "Valle de Aburrá" },
      "offers": {
        "@type": "Offer",
        "priceCurrency": "COP",
        "priceSpecification": {
          "@type": "PriceSpecification",
          "priceCurrency": "COP",
          "minPrice": 180000
        },
        "availability": "https://schema.org/InStock",
        "url": "https://negas.tattoo/cotizar"
      }
    },
    {
      "@type": "Service",
      "@id": "https://negas.tattoo/#svc-fineline",
      "name": "Fine line",
      "serviceType": "Tatuaje fine line",
      "provider": { "@id": "https://negas.tattoo/#studio" },
      "areaServed": { "@type": "AdministrativeArea", "name": "Valle de Aburrá" },
      "offers": {
        "@type": "Offer",
        "priceCurrency": "COP",
        "priceSpecification": {
          "@type": "PriceSpecification",
          "priceCurrency": "COP",
          "minPrice": 180000
        },
        "availability": "https://schema.org/InStock",
        "url": "https://negas.tattoo/cotizar"
      }
    }
  ]
}
</script>
```

### 4.2 Galería — `ImageObject` por pieza

Generar en `renderGallery()` (`script.js:296`) a partir de los datos que ya devuelve `/api/gallery`. Un solo bloque con todas las piezas:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "ImageGallery",
  "@id": "https://negas.tattoo/#archivo",
  "name": "El Archivo",
  "url": "https://negas.tattoo/#work",
  "isPartOf": { "@id": "https://negas.tattoo/#website" },
  "associatedMedia": [
    {
      "@type": "ImageObject",
      "contentUrl": "<<https://negas.tattoo/img/piezas/tatuaje-angel-blackwork.webp>>",
      "url": "<<https://negas.tattoo/img/piezas/tatuaje-angel-blackwork.webp>>",
      "width": "<<1080>>",
      "height": "<<1350>>",
      "name": "<<item.alt de la base de datos>>",
      "description": "<<item.alt de la base de datos>>",
      "keywords": "<<item.category>>",
      "creator": { "@id": "https://negas.tattoo/#studio" },
      "copyrightNotice": "© Negas Tattoo",
      "creditText": "Negas Tattoo",
      "license": "https://negas.tattoo/privacidad",
      "acquireLicensePage": "https://negas.tattoo/",
      "contentLocation": { "@id": "https://negas.tattoo/#studio" }
    }
  ]
}
</script>
```

Mapa de campos → BD (`gallery_images`): `contentUrl`←`url`, `name`/`description`←`alt`, `keywords`←`category`. Faltan `width`/`height` en la tabla: **añadir dos columnas** (`img_width int`, `img_height int`) y rellenarlas al subir. Eso también resuelve P2-5.

### 4.3 Subpáginas — `BreadcrumbList`

`public/cuidados.html`:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Inicio", "item": "https://negas.tattoo/" },
    { "@type": "ListItem", "position": 2, "name": "Cuidados post-tatuaje", "item": "https://negas.tattoo/cuidados" }
  ]
}
</script>
```

`public/privacidad.html`:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Inicio", "item": "https://negas.tattoo/" },
    { "@type": "ListItem", "position": 2, "name": "Política de privacidad", "item": "https://negas.tattoo/privacidad" }
  ]
}
</script>
```

### 4.4 FAQ — opcional, valor bajo

Las 7 preguntas de `index.html:230-313` ya existen como texto humano; marcarlas es solo estructura, no contenido nuevo. **Pero**: desde agosto de 2023 Google restringe los rich results de `FAQPage` a sitios de gobierno y salud. No habrá estrella en el SERP. Sirve para comprensión de entidad y para otros motores. Implementar solo si sobra tiempo, mapeando `.accordion-title` → `name` y `.accordion-text` → `acceptedAnswer.text` **sin reescribir el texto**.

Lo mismo aplica a `HowTo` en `/cuidados`: rich result retirado por Google en septiembre de 2023. No vale la pena.

### 4.5 Validación

```
https://validator.schema.org/
https://search.google.com/test/rich-results
```
Regla dura: **cero placeholders `<<>>` al desplegar**. Un `telephone` falso o una `geo` inventada rompen la consistencia con Google Business Profile y hacen más daño que no tener schema.

---

## 5. Requiere texto humano

Contenido que hace falta y que **debe escribir Negas**, no una IA. Google detecta y degrada texto generado en masa; en un negocio local de una sola persona, el texto propio *es* la señal de autenticidad. Aquí solo se lista **qué** y **por qué** — nada redactado.

### 5.1 Bloqueantes para el SEO local

| Qué falta | Por qué | Dónde va |
|---|---|---|
| **Dirección exacta del estudio** (calle, número, barrio, código postal) | Sin ella no hay NAP, no hay `PostalAddress` válido, no hay consistencia con GBP. Es *el* dato que decide el paquete local. | `address` del JSON-LD + footer visible + página de contacto |
| **Teléfono en formato E.164** (`+57...`) | Actualmente solo existe como número de WhatsApp inyectado por JS. Google necesita verlo en el HTML. | `telephone` del JSON-LD + enlace `tel:` visible |
| **Coordenadas reales del pin de GBP** | Una `geo` aproximada desalinea la ficha del sitio y puede degradar el ranking local. Copiar del panel de GBP, no de un mapa a ojo. | `geo` del JSON-LD |
| **URL corta de la ficha de Google Business Profile** | Es el vínculo explícito web↔GBP. Alimenta `hasMap` y `sameAs`. | JSON-LD + footer |
| **Confirmación del horario real** | El footer dice Lun–Vie 10–19, Sáb 11–16, Dom cerrado. Debe coincidir *exactamente* con GBP o Google marca conflicto. | verificar antes de publicar `openingHoursSpecification` |
| **Métodos de pago aceptados** | Campo `paymentAccepted`; también reduce fricción real. | JSON-LD |

### 5.2 Páginas y textos que faltan

| Qué falta | Por qué es necesario | Quién lo escribe |
|---|---|---|
| **Página `/contacto` o `/ubicacion`** con NAP completo, cómo llegar, referencia de barrio, mapa embebido | Hoy no existe ninguna URL que Google pueda asociar a la ubicación física. Es la página que se enlaza desde GBP y la que compite por "tatuajes cerca de mí". Requiere texto de orientación real (referencias del barrio, parqueadero, transporte) que solo Negas conoce. | Negas |
| **Descripciones únicas por estilo** (Blackwork / Botánico / Fine line) — si se hacen landings por estilo | Las tres tarjetas actuales tienen texto propio y bueno. Si se crean páginas dedicadas por estilo (recomendable para intención de búsqueda), cada una necesita texto nuevo y distinto. Reciclar o generar sería contenido delgado y duplicado. | Negas |
| **`alt` únicos para las 20 piezas** (15 están duplicados) | El alt describe *esa* pieza: qué es, dónde va en el cuerpo, qué técnica. Nadie más que el tatuador sabe qué hay en cada imagen. Un alt generado sería falso. | Negas, pieza por pieza en `/admin` |
| **`og:image` propia y alojada en el dominio** + su `alt` | Hoy apunta a `i.ibb.co`. Hace falta una imagen del estudio o de una pieza insignia, con pie de foto real. | Negas |
| **Descripción del negocio para GBP** (250–750 caracteres) | Campo obligatorio de la ficha. Debe sonar a la persona, no a plantilla; es lo que lee el cliente antes de escribir. | Negas |
| **Sección "sobre el artista"** con trayectoria, formación, años tatuando | Señal E-E-A-T. Tatuar es YMYL parcial (perfora la piel): la experiencia demostrable pesa. No se puede inventar. | Negas |
| **Bioseguridad y esterilización** — protocolo real del estudio | Refuerza confianza y E-E-A-T en un servicio con riesgo sanitario. Debe reflejar lo que de verdad se hace. | Negas |
| **Meta description de `/privacidad` y `/cuidados`** — revisión | Existen y son válidas. Solo confirmar que no queden truncadas (<155 caracteres). | Negas |
| **Reseñas de clientes reales** (vía GBP) | `AggregateRating` en el schema **solo es legítimo si hay reseñas reales**. Nunca inventar `ratingValue`/`reviewCount`: es motivo de acción manual. Estrategia: pedir reseñas en GBP tras cada sesión. | clientes |

### 5.3 Lo que NO se debe generar nunca

- Reseñas o testimonios de cualquier tipo.
- `AggregateRating` sin reseñas verificables detrás.
- Posts de blog en masa sobre "significado de los tatuajes de X".
- Páginas de ubicación duplicadas para Medellín / Envigado / Itagüí sin presencia física en cada una (doorway pages — penalizable).
- FAQs adicionales que Negas no responda de verdad.

---

## 6. Plan de ejecución sugerido

| Orden | Acción | Bloquea a | Esfuerzo |
|---:|---|---|---|
| 1 | Verificar/arreglar P0-4 (`cleanUrls`) | todo lo demás | 5 min |
| 2 | Recolectar los datos de §5.1 (dirección, teléfono, geo, GBP) | 3, 5 | Negas |
| 3 | `robots.txt` + `sitemap.xml` | indexación | 20 min |
| 4 | JSON-LD de §4.1 en la home | rich results, local | 30 min |
| 5 | Crear/reclamar y completar Google Business Profile | paquete local | Negas |
| 6 | Autoalojar imágenes + convertir a WebP/AVIF + `width`/`height` + `srcset` | imágenes, CWV | 2–3 h |
| 7 | Fallback HTML o SSR de la galería (P1-1) | indexación de piezas | 2 h |
| 8 | Página `/contacto` con NAP completo | local | Negas + 1 h |
| 9 | `ImageObject` de galería + columnas `img_width`/`img_height` | Google Imágenes | 1 h |
| 10 | Alts únicos, pieza por pieza | imágenes | Negas |
| 11 | Limpieza P2/P3 (preconnect, defer, H2 en `#estilos`, og/twitter, breadcrumbs) | CWV, social | 1 h |

---

## 7. Comandos de verificación post-fix

```bash
# Indexabilidad
curl -sI https://negas.tattoo/                | grep -iE 'HTTP|x-robots'
curl -sI https://negas.tattoo/cuidados        | grep -iE 'HTTP|x-robots'
curl -sI https://negas.tattoo/privacidad      | grep -iE 'HTTP|x-robots'
curl -sI https://negas.tattoo/cotizar         | grep -iE 'HTTP|x-robots'
curl -sI https://negas.tattoo/admin           | grep -iE 'HTTP|x-robots'   # debe decir noindex
curl -s  https://negas.tattoo/robots.txt      | head
curl -s  https://negas.tattoo/sitemap.xml     | head

# Schema
curl -s https://negas.tattoo/ | grep -c 'application/ld+json'   # esperado: >= 1
curl -s https://negas.tattoo/ | grep -o '<<[^>]*>>'             # esperado: vacío

# Canonicals
curl -s https://negas.tattoo/cotizar | grep -o '<link rel="canonical"[^>]*>'

# Galería sin JS (¿hay algo indexable?)
curl -s https://negas.tattoo/ | grep -c '<img'
```

Después: Search Console → Inspección de URL → "Probar URL publicada" → pestaña **HTML renderizado**, y confirmar que las piezas de la galería aparecen.

---

## 8. Apéndice — RESUELTO EL 2026-07-26

Ejecución del plan de la §6 en la rama `claude/negas-seo-audit-execution-68341k`.
Los datos del negocio **no se inventaron**: donde faltan quedaron tokens `<<...>>`,
listados en [`PENDIENTE-NEGAS.md`](./PENDIENTE-NEGAS.md).

Leyenda: ✅ resuelto · 🟡 código listo, falta un dato o una acción de Negas · ⬜ no abordado

### P0

| # | Estado | Qué se hizo |
|---|:--:|---|
| P0-1 | ✅ | `public/robots.txt`: permite todo salvo `/admin` y `/api`, declara el sitemap |
| P0-2 | ✅ | `public/sitemap.xml` con `/`, `/contacto`, `/cuidados`, `/privacidad`. Sin `/cotizar` (se canonicaliza a `/`) ni `/admin` |
| P0-3 | ✅ | `@graph` activo en `index.html` con los datos reales. **Adaptado a un service-area business**: sin `streetAddress`, sin `geo` y sin `hasMap`, porque no hay dirección pública. `BreadcrumbList` en `/cuidados`, `/privacidad` y `/contacto`; `ImageGallery` generado en runtime |
| P0-4 | ✅ | `"cleanUrls": true` en `vercel.json`. **Solo eso** — los enlaces y canonicals se dejaron sin `.html`. La verificación con `curl` no se pudo correr: la política de red del entorno devuelve 403 para `negas.tattoo`. El diagnóstico estático es concluyente: sin `cleanUrls` y con output `public`, `/cuidados` y `/privacidad` no resuelven |
| P0-5 | ✅ | `+573337589442` en HTML rastreable con `<a href="tel:">` en el footer de `index.html` y en `/contacto`. Convive con el flujo `js-wa`, no lo reemplaza |
| P0-6 | ✅ | **No aplica como se planteó**: es un estudio privado sin dirección pública, en Google figura como servicio a domicilio. El `PostalAddress` declara localidad, región, `055450` y país; el resto lo cubre `areaServed`. En el HTML queda la nota «la dirección se indica una vez agendada la cita» |

### P1

| # | Estado | Qué se hizo |
|---|:--:|---|
| P1-1 | ⬜ | Fallback HTML/SSR de la galería — fuera del alcance de esta ejecución. Mitigado en parte: el `ImageGallery` JSON-LD sí describe las 20 piezas |
| P1-2 | 🟡 | `scripts/migrate-images.mjs` listo (descarga → WebP q82 → 480/1080 → bucket `gallery` → SQL `UPDATE`). No se pudo ejecutar: la red del entorno bloquea `i.ibb.co` (403). Instrucciones en `PENDIENTE-NEGAS.md` §6 |
| P1-3 | ✅ | Enlace a la ficha (`share.google/Q0QXb30nNSbFShhjb`) en el footer de `index.html`, en `/contacto` y en `sameAs`. Sin `hasMap`: no hay pin público. TikTok `@negasva` añadido a `sameAs` |
| P1-4 | ✅ | `public/contacto.html` creada: NAP, `tel:`, WhatsApp, correo, mapa embebido, horario y `BreadcrumbList`. Ruta añadida a `server.js`, al sitemap, a robots y al footer de las tres páginas |
| P1-5 | 🟡 | La conversión a WebP la hace el script de P1-2 |
| P1-6 | ✅ | `srcset` de dos variantes + `sizes="(max-width: 640px) 50vw, 33vw"` en `renderGallery()`. Se activa solo en las piezas ya migradas (`-1080.webp`) |
| P1-7 | ⬜ | Alts únicos: los escribe Negas, pieza por pieza. El campo ya es obligatorio al subir (P2-6) |

### P2

| # | Estado | Qué se hizo |
|---|:--:|---|
| P2-1 | ✅ | `defer` en los dos `<script>` de GSAP |
| P2-2 | ✅ | `preconnect` a `fonts.gstatic.com` y `connect.facebook.net` en las 4 páginas, más `i.ibb.co` en `index.html` (temporal, hasta migrar la galería) |
| P2-3 | ✅ | `<h2>Estilos</h2>` en `#estilos` + regla `.svc-section-title` |
| P2-4 | ✅ | El lightbox toma el `alt` de la pieza abierta (`openLightbox(src, el, alt)`) |
| P2-5 | ✅ | Columnas `img_width` / `img_height` en `gallery_images`, expuestas por `/api/gallery` y volcadas a `width`/`height` del `<img>` |
| P2-6 | ✅ | El `alt` es obligatorio al subir pieza en `/admin`; el mismo flujo lee las medidas del archivo con `new Image()` |
| P2-7 | ✅ | `twitter:card` + `og:image` en `cuidados.html` |
| P2-8 | ✅ | `og:type/url/title/description/image` + `twitter:card` en `privacidad.html` |
| P2-9 | ✅ | `<meta name="robots" content="index, follow">` en `index.html` |
| P2-10 | ⬜ | Los `js-wa` con `href="#"` se dejaron tal cual: el teléfono ya existe en HTML rastreable por otra vía, y tocarlos rompería el tracking de origen |
| P2-11 | ✅ | El header `X-Robots-Tag` pasó de `source: "/admin"` a `"/admin(.*)"`: cubre `/admin/` y `/admin/index.html` |
| P2-12 | ✅ | Breadcrumbs visibles + `BreadcrumbList` en `/cuidados`, `/privacidad` y `/contacto` |
| P2-13 | ✅ | Ambas enlazan ahora a `/`, `/#work` y `/contacto` |

### P3

| # | Estado | Qué se hizo |
|---|:--:|---|
| P3-1 | ✅ | `<meta name="keywords">` eliminado |
| P3-2 | ✅ | `lang="es-CO"` en las cuatro páginas públicas |
| P3-3 | ✅ | `apple-touch-icon` y `theme-color` en las cuatro. Sin `manifest.json` (no hay caso de uso de PWA) |
| P3-4 | 🟡 | `og:site_name`, `og:locale` y `og:image:alt` en `index.html`. **Sin `og:image:width/height`**: el `og:image` es una pieza vertical del portafolio, no un 1200×630, y no se inventan medidas. Falta una imagen social propia |
| P3-5 | ⬜ | `twitter:title/description/image` siguen heredando de `og:` — funciona, no se añadió duplicación |
| P3-6 | ⬜ | `Cache-Control` sin tocar, **a propósito**: `immutable` sin versionado en los nombres de archivo cachearía un año un `style.css` cambiado. Anotado en `PENDIENTE-NEGAS.md` §7 |
| P3-7 | ⬜ | www → apex: configuración de DNS/Vercel, no de repo |
| P3-8 | ✅ | `/cotizar` sigue autocanonicalizándose a `/` y queda fuera del sitemap |

### Lo que deliberadamente NO se hizo

- **Nada de copy.** Ni descripciones, ni reseñas, ni alts de las piezas: §5 dice que lo escribe Negas.
- **Ningún dato del negocio inventado** — dirección, teléfono, coordenadas, GBP, pagos y horario quedaron como `<<...>>`.
- **Sin `AggregateRating`** (necesita reseñas reales) y **sin `FAQPage` / `HowTo`** (rich results retirados o restringidos por Google).

### Health score tras la ejecución

**73 / 100** al abrir la PR, **85 / 100** tras incorporar los datos que aportó
Negas (teléfono, horario, pagos, ficha de Google, TikTok) y activar el JSON-LD.
Antes: 31. Sube a ~**92** cuando se corran la migración de imágenes y los alts
únicos.

| Área | Peso | Antes | Ahora | Nota |
|---|---:|---:|---:|---|
| Indexabilidad y rastreo | 20 | 4 | 17 | robots + sitemap + `cleanUrls` + `/admin(.*)` noindex. Las piezas siguen sin fallback HTML (P1-1) |
| Datos estructurados | 20 | 0 | 18 | `@graph` completo y activo, breadcrumbs e `ImageGallery`. Sin `AggregateRating` hasta que haya reseñas reales |
| SEO local / Maps | 20 | 5 | 15 | NAP real, ficha enlazada, horario y área de cobertura. Falta verificar y completar la ficha de Google |
| Imágenes | 15 | 6 | 10 | `srcset`, `width`/`height` y schema listos; falta ejecutar el WebP y los alts únicos |
| Metadatos técnicos | 10 | 7 | 10 | las cuatro páginas completas |
| Rendimiento / CWV | 10 | 6 | 8 | `defer` + `preconnect`; el peso de las imágenes sigue pendiente |
| Headings y enlazado | 5 | 3 | 5 | H2 en `#estilos`, breadcrumbs, callejones sin salida cerrados |
