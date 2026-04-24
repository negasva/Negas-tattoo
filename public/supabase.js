import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL = 'https://qiyfydnwdwygbrpavdjb.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpeWZ5ZG53ZHd5Z2JycGF2ZGpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5Nzg5MDAsImV4cCI6MjA5MjU1NDkwMH0.nWhAfvw55i2V7-EoiPB4ncXY1dySjbVmkS0QTEZLlT4'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export async function uploadReferenceImage(file) {
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${file.name.split('.').pop()}`
  const { data, error } = await supabase.storage.from('reference-images').upload(filename, file)
  if (error) throw error
  return data.path
}

export async function saveLead(leadData) {
  const { error } = await supabase.from('leads').insert([leadData])
  if (error) throw error
}

export async function uploadDocument(file, clientName, tatuador) {
  const filename = `${Date.now()}-${clientName.replace(/\s+/g, '-')}.${file.name.split('.').pop()}`
  const { data, error } = await supabase.storage.from('signed-documents').upload(filename, file)
  if (error) throw error
  return data.path
}

export async function saveDocument(docData) {
  const { error } = await supabase.from('signed_documents').insert([docData])
  if (error) throw error
}

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
  const [leads, clients, recurring] = await Promise.all([
    supabase.from('leads').select('id'),
    supabase.from('leads').select('id').eq('status', 'client'),
    supabase.from('leads').select('id').eq('status', 'recurring')
  ])

  const totalLeads = leads.data?.length || 0
  const totalClients = clients.data?.length || 0
  const recurringClients = recurring.data?.length || 0
  const converted = totalClients + recurringClients

  return {
    totalLeads,
    totalClients,
    recurringClients,
    conversionRate: totalLeads ? Math.round((converted / totalLeads) * 100) : 0
  }
}
