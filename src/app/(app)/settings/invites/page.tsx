import { redirect } from 'next/navigation'
import { getSettingsContext, getSettingsInvites, getShareableItems } from '@/lib/settings-data'
import { istToday } from '@/lib/access'
import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { InvitesSettings } from '@/components/workspace/InvitesSettings'

export default async function InvitesPage() {
  const s = await getSettingsContext()
  if (s.isPersonal || !s.isAdmin) redirect('/settings')
  const [invites, items] = await Promise.all([getSettingsInvites(), getShareableItems()])
  return (
    <>
      <SettingsHeader eyebrow={s.workspace.name} title="Invites" />
      <div className="max-w-2xl"><InvitesSettings invites={invites} workspaceName={s.workspace.name} offSections={s.workspace.offSections} items={items} today={istToday()} /></div>
    </>
  )
}
