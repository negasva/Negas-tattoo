require('dotenv').config();

const REQUIRED_ENV = ['RECAPTCHA_SECRET_KEY', 'IMGBB_API_KEY', 'EMAILJS_SERVICE_ID', 'EMAILJS_TEMPLATE_ID', 'EMAILJS_PUBLIC_KEY'];
for (const v of REQUIRED_ENV) {
  if (!process.env[v]?.trim()) { console.error(`Missing required env var: ${v}`); process.exit(1); }
}

const express = require('express');
const multer = require('multer');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();

const PORT = Number(process.env.PORT) || 3780;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const REQUEST_TIMEOUT_MS = 12000;
const RECAPTCHA_MIN_SCORE = Number(process.env.RECAPTCHA_MIN_SCORE || 0.5);
const PUBLIC_PATH = path.join(__dirname, 'public');
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3780,http://127.0.0.1:3780,https://negas.tattoo')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

if (process.env.TRUST_PROXY) {
  app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : process.env.TRUST_PROXY);
}

const corsOptions = {
  origin(origin, callback) {
    const isLocalOrigin = typeof origin === 'string'
  && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);

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

const imageFileFilter = (_req, file, callback) => {
  const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
  if (!allowedTypes.has(file.mimetype)) {
    callback(new Error('INVALID_FILE_TYPE'));
    return;
  }

  callback(null, true);
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1
  },
  fileFilter: imageFileFilter
});

const configLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intenta de nuevo en un momento.' }
});

const captchaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiados intentos de verificacion.' }
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Se alcanzo el limite de carga de imagenes. Intenta mas tarde.' }
});

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Has enviado demasiadas solicitudes. Espera antes de reintentar.' }
});

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes.' }
});

app.use(cors(corsOptions));
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  contentSecurityPolicy: {
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com', 'https://cdnjs.cloudflare.com', 'https://www.google.com', 'https://www.gstatic.com', 'https://connect.facebook.net'],
      'script-src-attr': ["'none'"],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'img-src': ["'self'", 'data:', 'blob:', 'https://i.ibb.co', 'https://*.ibb.co'],
      'connect-src': ["'self'", 'https://api.imgbb.com', 'https://www.google.com', 'https://www.gstatic.com', 'https://www.facebook.com', 'https://api.emailjs.com', 'https://cdn.jsdelivr.net'],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
      'frame-src': ["'self'", 'https://www.google.com', 'https://recaptcha.google.com'],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'upgrade-insecure-requests': []
    }
  },
  referrerPolicy: { policy: 'no-referrer' }
}));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ limit: '100kb', extended: false }));
app.use(globalLimiter);
app.use(express.static(PUBLIC_PATH, { index: false }));

function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timeoutId));
}

function isValidImageBuffer(file) {
  if (!file?.buffer || file.buffer.length < 12) return false;

  const headerHex = file.buffer.subarray(0, 12).toString('hex');
  const isJpeg = headerHex.startsWith('ffd8ff');
  const isPng = headerHex.startsWith('89504e470d0a1a0a');
  const isWebp = file.buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && file.buffer.subarray(8, 12).toString('ascii') === 'WEBP';

  return isJpeg || isPng || isWebp;
}

function sanitizeText(value, maxLength) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, maxLength);
}

const MIME_TO_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const MIME_VALID_EXTS = { 'image/jpeg': new Set(['.jpg', '.jpeg']), 'image/png': new Set(['.png']), 'image/webp': new Set(['.webp']) };

function mimeMatchesExtension(filename, mimetype) {
  const ext = path.extname(filename || '').toLowerCase();
  return MIME_VALID_EXTS[mimetype]?.has(ext) ?? false;
}

function sanitizeImageUrl(value) {
  const str = sanitizeText(value, 500);
  if (!str) return '';
  try {
    const url = new URL(str);
    if (!/^i\.ibb\.co$/i.test(url.hostname)) return '';
    return str;
  } catch { return ''; }
}

function buildQuotePayload(rawParams) {
  const params = rawParams && typeof rawParams === 'object' ? rawParams : {};
  const quote = {
    cliente_nombre: sanitizeText(params.cliente_nombre, 100),
    cliente_whatsapp: sanitizeText(params.cliente_whatsapp, 20),
    user_email: sanitizeText(params.user_email, 120),
    ciudad: sanitizeText(params.ciudad, 80),
    zona_tatuaje: sanitizeText(params.zona_tatuaje, 80),
    complejidad_diseno: sanitizeText(params.complejidad_diseno, 80),
    descripcion_referencia: sanitizeText(params.descripcion_referencia, 500),
    cotizacion_estimada: sanitizeText(params.cotizacion_estimada, 40),
    tamano_final: sanitizeText(params.tamano_final, 40),
    link_referencia: sanitizeImageUrl(params.link_referencia)
  };

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(quote.user_email);
  const phoneOk = /^\d{10,15}$/.test(quote.cliente_whatsapp);
  const requiredFields = [
    quote.cliente_nombre,
    quote.user_email,
    quote.cliente_whatsapp,
    quote.ciudad,
    quote.zona_tatuaje,
    quote.complejidad_diseno,
    quote.descripcion_referencia,
    quote.cotizacion_estimada,
    quote.tamano_final
  ];

  if (requiredFields.some(value => !value) || !emailOk || !phoneOk) {
    return null;
  }

  return quote;
}

async function verifyRecaptchaToken(token, remoteIp) {
  const secret = (process.env.RECAPTCHA_SECRET_KEY || '').trim();
  const skipRecaptcha = process.env.SKIP_RECAPTCHA === 'true';

  // Bypass reCAPTCHA si SKIP_RECAPTCHA=true (desarrollo)
  if (skipRecaptcha) {
    console.warn('⚠️  reCAPTCHA SKIPPED - Only for development!');
    return { success: true, score: 0.9, action: 'submit_quote' };
  }

  if (!token || !secret) return { success: false };

  const body = new URLSearchParams({
    secret,
    response: token
  });

  if (remoteIp) {
    body.append('remoteip', remoteIp);
  }

  try {
    const response = await fetchWithTimeout('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    }, 5000);

    if (!response.ok) {
      console.error('reCAPTCHA API error - Status:', response.status);
      return { success: false };
    }

    const data = await response.json();

    console.log('reCAPTCHA response:', { success: data.success });

    return {
      success: Boolean(data.success)
    };
  } catch (error) {
    console.error('reCAPTCHA verification error:', error.message);
    return { success: false };
  }
}

app.get('/', (_req, res) => {
  res.sendFile(path.join(PUBLIC_PATH, 'index.html'));
});

app.get('/api/config', configLimiter, (_req, res) => {
  res.json({
    recaptchaSiteKey: (process.env.RECAPTCHA_SITE_KEY || '').trim(),
    waPhone: (process.env.WHATSAPP_PHONE || '').trim(),
    instagramUrl: (process.env.INSTAGRAM_URL || '').trim(),
    facebookUrl: (process.env.FACEBOOK_URL || '').trim()
  });
});

app.post('/api/verify-captcha', captchaLimiter, async (req, res) => {
  const token = sanitizeText(req.body?.token, 4000);
  const verification = await verifyRecaptchaToken(token, req.ip);
  res.status(verification.success ? 200 : 400).json(verification);
});

app.post('/api/upload-image', uploadLimiter, (req, res, next) => {
  upload.single('image')(req, res, error => {
    if (error instanceof multer.MulterError) {
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? `La imagen supera el limite de ${MAX_FILE_SIZE / (1024 * 1024)} MB`
        : 'No fue posible procesar la imagen';
      return res.status(400).json({ error: message });
    }

    if (error) {
      return res.status(400).json({ error: 'Tipo de archivo no permitido (solo JPG, PNG o WEBP)' });
    }

    return next();
  });
}, async (req, res) => {
  try {
    const key = (process.env.IMGBB_API_KEY || '').trim();

    console.log('Upload request received - File:', req.file?.originalname, 'MIME:', req.file?.mimetype);

    if (!req.file) {
      return res.status(400).json({ error: 'Archivo no proporcionado' });
    }

    if (!key) {
      console.error('IMGBB_API_KEY not configured');
      return res.status(500).json({ error: 'Servicio de subida no configurado.' });
    }

    if (!mimeMatchesExtension(req.file.originalname, req.file.mimetype)) {
      return res.status(400).json({ error: 'Tipo de archivo no permitido' });
    }

    if (!isValidImageBuffer(req.file)) {
      return res.status(400).json({ error: 'El archivo no es una imagen valida' });
    }

    const safeExt = MIME_TO_EXT[req.file.mimetype] || '.jpg';
    const safeName = `ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${safeExt}`;
    const form = new FormData();
    const imageBlob = new Blob([req.file.buffer], { type: req.file.mimetype });
    form.append('key', key);
    form.append('image', imageBlob, safeName);
    form.append('name', safeName.replace(/\.[^.]+$/, ''));

    console.log('Uploading to imgbb with API key length:', key.length);

    const response = await fetchWithTimeout('https://api.imgbb.com/1/upload', {
      method: 'POST',
      body: form
    }, 15000);

    const rawResponse = await response.text();
    console.log('imgbb response status:', response.status);

    let data = null;
    try {
      data = rawResponse ? JSON.parse(rawResponse) : null;
    } catch (_error) {
      console.error('Failed to parse imgbb response:', rawResponse.slice(0, 200));
      data = null;
    }

    if (!response.ok || !data?.success || !data?.data?.url) {
      console.error('Upload provider error - Status:', response.status, 'Success:', data?.success, 'URL:', data?.data?.url);

      if (response.status === 401 || response.status === 403) {
        return res.status(502).json({ error: 'Clave de API inválida. Contacta soporte.' });
      }
      if (response.status === 429) {
        return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' });
      }

      return res.status(502).json({ error: 'No fue posible subir la imagen. Intenta de nuevo.' });
    }

    console.log('Image uploaded successfully:', data.data.url);
    return res.json({ url: data.data.url });
  } catch (error) {
    console.error('Upload error:', error.name, error.message, error.cause);

    if (error.name === 'AbortError') {
      return res.status(408).json({ error: 'Timeout al subir la imagen. Intenta con una imagen más pequeña.' });
    }

    if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
      return res.status(503).json({ error: 'Sin conexión a internet o servidor de imgbb no disponible.' });
    }

    return res.status(500).json({ error: 'Error al procesar la imagen. Intenta de nuevo.' });
  }
});

app.post('/api/submit-quote', submitLimiter, async (req, res) => {
  const token = sanitizeText(req.body?.token, 4000);
  const quote = buildQuotePayload(req.body?.params);
  const serviceId = (process.env.EMAILJS_SERVICE_ID || '').trim();
  const templateId = (process.env.EMAILJS_TEMPLATE_ID || '').trim();
  const publicKey = (process.env.EMAILJS_PUBLIC_KEY || '').trim();

  if (!quote) {
    return res.status(400).json({ error: 'Los datos de la cotizacion son invalidos o estan incompletos.' });
  }

  if (!serviceId || !templateId || !publicKey) {
    return res.status(500).json({ error: 'El servicio de cotizaciones no esta configurado.' });
  }

  const verification = await verifyRecaptchaToken(token, req.ip);

  if (!verification.success) {
    console.warn('reCAPTCHA verification failed:', verification);
    return res.status(400).json({ error: 'No se pudo validar que la solicitud provenga de una persona.' });
  }

  try {
    const response = await fetchWithTimeout('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: serviceId,
        template_id: templateId,
        user_id: publicKey,
        template_params: quote
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Quote submit error - Status:', response.status, 'Response:', errorText);

      if (response.status === 401 || response.status === 403) {
        return res.status(502).json({ error: 'Error de autenticacion con EmailJS. Verifica las credenciales.' });
      }
      if (response.status === 400) {
        return res.status(502).json({ error: 'Datos invalidos enviados a EmailJS. Contacta soporte.' });
      }

      return res.status(502).json({ error: 'No fue posible enviar la cotizacion al proveedor de correo.' });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Quote submit error:', error.message);
    return res.status(500).json({ error: 'Error interno al enviar la cotizacion.' });
  }
});

app.use((_req, res) => res.status(404).send('Not Found'));

app.listen(PORT, () => {
  console.log(`Servidor operativo en puerto ${PORT}`);
});
