'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { ReasonButton } from '@/components/ui/ReasonButton'
import { useToast } from '@/components/ui/Toaster'
import { setMemberAccess } from '@/actions/workspace'
import { SECTIONS, type SectionKey } from '@/lib/workspace-sections'
import { ITEM_NOUN } from '@/lib/access'
import { AccessEditor, type AccessValue } from './AccessEditor'
import type { ShareableItems } from './settings-types'

/** One member's Access page: the editor, the Access manager role (admins only), and Save. */
export function MemberAccessForm({ memberId, memberName, initial, initialManager, canSetManager, items, today, offSections }: {
  memberId: string
  memberName: string
  initial: AccessValue
  initialManager: boolean
  /** Only owners and admins can make someone an Access manager. */
  canSetManager: boolean
  items: ShareableItems
  today: string
  offSections: SectionKey[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [value, setValue] = useState<AccessValue>(initial)
  const [manager, setManager] = useState(initialManager)
  const [pending, start] = useTransition()

  // "Only these" with nothing picked: say so before saving (Merch is fine: kits they're put on count).
  const emptyShare = SECTIONS.find(s => !offSections.includes(s.key) && s.key !== 'merch' && value.sections[s.key] === 'items' && !value.grants.some(g => g.section === s.key))
  const blocked = emptyShare ? `Pick at least one ${ITEM_NOUN[emptyShare.key].one} in ${emptyShare.label}, or set it to Off.` : null

  const save = () => start(async () => {
    const res = await setMemberAccess(memberId, { ...value, ...(canSetManager ? { accessManager: manager } : {}) })
    if (res.error) { toast(res.error, 'error'); return }
    toast(`Saved ${memberName}’s access`, 'success')
    router.push('/settings/members')
    router.refresh()
  })

  return (
    <div className="space-y-5">
      <AccessEditor value={value} onChange={setValue} items={items} today={today} offSections={offSections} disabled={pending} />

      {canSetManager && (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-brand-200 bg-white p-3">
          <input type="checkbox" checked={manager} disabled={pending} onChange={e => setManager(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-400" />
          <span>
            <span className="block text-sm font-bold text-gray-900">Access manager</span>
            <span className="block text-xs text-gray-500">Can change what other members can see and do, like this page. Not the owner’s, admins’ or their own.</span>
          </span>
        </label>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="secondary" asChild><Link href="/settings/members">Cancel</Link></Button>
        <ReasonButton onClick={save} loading={pending} blocked={blocked}>Save access</ReasonButton>
      </div>
    </div>
  )
}
