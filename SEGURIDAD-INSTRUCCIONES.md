# Guía de seguridad operativa

## Protecciones activas

- **reCAPTCHA v3** validado en el backend antes de crear un lead (`action: lead_start`).
- **Rate limiting** server-side: `/api/config` y `/api/gallery` (200 / 15 min),
  `/api/lead/start` (10 / hora), `/api/lead/complete` (30 / hora).
- **Token de actualización**: el paso final solo puede modificar el lead si presenta
  `leadId` + `update_token`. Nadie puede sobrescribir el lead de otro adivinando un id.
- **Precio recalculado en el servidor**: el navegador no puede inyectar un valor falso.
- **La service role key nunca sale del servidor.** El frontend usa la anon key,
  que está protegida por RLS.
- **Panel admin autenticado por JWT de Supabase**, verificado server-side en
  `/api/admin/*`. Se puede restringir por correo con `ADMIN_EMAILS`.
- **Subida de imágenes** limitada a 1 archivo, 10 MB, JPG/PNG/WEBP.
- **CSP, HSTS y Permissions-Policy** activos vía Helmet.
- **Consentimiento de datos** (Ley 1581) registrado con marca de tiempo en cada lead.

## Variables sensibles

Nunca deben aparecer en el repositorio ni en el frontend:

- `SUPABASE_SERVICE_ROLE_KEY`
- `RECAPTCHA_SECRET_KEY`

## Recomendaciones

- Poner el sitio detrás de Cloudflare o un WAF equivalente.
- Rellenar `ADMIN_EMAILS` en producción; si queda vacío, cualquier usuario
  autenticado de Supabase puede administrar la galería.
- Rotar claves si el proyecto o la carpeta se compartieron antes del hardening.
- Revisar periódicamente las respuestas 429 y los errores de proveedores externos.

## Deuda técnica resuelta

- `multer` 1.x eliminado: ya no se usa (las imágenes van directo a Supabase Storage).
- `form-data` eliminado: dependencia muerta.
- El SDK de Supabase se carga con `import()` dinámico, así un fallo del CDN ya no
  tumba el cotizador completo.

## Pendiente

- Los leads "eliminados" en el admin se guardan en `localStorage` del navegador,
  no en la base. Se pierden al cambiar de equipo o limpiar el navegador.
  Conviene moverlo a una columna `deleted_at` en la tabla `leads`.
