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

## Después de desplegar esta versión — 3 pasos obligatorios

### 1. Correr la migración de base de datos

Supabase → **SQL Editor** → pega y ejecuta `migrations/001-leads-y-galeria.sql`.

Sin esto el cotizador falla al guardar y la galería sale vacía.

### 2. Cambiar el número de WhatsApp

El número **no está en el código**: sale de la variable de entorno `WHATSAPP_PHONE`.
En el panel de tu hosting, ponla en:

```
WHATSAPP_PHONE=573337589442
```

### 3. Verificar el flujo

- Abre `https://negas.tattoo/cotizar` → el popup debe abrir solo.
- Completa el paso 1 → debe aparecer un lead con etapa **Incompleta** en `/admin`.
- Termina la cotización → el mismo lead pasa a **Completa** con el rango de precio.

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

- **Meta Pixel** `1467646508235189`: va directo en el `<head>` de cada página pública.
- **Google Ads / GA4**: se activan solos cuando rellenes `GOOGLE_ADS_ID`,
  `GOOGLE_ADS_CONVERSION_LABEL` y `GA4_MEASUREMENT_ID` en el `.env`.

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

## Keep-alive de Supabase

Para evitar la pausa por inactividad, apunta un monitor externo (UptimeRobot) a:

```
GET https://negas.tattoo/api/keepalive
```

Usa `SUPABASE_SERVICE_ROLE_KEY`, así que esa variable debe existir en el servidor.
Las tablas que consulta se configuran con `SUPABASE_KEEPALIVE_TABLES`.

---

## Notas de mantenimiento

- La landing **ya no depende del CDN de Tailwind**: todo el CSS es propio
  (`public/style.css`). El panel `/admin` sí lo sigue usando.
- El SDK de Supabase se carga con `import()` dinámico y solo al subir una imagen.
  Antes se importaba arriba del archivo, y si el CDN fallaba se caía el cotizador entero.
- Si GSAP no carga, la página se muestra igual (hay respaldo y una red de
  seguridad a los 3 segundos).
