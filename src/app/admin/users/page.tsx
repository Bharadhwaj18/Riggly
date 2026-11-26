import { AdminUsers } from '@/components/admin/AdminUsers'
import { adminUsers } from '@/lib/admin-data'

export default async function AdminUsersPage() {
  return <AdminUsers users={await adminUsers()} />
}
