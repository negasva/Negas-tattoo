// 0. COMPORTAMIENTO INICIAL: Reiniciar scroll al recargar
if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
}

if (!window.location.hash) {
    window.scrollTo(0, 0);
}

gsap.registerPlugin(ScrollTrigger);

ScrollTrigger.config({
    ignoreMobileResize: true,
    limitCallbacks: true,
    autoRefreshEvents: 'visibilitychange,DOMContentLoaded,load'
});

ScrollTrigger.normalizeScroll(false);

window.addEventListener('load', () => {
    ScrollTrigger.refresh();
});

let configuracionApp = {};
let tiempoEscritura;
let tiempoCalculo;
let ultimoMensajeEscrito = '';

async function loadConfig() {
    const botonEnvio = document.getElementById('submit-btn');
    if (botonEnvio) botonEnvio.disabled = true;

    try {
        const res = await fetch('/api/config');
        if (!res.ok) throw new Error('No se pudo cargar la configuracion');
        configuracionApp = await res.json();
        applyConfig();
    } catch (error) {
        console.error('Error loading config:', error);
    }

    if (botonEnvio) botonEnvio.disabled = false;
}

function applyConfig() {
    const { waPhone, instagramUrl, facebookUrl, recaptchaSiteKey } = configuracionApp;

    if (waPhone) {
        const whatsappWebUrl = 'https://wa.me/' + waPhone;
        document.querySelectorAll('a.js-wa').forEach(a => {
            a.href = whatsappWebUrl;
            a.dataset.webHref = whatsappWebUrl;
            a.dataset.appHref = 'whatsapp://send?phone=' + waPhone;
        });
    }

    if (instagramUrl) {
        const instagramUsername = getInstagramUsername(instagramUrl);
        document.querySelectorAll('a.js-ig').forEach(a => {
            a.href = instagramUrl;
            a.dataset.webHref = instagramUrl;
            if (instagramUsername) {
                a.dataset.appHref = 'instagram://user?username=' + instagramUsername;
            }
        });
    }

    if (facebookUrl) document.querySelectorAll('a.js-fb').forEach(a => { a.href = facebookUrl; });

}

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
    document.querySelectorAll('a.js-wa, a.js-ig').forEach(anchor => {
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


function showSubmitError(message) {
    alert(message);
    typeWriter(message, 'text-red-500', true);
}

function showSubmitWarning(message) {
    alert(message);
    typeWriter(message, 'text-amber-400');
}

window.toggleMenu = function(e) {
    e.stopPropagation();
    const m = document.getElementById('mobileMenu');
    if (!m) return;
    m.classList.toggle('active');
    document.body.classList.toggle('menu-open', m.classList.contains('active'));
};

document.querySelector('.redes-dropdown button')?.addEventListener('click', (e) => {
    if (window.innerWidth <= 768) {
        e.preventDefault();
        e.currentTarget.parentElement.classList.toggle('active');
    }
});

document.querySelectorAll('.custom-dropdown').forEach(dropdown => {
    const btn = dropdown.querySelector('.dropdown-btn');
    const menu = dropdown.querySelector('.dropdown-menu');
    const icon = dropdown.querySelector('.dropdown-icon');
    const label = dropdown.querySelector('.dropdown-label');
    const input = dropdown.querySelector('input[type="hidden"]');
    const options = dropdown.querySelectorAll('.dropdown-option');

    btn.onclick = (e) => {
        e.stopPropagation();
        document.querySelectorAll('.dropdown-menu').forEach(m => {
            if (m !== menu) {
                m.classList.add('opacity-0', 'invisible', '-translate-y-2');
                m.previousElementSibling.querySelector('.dropdown-icon').classList.remove('rotate-180');
            }
        });
        const open = !menu.classList.contains('invisible');
        menu.classList.toggle('opacity-0', open);
        menu.classList.toggle('invisible', open);
        menu.classList.toggle('-translate-y-2', open);
        icon.classList.toggle('rotate-180', !open);
    };

    options.forEach(opt => {
        opt.onclick = (e) => {
            e.stopPropagation();
            input.value = opt.getAttribute('data-value');
            label.textContent = opt.textContent;
            label.classList.remove('opacity-50');
            menu.classList.add('opacity-0', 'invisible', '-translate-y-2');
            icon.classList.remove('rotate-180');

            if (input.id === 'ciudad' && opt.getAttribute('data-value') === 'Otro') {
                const warning = document.getElementById('city-warning');
                if (warning) {
                    warning.classList.remove('hidden');
                    warning.classList.add('flex');
                }
            }

            calculatePrice();
        };
    });
});

window.addEventListener('click', () => {
    document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.add('opacity-0', 'invisible', '-translate-y-2'));
    document.querySelectorAll('.dropdown-icon').forEach(i => i.classList.remove('rotate-180'));
});

function typeWriter(text, colorClass = 'text-zinc-500', shake = false) {
    const elementoMensaje = document.getElementById('terminal-msg');
    if (!elementoMensaje || (ultimoMensajeEscrito === text && elementoMensaje.classList.contains('animate-shake') === shake)) return;

    ultimoMensajeEscrito = text;
    clearTimeout(tiempoEscritura);
    elementoMensaje.className = `text-[10px] uppercase tracking-widest leading-relaxed transition-colors duration-300 ${colorClass} ${shake ? 'animate-shake' : ''}`;
    elementoMensaje.textContent = '';
    let indice = 0;

    function type() {
        if (indice < text.length) {
            elementoMensaje.textContent += text.charAt(indice);
            indice++;
            tiempoEscritura = setTimeout(type, 10);
        }
    }

    type();
}

window.calculatePrice = function() {
    const selectorSize = document.getElementById('size');
    const selectorComp = document.getElementById('complexity');
    const displaySize = document.getElementById('size-display-val');
    const displayPrice = document.getElementById('price-display');
    const contenedorResultado = document.getElementById('price-result');
    const spinner = document.getElementById('terminal-spinner');
    const disclaimer = document.getElementById('disclaimer-msg');
    const terminal = document.getElementById('terminal-container');

    if (!selectorSize || !selectorComp || !displaySize || !displayPrice || !contenedorResultado) return;

    const valorTamano = Number(selectorSize.value);
    displaySize.textContent = valorTamano + 'cm';
    document.getElementById('form-size').value = valorTamano + 'cm';

    const valorComplejidad = parseFloat(selectorComp.value);
    const ideaProyecto = document.querySelector('textarea[name="message"]')?.value.trim();
    const estiloSeleccionado = !Number.isNaN(valorComplejidad);
    const ideaValida = Boolean(ideaProyecto);

    clearTimeout(tiempoCalculo);

    if (!estiloSeleccionado || !ideaValida) {
        if (spinner) spinner.classList.add('hidden');
        if (terminal) terminal.classList.remove('hidden');
        typeWriter('Completa los campos requeridos', 'text-zinc-500');
        contenedorResultado.classList.add('hidden', 'opacity-0');
        if (disclaimer) disclaimer.classList.remove('hidden');
    } else {
        if (spinner) spinner.classList.remove('hidden');
        if (terminal) terminal.classList.remove('hidden');
        typeWriter('Procesando...', 'text-emerald-500/80');
        tiempoCalculo = setTimeout(() => {
            if (spinner) spinner.classList.add('hidden');
            if (terminal) terminal.classList.add('hidden');
            const base = 90000;
            const factorPequeno = 33000;
            const factorGrande = 45000;
            const total = base + Math.min(valorTamano, 15) * factorPequeno * valorComplejidad + Math.max(0, valorTamano - 15) * factorGrande * valorComplejidad;
            displayPrice.textContent = '$' + total.toLocaleString('es-CO');
            document.getElementById('form-estimated-price').value = '$' + total.toLocaleString('es-CO');
            contenedorResultado.classList.remove('hidden');
            if (disclaimer) disclaimer.classList.add('hidden');
            setTimeout(() => contenedorResultado.classList.remove('opacity-0'), 10);
        }, 800);
    }
};

import { supabase, uploadReferenceImage, saveLead } from './supabase.js'

const form = document.getElementById('tattoo-form');
if (form) {
    form.onsubmit = async e => {
        e.preventDefault();

        const btn = document.getElementById('submit-btn');
        btn.textContent = 'ENVIANDO...';
        btn.disabled = true;

        try {
            if (!form.checkValidity()) {
                form.reportValidity();
                throw new Error('Complete all required fields');
            }

            let referenceImgUrl = null;
            const fileInput = document.getElementById('fotoTatuaje');
            const file = fileInput?.files?.[0];

            if (file) {
                try {
                    const path = await uploadReferenceImage(file);
                    const { data } = supabase.storage.from('reference-images').getPublicUrl(path);
                    referenceImgUrl = data.publicUrl;
                } catch (uploadError) {
                    console.warn('Image upload failed:', uploadError.message);
                }
            }

            const estiloRaw = document.querySelector('#complexity')?.closest('.custom-dropdown')?.querySelector('.dropdown-label')?.textContent?.trim();
            const estiloLabel = (estiloRaw && estiloRaw !== 'Selecciona una opcion...') ? estiloRaw : '';

            const estimatedPrice = document.getElementById('form-estimated-price')?.value || '';
            const leadData = {
                name: form.user_name.value.trim(),
                email: form.user_email.value.trim(),
                phone: form.user_phone.value.trim(),
                tattoo_zone: document.getElementById('tattoo_zone').value,
                size: document.getElementById('form-size').value.trim(),
                description: form.message.value.trim(),
                reference_img_url: referenceImgUrl,
                status: 'lead',
                created_at: new Date().toISOString()
            };

            await saveLead(leadData);
            sessionStorage.setItem('ultimaCotizacion', JSON.stringify({
                cliente_nombre: leadData.name,
                zona_tatuaje: leadData.tattoo_zone,
                tamano_final: leadData.size,
                complejidad_diseno: estiloLabel,
                cotizacion_estimada: estimatedPrice
            }));
            window.location.href = 'resumen.html';
        } catch (error) {
            console.error('Submit error:', error);
            showSubmitError(error.message || 'Error sending. Try again.');
            btn.textContent = 'RETRY';
            btn.disabled = false;
            return;
        }

        btn.textContent = 'SENT';
    };
}

function getAltText(url) {
    const filename = url.substring(url.lastIndexOf('/') + 1).split('.')[0].toLowerCase();
    let alt = 'Tatuaje Blackwork Negas Ink Sabaneta';
    if (filename.includes('mariposa')) alt = 'Tatuaje de mariposa blackwork Negas Ink';
    else if (filename.includes('letras')) alt = 'Tatuaje de letras blackwork Negas Ink';
    else if (filename.includes('angel')) alt = 'Tatuaje de angel blackwork Negas Ink';
    else if (filename.includes('tigre')) alt = 'Tatuaje de tigre blackwork Negas Ink';
    else if (filename.includes('mask')) alt = 'Tatuaje de mascara blackwork Negas Ink';
    return alt;
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

const allImageUrls = [
    'https://i.ibb.co/3ykPPk25/Tatttoo-Angel-copy-5.jpg', 'https://i.ibb.co/fdPRjPvm/Tatttoo-pierna-completa-copy.jpg', 'https://i.ibb.co/C5xgJLXY/Tatttoo-Angel.jpg',
    'https://i.ibb.co/s93WWvNq/Tatttoo-Angel-copy-7.jpg', 'https://i.ibb.co/35ggTM1t/Tatttoo-pierna-completa-copy-2.jpg', 'https://i.ibb.co/x8MJ4tW3/Tatttoo-mask-copy.jpg',
    'https://i.ibb.co/CKMdBXVC/Tatttoo-mask.jpg', 'https://i.ibb.co/4n31ng5r/Tatttoo-Angel-copy-2.jpg', 'https://i.ibb.co/Z6LmS5WK/Tatttoo-tigre.jpg',
    'https://i.ibb.co/C3MCJJFW/Tatttoo-pierna-completa.jpg', 'https://i.ibb.co/JYsWfZd/Tatttoo-Angel-copy-3.jpg', 'https://i.ibb.co/fdPZLNzG/Tatttoo-Elefante.jpg',
    'https://i.ibb.co/FLhCmFhg/Tatttoo-eye.jpg', 'https://i.ibb.co/Q7YssPnN/Tatttoo-Angel-copy-4.jpg', 'https://i.ibb.co/kVWLJHSn/Tatttoo-Angel-copy.jpg',
    'https://i.ibb.co/cKvQ5BkL/Tatttoo-Angel-copy-6.jpg', 'https://i.ibb.co/dFYtWP4/tatuaje-mariposa.jpg', 'https://i.ibb.co/6RCSYkN4/tatuaje-letras.jpg',
    'https://i.ibb.co/wZhYZ7TN/tatuaje-letras-copy.jpg', 'https://i.ibb.co/FLGJ9Q23/tatuaje-bebe.jpg', 'https://i.ibb.co/tMJQbKZW/IMG-0066.png',
    'https://i.ibb.co/hF1pjnd9/IMG-0067.png', 'https://i.ibb.co/ynWN6Cj1/IMG-0065.png', 'https://i.ibb.co/pBjNrfVs/IMG-0063.png',
    'https://i.ibb.co/pjnW24PB/IMG-4198.jpg', 'https://i.ibb.co/cKQLSWqs/IMG-4197.jpg', 'https://i.ibb.co/pTN8kzF/IMG-4195.jpg',
    'https://i.ibb.co/W4mNXJdv/IMG-4194.jpg', 'https://i.ibb.co/Xf6251Jc/IMG-4192.jpg', 'https://i.ibb.co/Sw36MPnL/IMG-4201.jpg'
];

const IMGS = shuffleArray([...new Set(allImageUrls)].map(url => ({ src: url, alt: getAltText(url) })));
const N = IMGS.length;
const W = 350;
const GAP = 32;
const VISIBLE = 4;
const SCALES = [1.15, 1, 1, 1];
let cur = 0;
let dragging = false;
let dragX0 = 0;
let dragCurX = 0;
let cards = [];
const vp = document.getElementById('vp');
const dotsEl = document.getElementById('dots');

function relOffset(i) {
    let o = ((i - cur) % N + N) % N;
    return o > N / 2 ? o - N : o;
}

function targetProps(o) {
    const abs = Math.abs(o);
    const s = o > 0 ? 1 : -1;
    if (abs >= VISIBLE) return null;
    let x = 0;
    for (let j = 1; j <= abs; j++) x += s * (W * SCALES[j - 1] / 2 + W * SCALES[j] / 2 + GAP);
    return { x, scale: SCALES[abs], zIndex: 20 - abs, autoAlpha: 1 };
}

function layout(instant) {
    if (!vp) return;
    cards.forEach((el, i) => {
        const p = targetProps(relOffset(i));
        if (!p) {
            gsap.set(el, { autoAlpha: 0, zIndex: 0 });
            return;
        }
        el.style.zIndex = p.zIndex;
        el.style.visibility = 'visible';
        gsap.to(el, { x: p.x, scale: p.scale, autoAlpha: p.autoAlpha, duration: instant ? 0 : 0.6, ease: 'power3.out', overwrite: true });
    });
    document.querySelectorAll('.sc-dot').forEach((d, i) => d.classList.toggle('on', i === Math.round(cur)));
}

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox();
});

window.addEventListener('popstate', () => {
    const lb = document.getElementById('lightbox');
    if (lb && lb.classList.contains('active')) closeLightbox(true);
});

function go(d) {
    cur = ((cur + d) % N + N) % N;
    layout();
}

function openLightbox(src, el) {
    const lb = document.getElementById('lightbox');
    const lbImg = document.getElementById('lb-img');
    const r = el.getBoundingClientRect();
    if (!lb || !lbImg) return;

    lbImg.src = src;
    const startX = (r.left + r.width / 2) - (window.innerWidth / 2);
    const startY = (r.top + r.height / 2) - (window.innerHeight / 2);
    const startScale = r.width / (window.innerWidth * 0.9);

    lbImg.style.transition = 'none';
    lbImg.style.transform = `translate(${startX}px, ${startY}px) scale(${startScale})`;
    lbImg.style.opacity = '0';

    lb.classList.add('active');
    history.pushState({ lightbox: true }, '');

    lbImg.offsetHeight;

    lbImg.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.5s ease';
    lbImg.style.transform = 'translate(0, 0) scale(1)';
    lbImg.style.opacity = '1';

    document.body.style.overflow = 'hidden';
}

window.openLightbox = openLightbox;

function closeLightbox(isNavigation = false) {
    const lb = document.getElementById('lightbox');
    const lbImg = document.getElementById('lb-img');

    if (lb) {
        if (!lb.classList.contains('active')) return;

        lb.classList.remove('active');

        if (!isNavigation && history.state?.lightbox) history.back();

        if (lbImg) {
            lbImg.style.opacity = '0';
            lbImg.style.transform = 'translateY(20px) scale(0.95)';
            setTimeout(() => {
                if (!lb.classList.contains('active')) lbImg.src = '';
            }, 500);
        }
    }
    document.body.style.overflow = '';
}

window.closeLightbox = closeLightbox;

const lbContainer = document.getElementById('lightbox');
if (lbContainer) {
    lbContainer.addEventListener('click', () => closeLightbox());

    const lbImg = document.getElementById('lb-img');
    if (lbImg) lbImg.addEventListener('click', e => e.stopPropagation());

    let touchStartY = 0;
    lbContainer.addEventListener('touchstart', e => { touchStartY = e.touches[0].clientY; }, { passive: true });
    lbContainer.addEventListener('touchend', e => {
        const touchEndY = e.changedTouches[0].clientY;
        if (Math.abs(touchStartY - touchEndY) > 70) closeLightbox();
    }, { passive: true });
}

if (vp) {
    IMGS.forEach((imgData, i) => {
        const card = document.createElement('div');
        card.className = 'sc-card';
        const img = document.createElement('img');
        img.src = imgData.src;
        img.alt = imgData.alt;
        card.appendChild(img);
        img.loading = 'lazy';
        img.width = 350;
        img.height = 350;
        card.onclick = () => {
            stopAutoPlay();
            if (Math.abs(dragCurX - dragX0) > 6) return;
            const offset = relOffset(i);
            if (offset === 0) openLightbox(imgData.src, card);
            else go(offset);
        };
        vp.appendChild(card);
        cards.push(card);
        const dot = document.createElement('div');
        dot.className = 'sc-dot';
        dot.onclick = () => go(relOffset(i));
        if (dotsEl) dotsEl.appendChild(dot);
    });

    let autoPlayInterval = setInterval(() => go(1), 3500);
    const stopAutoPlay = () => clearInterval(autoPlayInterval);

    vp.onpointerdown = e => {
        stopAutoPlay();
        dragging = true;
        dragX0 = dragCurX = e.clientX;
        vp.setPointerCapture(e.pointerId);
    };
    vp.onpointermove = e => {
        if (!dragging) return;
        dragCurX = e.clientX;
        cards.forEach((c, i) => {
            const p = targetProps(relOffset(i));
            if (p) gsap.set(c, { x: p.x + (dragCurX - dragX0) * 0.25 });
        });
    };
    vp.onpointerup = () => {
        dragging = false;
        Math.abs(dragCurX - dragX0) > 55 ? go(dragCurX < dragX0 ? 1 : -1) : layout();
    };

    document.getElementById('prev')?.addEventListener('click', () => {
        stopAutoPlay();
        go(-1);
    });
    document.getElementById('next')?.addEventListener('click', () => {
        stopAutoPlay();
        go(1);
    });
    layout(true);
}

window.handleImagePreview = function(input) {
    const preview = document.getElementById('upload-preview');
    const img = document.getElementById('preview-img');
    if (input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            img.src = e.target.result;
            document.getElementById('upload-placeholder').classList.add('hidden');
            preview.classList.remove('hidden');
        };
        reader.readAsDataURL(input.files[0]);
    }
};

const heroTl = gsap.timeline({ delay: 0.5 });

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

document.querySelectorAll('.accordion-header').forEach(header => {
    header.onclick = () => {
        const content = header.nextElementSibling;
        const isOpen = header.classList.contains('active');
        document.querySelectorAll('.accordion-header').forEach(h => {
            if (h !== header && h.classList.contains('active')) {
                h.classList.remove('active');
                gsap.to(h.nextElementSibling, { height: 0, padding: 0 });
            }
        });
        header.classList.toggle('active');
        gsap.to(content, { height: isOpen ? 0 : 'auto', padding: isOpen ? 0 : '1.5rem' });
    };
});

loadConfig();
bindDeepLinkAnchors();

document.getElementById('size')?.addEventListener('input', calculatePrice);
calculatePrice();

const ta = document.querySelector('textarea[name="message"]');
if (ta) {
    ta.oninput = function() {
        document.getElementById('charCount').textContent = this.value.length + '/500';
        calculatePrice();
    };
}

const ph = document.querySelector('input[name="user_phone"]');
if (ph) {
    ph.oninput = function() {
        this.value = this.value.replace(/\D/g, '');
    };
}

const uploadZone = document.getElementById('upload-zone');
const fileInput = document.getElementById('fotoTatuaje');
if (uploadZone && fileInput) {
    uploadZone.addEventListener('click', () => fileInput.click());
}

const cityWarning = document.getElementById('city-warning');
const cityWarningOverlay = document.getElementById('city-warning-overlay');
const cityWarningClose = document.getElementById('city-warning-close');
const closeCityWarning = () => {
    cityWarning?.classList.add('hidden');
    cityWarning?.classList.remove('flex');
};

cityWarningOverlay?.addEventListener('click', closeCityWarning);
cityWarningClose?.addEventListener('click', closeCityWarning);
