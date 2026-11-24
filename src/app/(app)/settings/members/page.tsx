import { redirect } from 'next/navigation'
import { getSettingsContext, getSettingsInvites, getSettingsMembers } from '@/lib/settings-data'
import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { MembersSettings } from '@/components/workspace/MembersSettings'
import { getCachedWorkspaceGroups } from '@/lib/data'

export default async function MembersPage() {
  const s = await getSettingsContext()
  if (s.isPersonal) redirect('/settings')
  const [members, invites, groups] = await Promise.all([getSettingsMembers(), getSettingsInvites(), getCachedWorkspaceGroups()])
  return (
    <>
      <SettingsHeader eyebrow={s.workspace.name} title="Members" />
      <div className="max-w-2xl">
        <MembersSettings members={members} isAdmin={s.isAdmin} canManageAccess={s.canManageAccess}
          activeInviteCount={invites.length} groups={groups} offSections={s.workspace.offSections} />
      </div>
    </>
  )
}
