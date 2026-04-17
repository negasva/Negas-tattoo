gsap.registerPlugin(ScrollTrigger);

// 0. COMPORTAMIENTO INICIAL: Reiniciar scroll al recargar
if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
}
window.scrollTo(0, 0);

let configuracionApp = {};
let tiempoEscritura;
let tiempoCalculo;
let ultimoMensajeEscrito = "";

async function loadConfig() {
    const botonEnvio = document.getElementById('submit-btn');
    if (botonEnvio) botonEnvio.disabled = true;
    try {
        const res = await fetch('/api/config');
        if (res.ok) {
            configuracionApp = await res.json();
            applyConfig();
        }
    } catch (e) { console.error("Error cargando configuración:", e); }
    if (botonEnvio) botonEnvio.disabled = false;
}

function applyConfig() {
    const { waPhone, instagramUrl, facebookUrl, emailjsPublicKey, recaptchaSiteKey } = configuracionApp;
    if (waPhone) document.querySelectorAll('a.js-wa').forEach(a => a.href = 'https://wa.me/' + waPhone);
    if (instagramUrl) document.querySelectorAll('a.js-ig').forEach(a => a.href = instagramUrl);
    if (facebookUrl) document.querySelectorAll('a.js-fb').forEach(a => a.href = facebookUrl);
    if (emailjsPublicKey) emailjs.init(emailjsPublicKey);
    if (recaptchaSiteKey) {
        const scriptRecaptcha = document.createElement('script');
        scriptRecaptcha.src = 'https://www.google.com/recaptcha/api.js?render=' + recaptchaSiteKey;
        scriptRecaptcha.async = true;
        document.head.appendChild(scriptRecaptcha);
    }
}

window.toggleMenu = function(e) {
    e.stopPropagation();
    const m = document.getElementById('mobileMenu');
    if (!m) return;
    m.classList.toggle('active');
    document.body.classList.toggle('menu-open', m.classList.contains('active'));
};

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
        menu.classList.toggle('opacity-0', open); menu.classList.toggle('invisible', open); menu.classList.toggle('-translate-y-2', open);
        icon.classList.toggle('rotate-180', !open);
    };

    options.forEach(opt => {
        opt.onclick = () => {
            input.value = opt.getAttribute('data-value'); 
            label.textContent = opt.textContent; 
            label.classList.remove('opacity-50');
            menu.classList.add('opacity-0', 'invisible', '-translate-y-2'); 
            icon.classList.remove('rotate-180');
            calculatePrice();
        };
    });
});

window.addEventListener('click', () => {
    document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.add('opacity-0', 'invisible', '-translate-y-2'));
    document.querySelectorAll('.dropdown-icon').forEach(i => i.classList.remove('rotate-180'));
});

function typeWriter(text, colorClass = "text-zinc-500", shake = false) {
    const elementoMensaje = document.getElementById('terminal-msg');
    if (!elementoMensaje || (ultimoMensajeEscrito === text && elementoMensaje.classList.contains('animate-shake') === shake)) return;
    ultimoMensajeEscrito = text;
    clearTimeout(tiempoEscritura);
    elementoMensaje.className = `text-[10px] uppercase tracking-widest leading-relaxed transition-colors duration-300 ${colorClass} ${shake ? 'animate-shake' : ''}`;
    elementoMensaje.textContent = '';
    let indice = 0;
    function type() {
        if (indice < text.length) { elementoMensaje.textContent += text.charAt(indice); indice++; tiempoEscritura = setTimeout(type, 10); }
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
    
    const valorTamano = +selectorSize.value; 
    displaySize.textContent = valorTamano + 'cm'; 
    document.getElementById('form-size').value = valorTamano + 'cm';
    
    const valorComplejidad = parseFloat(selectorComp.value);
    const ideaProyecto = document.querySelector('textarea[name="message"]')?.value.trim();
    const estiloSeleccionado = !isNaN(valorComplejidad);
    const ideaValida = ideaProyecto && ideaProyecto.length > 0;
    const sliderMovido = valorTamano !== 10;
    
    clearTimeout(tiempoCalculo);

    if (!estiloSeleccionado && !ideaValida && !sliderMovido) {
        if (spinner) spinner.classList.add('hidden'); if (terminal) terminal.classList.remove('hidden'); typeWriter('Esperando información...', 'text-zinc-500');
        contenedorResultado.classList.add('hidden', 'opacity-0'); if (disclaimer) disclaimer.classList.remove('hidden');
    } else if (!estiloSeleccionado || !ideaValida) {
        if (spinner) spinner.classList.add('hidden'); if (terminal) terminal.classList.remove('hidden'); typeWriter('Completa los campos requeridos 😟', 'text-red-500', true);
        contenedorResultado.classList.add('hidden', 'opacity-0'); if (disclaimer) disclaimer.classList.remove('hidden');
    } else {
        if (spinner) spinner.classList.remove('hidden'); if (terminal) terminal.classList.remove('hidden'); typeWriter('Procesando...', 'text-emerald-500/80');
        tiempoCalculo = setTimeout(() => {
            if (spinner) spinner.classList.add('hidden'); if (terminal) terminal.classList.add('hidden');
            const base = 90000, factorPequeno = 33000, factorGrande = 45000;
            const total = base + Math.min(valorTamano, 15) * factorPequeno * valorComplejidad + Math.max(0, valorTamano - 15) * factorGrande * valorComplejidad;
            const precioFormateado = '$' + total.toLocaleString('es-CO');
            displayPrice.textContent = precioFormateado; 
            document.getElementById('form-estimated-price').value = precioFormateado;
            contenedorResultado.classList.remove('hidden'); if (disclaimer) disclaimer.classList.add('hidden'); setTimeout(() => contenedorResultado.classList.remove('opacity-0'), 10);
        }, 800);
    }
};

const form = document.getElementById('tattoo-form');
if (form) {
    form.onsubmit = async e => {
        e.preventDefault();
        const btn = document.getElementById('submit-btn');
        btn.textContent = 'ENVIANDO...'; btn.disabled = true;
        
        let imageUrl = '';
        const file = document.getElementById('fotoTatuaje').files[0];
        if (file) {
            const fd = new FormData(); fd.append('image', file);
            const res = await fetch('/api/upload-image', { method: 'POST', body: fd });
            if (res.ok) { const data = await res.json(); imageUrl = data.url; }
        }

        const params = {
            cliente_nombre: form.user_name.value,
            cliente_whatsapp: form.user_phone.value,
            user_email: form.user_email.value,
            ciudad: document.getElementById('ciudad').value,
            zona_tatuaje: document.getElementById('tattoo_zone').value,
            complejidad_diseno: document.querySelector('#complexity').closest('.custom-dropdown').querySelector('.dropdown-label').textContent,
            descripcion_referencia: form.message.value,
            cotizacion_estimada: document.getElementById('form-estimated-price').value,
            tamano_final: document.getElementById('form-size').value,
            link_referencia: imageUrl
        };

        const { emailjsServiceId, emailjsTemplateId } = configuracionApp;
        emailjs.send(emailjsServiceId, emailjsTemplateId, params).then(() => {
            localStorage.setItem('ultimaCotizacion', JSON.stringify(params));
            window.location.href = 'resumen.html';
        }).catch(() => { alert('Error al enviar'); btn.textContent = 'REINTENTAR'; btn.disabled = false; });
    };
}

function getAltText(url) {
    const filename = url.substring(url.lastIndexOf('/') + 1).split('.')[0].toLowerCase();
    let alt = "Tatuaje Blackwork Negas Ink Sabaneta";
    if (filename.includes('mariposa')) alt = "Tatuaje de mariposa blackwork Negas Ink";
    else if (filename.includes('letras')) alt = "Tatuaje de letras blackwork Negas Ink";
    else if (filename.includes('angel')) alt = "Tatuaje de ángel blackwork Negas Ink";
    else if (filename.includes('tigre')) alt = "Tatuaje de tigre blackwork Negas Ink";
    else if (filename.includes('mask')) alt = "Tatuaje de máscara blackwork Negas Ink";
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
    "https://i.ibb.co/3ykPPk25/Tatttoo-Angel-copy-5.jpg", "https://i.ibb.co/fdPRjPvm/Tatttoo-pierna-completa-copy.jpg", "https://i.ibb.co/C5xgJLXY/Tatttoo-Angel.jpg", 
    "https://i.ibb.co/s93WWvNq/Tatttoo-Angel-copy-7.jpg", "https://i.ibb.co/35ggTM1t/Tatttoo-pierna-completa-copy-2.jpg", "https://i.ibb.co/x8MJ4tW3/Tatttoo-mask-copy.jpg", 
    "https://i.ibb.co/CKMdBXVC/Tatttoo-mask.jpg", "https://i.ibb.co/4n31ng5r/Tatttoo-Angel-copy-2.jpg", "https://i.ibb.co/Z6LmS5WK/Tatttoo-tigre.jpg", 
    "https://i.ibb.co/C3MCJJFW/Tatttoo-pierna-completa.jpg", "https://i.ibb.co/JYsWfZd/Tatttoo-Angel-copy-3.jpg", "https://i.ibb.co/fdPZLNzG/Tatttoo-Elefante.jpg", 
    "https://i.ibb.co/FLhCmFhg/Tatttoo-eye.jpg", "https://i.ibb.co/Q7YssPnN/Tatttoo-Angel-copy-4.jpg", "https://i.ibb.co/kVWLJHSn/Tatttoo-Angel-copy.jpg", 
    "https://i.ibb.co/cKvQ5BkL/Tatttoo-Angel-copy-6.jpg", "https://i.ibb.co/dFYtWP4/tatuaje-mariposa.jpg", "https://i.ibb.co/6RCSYkN4/tatuaje-letras.jpg", 
    "https://i.ibb.co/wZhYZ7TN/tatuaje-letras-copy.jpg", "https://i.ibb.co/FLGJ9Q23/tatuaje-bebe.jpg", "https://i.ibb.co/tMJQbKZW/IMG-0066.png", 
    "https://i.ibb.co/hF1pjnd9/IMG-0067.png", "https://i.ibb.co/ynWN6Cj1/IMG-0065.png", "https://i.ibb.co/pBjNrfVs/IMG-0063.png", 
    "https://i.ibb.co/pjnW24PB/IMG-4198.jpg", "https://i.ibb.co/cKQLSWqs/IMG-4197.jpg", "https://i.ibb.co/pTN8kzF/IMG-4195.jpg", 
    "https://i.ibb.co/W4mNXJdv/IMG-4194.jpg", "https://i.ibb.co/Xf6251Jc/IMG-4192.jpg", "https://i.ibb.co/Sw36MPnL/IMG-4201.jpg"
];

const IMGS = shuffleArray([...new Set(allImageUrls)].map(url => ({ src: url, alt: getAltText(url) })));
const N = IMGS.length, W = 280, GAP = 24, VISIBLE = 4, SCALES = [1.15, 1, 1, 1];
let cur = 0, dragging = false, dragX0 = 0, dragCurX = 0, cards = [];
const vp = document.getElementById('vp'), dotsEl = document.getElementById('dots');

function relOffset(i) { let o = ((i - cur) % N + N) % N; return o > N / 2 ? o - N : o; }
function targetProps(o) {
    const abs = Math.abs(o), s = o > 0 ? 1 : -1; if (abs >= VISIBLE) return null;
    let x = 0; for (let j = 1; j <= abs; j++) x += s * (W * SCALES[j - 1] / 2 + W * SCALES[j] / 2 + GAP);
    return { x, scale: SCALES[abs], zIndex: 20 - abs, autoAlpha: 1 };
}

function layout(instant) {
    if (!vp) return;
    cards.forEach((el, i) => {
        const p = targetProps(relOffset(i));
        if (!p) { gsap.set(el, { autoAlpha: 0, zIndex: 0 }); return; }
        el.style.zIndex = p.zIndex;
        el.style.visibility = 'visible';
        gsap.to(el, { x: p.x, scale: p.scale, autoAlpha: p.autoAlpha, duration: instant ? 0 : 0.6, ease: 'power3.out', overwrite: true });
    });
    document.querySelectorAll('.sc-dot').forEach((d, i) => d.classList.toggle('on', i === Math.round(cur)));
}

function go(d) { cur = ((cur + d) % N + N) % N; layout(); }

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
    lbImg.offsetHeight; // force reflow

    // Animación de entrada suave
    lbImg.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.5s ease';
    lbImg.style.transform = 'translate(0, 0) scale(1)';
    lbImg.style.opacity = '1';
    
    document.body.style.overflow = 'hidden';
}
// Hacerlo disponible globalmente
window.openLightbox = openLightbox;

function closeLightbox() { 
    const lb = document.getElementById('lightbox');
    if(lb) {
        lb.classList.remove('active');
        const lbImg = document.getElementById('lb-img');
        if(lbImg) {
            lbImg.style.opacity = '0';
            lbImg.style.transform = 'translateY(20px) scale(0.95)';
        }
    }
    document.body.style.overflow = '';
}
window.closeLightbox = closeLightbox;

// Init carousel
if (vp) {
    IMGS.forEach((imgData, i) => {
        const card = document.createElement('div'); card.className = 'sc-card';
        const img = document.createElement('img'); img.src = imgData.src; img.alt = imgData.alt; card.appendChild(img);
        img.loading = "lazy"; img.width = 280; img.height = 280;
        card.onclick = () => {
            if(Math.abs(dragCurX - dragX0) > 6) return;
            const offset = relOffset(i);
            if(offset === 0) openLightbox(imgData.src, card);
            else go(offset);
        };
        vp.appendChild(card); cards.push(card);
        const dot = document.createElement('div'); dot.className = 'sc-dot'; dot.onclick = () => go(relOffset(i)); 
        if(dotsEl) dotsEl.appendChild(dot);
    });
    vp.onpointerdown = e => { dragging = true; dragX0 = dragCurX = e.clientX; vp.setPointerCapture(e.pointerId); };
    vp.onpointermove = e => { if (!dragging) return; dragCurX = e.clientX; cards.forEach((c, i) => { const p = targetProps(relOffset(i)); if (p) gsap.set(c, { x: p.x + (dragCurX - dragX0) * .25 }); }); };
    vp.onpointerup = () => { dragging = false; Math.abs(dragCurX - dragX0) > 55 ? go(dragCurX < dragX0 ? 1 : -1) : layout(); };
    if(document.getElementById('prev')) document.getElementById('prev').onclick = () => go(-1);
    if(document.getElementById('next')) document.getElementById('next').onclick = () => go(1);
    layout(true);
}

window.handleImagePreview = function(input) {
    const preview = document.getElementById('upload-preview'), img = document.getElementById('preview-img');
    if (input.files[0]) {
        const reader = new FileReader(); reader.onload = (e) => {
            img.src = e.target.result; 
            document.getElementById('upload-placeholder').classList.add('hidden'); 
            preview.classList.remove('hidden');
        }; reader.readAsDataURL(input.files[0]);
    }
};

// 7. ANIMACIONES GSAP

// 7. ANIMACIONES HERO (Secuencia Refactorizada)
const heroTl = gsap.timeline({ delay: 0.5 });

heroTl
    .to("#hero-black", { x: 0, opacity: 1, duration: 1.2, ease: "power4.out" })
    .to("#hero-negas", { x: 0, opacity: 1, duration: 1.2, ease: "power4.out" }, "-=0.8")
    .to("#hero-work", { opacity: 1, duration: 1.5, ease: "expo.out" }, "-=0.4")
    .to("#hero-btn-container", { opacity: 1, y: 0, duration: 1, ease: "power3.out" }, "-=0.5");

// Parallax suave para la imagen del hero
gsap.to("#hero-img-parallax", {
    yPercent: 15,
    ease: "none",
    scrollTrigger: {
        trigger: "#hero",
        start: "top top",
        end: "bottom top",
        scrub: true
    }
});

// Animación de entrada para el contenedor de la imagen
gsap.from("#hero-img-container", {
    clipPath: "inset(100% 0% 0% 0%)",
    duration: 1.5,
    ease: "power4.inOut",
    delay: 0.2
});

gsap.utils.toArray('.reveal-item').forEach(el => {
    gsap.to(el, {
        opacity: 1,
        y: 0,
        duration: 1.2,
        ease: "power3.out",
        scrollTrigger: { trigger: el, start: "top 90%", toggleActions: "play none none none" }
    });
});

document.querySelectorAll('.accordion-header').forEach(header => {
    header.onclick = () => {
        const content = header.nextElementSibling, isOpen = header.classList.contains('active');
        document.querySelectorAll('.accordion-header').forEach(h => {
            if (h !== header && h.classList.contains('active')) {
                h.classList.remove('active'); gsap.to(h.nextElementSibling, { height: 0, padding: 0 });
            }
        });
        header.classList.toggle('active'); gsap.to(content, { height: isOpen ? 0 : "auto", padding: isOpen ? 0 : "1.5rem" });
    };
});

// 8. INICIO
loadConfig();
if(document.getElementById('size')) document.getElementById('size').oninput = calculatePrice;
const ta = document.querySelector('textarea[name="message"]');
if(ta) ta.oninput = function() {
    document.getElementById('charCount').textContent = this.value.length + '/500';
    calculatePrice();
};
const ph = document.querySelector('input[name="user_phone"]');
if(ph) ph.oninput = function() { this.value = this.value.replace(/\D/g, ''); };