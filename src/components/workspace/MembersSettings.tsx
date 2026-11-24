'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { KeyRound, Link2, Trash2, UserPlus, Users } from 'lucide-react'
import { setMemberRole, setMemberTreasurer, setMemberMerchManager, removeMember } from '@/actions/workspace'
import { StatusPill } from '@/components/ui/StatusPill'
import { UserAvatar } from '@/components/ui/UserAvatar'
import type { MemberRow } from './settings-types'
import { accessSummary, formatDay } from '@/lib/access'
import type { SectionKey } from '@/lib/workspace-sections'
import type { WorkspaceGroup } from '@/lib/groups'
import { GroupTag, GroupsSection, MemberGroupsSheet } from '@/components/groups/GroupsSettings'
import { Select } from '@/components/ui/Select'

const ROLE_LABEL: Record<string, string> = { owner: 'Owner', admin: 'Admin', member: 'Member' }

interface Props {
  workspaceName: string
  members: MemberRow[]
  isAdmin: boolean
  isOwner: boolean
  /** Owner, admins and Access managers: can open someone's Access page. */
  canManageAccess: boolean
  activeInviteCount: number
  groups: WorkspaceGroup[]
  /** Sections the workspace has switched off. */
  offSections?: SectionKey[]
}

const chip = 'inline-flex items-center gap-1.5 rounded-lg border border-brand-200 px-2.5 py-1.5 text-xs font-bold text-gray-700 hover:bg-brand-50'

export function MembersSettings({ workspaceName, members, isAdmin, isOwner, canManageAccess, activeInviteCount, groups, offSections = [] }: Props) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [groupsFor, setGroupsFor] = useState<MemberRow | null>(null)
  // Groups are for the band: people with only a few shared items aren't offered.
  const people = members.filter(m => !m.limited).map(m => ({ userId: m.userId, name: m.name, avatarUrl: m.avatarUrl }))

  const run = (fn: () => Promise<{ error?: string }>) => {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">{members.length} {members.length === 1 ? 'member' : 'members'}</p>
        {isAdmin && (
          <Link href="/settings/invites" className="inline-flex items-center gap-2 rounded-lg bg-brand-400 px-3.5 py-2 text-sm font-bold text-white hover:bg-brand-500">
            <UserPlus className="h-4 w-4" /> Invite people
          </Link>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <GroupsSection groups={groups} people={people} isAdmin={isAdmin} />

      <ul className="divide-y divide-brand-100 overflow-hidden rounded-2xl border border-brand-200 bg-white shadow-sm">
        {members.map(m => {
          const adminControls = isAdmin && m.role !== 'owner' && !m.isYou
          const accessControl = canManageAccess && m.role === 'member' && !m.isYou
          const summary = canManageAccess && m.role === 'member' ? accessSummary(m.sections, m.grantCounts, offSections) : null
          return (
            <li key={m.userId} className="animate-row-in flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <UserAvatar name={m.name} id={m.userId} avatarUrl={m.avatarUrl} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-gray-900">
                  {m.name}{m.isYou && <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-brand-700">You</span>}
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <StatusPill tone={m.role === 'member' ? 'gray' : 'green'}>{ROLE_LABEL[m.role] ?? m.role}</StatusPill>
                  {m.treasurer && <StatusPill tone="amber">Treasurer</StatusPill>}
                  {m.merchManager && <StatusPill tone="amber">Merch</StatusPill>}
                  {m.accessManager && <StatusPill tone="amber">Access manager</StatusPill>}
                  {m.accessEnded ? <StatusPill tone="gray">Access ended</StatusPill>
                    : m.accessUntil && <StatusPill tone="gray">Until {formatDay(m.accessUntil)}</StatusPill>}
                  {groups.filter(g => g.memberIds.includes(m.userId)).map(g => <GroupTag key={g.id} group={g} />)}
                </div>
                {summary && summary !== 'Everything' && <p className="mt-1 truncate text-xs text-gray-500">{summary}</p>}
              </div>

              {isAdmin && groups.length > 0 && !m.limited && (
                <button type="button" onClick={() => setGroupsFor(m)} aria-label={`Groups for ${m.name}`} className={chip}>
                  <Users className="h-3.5 w-3.5" /> Groups
                </button>
              )}
              {(adminControls || accessControl) && (
                <div className="flex flex-wrap items-center gap-3">
                  {adminControls && !m.limited && (
                    <>
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-gray-600">
                        <input type="checkbox" checked={m.treasurer} disabled={pending} onChange={e => run(() => setMemberTreasurer(m.userId, e.target.checked))} className="h-4 w-4 accent-brand-400" />
                        Treasurer
                      </label>
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-gray-600" title="Can approve merch takings into Finance">
                        <input type="checkbox" checked={m.merchManager} disabled={pending} onChange={e => run(() => setMemberMerchManager(m.userId, e.target.checked))} className="h-4 w-4 accent-brand-400" />
                        Merch
                      </label>
                    </>
                  )}
                  {adminControls && isOwner && (
                    <Select
                      value={m.role}
                      disabled={pending}
                      aria-label={`Role for ${m.name}`}
                      onChange={e => run(() => setMemberRole(m.userId, e.target.value as 'admin' | 'member'))}
                      className="rounded-lg border border-brand-200 bg-white px-2 py-1.5 text-xs font-bold text-gray-700"
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </Select>
                  )}
                  {accessControl && (
                    <Link href={`/settings/members/${m.userId}`} className={chip}>
                      <KeyRound className="h-3.5 w-3.5" /> Access
                    </Link>
                  )}
                  {adminControls && (
                    <button
                      type="button"
                      disabled={pending}
                      aria-label={`Remove ${m.name}`}
                      onClick={() => { if (window.confirm(`Remove ${m.name} from ${workspaceName}?`)) run(() => removeMember(m.userId)) }}
                      className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {isAdmin && activeInviteCount > 0 && (
        <Link href="/settings/invites" className="flex items-center gap-3 rounded-2xl border border-dashed border-brand-200 bg-white px-4 py-3 text-sm text-gray-600 hover:bg-brand-50">
          <Link2 className="h-4 w-4 text-gray-400" />
          <span className="flex-1">{activeInviteCount} active invite {activeInviteCount === 1 ? 'link' : 'links'}</span>
          <span className="font-bold text-brand-600">Manage</span>
        </Link>
      )}
      {groupsFor && (
        <MemberGroupsSheet key={groupsFor.userId} person={{ userId: groupsFor.userId, name: groupsFor.name, avatarUrl: groupsFor.avatarUrl }}
          groups={groups} people={people} open onOpenChange={o => { if (!o) setGroupsFor(null) }} />
      )}
    </div>
  )
}
