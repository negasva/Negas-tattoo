# Negas Tattoo — Instrucciones del proyecto

## USO OBLIGATORIO DE SKILLS

**Siempre usar las skills instaladas en `.claude/skills/`. No es opcional.**

Antes de empezar cualquier tarea, revisar la lista de skills y activar las que
apliquen. Si una skill cubre la tarea, se usa esa skill en vez de improvisar.

### Ponytail — obligatoria en TODO trabajo de código

Toda tarea de código (escribir, agregar, refactorizar, arreglar, revisar,
diseñar, elegir librerías) se hace bajo la skill `ponytail`:

- La solución más simple y corta que funciona. YAGNI.
- Librería estándar y features nativas antes que dependencias nuevas.
- Una línea antes que cincuenta.
- Nivel por defecto: `full`. Usar `lite` o `ultra` si se pide.

Skills relacionadas: `ponytail-review`, `ponytail-audit`, `ponytail-debt`,
`ponytail-gain`, `ponytail-help`.

### SEO — obligatoria en TODO trabajo de contenido, marketing o páginas públicas

Cualquier cambio que toque HTML público, textos, metadatos, imágenes,
sitemap, schema, rendimiento o posicionamiento se hace bajo la skill `seo`
y sus sub-skills:

| Tarea | Skill |
| --- | --- |
| Auditoría general del sitio | `seo`, `seo-audit` |
| Página concreta (title, meta, headings) | `seo-page` |
| Técnico (crawl, indexación, Core Web Vitals) | `seo-technical` |
| Schema / datos estructurados | `seo-schema` |
| Contenido y briefs | `seo-content`, `seo-content-brief` |
| Negocio local, Google Maps / GBP | `seo-local`, `seo-maps` |
| Imágenes | `seo-images`, `seo-image-gen` |
| Sitemap y robots | `seo-sitemap` |
| IA / AI Overviews / ChatGPT / Perplexity | `seo-geo` |
| Search Console, GA4, PageSpeed | `seo-google` |
| Backlinks | `seo-backlinks` |
| Competencia | `seo-competitor-pages`, `seo-drift` |
| Plan y clusters de keywords | `seo-plan`, `seo-cluster`, `seo-flow` |
| UX orientado a búsqueda | `seo-sxo` |
| Multi-idioma | `seo-hreflang` |
| Páginas programáticas | `seo-programmatic` |
| E-commerce | `seo-ecommerce` |

Negas Tattoo es un negocio local (estudio de tatuajes): priorizar
`seo-local`, `seo-maps` y schema `LocalBusiness` / `TattooParlor`.

### Runtime de claude-seo

Los scripts Python van por el lanzador, nunca con `python` directo:

```bash
.claude/skills/seo/bin/claude-seo setup     # primera vez (crea .venv local)
.claude/skills/seo/bin/claude-seo doctor    # diagnóstico
.claude/skills/seo/bin/claude-seo run <script.py> [args]
```

El `.venv` y los datos del runtime no se versionan (ver `.gitignore`).

### Agentes

Los subagentes SEO están en `.claude/agents/` y se pueden usar para trabajo
paralelo (`seo-technical`, `seo-local`, `seo-schema`, etc.).

## Origen de las skills

- `ponytail` — https://github.com/DietrichGebert/ponytail (MIT)
- `seo*` — https://github.com/AgricIDaniel/claude-seo · https://claude-seo.md (MIT)

Las extensiones de pago de claude-seo (DataForSEO, Ahrefs, SE Ranking,
Firecrawl, Profound, Bing, Unlighthouse, Banana) no se instalaron: requieren
claves de API. Instalarlas desde el repo original si hacen falta.

## Stack del proyecto

Node/Express (`server.js`), API en `api/`, frontend estático en `public/`,
migraciones SQL en `migrations/`, despliegue en Vercel (`vercel.json`).
Ver `README.md` y `SEGURIDAD-INSTRUCCIONES.md`.
