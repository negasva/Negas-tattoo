require('dotenv').config();
const express = require('express');
const multer = require('multer');
const FormData = require('form-data');
const path = require('path');

const app = express();
const ROOT = __dirname;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});

app.use((req, res, next) => {
  if (req.path === '/.env' || req.path.startsWith('/.env')) return res.status(404).end();
  next();
});

app.use(express.static(ROOT));

app.get('/', (req, res) => {
  res.sendFile(path.join(ROOT, 'index.html'));
});

// Agrega esto a tu servidor Node.js (Express)
app.get('/api/config', (req, res) => {
    // Si no hay variables, intentar leerlas otra vez
    const config = {
        emailjsPublicKey: (process.env.EMAILJS_PUBLIC_KEY || '').trim(),
        emailjsServiceId: (process.env.EMAILJS_SERVICE_ID || '').trim(),
        emailjsTemplateId: (process.env.EMAILJS_TEMPLATE_ID || '').trim(),
        recaptchaSiteKey: (process.env.RECAPTCHA_SITE_KEY || '').trim(),
        waPhone: (process.env.WHATSAPP_PHONE || '').trim(),
        instagramUrl: (process.env.INSTAGRAM_URL || '').trim(),
        facebookUrl: (process.env.FACEBOOK_URL || '').trim()
    };
    res.json(config);
});

app.post('/api/upload-image', upload.single('image'), async (req, res) => {
  try {
    const key = process.env.IMGBB_API_KEY;
    if (!key) {
      return res.status(500).json({ error: 'IMGBB_API_KEY no configurada en .env' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Sin archivo' });
    }
    const form = new FormData();
    form.append('image', req.file.buffer, {
      filename: req.file.originalname || 'image.jpg',
      contentType: req.file.mimetype || 'application/octet-stream'
    });
    const r = await fetch(
      'https://api.imgbb.com/1/upload?key=' + encodeURIComponent(key),
      { method: 'POST', body: form, headers: form.getHeaders() }
    );
    const j = await r.json();
    if (!j.success || !j.data?.url) {
      return res.status(400).json({
        error: j.error?.message || 'ImgBB rechazó la imagen'
      });
    }
    res.json({ url: j.data.url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Error subiendo imagen' });
  }
});

const PORT = Number(process.env.PORT) || 3780;
app.listen(PORT, () => {
  console.log(`Servidor: http://localhost:${PORT}`);
});
