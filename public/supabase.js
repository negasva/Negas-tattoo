import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

// La anon key es publica por diseno: la seguridad real la dan las politicas RLS
// de Supabase y los endpoints del servidor, que son los unicos que usan la
// service role key. Nunca pongas la service role key en este archivo.
const SUPABASE_URL = 'https://qiyfydnwdwygbrpavdjb.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpeWZ5ZG53ZHd5Z2JycGF2ZGpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5Nzg5MDAsImV4cCI6MjA5MjU1NDkwMH0.nWhAfvw55i2V7-EoiPB4ncXY1dySjbVmkS0QTEZLlT4'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

/* ─── Storage ────────────────────────────────────────────────── */
export async function uploadReferenceImage(file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { data, error } = await supabase.storage
    .from('reference-images')
    .upload(filename, file, { contentType: file.type || 'image/jpeg' })
  if (error) throw error
  return data.path
}

// Sube una pieza del portafolio al bucket publico `gallery`. Requiere sesion
// de administrador (politica de storage para usuarios autenticados).
export async function uploadGalleryImage(file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { data, error } = await supabase.storage
    .from('gallery')
    .upload(filename, file, { contentType: file.type || 'image/jpeg' })
  if (error) throw error
  const { data: pub } = supabase.storage.from('gallery').getPublicUrl(data.path)
  return pub.publicUrl
}

export async function uploadDocument(file, clientName) {
  const ext = file.name.split('.').pop().toLowerCase()
  const filename = `${Date.now()}-${clientName.replace(/\s+/g, '-')}.${ext}`
  const contentType = file.type || 'application/octet-stream'
  const { data, error } = await supabase.storage.from('signed-documents').upload(filename, file, { contentType })
  if (error) throw error
  return data.path
}

export async function saveDocument(docData) {
  const { error } = await supabase.from('signed_documents').insert([docData])
  if (error) throw error
}

/* ─── Leads ──────────────────────────────────────────────────── */
export async function getLeads() {
  const { data, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function updateLeadStatus(leadId, status) {
  const { error } = await supabase.from('leads').update({ status }).eq('id', leadId)
  if (error) throw error
}

export async function getStats() {
  const [leads, clients, recurring, complete] = await Promise.all([
    supabase.from('leads').select('id'),
    supabase.from('leads').select('id').eq('status', 'client'),
    supabase.from('leads').select('id').eq('status', 'recurring'),
    supabase.from('leads').select('id').eq('stage', 'complete')
  ])

  const totalLeads = leads.data?.length || 0
  const totalClients = clients.data?.length || 0
  const recurringClients = recurring.data?.length || 0
  const completedQuotes = complete.data?.length || 0
  const converted = totalClients + recurringClients

  return {
    totalLeads,
    totalClients,
    recurringClients,
    completedQuotes,
    conversionRate: totalLeads ? Math.round((converted / totalLeads) * 100) : 0
  }
}

/* ─── Galeria (admin) ────────────────────────────────────────── */
// Todas las escrituras pasan por el backend, que valida el JWT del admin y
// escribe con la service role key.
async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) throw new Error('Sesión expirada. Vuelve a entrar.')
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

async function galleryRequest(path, options = {}) {
  const headers = await authHeaders()
  const res = await fetch(path, { ...options, headers })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.ok === false) throw new Error(body.error || 'Error en la galería.')
  return body
}

export async function getGalleryImages() {
  const body = await galleryRequest('/api/admin/gallery')
  return body.images || []
}

export async function createGalleryImage(payload) {
  const body = await galleryRequest('/api/admin/gallery', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
  return body.image
}

export async function updateGalleryImage(id, payload) {
  const body = await galleryRequest(`/api/admin/gallery/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })
  return body.image
}

export async function deleteGalleryImage(id) {
  await galleryRequest(`/api/admin/gallery/${id}`, { method: 'DELETE' })
}
