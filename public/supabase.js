/* ═══════════════════════════════════════════════════════════════
   Cliente de Supabase para el navegador.

   NO hay credenciales escritas en este archivo. La URL y la anon key
   llegan desde /api/config, que las lee de las variables de entorno
   del servidor. Así no quedan en el repositorio de GitHub.

   Aviso honesto: la anon key igual es visible en la pestaña Red del
   navegador — es pública por diseño. Lo que de verdad protege los
   datos son las políticas RLS de Supabase y que la service role key
   jamás salga del servidor.
   ═══════════════════════════════════════════════════════════════ */

let clientPromise = null;
let supabaseBaseUrl = '';

async function createSupabase() {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error('No se pudo cargar la configuración del servidor.');

  const { supabaseUrl, supabaseAnonKey } = await res.json();
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Faltan SUPABASE_URL o SUPABASE_ANON_KEY en el servidor.');
  }

  supabaseBaseUrl = supabaseUrl.replace(/\/+$/, '');
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  return createClient(supabaseUrl, supabaseAnonKey);
}

/** Cliente de Supabase, creado una sola vez por sesión. */
export function getSupabase() {
  if (!clientPromise) {
    clientPromise = createSupabase().catch(err => {
      clientPromise = null; // permite reintentar si falló la red
      throw err;
    });
  }
  return clientPromise;
}

/* ─── Storage ────────────────────────────────────────────────── */
// `reference-images` es un bucket PRIVADO: no hay getPublicUrl que valga.
// Guardamos la ruta canónica del objeto y el admin la abre con una URL
// firmada de una hora (/api/admin/leads la firma al vuelo).
export async function uploadReferenceImage(file) {
  const supabase = await getSupabase();
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { data, error } = await supabase.storage
    .from('reference-images')
    .upload(filename, file, { contentType: file.type || 'image/jpeg' });
  if (error) throw error;

  return `${supabaseBaseUrl}/storage/v1/object/reference-images/${data.path}`;
}

// Sube una pieza del portafolio al bucket público `gallery`.
// Requiere sesión de administrador.
export async function uploadGalleryImage(file) {
  const supabase = await getSupabase();
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { data, error } = await supabase.storage
    .from('gallery')
    .upload(filename, file, { contentType: file.type || 'image/jpeg' });
  if (error) throw error;

  const { data: pub } = supabase.storage.from('gallery').getPublicUrl(data.path);
  return pub.publicUrl;
}

// `signed-documents` también es privado: guardamos solo la ruta. Para verla,
// pedirle una URL firmada al backend con signedDocumentUrl().
export async function uploadDocument(file, clientName) {
  const supabase = await getSupabase();
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const filename = `${Date.now()}-${clientName.replace(/\s+/g, '-')}.${ext}`;

  const { data, error } = await supabase.storage
    .from('signed-documents')
    .upload(filename, file, { contentType: file.type || 'application/octet-stream' });
  if (error) throw error;
  return data.path;
}

export async function saveDocument(docData) {
  const supabase = await getSupabase();
  const { error } = await supabase.from('signed_documents').insert([docData]);
  if (error) throw error;
}

/* ─── Panel admin ────────────────────────────────────────────── */
// Nada de esto se lee ya con la anon key desde el navegador: `leads` tiene
// RLS activa y sin políticas, así que solo la service role del servidor la
// ve. Todo pasa por /api/admin/*, que valida el JWT del admin server-side.
async function authHeaders() {
  const supabase = await getSupabase();
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Sesión expirada. Vuelve a entrar.');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

async function adminRequest(path, options = {}) {
  const headers = await authHeaders();
  const res = await fetch(path, { ...options, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ok === false) throw new Error(body.error || 'Error en el panel.');
  return body;
}

/* ─── Leads ──────────────────────────────────────────────────── */
export async function getLeads({ deleted = false } = {}) {
  const body = await adminRequest(`/api/admin/leads${deleted ? '?deleted=1' : ''}`);
  return body.leads || [];
}

export async function getStats() {
  const body = await adminRequest('/api/admin/stats');
  return body.stats;
}

export async function updateLeadStatus(leadId, status) {
  await adminRequest(`/api/admin/leads/${leadId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  });
}

// Borrado lógico real: escribe deleted_at en la base, no en el localStorage.
export async function deleteLead(leadId) {
  await adminRequest(`/api/admin/leads/${leadId}`, { method: 'DELETE' });
}

export async function restoreLead(leadId) {
  await adminRequest(`/api/admin/leads/${leadId}/restore`, { method: 'POST' });
}

/* ─── Documentos firmados ────────────────────────────────────── */
export async function signedDocumentUrl(path) {
  const body = await adminRequest('/api/admin/signed-url', {
    method: 'POST',
    body: JSON.stringify({ bucket: 'signed-documents', path })
  });
  return body.url;
}

/* ─── Galería ────────────────────────────────────────────────── */
export async function getGalleryImages() {
  const body = await adminRequest('/api/admin/gallery');
  return body.images || [];
}

export async function createGalleryImage(payload) {
  const body = await adminRequest('/api/admin/gallery', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return body.image;
}

export async function updateGalleryImage(id, payload) {
  const body = await adminRequest(`/api/admin/gallery/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
  return body.image;
}

export async function deleteGalleryImage(id) {
  await adminRequest(`/api/admin/gallery/${id}`, { method: 'DELETE' });
}
