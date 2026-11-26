import { AdminToday } from '@/components/admin/AdminToday'
import { adminToday } from '@/lib/admin-data'

export default async function AdminTodayPage() {
  const { content } = await adminToday()
  return <AdminToday initial={content} />
}
