import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getMemberAccess, getSettingsContext, getSettingsMembers, getShareableItems } from '@/lib/settings-data'
import { getCachedWorkspaceGroups } from '@/lib/data'
import { MemberAccessForm } from '@/components/workspace/MemberAccessForm'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { istToday } from '@/lib/access'

export default async function MemberPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  const s = await getSettingsContext()
  if (s.isPersonal || !s.canManageAccess) redirect('/settings/members')
  const [access, items, groups, members] = await Promise.all([getMemberAccess(userId), getShareableItems(), getCachedWorkspaceGroups(), getSettingsMembers()])
  if (!access) notFound()
  const { member, grants } = access
  const people = members.filter(m => !m.limited).map(m => ({ userId: m.userId, name: m.name, avatarUrl: m.avatarUrl }))

  return (
    <div className="max-w-2xl">
      <Link href="/settings/members" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-gray-700">
        <ChevronLeft className="h-4 w-4" /> Members
      </Link>
      <div className="mb-5 flex items-center gap-3">
        <UserAvatar name={member.name} id={member.userId} avatarUrl={member.avatarUrl} size={52} />
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-bold text-gray-900">{member.name}</h1>
          <p className="text-sm text-gray-500">{s.workspace.name}</p>
        </div>
      </div>
      <MemberAccessForm
        member={member}
        initial={{ sections: member.sections, accessUntil: member.accessEnded ? null : member.accessUntil, grants }}
        isAdmin={s.isAdmin}
        isOwner={s.isOwner}
        workspaceName={s.workspace.name}
        groups={groups}
        people={people}
        items={items}
        today={istToday()}
        offSections={s.workspace.offSections}
      />
    </div>
  )
}
