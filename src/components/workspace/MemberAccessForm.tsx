'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ReasonButton } from '@/components/ui/ReasonButton'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toaster'
import { removeMember, setMemberAccess, setMemberMerchManager, setMemberRole, setMemberTreasurer } from '@/actions/workspace'
import { SECTIONS, type SectionKey } from '@/lib/workspace-sections'
import { ITEM_NOUN } from '@/lib/access'
import type { WorkspaceGroup } from '@/lib/groups'
import { GroupTag, MemberGroupsSheet, type GroupPerson } from '@/components/groups/GroupsSettings'
import { AccessEditor, type AccessValue } from './AccessEditor'
import type { MemberRow, ShareableItems } from './settings-types'

const card = 'rounded-2xl border border-brand-200 bg-white p-4 shadow-sm sm:p-5'

/** A switch-style row: label and a line of help on the left, a checkbox on the right. Saves straight away. */
function Toggle({ label, help, checked, disabled, onChange }: { label: string; help: string; checked: boolean; disabled?: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2.5">
      <span>
        <span className="block text-sm font-bold text-gray-900">{label}</span>
        <span className="block text-xs text-gray-500">{help}</span>
      </span>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand-400" />
    </label>
  )
}

/**
 * One person's page: their role and jobs, their groups, what they can open, and removing them.
 * Admins see everything here; Access managers see only "What they can open".
 */
export function MemberAccessForm({ member, initial, isAdmin, isOwner, workspaceName, groups, people, items, today, offSections }: {
  member: MemberRow
  initial: AccessValue
  isAdmin: boolean
  isOwner: boolean
  workspaceName: string
  groups: WorkspaceGroup[]
  people: GroupPerson[]
  items: ShareableItems
  today: string
  offSections: SectionKey[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [value, setValue] = useState<AccessValue>(initial)
  const [manager, setManager] = useState(member.accessManager)
  const [groupsOpen, setGroupsOpen] = useState(false)
  const [pending, start] = useTransition()
  const isMember = member.role === 'member'
  const myGroups = groups.filter(g => g.memberIds.includes(member.userId))

  // Role and job switches save straight away.
  const run = (fn: () => Promise<{ error?: string }>, done: string) => start(async () => {
    const res = await fn()
    if (res.error) { toast(res.error, 'error'); return }
    toast(done, 'success')
    router.refresh()
  })

  // "Only these" with nothing picked: say so before saving (Merch is fine: kits they're put on count).
  const emptyShare = SECTIONS.find(s => !offSections.includes(s.key) && s.key !== 'merch' && value.sections[s.key] === 'items' && !value.grants.some(g => g.section === s.key))
  const blocked = emptyShare ? `Pick at least one ${ITEM_NOUN[emptyShare.key].one} in ${emptyShare.label}, or set it to Off.` : null

  const saveAccess = () => start(async () => {
    const res = await setMemberAccess(member.userId, { ...value, ...(isAdmin ? { accessManager: manager } : {}) })
    if (res.error) { toast(res.error, 'error'); return }
    toast(`Saved what ${member.name} can open`, 'success')
    router.refresh()
  })

  return (
    <div className="space-y-4">
      {isAdmin && (
        <section className={card}>
          <SectionLabel>Role</SectionLabel>
          <div className="mt-2 divide-y divide-brand-100">
            <div className="flex items-start justify-between gap-4 py-2.5">
              <span>
                <span className="block text-sm font-bold text-gray-900">{member.role === 'admin' ? 'Admin' : 'Member'}</span>
                <span className="block text-xs text-gray-500">{member.role === 'admin' ? 'Admins can open everything and manage the workspace.' : 'Opens what you set below.'}</span>
              </span>
              {isOwner && (
                <Select value={member.role} disabled={pending} aria-label={`Role for ${member.name}`}
                  onChange={e => run(() => setMemberRole(member.userId, e.target.value as 'admin' | 'member'), 'Role changed')}
                  className="rounded-lg border border-brand-200 bg-white px-2 py-1.5 text-sm font-bold text-gray-700">
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </Select>
              )}
            </div>
            <Toggle label="Treasurer" help="Can approve money entries and move money between accounts." checked={member.treasurer} disabled={pending}
              onChange={on => run(() => setMemberTreasurer(member.userId, on), on ? 'Made treasurer' : 'No longer treasurer')} />
            <Toggle label="Merch" help="Can approve merch takings into Finance and pack kits." checked={member.merchManager} disabled={pending}
              onChange={on => run(() => setMemberMerchManager(member.userId, on), on ? 'Can approve merch' : 'No longer approves merch')} />
          </div>
        </section>
      )}

      {isAdmin && !member.limited && (
        <section className={card}>
          <div className="flex items-center justify-between gap-3">
            <SectionLabel>Groups</SectionLabel>
            <button type="button" onClick={() => setGroupsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 px-2.5 py-1.5 text-xs font-bold text-gray-700 hover:bg-brand-50">
              <Users className="h-3.5 w-3.5" /> Change
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {myGroups.length ? myGroups.map(g => <GroupTag key={g.id} group={g} />) : <p className="text-sm text-gray-500">Not in a group yet.</p>}
          </div>
        </section>
      )}

      <section className={card}>
        <SectionLabel>What they can open</SectionLabel>
        {isMember ? (
          <div className="mt-3 space-y-4">
            <AccessEditor value={value} onChange={setValue} items={items} today={today} offSections={offSections} disabled={pending} />
            {isAdmin && (
              <div className="border-t border-brand-100">
                <Toggle label="Access manager" help="Can change what other members can open, like this. Not the owner’s, admins’ or their own."
                  checked={manager} disabled={pending} onChange={setManager} />
              </div>
            )}
            <div className="flex justify-end">
              <ReasonButton onClick={saveAccess} loading={pending} blocked={blocked}>Save access</ReasonButton>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-gray-500">Admins can open everything in {workspaceName}. Make them a Member to limit what they see.</p>
        )}
      </section>

      {isAdmin && (
        <section className={card}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-bold text-gray-900">Remove from {workspaceName}</span>
              <span className="block text-xs text-gray-500">They lose access straight away. You can invite them again later.</span>
            </span>
            <Button variant="secondary" disabled={pending}
              onClick={() => {
                if (!window.confirm(`Remove ${member.name} from ${workspaceName}?`)) return
                start(async () => {
                  const res = await removeMember(member.userId)
                  if (res.error) { toast(res.error, 'error'); return }
                  toast(`${member.name} removed`, 'success')
                  router.push('/settings/members')
                  router.refresh()
                })
              }}
              className="text-red-600 hover:bg-red-50">
              <Trash2 className="h-4 w-4" /> Remove
            </Button>
          </div>
        </section>
      )}

      {groupsOpen && (
        <MemberGroupsSheet person={{ userId: member.userId, name: member.name, avatarUrl: member.avatarUrl }}
          groups={groups} people={people} open onOpenChange={o => { if (!o) { setGroupsOpen(false); router.refresh() } }} />
      )}
    </div>
  )
}
