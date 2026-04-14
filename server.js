require('dotenv').config();
const express = require('express');
const multer = require('multer');
const FormData = require('form-data');
const path = require('path');

const app = express();

// Configuración de constantes
const PORT = Number(process.env.PORT) || 3780;
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

// Configuración de Multer (Considerar diskStorage para producción si los archivos son grandes)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE }
});

// --- MIDDLEWARES ---

app.use(express.json());

// Servir archivos estáticos de forma controlada
const PUBLIC_PATH = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_PATH));

// --- RUTAS ---

app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_PATH, 'index.html'));
});

app.get('/api/config', (req, res) => {
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

app.post('/api/verify-captcha', async (req, res) => {
    const { token } = req.body;
    const secret = process.env.RECAPTCHA_SECRET_KEY;

    if (!token || !secret) return res.status(400).json({ success: false });

    try {
        const verifyUrl = `https://www.google.com/recaptcha/api/siteverify`;
        const response = await fetch(verifyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `secret=${secret}&response=${token}`
        });
        const data = await response.json();
        res.json({ success: data.success, score: data.score });
    } catch (e) {
        console.error('Captcha error:', e.message);
        res.status(500).json({ success: false });
    }
});

app.post('/api/upload-image', upload.single('image'), async (req, res) => {
  try {
    const key = process.env.IMGBB_API_KEY;
    if (!key) throw new Error('Servicio de imágenes no configurado');
    if (!req.file) return res.status(400).json({ error: 'Archivo no proporcionado' });

    const form = new FormData();
    form.append('image', req.file.buffer, {
      filename: req.file.originalname || 'image.jpg',
      contentType: req.file.mimetype || 'application/octet-stream'
    });

    const response = await fetch(`https://api.imgbb.com/1/upload?key=${key}`, {
        method: 'POST',
        body: form,
        headers: form.getHeaders()
    });

    const data = await response.json();

    if (!data.success || !data.data?.url) {
      return res.status(400).json({
        error: data.error?.message || 'Error en el proveedor de imágenes'
      });
    }

    res.json({ url: data.data.url });
  } catch (e) {
    console.error('Upload Error:', e.message);
    res.status(500).json({ error: 'Error interno al procesar la imagen' });
  }
});

// Manejo de rutas no encontradas
app.use((req, res) => res.status(404).send('Not Found'));

app.listen(PORT, () => {
  console.log(`Servidor operativo en puerto ${PORT}`);
});
