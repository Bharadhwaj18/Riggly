import { AdminAnnouncements } from '@/components/admin/AdminAnnouncements'
import { adminAnnouncements, adminWorkspaces } from '@/lib/admin-data'

export default async function AdminAnnouncementsPage() {
  const [items, workspaces] = await Promise.all([adminAnnouncements(), adminWorkspaces()])
  const bands = workspaces.filter(w => w.type !== 'personal').map(w => ({ id: w.id, name: w.name }))
  return <AdminAnnouncements items={items} workspaces={bands} />
}
