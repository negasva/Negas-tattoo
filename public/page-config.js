/* Configuración de las páginas legales (privacidad y cuidados).

   El número de WhatsApp y el ID del Pixel salen de /api/config: sin
   credenciales en el HTML. Estaba duplicado inline en las dos páginas. */
fetch('/api/config')
    .then(res => res.ok ? res.json() : null)
    .then(config => {
        if (!config) return;
        if (config.waPhone) {
            document.querySelectorAll('a.js-wa').forEach(a => {
                a.href = 'https://wa.me/' + config.waPhone;
                a.target = '_blank';
                a.rel = 'noopener';
            });
        }
        if (config.metaPixelId && typeof window.fbq === 'function') {
            window.fbq('init', config.metaPixelId);
            window.fbq('track', 'PageView');
        }
    })
    .catch(() => {});
