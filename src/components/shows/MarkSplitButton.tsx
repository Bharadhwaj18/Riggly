'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toaster'
import { setShowSplit } from '@/actions/finance'

/** Marks a show as split without running a split (its money was already shared some other way). */
export function MarkSplitButton({ showId }: { showId: string }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const router = useRouter()
  const toast = useToast()

  const mark = async () => {
    setBusy(true)
    const res = await setShowSplit(showId, true)
    setBusy(false)
    if (res.error) { toast(res.error, 'error'); return }
    setOpen(false)
    router.refresh()
    toast('Show marked as split', 'success', {
      label: 'Undo',
      onClick: async () => {
        const undo = await setShowSplit(showId, false)
        if (undo.error) toast(undo.error, 'error')
        router.refresh()
      },
    })
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="shrink-0 rounded-lg border border-hero-muted/40 px-4 py-2 text-sm font-bold hover:opacity-90">
        Mark as split
      </button>
      <Modal open={open} onOpenChange={setOpen} title="Mark this show as split?"
        description="Use this when the show’s money was already shared out some other way. No payments are created, and like a normal split, no new entries can go onto this show.">
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={mark} loading={busy}>Mark as split</Button>
        </div>
      </Modal>
    </>
  )
}
