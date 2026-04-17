# 🛡️ Guía de Protección Anti-DDoS y Anti-Bots

## Protecciones Implementadas

### ✅ 1. reCAPTCHA v3 (Google)
**Qué hace:** Verifica invisiblemente si quien envía es un humano.

**Pasos para activar:**
1. Ve a: https://www.google.com/recaptcha/admin
2. Dale a "Create" o "+" para nuevo sitio
3. Nombre: "Negas Ink"
4. reCAPTCHA Type: **v3**
5. Dominio: tu-dominio.com
6. Copia el **Site Key**
7. En el HTML, busca la línea con:
   ```javascript
   grecaptcha.execute('6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI', {action: 'submit'});
   ```
8. Reemplaza `6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI` por tu Site Key

### ✅ 2. Rate Limiting Automático
**Límites activados:**
- ⏱️ Intervalo mínimo: **30 segundos** entre envíos
- 📊 Por minuto: Máximo **2 envíos**
- 📅 Por hora: Máximo **10 envíos**

Los intentos se guardan automáticamente.

### ✅ 3. Validaciones Anti-Bots
- ✓ Campos no vacíos
- ✓ Email válido (formato correcto)
- ✓ Teléfono exacto (10 dígitos)
- ✓ reCAPTCHA token

---

## 🔥 Cloudflare (RECOMENDADO - Protección DDoS Real)

**Cloudflare es GRATIS y muy potente:**

### Instalación (5 minutos):

1. **Crear cuenta:** https://www.cloudflare.com/es/
2. **Agregar dominio:** Click en "Add site"
3. **Cambiar nameservers** (en tu registrador/hosting):
   ```
   Cloudflare te dirá estos, será algo como:
   - ns1.cloudflare.com
   - ns2.cloudflare.com
   ```
4. **Esperar validación** (puede tardar 24-48 horas)

### Una vez dentro de Cloudflare:

#### Security (Seguridad)
```
Ir a: Security → Settings
├─ Security Level: SET TO "HIGH"
├─ Challenge Passage: 30 minutes
└─ Browser Check: ON
```

#### WAF (Web Application Firewall)
```
Ir a: Security → WAF
├─ Enable OWASP Core Rule Set: ON
└─ Manage Rules: ENABLE ALL
```

#### Bot Management
```
Ir a: Security → Bot Management
├─ Super Bot Fight Mode: ENABLED
│  ├─ Definitely Automated
│  ├─ Likely Automated  
│  └─ Verified Bots: Review
└─ Bot Fight Mode (si no tienes Enterprise): ON
```

#### Rate Limiting
```
Ir a: Security → Rate Limiting
Crear regla:
├─ Path: /formulario (o similar)
├─ Threshold: 5 requests per 10 seconds (ajusta)
└─ Action: Block
```

#### DDoS Protection
```
Ir a: Security → DDoS Protection
├─ Sensitivity Level: High
└─ (Automático en plan gratuito)
```

---

## 📊 Monitoreo

### En el navegador del usuario:
- Si intenta mandar múltiples formularios rápido, verá: "Has enviado demasiadas solicitudes"
- El formulario validará email y teléfono antes de enviar

### En Cloudflare Dashboard:
- **Analytics:** Ver tráfico, bots, ataques
- **Security Events:** Ver todos los intentos bloqueados
- **Logs:** Historial detallado de cada request

---

## 🚀 Niveles de Protección

| Nivel | Protección | Tiempo | Costo |
|-------|-----------|--------|-------|
| **Básico** | Rate Limiting + reCAPTCHA | 5 min | Gratis |
| **Recomendado** | + Cloudflare Gratis | 30 min | Gratis |
| **Máximo** | + Cloudflare Pro | 1 hora | $20/mes |

---

## ❓ Preguntas Frecuentes

**¿Es visible el reCAPTCHA?**
No, v3 es invisible. No molesta al usuario.

**¿Cuánto cuesta?**
Todo es GRATIS. reCAPTCHA y Cloudflare tienen planes gratuitos.

**¿Protege contra DDoS de verdad?**
Sí, Cloudflare bloquea millones de ataques diarios. Muy confiable.

**¿Si cambio de hosting pierdo la protección?**
Mientras los nameservers apunten a Cloudflare, tienes protección (independiente del hosting).

**¿Qué pasa si un bot intenta el formulario?**
1. Rate limiting lo bloquea en 30 segundos
2. reCAPTCHA lo detecta
3. Cloudflare lo puede bloquear si es bots conocidos

---

## ⚙️ Código Modificado

Se agregaron:
- Input hidden para reCAPTCHA token: `<input type="hidden" name="recaptcha_token" id="recaptcha_token">`
- Lógica de validación antes de enviar
- Rate limiting mejorado con localStorage
- Validaciones de email y teléfono

---

📝 **Última actualización:** 11 de abril de 2026
