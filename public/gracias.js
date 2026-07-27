/* Pagina de gracias (/gracias).

   Existe para que Google Ads pueda contar la cotizacion completa con el metodo
   "Page load": necesita una URL propia. Aqui se disparan las conversiones, no
   en el popup — al redirigir, la navegacion puede cancelar el beacon del pixel
   y el evento se pierde. En un page load no hay esa carrera.

   Los datos de la cotizacion llegan en sessionStorage (los deja script.js al
   recibir el OK de /api/lead/complete). Como respaldo se aceptan ?min= y ?max=
   en la URL. El rango lo calculo el servidor: aqui solo se pinta.

   Ningun ID esta escrito aqui: todos vienen de /api/config. */

const money = new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0
});

const params = new URLSearchParams(location.search);
let quote = {};
try { quote = JSON.parse(sessionStorage.getItem('negasQuote')) || {}; } catch { /* datos corruptos: seguimos sin ellos */ }

const min = Number(quote.price?.min || params.get('min'));
const max = Number(quote.price?.max || params.get('max'));

if (min > 0 && max > 0) {
    document.getElementById('ty-price-val').textContent = `${money.format(min)} – ${money.format(max)}`;
    document.getElementById('ty-price').hidden = false;
}

const firstName = (quote.name || '').split(' ')[0];
if (firstName) document.getElementById('ty-name').textContent = firstName;

function whatsAppMessage() {
    if (!quote.description) return 'Hola Negas, acabo de cotizar en la página y quiero confirmar los detalles.';

    const idea = quote.description.length > 220 ? quote.description.slice(0, 217) + '...' : quote.description;
    return [
        `Hola Negas, soy ${quote.name}.`,
        '',
        'Acabo de cotizar en la página:',
        `• Idea: ${idea}`,
        `• Tamaño: ${quote.sizeCm} cm`,
        `• Inversión aproximada: ${min > 0 ? `${money.format(min)} – ${money.format(max)}` : 'por definir'}`,
        '',
        'Quiero confirmar los detalles.'
    ].join('\n');
}

// Una sola vez por pestana: si la persona recarga /gracias, Ads y Meta no
// vuelven a contar la misma cotizacion.
function trackOnce(config) {
    if (sessionStorage.getItem('negasGracias')) return;
    sessionStorage.setItem('negasGracias', '1');

    if (typeof window.fbq === 'function') {
        window.fbq('track', 'SubmitApplication', {
            content_name: 'Cotizacion completa',
            value: min > 0 ? min : 0,
            currency: 'COP'
        });
    }

    // La etiqueta nueva manda; si aun no esta configurada, se usa la de
    // siempre para no perder la conversion que ya funcionaba.
    const label = config.googleAdsConversionLabelCompleta || config.googleAdsConversionLabel;
    if (config.googleAdsId && label && typeof window.gtag === 'function') {
        window.gtag('event', 'conversion', { send_to: `${config.googleAdsId}/${label}` });
    }
}

function loadGoogleTags(config) {
    const ids = [config.googleAdsId, config.ga4Id].filter(Boolean);
    if (!ids.length) return;

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(ids[0]);
    document.head.appendChild(script);

    ids.forEach(id => window.gtag('config', id));
}

fetch('/api/config')
    .then(res => res.ok ? res.json() : null)
    .then(config => {
        if (!config) return;

        const wa = document.getElementById('ty-wa');
        if (config.waPhone) {
            wa.href = `https://wa.me/${config.waPhone}?text=${encodeURIComponent(whatsAppMessage())}`;
        } else {
            wa.hidden = true;
        }

        if (config.metaPixelId && typeof window.fbq === 'function') {
            window.fbq('init', config.metaPixelId);
            window.fbq('track', 'PageView');
        }

        loadGoogleTags(config);
        trackOnce(config);
    })
    .catch(() => {});
