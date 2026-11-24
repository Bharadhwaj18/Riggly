import { redirect } from 'next/navigation'
import { getSettingsContext, getSettingsInvites, getSettingsMembers, getShareableSetlists } from '@/lib/settings-data'
import { istToday } from '@/lib/setlist-guest'
import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { MembersSettings } from '@/components/workspace/MembersSettings'
import { getCachedWorkspaceGroups } from '@/lib/data'

export default async function MembersPage() {
  const s = await getSettingsContext()
  if (s.isPersonal) redirect('/settings')
  const [members, invites, groups, setlists] = await Promise.all([getSettingsMembers(), getSettingsInvites(), getCachedWorkspaceGroups(), getShareableSetlists()])
  return (
    <>
      <SettingsHeader eyebrow={s.workspace.name} title="Members" />
      <div className="max-w-2xl">
        <MembersSettings workspaceName={s.workspace.name} members={members} isAdmin={s.isAdmin} isOwner={s.isOwner} activeInviteCount={invites.length} groups={groups} offSections={s.workspace.offSections} setlists={setlists} today={istToday()} />
      </div>
    </>
  )
}
