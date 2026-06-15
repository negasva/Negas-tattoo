require('dotenv').config();

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = Number(process.env.PORT) || 3780;
const PUBLIC_PATH = path.join(__dirname, 'public');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qiyfydnwdwygbrpavdjb.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_KEEPALIVE_TABLES = (process.env.SUPABASE_KEEPALIVE_TABLES || 'leads,signed_documents')
  .split(',')
  .map((table) => table.trim())
  .filter(Boolean);

// reCAPTCHA v3 (validacion server-side)
const RECAPTCHA_SITE_KEY = (process.env.RECAPTCHA_SITE_KEY || '').trim();
const RECAPTCHA_SECRET_KEY = (process.env.RECAPTCHA_SECRET_KEY || '').trim();
const RECAPTCHA_MIN_SCORE = Number(process.env.RECAPTCHA_MIN_SCORE) || 0.5;
const RECAPTCHA_EXPECTED_ACTION = (process.env.RECAPTCHA_EXPECTED_ACTION || 'submit_quote').trim();
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
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
  optionsSuccessStatus: 200,
  maxAge: 86400
};

// Detras de un proxy/CDN (Cloudflare, etc.) para que el rate-limit lea la IP real.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS) || 1);

// Limitador general para endpoints publicos de solo lectura (/api/config, /api/keepalive)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  limit: Number(process.env.RATE_LIMIT_API) || 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiadas solicitudes. Intenta de nuevo mas tarde.' }
});

// Limitador estricto para el envio de cotizaciones (anti-spam de leads)
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  limit: Number(process.env.RATE_LIMIT_SUBMIT) || 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'Has enviado demasiadas cotizaciones. Espera un momento antes de intentar de nuevo.' }
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
      'script-src': ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com', 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net'],
      'script-src-elem': ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com', 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net'],
      'script-src-attr': ["'unsafe-inline'"],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'img-src': ["'self'", 'data:', 'blob:', 'https://*.supabase.co', 'https://i.ibb.co', 'https://*.ibb.co'],
      'connect-src': ["'self'", 'https://qiyfydnwdwygbrpavdjb.supabase.co', 'https://cdn.jsdelivr.net'],
      'worker-src': ["'self'", 'blob:'],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
      'frame-src': ["'self'"],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
    }
  },
  referrerPolicy: { policy: 'no-referrer' }
}));

app.use(express.json({ limit: '100kb' }));
app.use(express.static(PUBLIC_PATH, { index: false }));

app.get('/', (_req, res) => {
  res.sendFile(path.join(PUBLIC_PATH, 'index.html'));
});

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(PUBLIC_PATH, 'admin', 'index.html'));
});

app.get('/api/config', apiLimiter, (_req, res) => {
  res.json({
    waPhone: (process.env.WHATSAPP_PHONE || '').trim(),
    instagramUrl: (process.env.INSTAGRAM_URL || '').trim(),
    facebookUrl: (process.env.FACEBOOK_URL || '').trim(),
    recaptchaSiteKey: RECAPTCHA_SITE_KEY
  });
});

app.get('/api/keepalive', apiLimiter, async (_req, res) => {
  if (!supabaseAdmin) {
    return res.status(500).json({
      ok: false,
      error: 'SUPABASE_SERVICE_ROLE_KEY is not configured'
    });
  }

  try {
    const touched = [];

    for (const table of SUPABASE_KEEPALIVE_TABLES) {
      const { error } = await supabaseAdmin
        .from(table)
        .select('id', { head: true })
        .limit(1);

      if (error) {
        throw new Error(`Keepalive query failed for table "${table}": ${error.message}`);
      }

      touched.push(table);
    }

    return res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      touched
    });
  } catch (error) {
    console.error('Keepalive failed:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Keepalive failed'
    });
  }
});

// Verifica un token de reCAPTCHA v3 contra la API de Google.
// Devuelve { ok, score, reason } sin lanzar excepciones hacia el handler.
async function verifyRecaptcha(token, remoteIp) {
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
    if (RECAPTCHA_EXPECTED_ACTION && data.action && data.action !== RECAPTCHA_EXPECTED_ACTION) {
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

// Normaliza y valida los datos del lead. Nunca confia en `status` ni `created_at`
// que vengan del cliente: se fijan en el servidor.
function sanitizeLead(body) {
  const str = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

  const name = str(body.name, 120);
  const email = str(body.email, 200);
  const phone = str(body.phone, 20).replace(/\D/g, '');
  const tattoo_zone = str(body.tattoo_zone, 60);
  const size = str(body.size, 20);
  const description = str(body.description, 500);
  let reference_img_url = str(body.reference_img_url, 600);

  const errors = [];
  if (!name) errors.push('name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('email');
  if (phone.length < 7 || phone.length > 15) errors.push('phone');
  if (!tattoo_zone) errors.push('tattoo_zone');
  if (!size) errors.push('size');

  if (reference_img_url && !/^https?:\/\//i.test(reference_img_url)) {
    reference_img_url = '';
  }

  const lead = {
    name,
    email,
    phone,
    tattoo_zone,
    size,
    description,
    reference_img_url: reference_img_url || null,
    status: 'lead',
    created_at: new Date().toISOString()
  };

  return { lead, errors };
}

app.post('/api/submit-quote', submitLimiter, async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(500).json({ ok: false, error: 'Servicio no disponible temporalmente.' });
  }

  const body = req.body || {};
  const remoteIp = req.ip;

  // 1) Validar reCAPTCHA v3 antes de tocar la base de datos.
  const captcha = await verifyRecaptcha(body.recaptchaToken, remoteIp);
  if (!captcha.ok) {
    console.warn('Quote blocked by reCAPTCHA:', captcha.reason, 'score:', captcha.score);
    return res.status(403).json({ ok: false, error: 'No pudimos verificar que seas humano. Recarga la pagina e intenta de nuevo.' });
  }

  // 2) Sanitizar y validar el payload.
  const { lead, errors } = sanitizeLead(body);
  if (errors.length) {
    return res.status(400).json({ ok: false, error: 'Datos incompletos o invalidos.', fields: errors });
  }

  // 3) Insertar de forma segura con el service role key (server-side).
  try {
    const { error } = await supabaseAdmin.from('leads').insert([lead]);
    if (error) throw error;

    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error('Lead insert failed:', error.message);
    return res.status(500).json({ ok: false, error: 'No se pudo guardar la cotizacion. Intenta de nuevo.' });
  }
});

app.use((_req, res) => res.status(404).send('Not Found'));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
