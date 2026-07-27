/* ═══════════════════════════════════════════════════════════════
   NEGAS TATTOO — frontend
   Flujo de cotizacion en popup con captura de lead en dos fases:
     paso 1  -> POST /api/lead/start     (guarda nombre + WhatsApp)
     paso 4  -> POST /api/lead/complete  (enriquece con idea/tamano/precio)
   Si la persona abandona en el paso 2 o 3, el contacto ya quedo guardado.

   El SDK de Supabase se carga con import() dinamico y SOLO cuando hay que
   subir una imagen. Antes se importaba arriba del archivo, y si el CDN
   fallaba el modulo entero moria y se caia el cotizador completo.
   ═══════════════════════════════════════════════════════════════ */

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
if (!window.location.hash) window.scrollTo(0, 0);

/* ─── Estado global ──────────────────────────────────────────── */
let appConfig = {};
let pricing = {
    base: 90000,
    perCmSmall: 38000,
    perCmLarge: 52000,
    breakpointCm: 15,
    minimum: 180000,
    rangeLow: 0.95,
    rangeHigh: 1.25,
    maxCm: 60
};

const quoteSession = {
    leadId: null,
    token: null,
    name: '',
    phone: '',
    description: '',
    sizeCm: 0,
    price: null
};

/* ─── Tracking (Meta Pixel + Google Ads / GA4) ────────────────── */
// Nunca lanza: si un pixel no esta configurado o el bloqueador de anuncios lo
// tumba, el flujo del formulario debe seguir funcionando igual.
function track(event, params = {}) {
    try {
        if (typeof window.fbq === 'function') {
            const standard = ['Lead', 'SubmitApplication', 'Contact', 'ViewContent', 'PageView'];
            if (standard.includes(event)) window.fbq('track', event, params);
            else window.fbq('trackCustom', event, params);
        }
    } catch (error) { console.warn('Meta Pixel no registro el evento', event, '—', error.message); }

    try {
        if (typeof window.gtag === 'function') {
            window.gtag('event', event, params);
        }
    } catch (error) { console.warn('gtag no registro el evento', event, '—', error.message); }
}

function trackAdsConversion() {
    const { googleAdsId, googleAdsConversionLabel } = appConfig;
    if (!googleAdsId || !googleAdsConversionLabel || typeof window.gtag !== 'function') return;
    try {
        window.gtag('event', 'conversion', {
            send_to: `${googleAdsId}/${googleAdsConversionLabel}`
        });
    } catch (error) { console.warn('Conversion de Google Ads no registrada —', error.message); }
}

function loadGoogleTags() {
    const ids = [appConfig.googleAdsId, appConfig.ga4Id].filter(Boolean);
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

/* ─── Configuracion ──────────────────────────────────────────── */
async function loadConfig() {
    try {
        const res = await fetch('/api/config');
        if (!res.ok) throw new Error('config no disponible');
        appConfig = await res.json();
    } catch (error) {
        console.error('Error loading config:', error);
        appConfig = {};
    }
    applyConfig();
}

// Arranca el Meta Pixel con el ID que manda el servidor. El bootstrap de fbq
// ya esta en el HTML (encola las llamadas), asi que el ID no queda escrito en
// el repositorio y el PageView se dispara igual, apenas llega /api/config.
function initMetaPixel(pixelId) {
    if (!pixelId || typeof window.fbq !== 'function' || window.__pixelReady) return;
    window.__pixelReady = true;
    try {
        window.fbq('init', pixelId);
        window.fbq('track', 'PageView');
    } catch (error) {
        console.warn('Meta Pixel no pudo inicializar:', error);
    }
}

function applyConfig() {
    const { waPhone, instagramUrl, facebookUrl, tiktokUrl, recaptchaSiteKey, metaPixelId } = appConfig;

    if (appConfig.pricing) pricing = { ...pricing, ...appConfig.pricing };
    if (recaptchaSiteKey) loadRecaptcha(recaptchaSiteKey);
    initMetaPixel(metaPixelId);
    loadGoogleTags();

    if (waPhone) {
        document.querySelectorAll('a.js-wa').forEach(a => { a.href = 'https://wa.me/' + waPhone; });
    } else {
        // Sin numero configurado el flotante seria un enlace a "#": mejor no mostrarlo.
        document.getElementById('floating-wa')?.remove();
    }

    if (instagramUrl) {
        document.querySelectorAll('a.js-ig').forEach(a => { a.href = instagramUrl; });
    }

    if (facebookUrl) {
        document.querySelectorAll('a.js-fb').forEach(a => { a.href = facebookUrl; });
    }

    if (tiktokUrl) {
        document.querySelectorAll('a.js-tt').forEach(a => { a.href = tiktokUrl; });
    }
}

/* ─── reCAPTCHA v3 ───────────────────────────────────────────── */
let recaptchaReady = null;

function loadRecaptcha(siteKey) {
    if (!siteKey || recaptchaReady) return recaptchaReady;
    recaptchaReady = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://www.google.com/recaptcha/api.js?render=' + encodeURIComponent(siteKey);
        script.async = true;
        script.onload = () => {
            if (window.grecaptcha && window.grecaptcha.ready) window.grecaptcha.ready(() => resolve());
            else reject(new Error('grecaptcha no disponible'));
        };
        script.onerror = () => reject(new Error('No se pudo cargar reCAPTCHA'));
        document.head.appendChild(script);
    });
    return recaptchaReady;
}

async function getRecaptchaToken(action) {
    const siteKey = appConfig?.recaptchaSiteKey;
    if (!siteKey) return '';
    try {
        if (recaptchaReady) await recaptchaReady;
        if (!window.grecaptcha) return '';
        return await window.grecaptcha.execute(siteKey, { action });
    } catch (error) {
        console.warn('reCAPTCHA token error:', error);
        return '';
    }
}

/* ─── Enlaces a WhatsApp e Instagram ─────────────────────────── */
// Sin maquina de deep links: https://wa.me/… y https://instagram.com/… abren
// la app nativa por si solos en iOS y en Android. El <a href> plano basta.
// Lo unico que queda aqui es el tracking del clic.
document.querySelectorAll('a.js-wa-track').forEach(anchor => {
    anchor.addEventListener('click', () => {
        track('ClickWhatsApp', { origen: anchor.dataset.origin || 'desconocido' });
    });
});

// Sigue en uso fuera de los deep links: el foco automatico del paso visible y
// el pulso del CTA flotante solo aplican en movil.
function isMobileDevice() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

/* ═══════════════════════════════════════════════════════════════
   GALERIA — se alimenta de /api/gallery (editable desde el admin)
   ═══════════════════════════════════════════════════════════════ */
const galGrid = document.getElementById('galGrid');
const galCount = document.getElementById('galCount');
const galEmpty = document.getElementById('galEmpty');
let galleryImages = [];
let activeFilter = 'All';

const shuffle = arr => arr
    .map(v => [Math.random(), v])
    .sort((a, b) => a[0] - b[0])
    .map(pair => pair[1]);

// Una pieza puede tener varias etiquetas. `categories` es lo nuevo; `category`
// es la columna vieja y sigue valiendo para lo que aun no se haya migrado.
const tagsOf = item => (
    Array.isArray(item.categories) && item.categories.length
        ? item.categories
        : item.category ? [item.category] : []
);

async function loadGallery() {
    if (!galGrid) return;
    try {
        const res = await fetch('/api/gallery');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'respuesta inválida');
        galleryImages = Array.isArray(data.images) ? data.images : [];
    } catch (error) {
        // Sin respaldo hardcodeado: se muestra #galEmpty, que ya existe.
        console.warn('Galería no disponible —', error.message);
        galleryImages = [];
    }
    renderGallery(activeFilter);
    qmCarRender('All');
}

function renderGallery(filter) {
    if (!galGrid) return;
    activeFilter = filter;

    const base = filter === 'All'
        ? galleryImages
        : galleryImages.filter(img => tagsOf(img).includes(filter));

    // Orden manual desde el admin (sort_order). Solo barajamos cuando todas las
    // piezas comparten el mismo orden, para que el archivo se sienta vivo pero
    // el orden explicito de Negas siempre mande.
    const allSameOrder = base.length > 1 && base.every(i => (i.sort_order || 0) === (base[0].sort_order || 0));
    const shown = allSameOrder ? shuffle(base) : base;

    galGrid.innerHTML = '';

    shown.forEach(item => {
        const tags = tagsOf(item);

        const el = document.createElement('div');
        el.className = 'gal-item' + (item.span ? ' ' + item.span : '');

        const img = document.createElement('img');
        img.src = item.url;
        img.alt = item.alt || `Tatuaje ${tags.join(' y ')} — Negas Tattoo Sabaneta`;
        img.loading = 'lazy';
        img.decoding = 'async';
        // Reserva de espacio (CLS). Solo si la pieza trae medidas reales.
        if (item.img_width && item.img_height) {
            img.width = item.img_width;
            img.height = item.img_height;
        }
        // Variante de 480px: solo existe en las piezas ya migradas al dominio
        // propio (nombre `...-1080.webp`). En las de i.ibb.co no aplica.
        const small = item.url.replace('-1080.webp', '-480.webp');
        if (small !== item.url) {
            img.srcset = `${small} 480w, ${item.url} 1080w`;
            img.sizes = '(max-width: 640px) 50vw, 33vw';
        }

        const overlay = document.createElement('div');
        overlay.className = 'gal-overlay';

        const cat = document.createElement('div');
        cat.className = 'gal-cat';
        tags.forEach(tag => {
            const chip = document.createElement('span');
            chip.textContent = tag;
            cat.appendChild(chip);
        });

        el.append(img, overlay, cat);
        el.addEventListener('click', () => openLightbox(item.url, el, img.alt));
        galGrid.appendChild(el);
    });

    renderGallerySchema(shown);

    if (galCount) {
        galCount.textContent = galleryImages.length
            ? `${shown.length} / ${galleryImages.length} piezas`
            : '';
    }
    if (galEmpty) galEmpty.hidden = shown.length > 0;
}

// ImageGallery + un ImageObject por pieza, a partir de lo que ya devuelve
// /api/gallery. Se reescribe en cada render (tambien al filtrar).
function renderGallerySchema(items) {
    let tag = document.getElementById('gallery-schema');
    if (!tag) {
        tag = document.createElement('script');
        tag.type = 'application/ld+json';
        tag.id = 'gallery-schema';
        document.head.appendChild(tag);
    }
    tag.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'ImageGallery',
        '@id': 'https://negas.tattoo/#archivo',
        name: 'El Archivo',
        url: 'https://negas.tattoo/#work',
        isPartOf: { '@id': 'https://negas.tattoo/#website' },
        associatedMedia: items.map(item => ({
            '@type': 'ImageObject',
            contentUrl: item.url,
            url: item.url,
            ...(item.img_width ? { width: item.img_width } : {}),
            ...(item.img_height ? { height: item.img_height } : {}),
            name: item.alt || undefined,
            description: item.alt || undefined,
            keywords: tagsOf(item).join(', '),
            creator: { '@id': 'https://negas.tattoo/#studio' },
            copyrightNotice: '© Negas Tattoo',
            creditText: 'Negas Tattoo',
            license: 'https://negas.tattoo/privacidad',
            acquireLicensePage: 'https://negas.tattoo/',
            contentLocation: { '@id': 'https://negas.tattoo/#studio' }
        }))
    });
}

document.querySelectorAll('.gal-btn').forEach(btn => {
    btn.addEventListener('click', function () {
        document.querySelectorAll('.gal-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        renderGallery(this.dataset.filter);
    });
});

/* ═══════════════════════════════════════════════════════════════
   CARRUSEL DEL PORTAFOLIO (dentro del cotizador)
   Reusa galleryImages: no hace su propio fetch. Sin piezas, se oculta y el
   formulario queda como si el carrusel no existiera.
   ═══════════════════════════════════════════════════════════════ */
const qmCar = document.getElementById('qm-car');
const qmCarTrack = document.getElementById('qm-car-track');
const qmCarStill = matchMedia('(prefers-reduced-motion: reduce)');
let qmCarIndex = 0;
let qmCarTimer = null;

function qmCarStop() {
    clearInterval(qmCarTimer);
    qmCarTimer = null;
}

function qmCarPlay() {
    qmCarStop();
    if (qmCarStill.matches || !qmCar || qmCar.hidden || !isQuoteOpen()) return;
    qmCarTimer = setInterval(() => qmCarGo(qmCarIndex + 1), 4500);
}

function qmCarGo(i) {
    const slides = qmCarTrack.children;
    if (!slides.length) return;
    qmCarIndex = (i + slides.length) % slides.length;
    [...slides].forEach((el, n) => el.classList.toggle('is-active', n === qmCarIndex));
}

function qmCarRender(filter) {
    if (!qmCarTrack) return;

    const items = filter === 'All'
        ? galleryImages
        : galleryImages.filter(img => tagsOf(img).includes(filter));

    qmCar.hidden = items.length === 0;
    qmCarTrack.innerHTML = '';

    items.forEach(item => {
        const img = document.createElement('img');
        img.alt = item.alt || `Tatuaje ${tagsOf(item).join(' y ')} — Negas Tattoo Sabaneta`;
        img.src = item.url;
        img.loading = 'lazy';
        img.decoding = 'async';
        const small = item.url.replace('-1080.webp', '-480.webp');
        if (small !== item.url) {
            img.srcset = `${small} 480w, ${item.url} 1080w`;
            img.sizes = '(max-width: 640px) 90vw, 32rem';
        }
        qmCarTrack.appendChild(img);
    });

    qmCarGo(0);
    qmCarPlay();
}

if (qmCar) {
    qmCar.querySelectorAll('.qm-car-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            qmCar.querySelectorAll('.qm-car-btn').forEach(b => b.classList.remove('is-active'));
            this.classList.add('is-active');
            qmCarRender(this.dataset.qmFilter);
        });
    });

    // Cada flecha reinicia el autoplay: si no, el siguiente salto automatico
    // puede caer medio segundo despues del clic.
    qmCar.querySelector('.qm-car-prev').addEventListener('click', () => { qmCarGo(qmCarIndex - 1); qmCarPlay(); });
    qmCar.querySelector('.qm-car-next').addEventListener('click', () => { qmCarGo(qmCarIndex + 1); qmCarPlay(); });

    qmCar.addEventListener('mouseenter', qmCarStop);
    qmCar.addEventListener('focusin', qmCarStop);
    qmCar.addEventListener('mouseleave', qmCarPlay);
    qmCar.addEventListener('focusout', qmCarPlay);
}

/* ═══════════════════════════════════════════════════════════════
   LIGHTBOX
   ═══════════════════════════════════════════════════════════════ */
function openLightbox(src, el, alt) {
    const lb = document.getElementById('lightbox');
    const lbImg = document.getElementById('lb-img');
    if (!lb || !lbImg) return;

    const r = el.getBoundingClientRect();
    lbImg.src = src;
    lbImg.alt = alt || 'Pieza del portafolio de Negas Tattoo';

    const startX = (r.left + r.width / 2) - (window.innerWidth / 2);
    const startY = (r.top + r.height / 2) - (window.innerHeight / 2);
    const startScale = r.width / (window.innerWidth * 0.9);

    lbImg.style.transition = 'none';
    lbImg.style.transform = `translate(${startX}px, ${startY}px) scale(${startScale})`;
    lbImg.style.opacity = '0';

    lb.classList.add('active');
    history.pushState({ lightbox: true }, '');

    void lbImg.offsetHeight;

    lbImg.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.5s ease';
    lbImg.style.transform = 'translate(0, 0) scale(1)';
    lbImg.style.opacity = '1';

    document.body.classList.add('no-scroll');
}

function closeLightbox(isNavigation = false) {
    const lb = document.getElementById('lightbox');
    const lbImg = document.getElementById('lb-img');
    if (!lb || !lb.classList.contains('active')) return;

    lb.classList.remove('active');
    if (!isNavigation && history.state?.lightbox) history.back();

    if (lbImg) {
        lbImg.style.opacity = '0';
        lbImg.style.transform = 'translateY(20px) scale(0.95)';
        setTimeout(() => {
            if (!lb.classList.contains('active')) lbImg.src = '';
        }, 500);
    }

    if (!isQuoteOpen()) document.body.classList.remove('no-scroll');
}

const lbContainer = document.getElementById('lightbox');
if (lbContainer) {
    lbContainer.addEventListener('click', () => closeLightbox());
    document.getElementById('lb-img')?.addEventListener('click', e => e.stopPropagation());

    let touchStartY = 0;
    lbContainer.addEventListener('touchstart', e => { touchStartY = e.touches[0].clientY; }, { passive: true });
    lbContainer.addEventListener('touchend', e => {
        if (Math.abs(touchStartY - e.changedTouches[0].clientY) > 70) closeLightbox();
    }, { passive: true });
}

/* ═══════════════════════════════════════════════════════════════
   POPUP DE COTIZACION
   ═══════════════════════════════════════════════════════════════ */
const modal = document.getElementById('quote-modal');
const quoteForm = document.getElementById('quote-form');
const TOTAL_STEPS = 4;
let currentStep = 1;
let pendingFile = null;
let isSubmitting = false;

const isQuoteOpen = () => modal?.classList.contains('is-open');

// Busca primero dentro del paso visible: `form` existe en varios pasos y el
// mensaje tiene que salir donde la persona esta mirando.
function setError(field, message) {
    const el = modal?.querySelector(`.qm-step.is-active [data-error-for="${field}"]`)
        || document.querySelector(`[data-error-for="${field}"]`);
    if (el) el.textContent = message || '';
}

function clearErrors() {
    document.querySelectorAll('.qm-error').forEach(el => { el.textContent = ''; });
}

function showStep(step) {
    currentStep = step;
    modal.querySelectorAll('.qm-step').forEach(section => {
        section.classList.toggle('is-active', Number(section.dataset.step) === step);
    });

    const head = modal.querySelector('.qm-head');
    const isDone = step > TOTAL_STEPS;
    if (head) head.classList.toggle('is-hidden', isDone);

    const fill = document.getElementById('qm-bar-fill');
    const now = document.getElementById('qm-step-now');
    if (fill) fill.style.width = `${(Math.min(step, TOTAL_STEPS) / TOTAL_STEPS) * 100}%`;
    if (now) now.textContent = String(Math.min(step, TOTAL_STEPS));

    // El cuerpo es el que scrollea (el panel tiene alto fijo), asi que es ahi
    // donde hay que volver arriba al cambiar de paso.
    const body = modal.querySelector('.qm-body');
    if (body) body.scrollTop = 0;

    const focusTarget = modal.querySelector('.qm-step.is-active input:not([type="hidden"]):not([type="checkbox"]), .qm-step.is-active textarea');
    if (focusTarget && !isMobileDevice()) setTimeout(() => focusTarget.focus(), 220);
}

function openQuote(origin = 'desconocido', { push = true } = {}) {
    if (!modal) return;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');

    if (push && window.location.pathname !== '/cotizar') {
        history.pushState({ quote: true }, '', '/cotizar');
    }

    track('AbrioCotizador', { origen: origin });
    showStep(currentStep);
    qmCarPlay();
}

function closeQuote(isNavigation = false) {
    if (!modal || !isQuoteOpen()) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
    qmCarStop();

    if (!isNavigation && history.state?.quote) {
        history.back();
    } else if (!isNavigation && window.location.pathname === '/cotizar') {
        // Entraron directo por /cotizar (anuncio): al cerrar dejamos la home
        // en la barra de direcciones, sin recargar.
        history.replaceState({}, '', '/');
    }
}

document.querySelectorAll('.js-open-quote').forEach(btn => {
    btn.addEventListener('click', event => {
        event.preventDefault();
        openQuote(btn.dataset.origin || 'desconocido');
    });
});

modal?.querySelectorAll('[data-qm-close]').forEach(btn => {
    btn.addEventListener('click', () => closeQuote());
});

window.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (document.getElementById('lightbox')?.classList.contains('active')) closeLightbox();
    else if (isQuoteOpen()) closeQuote();
});

window.addEventListener('popstate', () => {
    if (document.getElementById('lightbox')?.classList.contains('active')) closeLightbox(true);
    if (isQuoteOpen()) closeQuote(true);
});

/* ─── Paso 1: validacion + guardado del lead ─────────────────── */
const nameInput = document.getElementById('qm-name');
const phoneInput = document.getElementById('qm-phone');
const emailInput = document.getElementById('qm-email');
const consentInput = document.getElementById('qm-consent');

phoneInput?.addEventListener('input', function () {
    this.value = this.value.replace(/\D/g, '').slice(0, 10);
});

function readUtm() {
    const params = new URLSearchParams(window.location.search);
    return {
        utm_source: params.get('utm_source') || '',
        utm_medium: params.get('utm_medium') || '',
        utm_campaign: params.get('utm_campaign') || (params.get('gclid') ? 'google-ads' : '')
    };
}

async function submitStepOne(button) {
    clearErrors();

    const name = (nameInput?.value || '').trim();
    const phone = (phoneInput?.value || '').replace(/\D/g, '');
    const email = (emailInput?.value || '').trim();
    const consent = Boolean(consentInput?.checked);

    let valid = true;
    if (name.length < 2) { setError('name', 'Escribe tu nombre.'); valid = false; }
    if (!/^3\d{9}$/.test(phone)) { setError('phone', 'Debe ser un celular de 10 dígitos que empiece por 3.'); valid = false; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('email', 'Ese correo no parece válido.'); valid = false; }
    if (!consent) { setError('consent', 'Necesito tu autorización para guardar tus datos.'); valid = false; }
    if (!valid) return;

    // Si ya guardamos el lead en esta sesion, no lo duplicamos al volver atras.
    if (quoteSession.leadId) {
        quoteSession.name = name;
        quoteSession.phone = phone;
        showStep(2);
        return;
    }

    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Guardando...';

    try {
        const recaptchaToken = await getRecaptchaToken('lead_start');
        const res = await fetch('/api/lead/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name, phone, email, consent: true, recaptchaToken,
                source: window.location.pathname === '/cotizar' ? 'cotizar-url' : 'landing',
                ...readUtm()
            })
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.error || 'No pudimos guardar tus datos. Intenta de nuevo.');

        // Sin leadId no hay sesion de cotizacion: el servidor guardo el contacto
        // pero no nos autoriza a completar nada. Pasa solo si la tabla todavia
        // tiene el UNIQUE sobre phone que quita la migracion.
        if (!data.leadId || !data.token) {
            throw new Error('No pudimos abrir tu cotización. Escríbenos por WhatsApp y la terminamos ahí.');
        }

        quoteSession.leadId = data.leadId;
        quoteSession.token = data.token;
        quoteSession.name = name;
        quoteSession.phone = phone;

        // El lead ya existe en la base: este es el evento que alimenta el
        // retargeting, no el envio final.
        track('Lead', { content_name: 'Cotizador paso 1' });

        showStep(2);
    } catch (error) {
        setError('form', error.message);
    } finally {
        button.disabled = false;
        button.textContent = original;
    }
}

/* ─── Paso 2: idea ───────────────────────────────────────────── */
const descriptionInput = document.getElementById('qm-description');
const charCount = document.getElementById('qm-char-count');

descriptionInput?.addEventListener('input', function () {
    if (charCount) charCount.textContent = String(this.value.length);
});

function validateStepTwo() {
    clearErrors();
    const value = (descriptionInput?.value || '').trim();
    if (value.length < 10) {
        setError('description', 'Cuéntame un poco más para poder cotizarte bien.');
        return false;
    }
    quoteSession.description = value;
    return true;
}

/* ─── Paso 3: tamano + precio ────────────────────────────────── */
const sizeInput = document.getElementById('qm-size');
const sizeDisplay = document.getElementById('qm-size-display');
const priceIdle = document.getElementById('qm-price-idle');
const priceResult = document.getElementById('qm-price-result');
const priceVal = document.getElementById('qm-price-val');

const COP = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
});
const formatCop = value => COP.format(Math.round(value));

// ⚠ Espejo EXACTO de computePriceRange() en server.js (misma formula, mismo
// `label`). El servidor recalcula y manda la verdad — esto solo alimenta el
// feedback en vivo del slider. Si cambias uno, cambia el otro.
function computePriceRange(cm) {
    const size = Math.max(0, Math.min(Number(cm) || 0, pricing.maxCm));
    if (!size) return { min: 0, max: 0, label: '' };

    const small = Math.min(size, pricing.breakpointCm) * pricing.perCmSmall;
    const large = Math.max(0, size - pricing.breakpointCm) * pricing.perCmLarge;
    const point = Math.max(pricing.minimum, pricing.base + small + large);

    const round = n => Math.round(n / 10000) * 10000;
    const min = round(point * pricing.rangeLow);
    const max = round(point * pricing.rangeHigh);

    return { min, max, label: `${formatCop(min)} - ${formatCop(max)}` };
}

function updatePrice() {
    if (!sizeInput) return;
    const cm = Number(sizeInput.value) || 0;

    if (sizeDisplay) sizeDisplay.textContent = String(cm);
    sizeInput.style.setProperty('--qm-range-pct', `${(cm / (pricing.maxCm || 60)) * 100}%`);

    const range = computePriceRange(cm);
    quoteSession.sizeCm = cm;
    quoteSession.price = range.min ? range : null;

    if (!range.min) {
        if (priceIdle) priceIdle.hidden = false;
        if (priceResult) priceResult.hidden = true;
        return;
    }

    if (priceIdle) priceIdle.hidden = true;
    if (priceResult) priceResult.hidden = false;
    if (priceVal) priceVal.textContent = `${formatCop(range.min)} – ${formatCop(range.max)}`;
}

sizeInput?.addEventListener('input', updatePrice);

let priceSeenTracked = false;
sizeInput?.addEventListener('change', () => {
    if (priceSeenTracked || !quoteSession.sizeCm) return;
    priceSeenTracked = true;
    track('VioPrecio', { tamano_cm: quoteSession.sizeCm });
});

function validateStepThree() {
    clearErrors();
    if (!quoteSession.sizeCm) {
        setError('sizeCm', 'Mueve el slider para elegir el tamaño.');
        return false;
    }
    return true;
}

/* ─── Paso 4: referencias ────────────────────────────────────── */
const fileInput = document.getElementById('qm-file');
const dropZone = document.getElementById('qm-drop');
const dropInner = document.getElementById('qm-drop-inner');
const previewImg = document.getElementById('qm-preview');
const fileClear = document.getElementById('qm-file-clear');

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

dropZone?.addEventListener('click', () => fileInput?.click());
dropZone?.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        fileInput?.click();
    }
});

// Se llama "drop zone", ahora tambien acepta archivos soltados. El archivo se
// mete en el input y se dispara su 'change': asi la validacion y la vista
// previa son exactamente las mismas que al elegirlo con el selector.
dropZone?.addEventListener('dragover', event => event.preventDefault());
dropZone?.addEventListener('drop', event => {
    event.preventDefault();
    if (!fileInput || !event.dataTransfer?.files?.length) return;
    fileInput.files = event.dataTransfer.files;
    fileInput.dispatchEvent(new Event('change'));
});

fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    setError('file', '');
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
        setError('file', 'El archivo debe ser JPG, PNG o WEBP.');
        fileInput.value = '';
        return;
    }
    if (file.size > MAX_FILE_BYTES) {
        setError('file', 'La imagen supera los 10MB.');
        fileInput.value = '';
        return;
    }

    pendingFile = file;
    const reader = new FileReader();
    reader.onload = e => {
        if (previewImg) {
            previewImg.src = e.target.result;
            previewImg.hidden = false;
        }
        if (dropInner) dropInner.hidden = true;
        if (fileClear) fileClear.hidden = false;
    };
    reader.readAsDataURL(file);
});

fileClear?.addEventListener('click', () => {
    pendingFile = null;
    if (fileInput) fileInput.value = '';
    if (previewImg) { previewImg.hidden = true; previewImg.src = ''; }
    if (dropInner) dropInner.hidden = false;
    fileClear.hidden = true;
    setError('file', '');
});

/* ─── Envio final ────────────────────────────────────────────── */
function buildWhatsAppMessage() {
    const idea = quoteSession.description.length > 220
        ? quoteSession.description.slice(0, 217) + '...'
        : quoteSession.description;

    const priceLine = quoteSession.price
        ? `${formatCop(quoteSession.price.min)} – ${formatCop(quoteSession.price.max)}`
        : 'por definir';

    return [
        `Hola Negas, soy ${quoteSession.name}.`,
        '',
        'Acabo de cotizar en la página:',
        `• Idea: ${idea}`,
        `• Tamaño: ${quoteSession.sizeCm} cm`,
        `• Inversión aproximada: ${priceLine}`,
        '',
        'Quiero confirmar los detalles.'
    ].join('\n');
}

function showDoneStep() {
    const doneName = document.getElementById('qm-done-name');
    const doneVal = document.getElementById('qm-done-val');
    const waCta = document.getElementById('qm-wa-cta');

    if (doneName) doneName.textContent = quoteSession.name.split(' ')[0] || 'ya quedó';
    if (doneVal && quoteSession.price) {
        doneVal.textContent = `${formatCop(quoteSession.price.min)} – ${formatCop(quoteSession.price.max)}`;
    }

    if (waCta && appConfig.waPhone) {
        const text = encodeURIComponent(buildWhatsAppMessage());
        waCta.href = `https://wa.me/${appConfig.waPhone}?text=${text}`;
        waCta.addEventListener('click', () => {
            track('ClickWhatsApp', { origen: 'cierre-cotizador' });
        }, { once: true });
    }

    showStep(5);
}

async function submitQuote({ skipImage = false } = {}) {
    if (isSubmitting) return;
    if (!quoteSession.leadId || !quoteSession.token) {
        setError('form', 'Se perdió la sesión. Cierra y vuelve a empezar.');
        return;
    }

    isSubmitting = true;
    const submitBtn = document.getElementById('qm-submit');
    const skipBtn = document.getElementById('qm-skip');
    const original = submitBtn?.textContent;
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Enviando...'; }
    if (skipBtn) skipBtn.disabled = true;

    try {
        let referenceImgUrl = null;
        const file = skipImage ? null : pendingFile;

        if (file) {
            try {
                const { upload, storageUrl } = await import('./supabase.js');
                referenceImgUrl = storageUrl('reference-images', await upload('reference-images', file));
            } catch (uploadError) {
                console.error('Image upload failed:', uploadError);
                setError('file', 'No pudimos subir tu imagen. Puedes enviarla luego por WhatsApp — toca "Omitir y enviar".');
                return;
            }
        }

        const res = await fetch('/api/lead/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                leadId: quoteSession.leadId,
                token: quoteSession.token,
                description: quoteSession.description,
                sizeCm: quoteSession.sizeCm,
                reference_img_url: referenceImgUrl
            })
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudo enviar tu cotización. Intenta de nuevo.');

        // El servidor recalcula el precio: usamos su respuesta, no la del cliente.
        if (data.price && typeof data.price.min === 'number') {
            quoteSession.price = { min: data.price.min, max: data.price.max };
        }

        track('SubmitApplication', {
            content_name: 'Cotizacion completa',
            value: quoteSession.price?.min || 0,
            currency: 'COP'
        });
        trackAdsConversion();

        showDoneStep();
    } catch (error) {
        setError('form', error.message);
    } finally {
        isSubmitting = false;
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = original || 'Ver mi cotización'; }
        if (skipBtn) skipBtn.disabled = false;
    }
}

quoteForm?.addEventListener('submit', event => {
    event.preventDefault();
    submitQuote();
});

document.getElementById('qm-skip')?.addEventListener('click', () => submitQuote({ skipImage: true }));

/* ─── Navegacion entre pasos ─────────────────────────────────── */
modal?.querySelectorAll('[data-qm-next]').forEach(btn => {
    btn.addEventListener('click', () => {
        const step = Number(btn.dataset.qmNext);
        if (step === 1) submitStepOne(btn);
        else if (step === 2 && validateStepTwo()) showStep(3);
        else if (step === 3 && validateStepThree()) showStep(4);
    });
});

modal?.querySelectorAll('[data-qm-back]').forEach(btn => {
    btn.addEventListener('click', () => {
        clearErrors();
        showStep(Math.max(1, Number(btn.dataset.qmBack) - 1));
    });
});

/* ═══════════════════════════════════════════════════════════════
   ANIMACIONES Y UI
   ═══════════════════════════════════════════════════════════════ */
const hasGsap = typeof window.gsap !== 'undefined';

if (hasGsap) {
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({
        ignoreMobileResize: true,
        limitCallbacks: true,
        autoRefreshEvents: 'visibilitychange,DOMContentLoaded,load'
    });
    ScrollTrigger.normalizeScroll(false);
    window.addEventListener('load', () => ScrollTrigger.refresh());

    const heroTl = gsap.timeline({ delay: 0.4 });
    heroTl
        .to('#hero-black', { y: 0, opacity: 1, duration: 0.5, ease: 'power4.out' })
        .to('#hero-work', { y: 0, opacity: 1, duration: 0.5, ease: 'power4.out' }, '-=0.35')
        .to('#hero-negas', { y: 0, opacity: 1, duration: 0.5, ease: 'power4.out' }, '-=0.35')
        .to('#hero-btn-container', { opacity: 1, y: 0, duration: 0.7, ease: 'expo.out' }, '-=0.1');

    gsap.utils.toArray('.reveal-item').forEach(el => {
        gsap.to(el, {
            opacity: 1,
            y: 0,
            duration: 1.2,
            ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 90%', toggleActions: 'play none none none' }
        });
    });
}

// Red de seguridad unica: si GSAP no carga, o carga pero ScrollTrigger no
// dispara (scroll raro, error de terceros, prefers-reduced-motion), a los 3 s
// mostramos todo igual. Una landing invisible es una landing sin leads.
setTimeout(() => {
    document.querySelectorAll('.reveal-item').forEach(el => {
        if (Number(getComputedStyle(el).opacity) < 0.05) {
            el.style.opacity = '1';
            el.style.transform = 'none';
        }
    });
}, 3000);

/* ─── Header ─────────────────────────────────────────────────── */
// Transparente sobre el hero, con fondo apenas se baja. Sin listeners de
// scroll costosos: solo togglea una clase.
const siteHeader = document.getElementById('site-header');

if (siteHeader) {
    const syncHeader = () => siteHeader.classList.toggle('is-solid', window.scrollY > 24);
    syncHeader();
    window.addEventListener('scroll', syncHeader, { passive: true });
}

/* ─── CTA flotante ───────────────────────────────────────────── */
const floatingCta = document.getElementById('floating-cta');
const heroSection = document.getElementById('hero');
const bookingSection = document.getElementById('booking');
let heroVisible = true;
let bookingVisible = false;
let shakeTimer = null;

function updateFloatingCta() {
    if (!floatingCta) return;
    const shouldShow = !heroVisible && !bookingVisible;
    floatingCta.classList.toggle('is-visible', shouldShow);
    floatingCta.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');

    if (!isMobileDevice()) return;
    if (shouldShow) startShakePulse();
    else {
        clearInterval(shakeTimer);
        floatingCta.classList.remove('animate-shake');
    }
}

function triggerFloatingShake() {
    if (!floatingCta?.classList.contains('is-visible')) return;
    floatingCta.classList.remove('animate-shake');
    void floatingCta.offsetWidth;
    floatingCta.classList.add('animate-shake');
    floatingCta.addEventListener('animationend', () => {
        floatingCta.classList.remove('animate-shake');
    }, { once: true });
}

function startShakePulse() {
    clearInterval(shakeTimer);
    shakeTimer = setInterval(triggerFloatingShake, 12000);
}

if (floatingCta && heroSection && bookingSection && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
            if (entry.target === heroSection) heroVisible = entry.isIntersecting;
            if (entry.target === bookingSection) bookingVisible = entry.isIntersecting;
        }
        updateFloatingCta();
    }, { root: null, threshold: 0.12 });

    observer.observe(heroSection);
    observer.observe(bookingSection);
    updateFloatingCta();
}

/* ─── Acordeon FAQ ───────────────────────────────────────────── */
document.querySelectorAll('.accordion-header').forEach(header => {
    header.addEventListener('click', () => {
        const content = header.nextElementSibling;
        const isOpen = header.classList.contains('active');

        document.querySelectorAll('.accordion-header').forEach(other => {
            if (other !== header && other.classList.contains('active')) {
                other.classList.remove('active');
                const otherContent = other.nextElementSibling;
                if (hasGsap) gsap.to(otherContent, { height: 0, padding: 0 });
                else { otherContent.style.height = '0'; otherContent.style.padding = '0'; }
            }
        });

        header.classList.toggle('active');
        if (hasGsap) gsap.to(content, { height: isOpen ? 0 : 'auto', padding: isOpen ? 0 : '1.5rem' });
        else {
            content.style.height = isOpen ? '0' : 'auto';
            content.style.padding = isOpen ? '0' : '1.5rem';
        }
    });
});

/* ─── Arranque ───────────────────────────────────────────────── */
updatePrice();
loadConfig();
loadGallery();

// /cotizar abre el popup directo: es la URL que se usa en Google Ads.
if (window.location.pathname === '/cotizar' || window.location.hash === '#cotizar') {
    openQuote('url-cotizar', { push: false });
}
