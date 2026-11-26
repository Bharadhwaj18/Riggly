import { AdminPanel } from '@/components/admin/AdminPanel'
import { adminToday, adminWorkspaces } from '@/lib/admin-data'
import type { SectionKey } from '@/lib/workspace-sections'

export default async function AdminWorkspacesPage() {
  const [workspaces, { content, core }] = await Promise.all([adminWorkspaces(), adminToday()])
  return <AdminPanel workspaces={workspaces} core={core as SectionKey[]} globalOff={content.off} />
}
