import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { featuresFrom, type SectionKey } from '@/lib/workspace-sections'
import { AdminPanel, type AdminWorkspace } from '@/components/admin/AdminPanel'

/** The platform admin panel: every workspace, which sections each has, and what new workspaces start with. */
export default async function AdminPage() {
  const supabase = await createClient()
  const { data: isAdmin } = await supabase.rpc('is_platform_admin')
  // Anyone else gets a plain "not found", so the page doesn't advertise itself.
  if (isAdmin !== true) notFound()

  const [{ data: rows, error }, { data: settings }] = await Promise.all([
    supabase.rpc('admin_workspaces'),
    supabase.from('platform_settings').select('core_features').eq('id', 1).maybeSingle(),
  ])
  if (error) throw new Error(error.message)

  const workspaces: AdminWorkspace[] = (rows ?? []).map(w => ({
    id: w.id,
    name: w.name,
    type: w.type,
    kind: w.kind,
    color: w.color,
    plan: w.plan,
    createdAt: w.created_at,
    ownerName: w.owner_name,
    ownerEmail: w.owner_email,
    members: w.members,
    features: featuresFrom({ features: w.features }),
    demo: w.demo === true,
  }))

  return <AdminPanel workspaces={workspaces} core={(settings?.core_features ?? []) as SectionKey[]} />
}
