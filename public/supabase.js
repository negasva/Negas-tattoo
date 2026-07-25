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

async function createSupabase() {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error('No se pudo cargar la configuración del servidor.');

  const { supabaseUrl, supabaseAnonKey } = await res.json();
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Faltan SUPABASE_URL o SUPABASE_ANON_KEY en el servidor. Revisa /api/health.');
  }

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
export async function uploadReferenceImage(file) {
  const supabase = await getSupabase();
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { data, error } = await supabase.storage
    .from('reference-images')
    .upload(filename, file, { contentType: file.type || 'image/jpeg' });
  if (error) throw error;

  const { data: pub } = supabase.storage.from('reference-images').getPublicUrl(data.path);
  return pub.publicUrl;
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

/* ─── Leads ──────────────────────────────────────────────────── */
export async function getLeads() {
  const supabase = await getSupabase();
  const { data, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function updateLeadStatus(leadId, status) {
  const supabase = await getSupabase();
  const { error } = await supabase.from('leads').update({ status }).eq('id', leadId);
  if (error) throw error;
}

export async function getStats() {
  const supabase = await getSupabase();
  const [leads, clients, recurring, complete] = await Promise.all([
    supabase.from('leads').select('id'),
    supabase.from('leads').select('id').eq('status', 'client'),
    supabase.from('leads').select('id').eq('status', 'recurring'),
    supabase.from('leads').select('id').eq('stage', 'complete')
  ]);

  const totalLeads = leads.data?.length || 0;
  const totalClients = clients.data?.length || 0;
  const recurringClients = recurring.data?.length || 0;
  const completedQuotes = complete.data?.length || 0;
  const converted = totalClients + recurringClients;

  return {
    totalLeads,
    totalClients,
    recurringClients,
    completedQuotes,
    conversionRate: totalLeads ? Math.round((converted / totalLeads) * 100) : 0
  };
}

/* ─── Galería (admin) ────────────────────────────────────────── */
// Todas las escrituras pasan por el backend, que valida el JWT del admin
// y escribe con la service role key.
async function authHeaders() {
  const supabase = await getSupabase();
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Sesión expirada. Vuelve a entrar.');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

async function galleryRequest(path, options = {}) {
  const headers = await authHeaders();
  const res = await fetch(path, { ...options, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ok === false) throw new Error(body.error || 'Error en la galería.');
  return body;
}

export async function getGalleryImages() {
  const body = await galleryRequest('/api/admin/gallery');
  return body.images || [];
}

export async function createGalleryImage(payload) {
  const body = await galleryRequest('/api/admin/gallery', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return body.image;
}

export async function updateGalleryImage(id, payload) {
  const body = await galleryRequest(`/api/admin/gallery/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
  return body.image;
}

export async function deleteGalleryImage(id) {
  await galleryRequest(`/api/admin/gallery/${id}`, { method: 'DELETE' });
}
