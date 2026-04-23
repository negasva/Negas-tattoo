function isMobileDevice() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

function getInstagramUsername(instagramUrl) {
    try {
        const url = new URL(instagramUrl);
        if (!/instagram\.com$/i.test(url.hostname) && !/www\.instagram\.com$/i.test(url.hostname)) {
            return '';
        }
        const [username] = url.pathname.split('/').filter(Boolean);
        return username || '';
    } catch (_error) {
        return '';
    }
}

function openAppOrFallback(appUrl, webUrl) {
    if (!appUrl) {
        window.open(webUrl, '_blank', 'noopener');
        return;
    }

    const startedAt = Date.now();
    const fallbackDelay = 1200;
    const fallback = setTimeout(() => {
        if (Date.now() - startedAt < fallbackDelay + 250) {
            window.location.href = webUrl;
        }
    }, fallbackDelay);

    const handleVisibilityChange = () => {
        if (document.hidden) {
            clearTimeout(fallback);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.location.href = appUrl;
}

function bindDeepLinkAnchors() {
    document.querySelectorAll('a.js-wa, a.js-wa-msg, a.js-ig').forEach(anchor => {
        if (anchor.dataset.deepLinkBound === 'true') return;
        anchor.dataset.deepLinkBound = 'true';

        anchor.addEventListener('click', event => {
            if (!isMobileDevice()) return;

            const appHref = anchor.dataset.appHref;
            const webHref = anchor.dataset.webHref || anchor.href;
            if (!webHref) return;

            event.preventDefault();
            openAppOrFallback(appHref, webHref);
        });
    });
}

async function init() {
    try {
        const res = await fetch('/api/config');
        const config = await res.json();
        if (config.waPhone) {
            document.querySelectorAll('a.js-wa').forEach(a => {
                a.href = 'https://wa.me/' + config.waPhone;
                a.dataset.webHref = 'https://wa.me/' + config.waPhone;
                a.dataset.appHref = 'whatsapp://send?phone=' + config.waPhone;
            });
            document.querySelectorAll('a.js-wa-msg').forEach(a => {
                const webHref = 'https://wa.me/' + config.waPhone + '?text=' + encodeURIComponent('Hola! Tengo dudas sobre mi cotizacion');
                a.href = webHref;
                a.dataset.webHref = webHref;
                a.dataset.appHref = 'whatsapp://send?phone=' + config.waPhone + '&text=' + encodeURIComponent('Hola! Tengo dudas sobre mi cotizacion');
            });
        }
        if (config.instagramUrl) {
            const username = getInstagramUsername(config.instagramUrl);
            document.querySelectorAll('a.js-ig').forEach(a => {
                a.href = config.instagramUrl;
                a.dataset.webHref = config.instagramUrl;
                if (username) {
                    a.dataset.appHref = 'instagram://user?username=' + username;
                }
            });
        }
        bindDeepLinkAnchors();
    } catch (error) {
        console.error('Error cargando config en resumen:', error);
    }
}
init();

const raw = sessionStorage.getItem('ultimaCotizacion');
const datos = raw ? JSON.parse(raw) : null;
if (datos) {
    document.getElementById('res-nombre').innerText = datos.cliente_nombre || 'No especificado';
    document.getElementById('res-zona').innerText = datos.zona_tatuaje || 'No especificada';
    document.getElementById('res-tamano').innerText = datos.tamano_final || 'No especificado';
    document.getElementById('res-estilo').innerText = datos.complejidad_diseno || 'No especificado';
    document.getElementById('res-precio').innerText = datos.cotizacion_estimada || 'No especificado';
} else {
    window.location.href = '/';
}
