require('dotenv').config();

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = Number(process.env.PORT) || 3780;
const PUBLIC_PATH = path.join(__dirname, 'public');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qiyfydnwdwygbrpavdjb.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
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

app.get('/api/config', (_req, res) => {
  res.json({
    waPhone: (process.env.WHATSAPP_PHONE || '').trim(),
    instagramUrl: (process.env.INSTAGRAM_URL || '').trim()
  });
});

app.get('/api/keepalive', async (_req, res) => {
  if (!supabaseAdmin) {
    return res.status(500).json({
      ok: false,
      error: 'SUPABASE_SERVICE_ROLE_KEY is not configured'
    });
  }

  try {
    const [leadCheck, docCheck] = await Promise.all([
      supabaseAdmin.from('leads').select('id', { count: 'exact', head: true }).limit(1),
      supabaseAdmin.from('signed_documents').select('id', { count: 'exact', head: true }).limit(1)
    ]);

    if (leadCheck.error) throw leadCheck.error;
    if (docCheck.error) throw docCheck.error;

    return res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      touched: ['leads', 'signed_documents']
    });
  } catch (error) {
    console.error('Keepalive failed:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Keepalive failed'
    });
  }
});

app.use((_req, res) => res.status(404).send('Not Found'));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
