import { notFound, redirect } from 'next/navigation'
import { getMemberAccess, getSettingsContext, getShareableItems } from '@/lib/settings-data'
import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { MemberAccessForm } from '@/components/workspace/MemberAccessForm'
import { istToday } from '@/lib/access'

export default async function MemberAccessPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  const s = await getSettingsContext()
  if (s.isPersonal || !s.canManageAccess) redirect('/settings/members')
  const [access, items] = await Promise.all([getMemberAccess(userId), getShareableItems()])
  if (!access) notFound()
  const { member, grants } = access

  return (
    <>
      <SettingsHeader eyebrow={`${s.workspace.name} · Members`} title={`${member.name}’s access`} />
      <div className="max-w-2xl">
        <p className="mb-4 text-sm text-gray-500">
          Choose what {member.name} can open in each part of {s.workspace.name}. “Only these” shares just the items you pick.
        </p>
        <MemberAccessForm
          memberId={member.userId}
          memberName={member.name}
          initial={{ sections: member.sections, accessUntil: member.accessEnded ? null : member.accessUntil, grants }}
          initialManager={member.accessManager}
          canSetManager={s.isAdmin}
          items={items}
          today={istToday()}
          offSections={s.workspace.offSections}
        />
      </div>
    </>
  )
}
