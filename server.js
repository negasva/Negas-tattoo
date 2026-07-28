const crypto = require('crypto');
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = Number(process.env.PORT) || 3780;
const PUBLIC_PATH = path.join(__dirname, 'public');

// Nada de credenciales escritas en el codigo. Todo sale del entorno.
// Si falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY, /api/health lo dice.
const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const SUPABASE_KEEPALIVE_TABLES = ['leads', 'gallery_images'];

// El pixel de Meta es un identificador publico (va en el HTML de cualquier
// sitio que lo use), pero lo servimos desde el entorno igual para no dejarlo
// escrito en el repositorio.
const META_PIXEL_ID = (process.env.META_PIXEL_ID || '').trim();

// reCAPTCHA v3 (validacion server-side)
const RECAPTCHA_SITE_KEY = (process.env.RECAPTCHA_SITE_KEY || '').trim();
const RECAPTCHA_SECRET_KEY = (process.env.RECAPTCHA_SECRET_KEY || '').trim();
const RECAPTCHA_MIN_SCORE = Number(process.env.RECAPTCHA_MIN_SCORE) || 0.5;

// Correos autorizados para el panel admin. OBLIGATORIA: si queda vacia nadie
// puede administrar, ni siquiera un usuario autenticado de Supabase.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

// Parametros de precio. Estuvieron detras de nueve variables de entorno "para
// ajustar tarifas sin desplegar"; ninguna se configuro nunca en ningun entorno,
// asi que las nueve caian siempre al mismo default. El frontend los recibe via
// /api/config. Cambiar una tarifa es cambiar este objeto y desplegar.
const PRICING = {
  base: 90000,
  perCmSmall: 38000,
  perCmLarge: 52000,
  breakpointCm: 15,
  minimum: 180000,
  rangeLow: 0.95,
  rangeHigh: 1.25,
  maxCm: 60
};

// Unica definicion de las categorias y los tamanos de la galeria: aqui se
// validan (/api/admin/gallery) y desde aqui se sirven al panel admin por
// /api/config. Estaban repetidos en el admin.
const GALLERY_CATEGORIES = ['Blackwork', 'Botánico', 'Fineline'];
const GALLERY_SPANS = [
  { value: '', label: 'Normal (1×1)' },
  { value: 'gal-cs2', label: 'Ancha (2×1)' },
  { value: 'gal-rs2', label: 'Alta (1×2)' },
  { value: 'gal-cs2rs2', label: 'Grande (2×2)' }
];
const GALLERY_SPAN_VALUES = GALLERY_SPANS.map((span) => span.value);

// Buckets privados: contienen datos personales (fotos del cuerpo del cliente,
// cedulas, documentos de acudientes de menores). No se sirven por URL publica;
// el admin los ve con URLs firmadas de una hora.
const PRIVATE_BUCKETS = ['reference-images', 'signed-documents'];
const SIGNED_URL_TTL = 3600;

// Forma canonica de un objeto de `reference-images`. Es lo unico que
// /api/lead/complete acepta en reference_img_url.
const REFERENCE_IMAGE_PREFIX = `${SUPABASE_URL}/storage/v1/object/reference-images/`;

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;

// El allowlist y el comodin de localhost se calculan una vez, no en cada request.
// El comodin es para desarrollo: en produccion solo valen los origenes de
// ALLOWED_ORIGINS; si no, la pagina local de un atacante podria leer respuestas
// de la API real.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3780,http://127.0.0.1:3780,https://negas.tattoo')
  .split(',')
  .map((origin) => origin.trim());
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
const ALLOW_LOCAL_ORIGINS = process.env.NODE_ENV !== 'production';

const corsOptions = {
  origin(origin, callback) {
    const isLocalOrigin = ALLOW_LOCAL_ORIGINS && typeof origin === 'string' && LOCAL_ORIGIN.test(origin);

    if (!origin || isLocalOrigin || ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    console.warn('CORS blocked origin:', origin);
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
  maxAge: 86400
};

// Detras de un proxy/CDN (Cloudflare, etc.) para que el rate-limit lea la IP real.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS) || 1);

const TOO_MANY = 'Demasiadas solicitudes. Intenta de nuevo mas tarde.';
const limiter = (limit, windowMs, message = TOO_MANY) => rateLimit({
  windowMs,
  limit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: message }
});

// General para endpoints publicos de solo lectura.
const apiLimiter = limiter(Number(process.env.RATE_LIMIT_API) || 200, 15 * 60 * 1000);

// Paso 1 del cotizador: captura de nombre + WhatsApp. Es el endpoint mas
// atractivo para spam, pero tampoco puede ser tan estricto que bloquee
// reintentos legitimos de la misma persona.
const leadStartLimiter = limiter(
  Number(process.env.RATE_LIMIT_LEAD_START) || 10,
  60 * 60 * 1000,
  'Has enviado demasiadas solicitudes. Espera un momento antes de intentar de nuevo.'
);

// Paso final: ya viene autorizado por leadId + token, asi que puede ser mas laxo.
const leadCompleteLimiter = limiter(Number(process.env.RATE_LIMIT_LEAD_COMPLETE) || 30, 60 * 60 * 1000);

// La CSP se declara aqui y se REPITE literalmente en vercel.json, porque el
// CDN de Vercel sirve el HTML y el estatico sin pasar por Express: sin esa
// copia, las paginas se entregan en produccion sin ninguna cabecera.
// Si tocas esto, toca tambien vercel.json (`npm test` compara las dos).
// Sin 'unsafe-inline' en script-src: no queda ni un script inline en public/.
const CSP_SCRIPT_SRC = ["'self'", 'https://cdn.tailwindcss.com', 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net', 'https://www.google.com', 'https://www.gstatic.com', 'https://connect.facebook.net', 'https://www.googletagmanager.com'];
const CSP_DIRECTIVES = {
  'default-src': ["'self'"],
  'base-uri': ["'self'"],
  'font-src': ["'self'", 'https://fonts.gstatic.com'],
  'form-action': ["'self'", 'https://www.facebook.com'],
  'frame-ancestors': ["'none'"],
  'frame-src': ["'self'", 'https://www.google.com', 'https://td.doubleclick.net', 'https://www.facebook.com'],
  'img-src': ["'self'", 'data:', 'blob:', 'https://*.supabase.co', 'https://i.ibb.co', 'https://*.ibb.co', 'https://www.facebook.com', 'https://www.google.com', 'https://www.google.com.co', 'https://googleads.g.doubleclick.net'],
  'connect-src': ["'self'", 'https://*.supabase.co', 'https://cdn.jsdelivr.net', 'https://www.google.com', 'https://connect.facebook.net', 'https://www.facebook.com', 'https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com', 'https://googleads.g.doubleclick.net'],
  'object-src': ["'none'"],
  'script-src': CSP_SCRIPT_SRC,
  'script-src-attr': ["'none'"],
  'script-src-elem': CSP_SCRIPT_SRC,
  'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  'worker-src': ["'self'", 'blob:'],
  'upgrade-insecure-requests': []
};

// Misma serializacion que usa Helmet, para poder compararla con vercel.json.
const cspString = () => Object.entries(CSP_DIRECTIVES)
  .map(([key, values]) => [key, ...values].join(' '))
  .join('; ');

app.use(cors(corsOptions));
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  permissionsPolicy: {
    geolocation: [],
    microphone: [],
    camera: [],
    usb: [],
    magnetometer: [],
    gyroscope: [],
    accelerometer: [],
    paymentHandler: []
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  contentSecurityPolicy: {
    useDefaults: false,
    directives: CSP_DIRECTIVES
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

app.use(express.json({ limit: '100kb' }));
// `extensions: ['html']` sirve /privacidad y /cuidados sin la extension, e
// index.html para / y /admin. Reemplaza las cinco rutas sendFile que habia
// aqui. /cotizar lo reescribe vercel.json a /index.html en produccion.
app.use(express.static(PUBLIC_PATH, { extensions: ['html'] }));

// La unica ruta de pagina que sobrevive: /cotizar no tiene archivo propio (es
// la misma landing, el frontend detecta el pathname y abre el popup). En
// produccion la reescribe vercel.json y esto no llega a ejecutarse; en local
// sin esta linea la URL de Google Ads da 404.
app.get('/cotizar', (_req, res) => res.sendFile(path.join(PUBLIC_PATH, 'index.html')));

// ─── Helpers de ruta ─────────────────────────────────────────────────────────
// Express 4 no captura los rechazos de un handler async: sin esto, un fallo de
// Supabase (DNS, timeout, socket) deja la request colgada hasta el timeout de
// Vercel. asyncRoute manda el error al handler global con el mensaje que ve el
// usuario, y ahi se responde y se loguea una sola vez.
const asyncRoute = (message, handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch((error) => {
    error.publicMessage = message;
    next(error);
  });

// Las rutas que hablan con Supabase no tienen nada que hacer sin credenciales.
const requireSupabase = (_req, res, next) => {
  if (!supabaseAdmin) {
    return res.status(500).json({ ok: false, error: 'Servicio no disponible temporalmente.' });
  }
  return next();
};

// Configuracion publica del frontend. Aqui solo van valores que de todas
// formas terminan en el navegador: la anon key de Supabase (protegida por
// RLS), la site key de reCAPTCHA y los IDs de medicion. Los secretos de
// verdad (service role, secret de reCAPTCHA) NUNCA salen de aqui.
app.get('/api/config', apiLimiter, (_req, res) => {
  res.json({
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
    waPhone: (process.env.WHATSAPP_PHONE || '').trim(),
    instagramUrl: (process.env.INSTAGRAM_URL || '').trim(),
    facebookUrl: (process.env.FACEBOOK_URL || '').trim(),
    tiktokUrl: (process.env.TIKTOK_URL || '').trim(),
    recaptchaSiteKey: RECAPTCHA_SITE_KEY,
    metaPixelId: META_PIXEL_ID,
    googleAdsId: (process.env.GOOGLE_ADS_ID || '').trim(),
    googleAdsConversionLabel: (process.env.GOOGLE_ADS_CONVERSION_LABEL || '').trim(),
    googleAdsConversionLabelCompleta: (process.env.GOOGLE_ADS_CONVERSION_LABEL_COMPLETA || '').trim(),
    ga4Id: (process.env.GA4_MEASUREMENT_ID || '').trim(),
    pricing: PRICING,
    gallery: { categories: GALLERY_CATEGORIES, spans: GALLERY_SPANS }
  });
});

// ─── Diagnostico ─────────────────────────────────────────────────────────────
// Dice exactamente que falta configurar. Como enumera proveedores, tablas y
// errores crudos de Postgres, no es publico: sin HEALTH_DEBUG_KEY definida en
// el entorno y repetida en ?key=, el endpoint no existe.
app.get('/api/health', apiLimiter, asyncRoute('No se pudo completar el diagnostico.', async (req, res) => {
  const debugKey = (process.env.HEALTH_DEBUG_KEY || '').trim();
  if (!debugKey || String(req.query.key || '') !== debugKey) {
    return res.status(404).send('Not Found');
  }

  const checks = {
    SUPABASE_URL: Boolean(SUPABASE_URL),
    SUPABASE_ANON_KEY: Boolean(SUPABASE_ANON_KEY),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(SUPABASE_SERVICE_ROLE_KEY),
    WHATSAPP_PHONE: Boolean((process.env.WHATSAPP_PHONE || '').trim()),
    RECAPTCHA_SITE_KEY: Boolean(RECAPTCHA_SITE_KEY),
    RECAPTCHA_SECRET_KEY: Boolean(RECAPTCHA_SECRET_KEY),
    META_PIXEL_ID: Boolean(META_PIXEL_ID),
    ADMIN_EMAILS: ADMIN_EMAILS.length
  };

  const db = { tabla_leads: null, columnas_nuevas_de_leads: null, tabla_gallery_images: null };
  const pendientes = [];

  if (supabaseAdmin) {
    const leads = await supabaseAdmin.from('leads').select('id').limit(1);
    db.tabla_leads = leads.error ? `ERROR: ${leads.error.message}` : 'ok';

    // Si falta una sola de estas columnas, el paso 1 del cotizador falla.
    const cols = await supabaseAdmin
      .from('leads')
      .select('id,stage,consent,update_token,estimated_min,estimated_max,estimated_price')
      .limit(1);
    db.columnas_nuevas_de_leads = cols.error ? `FALTAN: ${cols.error.message}` : 'ok';

    const gallery = await supabaseAdmin.from('gallery_images').select('id').limit(1);
    db.tabla_gallery_images = gallery.error ? `ERROR: ${gallery.error.message}` : 'ok';

    if (cols.error || gallery.error) {
      pendientes.push('Ejecuta migrations/EJECUTAR-ESTE-EN-SUPABASE.sql en el SQL Editor de Supabase.');
    }
  } else {
    pendientes.push('Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en las variables de entorno.');
  }

  Object.entries(checks).forEach(([key, present]) => {
    if (!present) pendientes.push(`Falta la variable de entorno ${key}.`);
  });

  const ok = pendientes.length === 0;
  res.status(ok ? 200 : 503).json({
    ok,
    variables: checks,
    base_de_datos: db,
    pendientes
  });
}));

// Mantiene el proyecto de Supabase despierto: los proyectos gratuitos se
// pausan tras ~7 dias sin actividad. Lo llama el cron de Vercel a diario.
//
// A proposito NO falla si una tabla no existe: con que UNA responda, el
// proyecto ya cuenta como activo. Antes bastaba una tabla borrada para que
// el keepalive devolviera 500 y dejara de cumplir su unica funcion.
app.get('/api/keepalive', apiLimiter, asyncRoute('No se pudo tocar la base.', async (req, res) => {
  // Solo el cron. Vercel manda `Authorization: Bearer $CRON_SECRET` cuando la
  // variable esta definida. Sin CRON_SECRET no entra nadie: falla cerrado.
  const cronSecret = (process.env.CRON_SECRET || '').trim();
  if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ ok: false, error: 'No autorizado.' });
  }
  // Aqui NO va requireSupabase: la autorizacion se comprueba primero, para no
  // contarle el estado de la configuracion a quien no trae el secreto del cron.
  if (!supabaseAdmin) {
    return res.status(500).json({
      ok: false,
      error: 'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.'
    });
  }

  const touched = [];
  const failed = [];

  for (const table of SUPABASE_KEEPALIVE_TABLES) {
    try {
      const { error } = await supabaseAdmin.from(table).select('id', { head: true }).limit(1);
      if (error) failed.push(`${table}: ${error.message}`);
      else touched.push(table);
    } catch (error) {
      failed.push(`${table}: ${error.message}`);
    }
  }

  const ok = touched.length > 0;
  if (!ok) console.error('Keepalive failed on every table:', failed);

  return res.status(ok ? 200 : 500).json({
    ok,
    timestamp: new Date().toISOString(),
    touched,
    failed
  });
}));

// ─── reCAPTCHA ───────────────────────────────────────────────────────────────
// Verifica un token de reCAPTCHA v3 contra la API de Google.
// Devuelve { ok, score, reason } sin lanzar excepciones hacia el handler.
async function verifyRecaptcha(token, remoteIp, expectedAction) {
  if (!RECAPTCHA_SECRET_KEY) {
    // Sin secret configurado no podemos validar: fallamos cerrado.
    return { ok: false, reason: 'recaptcha-not-configured' };
  }
  if (!token || typeof token !== 'string') {
    return { ok: false, reason: 'missing-token' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const params = new URLSearchParams({ secret: RECAPTCHA_SECRET_KEY, response: token });
    if (remoteIp) params.append('remoteip', remoteIp);

    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: controller.signal
    });

    const data = await response.json();

    if (!data.success) {
      return { ok: false, reason: 'verification-failed', score: data.score };
    }
    if (expectedAction && data.action && data.action !== expectedAction) {
      return { ok: false, reason: 'action-mismatch', score: data.score };
    }
    if (typeof data.score === 'number' && data.score < RECAPTCHA_MIN_SCORE) {
      return { ok: false, reason: 'low-score', score: data.score };
    }

    return { ok: true, score: data.score };
  } catch (error) {
    console.error('reCAPTCHA verification error:', error.name === 'AbortError' ? 'timeout' : error.message);
    return { ok: false, reason: 'verification-error' };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const str = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0
});

// Recalcula el precio en el servidor. Nunca confiamos en el rango que manda el
// cliente: el navegador puede alterarlo y quedaria un precio falso en la base.
//
// ⚠ Esta funcion esta duplicada a proposito en script.js (el slider necesita
// feedback en vivo sin ida y vuelta al servidor). Aqui esta la verdad: misma
// formula y mismo `label` en los dos lados. Si cambias uno, cambia el otro.
function computePriceRange(sizeCm) {
  const cm = Math.max(0, Math.min(Number(sizeCm) || 0, PRICING.maxCm));
  if (!cm) return { min: 0, max: 0, label: '' };

  const small = Math.min(cm, PRICING.breakpointCm) * PRICING.perCmSmall;
  const large = Math.max(0, cm - PRICING.breakpointCm) * PRICING.perCmLarge;
  const point = Math.max(PRICING.minimum, PRICING.base + small + large);

  const round = (n) => Math.round(n / 10000) * 10000;
  const min = round(point * PRICING.rangeLow);
  const max = round(point * PRICING.rangeHigh);

  return { min, max, label: `${COP.format(min)} - ${COP.format(max)}` };
}

// Colombia: 10 digitos empezando por 3. Aceptamos que venga con el 57 delante.
function normalizePhone(raw) {
  let digits = str(String(raw ?? ''), 20).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('57')) digits = digits.slice(2);
  return digits;
}

// ─── Paso 1: captura del lead ────────────────────────────────────────────────
// Se guarda apenas la persona da nombre y WhatsApp, ANTES de ver el precio.
// Ese es el punto del rediseno: si abandona en el paso 2 o 3, el contacto ya
// esta en la base y se puede recuperar por WhatsApp o por retargeting.
app.post('/api/lead/start', leadStartLimiter, requireSupabase, async (req, res) => {
  const body = req.body || {};

  const captcha = await verifyRecaptcha(body.recaptchaToken, req.ip, 'lead_start');
  if (!captcha.ok) {
    console.warn('Lead start blocked by reCAPTCHA:', captcha.reason, 'score:', captcha.score);
    return res.status(403).json({ ok: false, error: 'No pudimos verificar que seas humano. Recarga la pagina e intenta de nuevo.' });
  }

  const name = str(body.name, 120);
  const phone = normalizePhone(body.phone);
  const email = str(body.email, 200);

  const errors = [];
  if (name.length < 2) errors.push('name');
  if (!/^3\d{9}$/.test(phone)) errors.push('phone');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('email');
  if (body.consent !== true) errors.push('consent');

  if (errors.length) {
    return res.status(400).json({ ok: false, error: 'Revisa los datos e intenta de nuevo.', fields: errors });
  }

  const updateToken = crypto.randomBytes(24).toString('hex');
  const now = new Date().toISOString();

  const lead = {
    name,
    phone,
    email: email || null,
    description: null,
    reference_img_url: null,
    status: 'lead',
    stage: 'partial',
    consent: true,
    consent_at: now,
    update_token: updateToken,
    source: str(body.source, 60) || 'web',
    utm_source: str(body.utm_source, 80) || null,
    utm_medium: str(body.utm_medium, 80) || null,
    utm_campaign: str(body.utm_campaign, 120) || null,
    created_at: now
  };

  try {
    const { data, error } = await supabaseAdmin
      .from('leads')
      .insert([lead])
      .select('id')
      .single();

    if (error) {
      // Un telefono repetido NO da acceso al lead de esa persona: nunca se
      // devuelve su id ni se le reescribe el update_token. Y respondemos lo
      // mismo que en un alta normal para no confirmar si el numero ya existe.
      //
      // Solo puede pasar si la tabla tiene un UNIQUE sobre phone; la migracion
      // lo quita para que una recotizacion sea simplemente una fila nueva.
      const isDuplicate = error.code === '23505' || (error.message && error.message.toLowerCase().includes('unique'));
      if (isDuplicate) {
        console.warn('Lead start: UNIQUE sobre phone todavia activo. Corre la migracion.');
        return res.status(200).json({ ok: true });
      }
      throw error;
    }

    return res.status(201).json({ ok: true, leadId: data.id, token: updateToken });
  } catch (error) {
    // Log detallado: sin el code/details, en los Runtime Logs de Vercel solo
    // se veia un mensaje generico imposible de diagnosticar.
    console.error('Lead start failed:', JSON.stringify({
      code: error.code || null,
      message: error.message || null,
      details: error.details || null,
      hint: error.hint || null
    }));
    return res.status(500).json({ ok: false, error: 'No pudimos guardar tus datos. Intenta de nuevo.' });
  }
});

// ─── Paso final: completar la cotizacion ─────────────────────────────────────
// Autorizado por leadId + update_token para que nadie pueda sobrescribir el
// lead de otra persona conociendo solo un id secuencial.
app.post('/api/lead/complete', leadCompleteLimiter, requireSupabase, asyncRoute('No se pudo guardar tu cotizacion. Intenta de nuevo.', async (req, res) => {
  const body = req.body || {};
  const leadId = str(String(body.leadId ?? ''), 40);
  const token = str(body.token, 80);
  const description = str(body.description, 500);
  const sizeCm = Math.max(0, Math.min(Number(body.sizeCm) || 0, PRICING.maxCm));
  let referenceImgUrl = str(body.reference_img_url, 600);

  if (!leadId || !token) {
    return res.status(400).json({ ok: false, error: 'Sesion de cotizacion invalida. Recarga la pagina.' });
  }
  if (description.length < 5) {
    return res.status(400).json({ ok: false, error: 'Cuentame un poco mas sobre tu idea.' });
  }
  if (!sizeCm) {
    return res.status(400).json({ ok: false, error: 'Selecciona el tamano aproximado.' });
  }
  // Solo aceptamos una URL de nuestro propio Storage. Cualquier otra cosa es
  // un campo controlado por el cliente guardado como dato de negocio.
  if (referenceImgUrl && !referenceImgUrl.startsWith(REFERENCE_IMAGE_PREFIX)) {
    referenceImgUrl = '';
  }

  const price = computePriceRange(sizeCm);

  const { data, error } = await supabaseAdmin
    .from('leads')
    .update({
      description,
      size: `${sizeCm}cm`,
      estimated_min: price.min,
      estimated_max: price.max,
      estimated_price: price.label,
      reference_img_url: referenceImgUrl || null,
      stage: 'complete',
      completed_at: new Date().toISOString()
    })
    .eq('id', leadId)
    .eq('update_token', token)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return res.status(403).json({ ok: false, error: 'Sesion de cotizacion invalida. Recarga la pagina.' });
  }

  return res.json({ ok: true, price });
}));

// ─── Galeria publica ─────────────────────────────────────────────────────────
app.get('/api/gallery', apiLimiter, requireSupabase, asyncRoute('No se pudo cargar la galeria.', async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('gallery_images')
    .select('id,url,category,categories,alt,span,sort_order,img_width,img_height')
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });

  if (error) throw error;

  res.set('Cache-Control', 'public, max-age=60');
  return res.json({ ok: true, images: data || [] });
}));

// ─── Galeria: administracion ─────────────────────────────────────────────────
// Autenticado con el JWT de Supabase que ya usa el panel admin para iniciar
// sesion. Se verifica server-side; el navegador nunca toca la service role key.
async function requireAdmin(req, res, next) {
  if (!supabaseAdmin) {
    return res.status(500).json({ ok: false, error: 'Servicio no disponible temporalmente.' });
  }

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    return res.status(401).json({ ok: false, error: 'No autorizado.' });
  }

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ ok: false, error: 'Sesion expirada. Vuelve a entrar.' });
    }

    const email = (data.user.email || '').toLowerCase();
    // Falla cerrado: lista vacia = nadie entra. Antes, ADMIN_EMAILS sin
    // rellenar convertia en administrador a cualquier usuario registrado.
    // El mensaje distingue los dos casos: sin esto, "no tienes permisos" para
    // el unico dueno del estudio no dice que lo que falta es la env var.
    if (!ADMIN_EMAILS.length) {
      return res.status(403).json({
        ok: false,
        error: 'El servidor no tiene ADMIN_EMAILS configurada: nadie puede administrar.'
      });
    }
    if (!ADMIN_EMAILS.includes(email)) {
      return res.status(403).json({ ok: false, error: 'Esta cuenta no tiene permisos de administrador.' });
    }

    req.adminUser = data.user;
    return next();
  } catch (error) {
    console.error('Admin auth failed:', error.message);
    return res.status(401).json({ ok: false, error: 'No autorizado.' });
  }
}

function sanitizeGalleryPayload(body, { partial = false } = {}) {
  const out = {};
  const errors = [];

  if (body.url !== undefined || !partial) {
    const url = str(body.url, 600);
    if (!/^https?:\/\//i.test(url)) errors.push('url');
    else out.url = url;
  }

  // Multi-etiqueta: una pieza puede ser Blackwork y Botanico a la vez.
  // `categories` es la fuente de verdad; `category` (la columna vieja) se
  // mantiene sincronizada con la primera para no romper lo que ya la lee.
  const rawCategories = Array.isArray(body.categories)
    ? body.categories
    : body.categories !== undefined ? []
    : body.category !== undefined ? [body.category]
    : null;

  if (rawCategories || !partial) {
    const list = [...new Set((rawCategories || []).map((value) => str(value, 40)))]
      .filter((value) => GALLERY_CATEGORIES.includes(value));

    if (!list.length) errors.push('categories');
    else {
      out.categories = list;
      out.category = list[0];
    }
  }

  if (body.span !== undefined) {
    const span = str(body.span, 20);
    if (!GALLERY_SPAN_VALUES.includes(span)) errors.push('span');
    else out.span = span;
  }

  if (body.alt !== undefined) out.alt = str(body.alt, 200) || null;
  if (body.img_width !== undefined) out.img_width = Number(body.img_width) || null;
  if (body.img_height !== undefined) out.img_height = Number(body.img_height) || null;
  if (body.sort_order !== undefined) out.sort_order = Number(body.sort_order) || 0;
  if (body.active !== undefined) out.active = Boolean(body.active);

  return { payload: out, errors };
}

app.get('/api/admin/gallery', requireAdmin, asyncRoute('No se pudo cargar la galeria.', async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('gallery_images')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });

  if (error) throw error;
  return res.json({ ok: true, images: data || [] });
}));

app.post('/api/admin/gallery', requireAdmin, asyncRoute('No se pudo guardar la imagen.', async (req, res) => {
  const { payload, errors } = sanitizeGalleryPayload(req.body || {});
  if (errors.length) {
    return res.status(400).json({ ok: false, error: 'Datos invalidos.', fields: errors });
  }

  const { data, error } = await supabaseAdmin
    .from('gallery_images')
    .insert([{ active: true, sort_order: 0, span: '', ...payload }])
    .select('*')
    .single();

  if (error) throw error;
  return res.status(201).json({ ok: true, image: data });
}));

app.patch('/api/admin/gallery/:id', requireAdmin, asyncRoute('No se pudo actualizar la imagen.', async (req, res) => {
  const { payload, errors } = sanitizeGalleryPayload(req.body || {}, { partial: true });
  if (errors.length) {
    return res.status(400).json({ ok: false, error: 'Datos invalidos.', fields: errors });
  }
  if (!Object.keys(payload).length) {
    return res.status(400).json({ ok: false, error: 'Nada que actualizar.' });
  }

  const { data, error } = await supabaseAdmin
    .from('gallery_images')
    .update(payload)
    .eq('id', req.params.id)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  if (!data) return res.status(404).json({ ok: false, error: 'Imagen no encontrada.' });
  return res.json({ ok: true, image: data });
}));

app.delete('/api/admin/gallery/:id', requireAdmin, asyncRoute('No se pudo eliminar la imagen.', async (req, res) => {
  const { error } = await supabaseAdmin
    .from('gallery_images')
    .delete()
    .eq('id', req.params.id);

  if (error) throw error;
  return res.json({ ok: true });
}));

// ─── Leads: administracion ───────────────────────────────────────────────────
// El navegador ya no lee `leads` con la anon key: esa tabla tiene RLS activa
// y sin politicas, asi que solo la service role del servidor la ve. Todo pasa
// por aqui, detras del mismo requireAdmin que la galeria.

const LEAD_STATUSES = ['lead', 'client', 'recurring'];

// Los buckets privados no se sirven por URL: se firman por una hora.
async function signStoragePath(bucket, filePath) {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(filePath, SIGNED_URL_TTL);

  if (error) {
    console.error(`Signed URL failed for ${bucket}:`, error.message);
    return null;
  }
  return data.signedUrl;
}

// Saca la ruta del objeto para poder firmarla. Solo de nuestro propio Storage:
// acepta la forma canonica y la publica antigua (los leads guardados cuando el
// bucket todavia era publico), y nada mas.
const referencePath = (url) => {
  const value = String(url || '');
  const prefixes = [REFERENCE_IMAGE_PREFIX, REFERENCE_IMAGE_PREFIX.replace('/object/', '/object/public/')];
  const prefix = prefixes.find((p) => value.startsWith(p));
  return prefix ? value.slice(prefix.length) || null : null;
};

app.get('/api/admin/leads', requireAdmin, asyncRoute('No se pudieron cargar los leads.', async (req, res) => {
  const onlyDeleted = String(req.query.deleted || '') === '1';

  let query = supabaseAdmin.from('leads').select('*').order('created_at', { ascending: false });
  query = onlyDeleted ? query.not('deleted_at', 'is', null) : query.is('deleted_at', null);

  const { data, error } = await query;
  if (error) throw error;

  // La foto de referencia sale firmada, nunca como URL permanente.
  const leads = await Promise.all((data || []).map(async (lead) => {
    const filePath = referencePath(lead.reference_img_url);
    return { ...lead, reference_img_url: filePath ? await signStoragePath('reference-images', filePath) : null };
  }));

  return res.json({ ok: true, leads });
}));

// Contamos en Postgres (head + count exacto), no trayendo las filas enteras.
app.get('/api/admin/stats', requireAdmin, asyncRoute('No se pudieron cargar las estadisticas.', async (_req, res) => {
  const countLeads = (build) => build(
    supabaseAdmin.from('leads').select('id', { count: 'exact', head: true }).is('deleted_at', null)
  );

  const [total, clients, recurring, complete] = await Promise.all([
    countLeads((q) => q),
    countLeads((q) => q.eq('status', 'client')),
    countLeads((q) => q.eq('status', 'recurring')),
    countLeads((q) => q.eq('stage', 'complete'))
  ]);

  const firstError = [total, clients, recurring, complete].find((r) => r.error);
  if (firstError) throw firstError.error;

  const totalLeads = total.count || 0;
  const converted = (clients.count || 0) + (recurring.count || 0);

  return res.json({
    ok: true,
    stats: {
      totalLeads,
      totalClients: clients.count || 0,
      recurringClients: recurring.count || 0,
      completedQuotes: complete.count || 0,
      conversionRate: totalLeads ? Math.round((converted / totalLeads) * 100) : 0
    }
  });
}));

app.patch('/api/admin/leads/:id/status', requireAdmin, asyncRoute('No se pudo actualizar el estado.', async (req, res) => {
  const status = str((req.body || {}).status, 20);
  if (!LEAD_STATUSES.includes(status)) {
    return res.status(400).json({ ok: false, error: 'Estado invalido.' });
  }

  const { data, error } = await supabaseAdmin
    .from('leads')
    .update({ status })
    .eq('id', req.params.id)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  if (!data) return res.status(404).json({ ok: false, error: 'Lead no encontrado.' });
  return res.json({ ok: true });
}));

// Borrado logico de verdad: antes solo se marcaba en el localStorage del
// navegador, asi que el lead reaparecia en otro equipo y no habia forma de
// atender una solicitud de supresion (Ley 1581).
const setDeletedAt = (deleted) => asyncRoute('No se pudo completar la operacion.', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('leads')
    .update({ deleted_at: deleted ? new Date().toISOString() : null })
    .eq('id', req.params.id)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  if (!data) return res.status(404).json({ ok: false, error: 'Lead no encontrado.' });
  return res.json({ ok: true });
});

app.delete('/api/admin/leads/:id', requireAdmin, setDeletedAt(true));
app.post('/api/admin/leads/:id/restore', requireAdmin, setDeletedAt(false));

// URL firmada para los buckets privados (documentos firmados, cedulas de
// acudientes). Solo esos dos: nada de firmar rutas arbitrarias.
app.post('/api/admin/signed-url', requireAdmin, async (req, res) => {
  const { bucket, path: filePath } = req.body || {};
  if (!PRIVATE_BUCKETS.includes(bucket) || !str(filePath, 400)) {
    return res.status(400).json({ ok: false, error: 'Bucket o ruta invalidos.' });
  }

  const url = await signStoragePath(bucket, str(filePath, 400));
  if (!url) return res.status(404).json({ ok: false, error: 'Archivo no encontrado.' });
  return res.json({ ok: true, url });
});

// Error handler global: unico sitio donde se loguea y se responde un 500.
// El mensaje que ve el usuario lo pone asyncRoute en cada ruta.
app.use((error, req, res, _next) => {
  console.error(`${req.method} ${req.path} failed:`, error.message);
  res.status(500).json({ ok: false, error: error.publicMessage || 'Servicio no disponible temporalmente.' });
});

// En Vercel este archivo se importa desde api/index.js y NO debe abrir un
// puerto (las funciones serverless no escuchan). Con `node server.js` en un
// servidor normal sí abre el puerto, como siempre.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      console.warn('⚠  Falta SUPABASE_SERVICE_ROLE_KEY — revisa /api/health');
    }
    if (!ADMIN_EMAILS.length) {
      console.warn('⚠  Falta ADMIN_EMAILS — el panel /admin devolvera 403 a todo el mundo');
    }
  });
}

// Para scripts/selfcheck.js (`npm test`): la CSP se compara con la copia de
// vercel.json, y las reglas de reference_img_url se prueban con asserts.
app.cspString = cspString;
app.referenceImagePrefix = REFERENCE_IMAGE_PREFIX;
app.referencePath = referencePath;

module.exports = app;
