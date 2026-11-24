'use client'

import Link from 'next/link'
import { ChevronRight, Link2, UserPlus } from 'lucide-react'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { cn } from '@/lib/utils'
import type { MemberRow } from './settings-types'
import { accessSummary, formatDay } from '@/lib/access'
import type { SectionKey } from '@/lib/workspace-sections'
import type { WorkspaceGroup } from '@/lib/groups'
import { GroupTag, GroupsSection } from '@/components/groups/GroupsSettings'

const ROLE_LABEL: Record<string, string> = { owner: 'Owner', admin: 'Admin', member: 'Member' }

interface Props {
  members: MemberRow[]
  isAdmin: boolean
  /** Owner, admins and Access managers: can open someone's page. */
  canManageAccess: boolean
  activeInviteCount: number
  groups: WorkspaceGroup[]
  /** Sections the workspace has switched off. */
  offSections?: SectionKey[]
}

/** Who can open this person's page: admins for anyone but the owner, Access managers for members. Never yourself. */
export const canOpenMember = (m: MemberRow, isAdmin: boolean, canManageAccess: boolean) =>
  !m.isYou && m.role !== 'owner' && (isAdmin || (canManageAccess && m.role === 'member'))

/** "Admin · Treasurer · Merch" — the role and jobs in one quiet line. */
function roleLine(m: MemberRow): string {
  return [ROLE_LABEL[m.role] ?? m.role, m.treasurer && 'Treasurer', m.merchManager && 'Merch', m.accessManager && 'Access manager'].filter(Boolean).join(' · ')
}

/**
 * The band, one row per person: name, role and jobs, groups, and (for people who manage access) what they can open.
 * Tap a row to change any of it on that person's page.
 */
export function MembersSettings({ members, isAdmin, canManageAccess, activeInviteCount, groups, offSections = [] }: Props) {
  // Groups are for the band: people with only a few shared items aren't offered.
  const people = members.filter(m => !m.limited).map(m => ({ userId: m.userId, name: m.name, avatarUrl: m.avatarUrl }))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">{members.length} {members.length === 1 ? 'member' : 'members'}{canManageAccess && ' · tap someone to change what they can do'}</p>
        {isAdmin && (
          <Link href="/settings/invites" className="inline-flex items-center gap-2 rounded-lg bg-brand-400 px-3.5 py-2 text-sm font-bold text-white hover:bg-brand-500">
            <UserPlus className="h-4 w-4" /> Invite people
          </Link>
        )}
      </div>

      <GroupsSection groups={groups} people={people} isAdmin={isAdmin} />

      <ul className="divide-y divide-brand-100 overflow-hidden rounded-2xl border border-brand-200 bg-white shadow-sm">
        {members.map(m => {
          const open = canOpenMember(m, isAdmin, canManageAccess)
          const summary = canManageAccess && m.role === 'member' ? accessSummary(m.sections, m.grantCounts, offSections) : null
          const access = m.accessEnded ? 'Access ended'
            : [summary && summary !== 'Everything' ? summary : null, m.accessUntil && `until ${formatDay(m.accessUntil)}`].filter(Boolean).join(' · ')
          const myGroups = groups.filter(g => g.memberIds.includes(m.userId))
          const body = (
            <>
              <UserAvatar name={m.name} id={m.userId} avatarUrl={m.avatarUrl} size={40} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm font-bold text-gray-900">
                  <span className="truncate">{m.name}</span>
                  {m.isYou && <span className="shrink-0 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-brand-700">You</span>}
                </p>
                <p className={cn('truncate text-xs', m.role === 'member' ? 'text-gray-500' : 'font-semibold text-emerald-700')}>{roleLine(m)}</p>
                {access && <p className={cn('truncate text-xs', m.accessEnded ? 'font-semibold text-amber-700' : 'text-gray-500')}>{access}</p>}
                {myGroups.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{myGroups.map(g => <GroupTag key={g.id} group={g} />)}</div>}
              </div>
              {open && <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />}
            </>
          )
          return (
            <li key={m.userId} className="animate-row-in">
              {open ? (
                <Link href={`/settings/members/${m.userId}`} aria-label={`${m.name}: role, groups and access`} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-brand-50">
                  {body}
                </Link>
              ) : (
                <div className="flex min-h-16 items-center gap-3 px-4 py-3">{body}</div>
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
    </div>
  )
}
