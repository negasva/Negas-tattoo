# Guia de seguridad operativa

## Protecciones activas

- `reCAPTCHA v3` validado en backend antes de aceptar cotizaciones.
- `Rate limiting` server-side en `/api/config`, `/api/verify-captcha`, `/api/upload-image` y `/api/submit-quote`.
- Carga de imagenes limitada a `1 archivo`, `10 MB`, formatos `JPG`, `PNG` y `WEBP`.
- Validacion de firma basica del archivo para evitar confiar solo en el MIME enviado por el navegador.
- Envio de cotizaciones desde backend hacia EmailJS para no dejar el flujo principal en el cliente.
- Timeouts en llamadas externas a Google, ImgBB y EmailJS.

## Variables necesarias

- `IMGBB_API_KEY`
- `EMAILJS_PUBLIC_KEY`
- `EMAILJS_SERVICE_ID`
- `EMAILJS_TEMPLATE_ID`
- `RECAPTCHA_SITE_KEY`
- `RECAPTCHA_SECRET_KEY`
- `ALLOWED_ORIGINS`

## Recomendaciones adicionales

- Poner el sitio detras de Cloudflare o un WAF equivalente si va a quedar publico.
- Rotar claves si el proyecto o la carpeta se compartieron antes del hardening.
- Revisar periodicamente respuestas 429 y errores de proveedores externos.
- Mantener `multer` actualizado; la rama 1.x sigue siendo una deuda tecnica conocida.

## Pendiente recomendado

- Migrar de `multer` 1.x a 2.x cuando puedas actualizar dependencias sin romper despliegue.
