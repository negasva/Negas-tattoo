/* ═══════════════════════════════════════════════════════════════
   Panel admin.

   Este archivo estaba embebido en index.html. Salió a un .js externo
   para poder quitar 'unsafe-inline' de script-src en la CSP.

   Ni los leads ni las estadísticas se leen ya con la anon key: pasan
   por /api/admin/*, que verifica el JWT del admin en el servidor.
   ═══════════════════════════════════════════════════════════════ */

import {
    getSupabase, getLeads, updateLeadStatus, deleteLead, restoreLead, getStats,
    upload, storageUrl, saveDocument,
    getGalleryImages, createGalleryImage, updateGalleryImage, deleteGalleryImage
} from '../supabase.js'

const loginScreen = document.getElementById('login-screen')
const adminScreen = document.getElementById('admin-screen')
const $ = id => document.getElementById(id)

/* ─── Toast ─── */
let toastTimer = null
function toast(message, isError = false) {
    const el = $('toast')
    el.textContent = message
    el.classList.toggle('error', isError)
    el.classList.add('show')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800)
}

const escapeHtml = value => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/* ─── Auth ─── */
async function login() {
    const email = $('email').value
    const password = $('password').value
    const errorEl = $('login-error')
    const btn = $('login-btn')

    btn.textContent = 'Entrando...'
    btn.disabled = true
    errorEl.classList.add('hidden')

    try {
        const supabase = await getSupabase()
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        showAdmin()
    } catch (err) {
        console.error(err)
        errorEl.textContent = err?.message?.includes('SUPABASE')
            ? 'Falta configurar el servidor.'
            : 'Credenciales incorrectas'
        errorEl.classList.remove('hidden')
    } finally {
        btn.textContent = 'Entrar'
        btn.disabled = false
    }
}

async function logout() {
    const supabase = await getSupabase()
    await supabase.auth.signOut()
    loginScreen.classList.remove('hidden')
    adminScreen.classList.add('hidden')
    $('email').value = ''
    $('password').value = ''
}

function showAdmin() {
    loginScreen.classList.add('hidden')
    adminScreen.classList.remove('hidden')
    loadDashboard()
    loadGallery()
}

/* ─── Tabs ─── */
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        $('tab-leads').classList.toggle('hidden', btn.dataset.tab !== 'leads')
        $('tab-galeria').classList.toggle('hidden', btn.dataset.tab !== 'galeria')
    })
})

/* ═══════════ LEADS ═══════════ */
let allLeads = []

async function loadDashboard() {
    try {
        const [leads, stats] = await Promise.all([getLeads(), getStats()])
        allLeads = leads
        $('stat-leads').textContent = stats.totalLeads
        $('stat-complete').textContent = stats.completedQuotes
        $('stat-clients').textContent = stats.totalClients
        $('stat-conversion').textContent = stats.conversionRate + '%'
        renderLeads()
    } catch (err) {
        console.error(err)
        toast('No se pudieron cargar los leads', true)
    }
}

function waLink(phone) {
    const digits = String(phone || '').replace(/\D/g, '')
    if (!digits) return null
    return 'https://wa.me/' + (digits.length === 10 ? '57' + digits : digits)
}

function renderLeads() {
    const statusFilter = $('filter-status').value
    const stageFilter = $('filter-stage').value

    const filtered = allLeads
        .filter(l => !statusFilter || l.status === statusFilter)
        .filter(l => !stageFilter || (l.stage || 'complete') === stageFilter)

    $('leads-count').textContent = filtered.length + ' registros'

    if (!filtered.length) {
        $('leads-table').innerHTML = '<tr><td colspan="7" class="px-6 py-10 text-center text-zinc-500">Nada por aquí todavía.</td></tr>'
        return
    }

    $('leads-table').innerHTML = filtered.map(lead => {
        const stage = lead.stage || 'complete'
        // La clase sale de una lista cerrada, nunca del valor de la base.
        const stageClass = stage === 'partial' ? 'stage-partial' : 'stage-complete'
        const stageLabel = stage === 'partial' ? 'Incompleta' : 'Completa'
        const wa = waLink(lead.phone)
        const idea = lead.description || ''
        const shortIdea = idea.length > 60 ? idea.slice(0, 57) + '…' : idea

        return `
        <tr class="lead-row">
            <td class="px-6 py-4 align-top">
                <button class="delete-lead text-zinc-600 hover:text-red-600 transition text-xs font-black mr-2" data-delete-id="${lead.id}" title="Eliminar">✕</button>
                <span class="font-bold italic cursor-pointer hover:text-red-500 transition" data-fill-name="${escapeHtml(lead.name)}" data-lead-id="${lead.id}" data-lead-status="${escapeHtml(lead.status)}">${escapeHtml(lead.name) || '—'}</span>
                ${lead.email ? `<div class="text-[11px] text-zinc-600 mt-1">${escapeHtml(lead.email)}</div>` : ''}
            </td>
            <td class="px-4 py-4 align-top whitespace-nowrap">
                ${wa ? `<a href="${wa}" target="_blank" rel="noopener" class="text-emerald-400 hover:text-emerald-300 font-mono text-xs">${escapeHtml(lead.phone)}</a>` : '—'}
            </td>
            <td class="px-4 py-4 align-top text-zinc-400 text-xs max-w-[16rem]" title="${escapeHtml(idea)}">${escapeHtml(shortIdea) || '—'}</td>
            <td class="px-4 py-4 align-top text-zinc-400 whitespace-nowrap">${escapeHtml(lead.size) || '—'}</td>
            <td class="px-4 py-4 align-top text-zinc-300 text-xs whitespace-nowrap">${escapeHtml(lead.estimated_price) || '—'}</td>
            <td class="px-4 py-4 align-top">
                <span class="px-2 py-1 text-[10px] font-black uppercase ${stageClass}">${stageLabel}</span>
            </td>
            <td class="px-4 py-4 align-top">
                <select class="status-select input-sm font-bold uppercase cursor-pointer" data-lead-id="${lead.id}">
                    <option value="lead" ${lead.status === 'lead' ? 'selected' : ''}>Lead</option>
                    <option value="client" ${lead.status === 'client' ? 'selected' : ''}>Cliente</option>
                    <option value="recurring" ${lead.status === 'recurring' ? 'selected' : ''}>Recurrente</option>
                </select>
            </td>
        </tr>`
    }).join('')
}

let selectedLeadId = null
let selectedLeadStatus = null

$('leads-table').addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('.delete-lead')
    if (deleteBtn) {
        if (!confirm('¿Eliminar este lead? Deja de aparecer en la lista y queda marcado como borrado en la base.')) return
        try {
            await deleteLead(deleteBtn.dataset.deleteId)
            toast('Lead eliminado')
            await loadDashboard()
        } catch (err) {
            toast(err.message, true)
        }
        return
    }
    const cell = e.target.closest('[data-fill-name]')
    if (!cell) return
    selectedLeadId = cell.dataset.leadId
    selectedLeadStatus = cell.dataset.leadStatus
    $('doc-name').value = cell.dataset.fillName
    $('doc-name').scrollIntoView({ behavior: 'smooth', block: 'center' })
})

$('leads-table').addEventListener('change', async (e) => {
    if (!e.target.classList.contains('status-select')) return
    try {
        await updateLeadStatus(e.target.dataset.leadId, e.target.value)
        toast('Estado actualizado')
        loadDashboard()
    } catch (err) {
        console.error(err)
        toast('No se pudo actualizar', true)
    }
})

$('filter-status').addEventListener('change', renderLeads)
$('filter-stage').addEventListener('change', renderLeads)

$('doc-menor').addEventListener('change', (e) => {
    $('acudiente-section').classList.toggle('hidden', !e.target.checked)
})

$('upload-doc-btn').addEventListener('click', async () => {
    const file = $('doc-file').files[0]
    const name = $('doc-name').value.trim()
    const cedula = $('doc-cedula').value.trim()
    const esMenor = $('doc-menor').checked
    const statusEl = $('doc-status')
    const btn = $('upload-doc-btn')

    if (!file || !name) { toast('Completa nombre y archivo', true); return }

    btn.textContent = 'Subiendo...'
    btn.disabled = true

    try {
        const filePath = await upload('signed-documents', file, name)

        const docData = {
            client_name: name,
            cedula: cedula || null,
            es_menor: esMenor,
            tatuador: 'Negas',
            file_url: filePath,
            date: new Date().toISOString()
        }

        if (esMenor) {
            const acudienteFile = $('doc-acudiente-file').files[0]
            docData.acudiente_nombre = $('doc-acudiente-nombre').value.trim() || null
            docData.acudiente_cedula = $('doc-acudiente-cedula').value.trim() || null
            if (acudienteFile) {
                docData.acudiente_file_url = await upload('signed-documents', acudienteFile, name + '-acudiente')
            }
        }

        await saveDocument(docData)

        if (selectedLeadId) {
            const nameMatch = (allLeads || []).filter(l =>
                String(l.id) !== String(selectedLeadId) &&
                (l.status === 'client' || l.status === 'recurring') &&
                (l.name || '').toLowerCase() === name.toLowerCase()
            )
            const newStatus = nameMatch.length > 0 ? 'recurring'
                : selectedLeadStatus === 'lead' ? 'client'
                : selectedLeadStatus === 'client' ? 'recurring'
                : null
            if (newStatus) {
                await updateLeadStatus(selectedLeadId, newStatus)
                selectedLeadId = null
                selectedLeadStatus = null
            }
        }

        statusEl.textContent = '✓ Documento subido'
        statusEl.className = 'text-[11px] uppercase tracking-widest text-emerald-400'
        statusEl.classList.remove('hidden')
        toast('Documento subido')

        $('doc-file').value = ''
        $('doc-name').value = ''
        $('doc-cedula').value = ''
        $('doc-menor').checked = false
        $('acudiente-section').classList.add('hidden')
        $('doc-acudiente-nombre').value = ''
        $('doc-acudiente-cedula').value = ''
        $('doc-acudiente-file').value = ''
        loadDashboard()
    } catch (err) {
        console.error(err)
        statusEl.textContent = '✗ Error al subir'
        statusEl.className = 'text-[11px] uppercase tracking-widest text-red-500'
        statusEl.classList.remove('hidden')
        toast('Error al subir el documento', true)
    }

    btn.textContent = 'Subir Documento'
    btn.disabled = false
})

/* ─── Leads eliminados ─── */
// Los eliminados viven en la base (columna deleted_at), no en el localStorage:
// antes se perdían al cambiar de equipo y el dato seguía intacto en Supabase.
async function renderDeletedModal() {
    const listEl = $('deleted-leads-list')
    listEl.innerHTML = '<div class="px-6 py-8 text-center text-zinc-500">Cargando…</div>'

    let deletedLeads = []
    try {
        deletedLeads = await getLeads({ deleted: true })
    } catch (err) {
        listEl.innerHTML = `<div class="px-6 py-8 text-center text-zinc-500">${escapeHtml(err.message)}</div>`
        return
    }

    $('deleted-count').textContent = deletedLeads.length + ' leads eliminados'

    if (!deletedLeads.length) {
        listEl.innerHTML = '<div class="px-6 py-8 text-center text-zinc-500">No hay leads eliminados</div>'
        return
    }

    listEl.innerHTML = deletedLeads.map(lead => `
        <div class="px-6 py-4 flex justify-between items-center hover:bg-white/5 transition">
            <div class="flex-1">
                <p class="font-bold italic text-white">${escapeHtml(lead.name) || '—'}</p>
                <p class="text-xs text-zinc-500">${escapeHtml(lead.phone || lead.email) || '—'}</p>
            </div>
            <button class="recover-lead bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 text-xs font-black uppercase transition" data-recover-id="${lead.id}">Recuperar</button>
        </div>
    `).join('')
}

$('deleted-leads-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('.recover-lead')
    if (!btn) return
    try {
        await restoreLead(btn.dataset.recoverId)
        toast('Lead recuperado')
        await Promise.all([loadDashboard(), renderDeletedModal()])
    } catch (err) {
        toast(err.message, true)
    }
})

const deletedModal = $('deleted-leads-modal')
$('deleted-leads-btn').addEventListener('click', () => {
    deletedModal.classList.remove('hidden')
    deletedModal.classList.add('flex')
    renderDeletedModal()
})
$('close-deleted-modal').addEventListener('click', () => {
    deletedModal.classList.add('hidden')
    deletedModal.classList.remove('flex')
})
deletedModal.addEventListener('click', (e) => {
    if (e.target === deletedModal) {
        deletedModal.classList.add('hidden')
        deletedModal.classList.remove('flex')
    }
})

/* ═══════════ GALERÍA ═══════════ */
// La lista viva de categorías y tamaños es la del servidor (/api/config), la
// misma con la que valida /api/admin/gallery. Aquí no se repite: estaba
// escrita tres veces (server.js, este archivo y el <select> del HTML).
let CATEGORIES = []
let SPANS = []

async function loadGalleryConfig() {
    const res = await fetch('/api/config')
    if (!res.ok) throw new Error('No se pudo cargar la configuración.')
    const { gallery } = await res.json()
    CATEGORIES = gallery.categories
    SPANS = gallery.spans
    $('gal-category').innerHTML = CATEGORIES.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')
    $('gal-span').innerHTML = SPANS.map(s => `<option value="${escapeHtml(s.value)}">${escapeHtml(s.label)}</option>`).join('')
}

let galleryImages = []

async function loadGallery() {
    try {
        if (!CATEGORIES.length) await loadGalleryConfig()
        galleryImages = await getGalleryImages()
        renderGalleryAdmin()
    } catch (err) {
        console.error(err)
        $('gal-list').innerHTML = `<div class="px-6 py-8 text-center text-zinc-500">${escapeHtml(err.message)}</div>`
    }
}

function renderGalleryAdmin() {
    $('gal-count').textContent = galleryImages.length + ' piezas'

    if (!galleryImages.length) {
        $('gal-list').innerHTML = '<div class="px-6 py-10 text-center text-zinc-500">Todavía no hay piezas. Agrega la primera arriba.</div>'
        return
    }

    $('gal-list').innerHTML = galleryImages.map(img => `
        <div class="gal-row ${img.active ? '' : 'gal-inactive'}" data-gal-id="${img.id}">
            <img class="gal-thumb" src="${escapeHtml(img.url)}" alt="" loading="lazy">
            <div class="space-y-2">
                <div class="gal-row-controls">
                    <select class="input-sm" data-gal-field="category">
                        ${CATEGORIES.map(c => `<option value="${c}" ${img.category === c ? 'selected' : ''}>${c}</option>`).join('')}
                    </select>
                    <select class="input-sm" data-gal-field="span">
                        ${SPANS.map(s => `<option value="${s.value}" ${(img.span || '') === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
                    </select>
                    <label class="text-[11px] text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                        Orden
                        <input type="number" class="input-sm w-16" data-gal-field="sort_order" value="${Number(img.sort_order) || 0}">
                    </label>
                    <label class="text-[11px] text-zinc-500 uppercase tracking-widest flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" class="w-4 h-4 accent-red-600 cursor-pointer" data-gal-field="active" ${img.active ? 'checked' : ''}>
                        Visible
                    </label>
                    <button class="gal-save bg-white text-black px-3 py-1 text-[11px] font-black uppercase hover:bg-zinc-300 transition">Guardar</button>
                    <button class="gal-delete text-zinc-600 hover:text-red-500 text-[11px] font-black uppercase transition">Eliminar</button>
                </div>
                <input type="text" class="input-sm w-full" data-gal-field="alt" placeholder="Texto alternativo (SEO)" value="${escapeHtml(img.alt || '')}">
            </div>
        </div>
    `).join('')
}

$('gal-list').addEventListener('click', async (e) => {
    const row = e.target.closest('[data-gal-id]')
    if (!row) return
    const id = row.dataset.galId

    if (e.target.classList.contains('gal-save')) {
        const payload = {
            category: row.querySelector('[data-gal-field="category"]').value,
            span: row.querySelector('[data-gal-field="span"]').value,
            sort_order: Number(row.querySelector('[data-gal-field="sort_order"]').value) || 0,
            active: row.querySelector('[data-gal-field="active"]').checked,
            alt: row.querySelector('[data-gal-field="alt"]').value.trim()
        }
        e.target.disabled = true
        try {
            await updateGalleryImage(id, payload)
            toast('Pieza actualizada')
            await loadGallery()
        } catch (err) {
            toast(err.message, true)
        } finally {
            e.target.disabled = false
        }
    }

    if (e.target.classList.contains('gal-delete')) {
        if (!confirm('¿Eliminar esta pieza del portafolio?')) return
        try {
            await deleteGalleryImage(id)
            toast('Pieza eliminada')
            await loadGallery()
        } catch (err) {
            toast(err.message, true)
        }
    }
})

$('gal-reload').addEventListener('click', loadGallery)

$('gal-add-btn').addEventListener('click', async () => {
    const btn = $('gal-add-btn')
    const statusEl = $('gal-add-status')
    const file = $('gal-file').files[0]
    const typedUrl = $('gal-url').value.trim()

    if (!file && !typedUrl) { toast('Sube una imagen o pega una URL', true); return }

    btn.disabled = true
    btn.textContent = 'Guardando...'
    statusEl.classList.add('hidden')

    try {
        let url = typedUrl
        if (file) {
            // UX, no control: el límite de verdad lo pone el bucket en Supabase.
            if (file.size > 10 * 1024 * 1024) throw new Error('La imagen supera los 10MB.')
            url = storageUrl('gallery', await upload('gallery', file), { publico: true })
        }

        await createGalleryImage({
            url,
            category: $('gal-category').value,
            span: $('gal-span').value,
            alt: $('gal-alt').value.trim(),
            sort_order: 0
        })

        $('gal-file').value = ''
        $('gal-url').value = ''
        $('gal-alt').value = ''
        statusEl.textContent = '✓ Pieza agregada'
        statusEl.className = 'text-[11px] uppercase tracking-widest text-emerald-400'
        statusEl.classList.remove('hidden')
        toast('Pieza agregada')
        await loadGallery()
    } catch (err) {
        console.error(err)
        statusEl.textContent = '✗ ' + err.message
        statusEl.className = 'text-[11px] uppercase tracking-widest text-red-500'
        statusEl.classList.remove('hidden')
        toast(err.message, true)
    } finally {
        btn.disabled = false
        btn.textContent = 'Agregar al portafolio'
    }
})

/* ─── Arranque ─── */
$('login-btn').addEventListener('click', login)
$('logout-btn').addEventListener('click', logout)
$('email').addEventListener('keypress', e => e.key === 'Enter' && login())
$('password').addEventListener('keypress', e => e.key === 'Enter' && login())

try {
    const supabase = await getSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    if (session) showAdmin()
} catch (err) {
    console.error(err)
    const errorEl = $('login-error')
    errorEl.textContent = 'No se pudo conectar con el servidor.'
    errorEl.classList.remove('hidden')
}
