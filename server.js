require('dotenv').config();

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

// LOG TEMPORAL — borrar cuando el bug esté resuelto
app.use((req, _res, next) => { console.log('[DEBUG]', req.method, req.url); next(); });

// Nada de credenciales escritas en el codigo. Todo sale del entorno.
// Si falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY, /api/health lo dice.
const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const SUPABASE_KEEPALIVE_TABLES = (process.env.SUPABASE_KEEPALIVE_TABLES || 'leads,gallery_images')
  .split(',')
  .map((table) => table.trim())
  .filter(Boolean);

// El pixel de Meta es un identificador publico (va en el HTML de cualquier
// sitio que lo use), pero lo servimos desde el entorno igual para no dejarlo
// escrito en el repositorio.
const META_PIXEL_ID = (process.env.META_PIXEL_ID || '').trim();

// reCAPTCHA v3 (validacion server-side)
const RECAPTCHA_SITE_KEY = (process.env.RECAPTCHA_SITE_KEY || '').trim();
const RECAPTCHA_SECRET_KEY = (process.env.RECAPTCHA_SECRET_KEY || '').trim();
const RECAPTCHA_MIN_SCORE = Number(process.env.RECAPTCHA_MIN_SCORE) || 0.5;

// Correos autorizados para el panel admin. Vacio = cualquier usuario autenticado
// de Supabase puede administrar. Rellenar en produccion.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

// Parametros de precio: editables por variables de entorno para poder ajustar
// tarifas sin volver a desplegar. El frontend los recibe via /api/config.
const PRICING = {
  base: Number(process.env.PRICE_BASE) || 90000,
  perCmSmall: Number(process.env.PRICE_PER_CM_SMALL) || 38000,
  perCmLarge: Number(process.env.PRICE_PER_CM_LARGE) || 52000,
  breakpointCm: Number(process.env.PRICE_BREAKPOINT_CM) || 15,
  minimum: Number(process.env.PRICE_MINIMUM) || 180000,
  rangeLow: Number(process.env.PRICE_RANGE_LOW) || 0.95,
  rangeHigh: Number(process.env.PRICE_RANGE_HIGH) || 1.25,
  maxCm: Number(process.env.PRICE_MAX_CM) || 60
};

const GALLERY_CATEGORIES = ['Blackwork', 'Botánico', 'Fineline'];
const GALLERY_SPANS = ['', 'gal-cs2', 'gal-rs2', 'gal-cs2rs2'];

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;

const corsOptions = {
  origin(origin, callback) {
    const isLocalOrigin = typeof origin === 'string' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3780,http://127.0.0.1:3780,https://negas.tattoo').split(',').map(o => o.trim());

    if (!origin || isLocalOrigin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    console.warn('CORS blocked origin:', origin);
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
  optionsSuccessStatus: 200,
  maxAge: 86400
};

// Detras de un proxy/CDN (Cloudflare, etc.) para que el rate-limit lea la IP real.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS) || 1);

// Limitador general para endpoints publicos de solo lectura.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  limit: Number(process.env.RATE_LIMIT_API) || 200,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiadas solicitudes. Intenta de nuevo mas tarde.' }
});

// Paso 1 del cotizador: captura de nombre + WhatsApp. Es el endpoint mas
// atractivo para spam, pero tampoco puede ser tan estricto que bloquee
// reintentos legitimos de la misma persona.
const leadStartLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  limit: Number(process.env.RATE_LIMIT_LEAD_START) || 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'Has enviado demasiadas solicitudes. Espera un momento antes de intentar de nuevo.' }
});

// Paso final: ya viene autorizado por leadId + token, asi que puede ser mas laxo.
const leadCompleteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_LEAD_COMPLETE) || 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiadas solicitudes. Intenta de nuevo mas tarde.' }
});

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
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com', 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net', 'https://www.google.com', 'https://www.gstatic.com', 'https://connect.facebook.net', 'https://www.googletagmanager.com'],
      'script-src-elem': ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com', 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net', 'https://www.google.com', 'https://www.gstatic.com', 'https://connect.facebook.net', 'https://www.googletagmanager.com'],
      'script-src-attr': ["'unsafe-inline'"],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'img-src': ["'self'", 'data:', 'blob:', 'https://*.supabase.co', 'https://i.ibb.co', 'https://*.ibb.co', 'https://www.facebook.com', 'https://www.google.com', 'https://www.google.com.co', 'https://googleads.g.doubleclick.net'],
      'connect-src': ["'self'", 'https://*.supabase.co', 'https://cdn.jsdelivr.net', 'https://www.google.com', 'https://connect.facebook.net', 'https://www.facebook.com', 'https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com', 'https://googleads.g.doubleclick.net'],
      'worker-src': ["'self'", 'blob:'],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
      'frame-src': ["'self'", 'https://www.google.com', 'https://td.doubleclick.net', 'https://www.facebook.com'],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'", 'https://www.facebook.com'],
    }
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

app.use(express.json({ limit: '100kb' }));
app.use(express.static(PUBLIC_PATH, { index: false }));

// ─── Rutas de paginas ────────────────────────────────────────────────────────
// /cotizar sirve la misma landing. El frontend detecta el pathname y abre el
// popup de cotizacion automaticamente. Asi tenemos una URL real para Google Ads
// sin duplicar contenido ni mantener dos paginas separadas.
const sendIndex = (_req, res) => res.sendFile(path.join(PUBLIC_PATH, 'index.html'));

app.get('/', sendIndex);
app.get('/cotizar', sendIndex);

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(PUBLIC_PATH, 'admin', 'index.html'));
});

app.get('/privacidad', (_req, res) => {
  res.sendFile(path.join(PUBLIC_PATH, 'privacidad.html'));
});

app.get('/cuidados', (_req, res) => {
  res.sendFile(path.join(PUBLIC_PATH, 'cuidados.html'));
});

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
    recaptchaSiteKey: RECAPTCHA_SITE_KEY,
    metaPixelId: META_PIXEL_ID,
    googleAdsId: (process.env.GOOGLE_ADS_ID || '').trim(),
    googleAdsConversionLabel: (process.env.GOOGLE_ADS_CONVERSION_LABEL || '').trim(),
    ga4Id: (process.env.GA4_MEASUREMENT_ID || '').trim(),
    pricing: PRICING
  });
});

// ─── Diagnostico ─────────────────────────────────────────────────────────────
// Abre /api/health y te dice exactamente que falta configurar. Sin esto,
// un fallo de base de datos se ve solo como "No pudimos guardar tus datos".
app.get('/api/health', apiLimiter, async (_req, res) => {
  const checks = {
    SUPABASE_URL: Boolean(SUPABASE_URL),
    SUPABASE_ANON_KEY: Boolean(SUPABASE_ANON_KEY),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(SUPABASE_SERVICE_ROLE_KEY),
    WHATSAPP_PHONE: Boolean((process.env.WHATSAPP_PHONE || '').trim()),
    RECAPTCHA_SITE_KEY: Boolean(RECAPTCHA_SITE_KEY),
    RECAPTCHA_SECRET_KEY: Boolean(RECAPTCHA_SECRET_KEY),
    META_PIXEL_ID: Boolean(META_PIXEL_ID)
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
    clave_service_role: describeServiceKey(),
    base_de_datos: db,
    pendientes
  });
});

// ─── Diagnostico profundo ────────────────────────────────────────────────────
// /api/health solo hace SELECTs, y un SELECT bloqueado por RLS devuelve una
// lista vacia SIN error: por eso puede salir todo verde mientras el INSERT
// falla. Este endpoint hace el INSERT de verdad (la misma fila que manda
// /api/lead/start), borra la fila de prueba y devuelve el error crudo de
// Postgres: codigo, mensaje, details y hint.
//
//   https://negas.tattoo/api/health/insert
//
// Si defines HEALTH_DEBUG_KEY en Vercel, hay que llamarlo con ?key=ESE_VALOR.
app.get('/api/health/insert', apiLimiter, async (req, res) => {
  const debugKey = (process.env.HEALTH_DEBUG_KEY || '').trim();
  if (debugKey && String(req.query.key || '') !== debugKey) {
    return res.status(403).json({ ok: false, error: 'Clave de diagnostico incorrecta.' });
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ ok: false, error: 'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.' });
  }

  const now = new Date().toISOString();
  const probeToken = `health-probe-${crypto.randomBytes(8).toString('hex')}`;
  const fila = {
    name: 'PRUEBA DIAGNOSTICO',
    phone: '3000000000',
    email: null,
    description: null,
    reference_img_url: null,
    status: 'lead',
    stage: 'partial',
    consent: true,
    consent_at: now,
    update_token: probeToken,
    source: 'health-probe',
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    created_at: now
  };

  const { data, error } = await supabaseAdmin
    .from('leads')
    .insert([fila])
    .select('id')
    .single();

  if (error) {
    // Traducimos los codigos de Postgres/PostgREST mas comunes a algo accionable.
    const pistas = {
      '23502': 'Hay una columna NOT NULL en `leads` que el servidor no esta enviando. Mira el campo "column" del error y ponle un DEFAULT o quitale el NOT NULL.',
      '23514': 'Un CHECK de la tabla rechaza los valores que manda el servidor (status = "lead", stage = "partial"). Ajusta el CHECK o los valores.',
      '23505': 'Hay un indice UNIQUE que se esta violando (probablemente sobre phone). Es esperable si ya existe ese numero.',
      '42501': 'PERMISO DENEGADO: la peticion esta pasando por RLS. Casi seguro SUPABASE_SERVICE_ROLE_KEY en Vercel NO tiene la service role key, sino la anon/publishable key. Copiala de Supabase → Settings → API → service_role (secret) y vuelve a desplegar.',
      '42703': 'Falta una columna en `leads`. Vuelve a correr migrations/EJECUTAR-ESTE-EN-SUPABASE.sql.',
      '42P01': 'La tabla `leads` no existe en el esquema public.',
      'PGRST204': 'PostgREST no encuentra una columna en su cache de esquema. Supabase → Settings → API → "Reload schema cache", o vuelve a correr la migracion.',
      'PGRST301': 'JWT invalido o expirado: revisa el valor de SUPABASE_SERVICE_ROLE_KEY.'
    };

    return res.status(500).json({
      ok: false,
      paso: 'insert',
      clave_service_role: describeServiceKey(),
      error: {
        code: error.code || null,
        message: error.message || null,
        details: error.details || null,
        hint: error.hint || null
      },
      diagnostico: pistas[error.code] || 'Codigo no catalogado. El campo error.message de arriba dice exactamente que rechazo Postgres.'
    });
  }

  // El INSERT funciono: limpiamos la fila de prueba.
  const cleanup = await supabaseAdmin.from('leads').delete().eq('id', data.id);

  return res.json({
    ok: true,
    clave_service_role: describeServiceKey(),
    mensaje: 'El INSERT en `leads` funciona correctamente. El formulario deberia guardar.',
    fila_de_prueba_borrada: !cleanup.error,
    aviso_limpieza: cleanup.error ? cleanup.error.message : null,
    siguiente_paso: 'Si el formulario sigue fallando, el error esta en reCAPTCHA o en la validacion. Revisa los Runtime Logs de Vercel al enviar el formulario.'
  });
});

// Mira el rol que declara SUPABASE_SERVICE_ROLE_KEY sin revelar la clave.
// Una service role key legitima es un JWT cuyo payload trae role="service_role"
// (o una clave nueva con prefijo sb_secret_). Si aqui sale "anon", esa es la
// causa: RLS se aplica y todos los INSERT se bloquean.
function describeServiceKey() {
  const key = SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return { presente: false };

  if (key.startsWith('sb_secret_')) return { presente: true, formato: 'sb_secret', rol: 'service_role', correcta: true };
  if (key.startsWith('sb_publishable_')) {
    return { presente: true, formato: 'sb_publishable', rol: 'anon', correcta: false,
      problema: 'Es la clave PUBLICA. Necesitas la secreta (sb_secret_...).' };
  }

  const parts = key.split('.');
  if (parts.length !== 3) return { presente: true, formato: 'desconocido', correcta: false, problema: 'No parece un JWT ni una clave sb_secret_.' };

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
    const rol = payload.role || null;
    return {
      presente: true,
      formato: 'jwt',
      rol,
      correcta: rol === 'service_role',
      problema: rol === 'service_role'
        ? null
        : `El JWT declara role="${rol}". Vercel tiene la clave equivocada en SUPABASE_SERVICE_ROLE_KEY: copia la de Supabase → Settings → API → service_role (secret) y vuelve a desplegar.`
    };
  } catch (_) {
    return { presente: true, formato: 'jwt-ilegible', correcta: false, problema: 'No se pudo leer el payload del JWT.' };
  }
}

// Mantiene el proyecto de Supabase despierto: los proyectos gratuitos se
// pausan tras ~7 dias sin actividad. Lo llama el cron de Vercel a diario.
//
// A proposito NO falla si una tabla no existe: con que UNA responda, el
// proyecto ya cuenta como activo. Antes bastaba una tabla borrada para que
// el keepalive devolviera 500 y dejara de cumplir su unica funcion.
app.get('/api/keepalive', apiLimiter, async (_req, res) => {
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
});

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

// Recalcula el precio en el servidor. Nunca confiamos en el rango que manda el
// cliente: el navegador puede alterarlo y quedaria un precio falso en la base.
function computePriceRange(sizeCm) {
  const cm = Math.max(0, Math.min(Number(sizeCm) || 0, PRICING.maxCm));
  if (!cm) return { min: 0, max: 0, label: '' };

  const small = Math.min(cm, PRICING.breakpointCm) * PRICING.perCmSmall;
  const large = Math.max(0, cm - PRICING.breakpointCm) * PRICING.perCmLarge;
  const point = Math.max(PRICING.minimum, PRICING.base + small + large);

  const round = (n) => Math.round(n / 10000) * 10000;
  const min = round(point * PRICING.rangeLow);
  const max = round(point * PRICING.rangeHigh);

  return {
    min,
    max,
    label: `$${min.toLocaleString('es-CO')} - $${max.toLocaleString('es-CO')}`
  };
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
app.post('/api/lead/start', leadStartLimiter, async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(500).json({ ok: false, error: 'Servicio no disponible temporalmente.' });
  }

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

  const forceCreate = body.forceCreate === true;
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
      const isDuplicate = error.code === '23505' || (error.message && error.message.toLowerCase().includes('unique'));
      if (isDuplicate && !forceCreate) {
        return res.status(200).json({ ok: true, duplicate: true });
      }
      if (isDuplicate && forceCreate) {
        // Constraint still exists: reuse existing lead, refresh its token so this session works
        const newToken = crypto.randomBytes(24).toString('hex');
        const { data: existing, error: fetchErr } = await supabaseAdmin
          .from('leads')
          .select('id')
          .eq('phone', phone)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        if (fetchErr || !existing) throw fetchErr || new Error('Lead not found');
        await supabaseAdmin.from('leads').update({ update_token: newToken, name, email: email || null }).eq('id', existing.id);
        return res.status(200).json({ ok: true, leadId: existing.id, token: newToken });
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
app.post('/api/lead/complete', leadCompleteLimiter, async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(500).json({ ok: false, error: 'Servicio no disponible temporalmente.' });
  }

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
  if (referenceImgUrl && !/^https?:\/\//i.test(referenceImgUrl)) {
    referenceImgUrl = '';
  }

  const price = computePriceRange(sizeCm);

  try {
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
  } catch (error) {
    console.error('Lead complete failed:', error.message);
    return res.status(500).json({ ok: false, error: 'No se pudo guardar tu cotizacion. Intenta de nuevo.' });
  }
});

// ─── Galeria publica ─────────────────────────────────────────────────────────
app.get('/api/gallery', apiLimiter, async (_req, res) => {
  if (!supabaseAdmin) {
    return res.status(500).json({ ok: false, error: 'Servicio no disponible temporalmente.' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('gallery_images')
      .select('id,url,category,alt,span,sort_order')
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });

    if (error) throw error;

    res.set('Cache-Control', 'public, max-age=60');
    return res.json({ ok: true, images: data || [] });
  } catch (error) {
    console.error('Gallery fetch failed:', error.message);
    return res.status(500).json({ ok: false, error: 'No se pudo cargar la galeria.' });
  }
});

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
    if (ADMIN_EMAILS.length && !ADMIN_EMAILS.includes(email)) {
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

  if (body.category !== undefined || !partial) {
    const category = str(body.category, 40);
    if (!GALLERY_CATEGORIES.includes(category)) errors.push('category');
    else out.category = category;
  }

  if (body.span !== undefined) {
    const span = str(body.span, 20);
    if (!GALLERY_SPANS.includes(span)) errors.push('span');
    else out.span = span;
  }

  if (body.alt !== undefined) out.alt = str(body.alt, 200) || null;
  if (body.sort_order !== undefined) out.sort_order = Number(body.sort_order) || 0;
  if (body.active !== undefined) out.active = Boolean(body.active);

  return { payload: out, errors };
}

app.get('/api/admin/gallery', requireAdmin, async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('gallery_images')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });

    if (error) throw error;
    return res.json({ ok: true, images: data || [] });
  } catch (error) {
    console.error('Admin gallery fetch failed:', error.message);
    return res.status(500).json({ ok: false, error: 'No se pudo cargar la galeria.' });
  }
});

app.post('/api/admin/gallery', requireAdmin, async (req, res) => {
  const { payload, errors } = sanitizeGalleryPayload(req.body || {});
  if (errors.length) {
    return res.status(400).json({ ok: false, error: 'Datos invalidos.', fields: errors });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('gallery_images')
      .insert([{ active: true, sort_order: 0, span: '', ...payload }])
      .select('*')
      .single();

    if (error) throw error;
    return res.status(201).json({ ok: true, image: data });
  } catch (error) {
    console.error('Gallery insert failed:', error.message);
    return res.status(500).json({ ok: false, error: 'No se pudo guardar la imagen.' });
  }
});

app.patch('/api/admin/gallery/:id', requireAdmin, async (req, res) => {
  const { payload, errors } = sanitizeGalleryPayload(req.body || {}, { partial: true });
  if (errors.length) {
    return res.status(400).json({ ok: false, error: 'Datos invalidos.', fields: errors });
  }
  if (!Object.keys(payload).length) {
    return res.status(400).json({ ok: false, error: 'Nada que actualizar.' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('gallery_images')
      .update(payload)
      .eq('id', req.params.id)
      .select('*')
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ ok: false, error: 'Imagen no encontrada.' });
    return res.json({ ok: true, image: data });
  } catch (error) {
    console.error('Gallery update failed:', error.message);
    return res.status(500).json({ ok: false, error: 'No se pudo actualizar la imagen.' });
  }
});

app.delete('/api/admin/gallery/:id', requireAdmin, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('gallery_images')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    return res.json({ ok: true });
  } catch (error) {
    console.error('Gallery delete failed:', error.message);
    return res.status(500).json({ ok: false, error: 'No se pudo eliminar la imagen.' });
  }
});

app.use((_req, res) => res.status(404).send('Not Found'));

// En Vercel este archivo se importa desde api/index.js y NO debe abrir un
// puerto (las funciones serverless no escuchan). Con `node server.js` en un
// servidor normal sí abre el puerto, como siempre.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      console.warn('⚠  Falta SUPABASE_SERVICE_ROLE_KEY — revisa /api/health');
    }
  });
}

module.exports = app;
