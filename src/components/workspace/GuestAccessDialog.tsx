'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { ReasonButton } from '@/components/ui/ReasonButton'
import { useToast } from '@/components/ui/Toaster'
import { setGuestAccess } from '@/actions/workspace'
import { addDaysISO } from '@/lib/dates'
import { formatGuestDate, type SetlistGuest } from '@/lib/setlist-guest'
import { GuestSetlistPicker, GuestUntilField } from './GuestSetlistPicker'
import type { SetlistOption } from './settings-types'

/** Change which setlists a setlist guest can see, and their last day. */
export function GuestAccessDialog({ memberId, memberName, guest, setlists, today, open, onOpenChange }: {
  memberId: string
  memberName: string
  guest: SetlistGuest
  setlists: SetlistOption[]
  today: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const toast = useToast()
  // Setlists that were deleted since aren't offered or kept.
  const [ids, setIds] = useState(guest.setlistIds.filter(id => setlists.some(s => s.id === id)))
  const [until, setUntil] = useState(guest.accessUntil && guest.accessUntil >= today ? guest.accessUntil : addDaysISO(today, 7))
  const [pending, start] = useTransition()

  const save = () => start(async () => {
    const res = await setGuestAccess(memberId, ids, until)
    if (res.error) { toast(res.error, 'error'); return }
    toast(`Saved what ${memberName} can see`, 'success')
    onOpenChange(false)
    router.refresh()
  })

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={`What ${memberName} can see`}
      description="A setlist guest sees only these setlists, with their songs and chords. View only." className="max-w-md">
      {guest.ended && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Their access ended on {guest.accessUntil ? formatGuestDate(guest.accessUntil) : 'its last day'}. Pick a new last day to let them look again.
        </p>
      )}
      <div className="space-y-4">
        <GuestSetlistPicker setlists={setlists} value={ids} onChange={setIds} today={today} disabled={pending} />
        <GuestUntilField value={until} onChange={setUntil} today={today} max={addDaysISO(today, 366)} disabled={pending} />
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
        <ReasonButton onClick={save} loading={pending}
          blocked={ids.length === 0 ? 'Pick at least one setlist. To stop their access, remove them instead.' : !until ? 'Pick the last day they can look.' : null}>
          Save
        </ReasonButton>
      </div>
    </Modal>
  )
}
