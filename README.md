# Negas Tattoo

Landing y cotizador de negas.tattoo. Node + Express sirviendo estáticos, Supabase como base de datos.

---

## Puesta en marcha

```bash
npm install
cp .env.example .env    # rellena los valores
npm start               # http://localhost:3780
```

---

## Puesta en producción — 3 pasos obligatorios

### 1. Correr la migración de base de datos

Supabase → **SQL Editor** → **New query** → pega y ejecuta
`migrations/EJECUTAR-ESTE-EN-SUPABASE.sql`.

> Ese es el único archivo que va en el SQL Editor. Si pegas `public/supabase.js`
> (que empieza con `import`) obtendrás `42601: syntax error at or near "{"`.

Al terminar debe salir una fila con `TODO LISTO ✓`, `fotos_en_galeria = 20` y
`columnas_nuevas_de_6 = 6`.

Sin esto el cotizador falla al guardar y la galería usa el respaldo local.

### 2. Cargar las variables de entorno

Ninguna credencial está escrita en el código. En Vercel:
**Project Settings → Environment Variables**. La lista completa está en
`.env.example`; los valores te los pasaron por separado.

### 3. Verificar

Abre **`/api/health`**. Te dice exactamente qué falta:

```json
{ "ok": true, "variables": { ... }, "base_de_datos": { ... }, "pendientes": [] }
```

Si `ok` es `true`, prueba el flujo: `/cotizar` → completa el paso 1 → debe
aparecer un lead **Incompleta** en `/admin`; al terminar pasa a **Completa**.

---

## Cómo funciona la captura de leads

El cotizador guarda en **dos fases**:

| Momento | Endpoint | Qué guarda |
|---|---|---|
| Paso 1 (nombre + WhatsApp) | `POST /api/lead/start` | Crea el lead con `stage='partial'` y devuelve `leadId` + `token` |
| Envío final | `POST /api/lead/complete` | Añade idea, tamaño, rango y referencia. Pasa a `stage='complete'` |

La gracia está en la fase 1: si alguien abandona en el paso 2 o 3, **su WhatsApp ya
quedó guardado**. Esos son los leads marcados como *Incompleta* en el admin.

El precio se **recalcula siempre en el servidor**; nunca se confía en el valor que
manda el navegador.

---

## Rutas

| Ruta | Qué es |
|---|---|
| `/` | Landing |
| `/cotizar` | Misma landing con el popup abierto — **esta es la URL para Google Ads** |
| `/privacidad` | Política de tratamiento de datos (Ley 1581 de 2012) |
| `/cuidados` | Cuidados post-tatuaje |
| `/admin` | Panel: leads + galería |
| `/api/config` | Configuración pública (WhatsApp, redes, precios, IDs de medición) |
| `/api/gallery` | Portafolio público |
| `/api/health` | **Diagnóstico**: qué variable o tabla falta |
| `/api/keepalive` | Mantiene Supabase despierto (lo llama el cron de Vercel) |

---

## Ajustar precios sin desplegar

Todo sale de variables de entorno. La fórmula:

```
base + min(cm, 15) × PER_CM_SMALL + max(0, cm − 15) × PER_CM_LARGE
```

con piso en `PRICE_MINIMUM`, mostrado como rango `×RANGE_LOW` a `×RANGE_HIGH`
y redondeado a la decena de mil.

```
PRICE_BASE=90000
PRICE_PER_CM_SMALL=38000
PRICE_PER_CM_LARGE=52000
PRICE_BREAKPOINT_CM=15
PRICE_MINIMUM=180000
PRICE_RANGE_LOW=0.95
PRICE_RANGE_HIGH=1.25
```

Ejemplo a 12 cm: `90.000 + 456.000 = 546.000` → se muestra **$520.000 – $680.000**.

> Al quitar el selector de estilo desapareció el multiplicador de complejidad
> (blackwork y lettering iban ×1.2). Se compensó subiendo `PER_CM_SMALL` de
> 33.000 a 38.000 y `PER_CM_LARGE` de 45.000 a 52.000, para no bajar los precios
> de blackwork un 20 %.

---

## Medición

- **Meta Pixel**: el ID sale de `META_PIXEL_ID`. El HTML solo carga la librería
  y encola los eventos; `script.js` dispara `init` y `PageView` apenas llega
  `/api/config`. Así el ID no queda escrito en el repositorio.
- **Google Ads / GA4**: se activan solos cuando rellenes `GOOGLE_ADS_ID`,
  `GOOGLE_ADS_CONVERSION_LABEL` y `GA4_MEASUREMENT_ID`.

Eventos que se disparan:

| Evento | Cuándo |
|---|---|
| `AbrioCotizador` | Se abre el popup |
| `Lead` | Paso 1 guardado — **este es el que alimenta el retargeting** |
| `VioPrecio` | Mueve el slider y ve el rango |
| `SubmitApplication` | Cotización completa |
| `ClickWhatsApp` | Cualquier clic a WhatsApp |

Para retargeting en Meta: crea un público personalizado de quienes dispararon
`AbrioCotizador` pero **no** `SubmitApplication`.

---

## Galería editable

Las piezas viven en la tabla `gallery_images` y se administran desde `/admin` →
pestaña **Galería**. Se puede subir un archivo (va al bucket `gallery` de Supabase)
o pegar una URL. Cada pieza tiene etiqueta (Blackwork / Botánico / Fineline),
tamaño en la grilla, orden y visibilidad.

El orden es ascendente. Si todas las piezas comparten el mismo número, la galería
las baraja sola en cada visita.

---

## Despliegue en Vercel

- `api/[...path].js` reenvía todo `/api/*` a la app de Express. Vercel enruta
  ahí automáticamente por el nombre catch-all, conservando la ruta original.
- `server.js` solo abre puerto con `node server.js`; importado no escucha.
- `vercel.json` activa `cleanUrls` (así `/privacidad` sirve `privacidad.html`),
  reescribe `/cotizar` a `/index.html` y programa el cron.
- Los archivos de `public/` los sirve Vercel como estáticos desde el CDN.

Si los estáticos dan 404, pon **Output Directory = `public`** en la
configuración del proyecto.

## Keep-alive de Supabase

Los proyectos gratuitos de Supabase se pausan tras ~7 días sin actividad.
`vercel.json` incluye un cron **diario** contra `/api/keepalive`:

```json
"crons": [{ "path": "/api/keepalive", "schedule": "0 6 * * *" }]
```

Diario en vez de semanal a propósito: si el cron corriera cada 7 días, un solo
fallo dejaría el proyecto pasado del límite y las páginas caídas.

El endpoint consulta las tablas de `SUPABASE_KEEPALIVE_TABLES` y responde OK si
**al menos una** contesta, para que una tabla renombrada no lo inutilice.

Si no usas Vercel, apunta un monitor externo (UptimeRobot) a esa misma URL.

---

## Credenciales

**No hay ninguna escrita en el código.** `public/supabase.js` pide la URL y la
anon key a `/api/config`, que las lee del entorno.

Aviso honesto: la anon key sigue siendo visible en la pestaña Red del navegador
— es pública por diseño. Lo que se ganó es que ya no está en el repositorio de
GitHub, donde la indexan buscadores y bots. Lo que de verdad protege los datos
son las políticas RLS y que `SUPABASE_SERVICE_ROLE_KEY` jamás salga del servidor.

## Notas de mantenimiento

- La landing **ya no depende del CDN de Tailwind**: todo el CSS es propio
  (`public/style.css`). El panel `/admin` sí lo sigue usando.
- El SDK de Supabase se carga con `import()` dinámico y solo al subir una imagen.
  Antes se importaba arriba del archivo, y si el CDN fallaba se caía el cotizador entero.
- Si GSAP no carga, la página se muestra igual (hay respaldo y una red de
  seguridad a los 3 segundos).
- Si `/api/gallery` falla, el archivo muestra un respaldo con las 20 piezas
  originales en vez de quedar vacío. Si la API responde bien con una lista
  vacía, se respeta: significa que se borraron a propósito desde el admin.

## Skills de Claude instaladas

El repo trae skills en `.claude/skills/`. **Regla: siempre se usan.** Ver
[`CLAUDE.md`](CLAUDE.md).

- **ponytail** (+ `-review`, `-audit`, `-debt`, `-gain`, `-help`) — obligatoria
  en todo trabajo de código: la solución más simple que funciona, YAGNI, cero
  dependencias innecesarias. https://github.com/DietrichGebert/ponytail
- **seo** y 23 sub-skills (`seo-local`, `seo-maps`, `seo-schema`,
  `seo-technical`, `seo-content`, `seo-geo`, …) — obligatorias en todo trabajo
  de contenido, marketing o páginas públicas.
  https://github.com/AgricIDaniel/claude-seo · https://claude-seo.md

Primera vez que se usan los scripts SEO:

```bash
.claude/skills/seo/bin/claude-seo setup
```
