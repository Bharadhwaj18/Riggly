'use client'

import { useState } from 'react'
import { Camera, ImageIcon, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/Modal'
import { shrink } from './MerchPhotoField'

export const PROOF_BUCKET = 'merch-payment-proofs'
const MAX_BYTES = 20 * 1024 * 1024
// Big enough to read a transaction ID and amount on a screenshot.
const PROOF_SIDE = 1600

export interface PickedProof { file: File; preview: string }

/** What blocks recording a sale: UPI money taken with no photo of the payment. */
export const proofMissing = (upiAmount: number, proofs: PickedProof[]) =>
  upiAmount > 0 && proofs.length === 0 ? 'Add a photo of the UPI payment first.' : null

/** Take or pick photos of the UPI payment. Nothing uploads until the sale is recorded. */
export function UpiProofPicker({ proofs, onChange, multiple = false }: { proofs: PickedProof[]; onChange: (p: PickedProof[]) => void; multiple?: boolean }) {
  const [error, setError] = useState<string | null>(null)

  const add = (files: FileList | null) => {
    setError(null)
    const next = [...proofs]
    for (const file of Array.from(files ?? [])) {
      if (!file.type.startsWith('image/')) { setError('Pick a photo or screenshot.'); continue }
      if (file.size > MAX_BYTES) { setError('That photo is too big. Pick a smaller one.'); continue }
      next.push({ file, preview: URL.createObjectURL(file) })
    }
    onChange(multiple ? next : next.slice(-1))
  }
  const remove = (i: number) => { URL.revokeObjectURL(proofs[i].preview); onChange(proofs.filter((_, j) => j !== i)) }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {proofs.map((p, i) => (
          <span key={p.preview} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.preview} alt={`UPI payment photo ${i + 1}`} className="h-14 w-14 rounded-lg object-cover ring-1 ring-brand-200" />
            <button type="button" aria-label="Remove this photo" onClick={() => remove(i)} className="absolute -right-1.5 -top-1.5 rounded-full bg-gray-900 p-0.5 text-white"><X className="h-3 w-3" /></button>
          </span>
        ))}
        {(multiple || proofs.length === 0) && (
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border-2 border-dashed border-brand-300 px-3 py-2 text-xs font-bold text-brand-700 hover:bg-brand-50">
            <Camera className="h-4 w-4" />
            {proofs.length ? 'Add another photo' : 'Photo of the UPI payment'}
            <input type="file" accept="image/*" multiple={multiple} className="sr-only" onChange={e => { add(e.target.files); e.target.value = '' }} />
          </label>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

/** Uploads the payment photos into the person's own folder. Returns their storage paths. */
export async function uploadProofs(workspaceId: string, userId: string, proofs: PickedProof[]): Promise<{ paths?: string[]; error?: string }> {
  const storage = createClient().storage.from(PROOF_BUCKET)
  const paths: string[] = []
  for (const p of proofs) {
    const out = await shrink(p.file, PROOF_SIDE).catch(() => null)
    if (!out) return { error: 'Couldn’t read a payment photo. Try another one.' }
    const path = `${workspaceId}/${userId}/${crypto.randomUUID()}.${out.type === 'image/webp' ? 'webp' : 'jpg'}`
    const { error } = await storage.upload(path, out.blob, { contentType: out.type, upsert: false })
    if (error) {
      if (paths.length) await storage.remove(paths)
      return { error: /bucket not found|not found/i.test(error.message) ? 'UPI photos aren’t switched on yet. Run the UPI proof SQL first.' : error.message }
    }
    paths.push(path)
  }
  return { paths }
}

/** A small link to look at a sale's UPI photos (signed links that expire, since they're private). */
export function UpiProofLink({ paths }: { paths: string[] }) {
  const [urls, setUrls] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!paths.length) return null

  const open = async () => {
    setError(null)
    const { data, error: e } = await createClient().storage.from(PROOF_BUCKET).createSignedUrls(paths, 600)
    if (e || !data) { setError('Couldn’t open the photos.'); return }
    setUrls(data.map(d => d.signedUrl).filter((u): u is string => !!u))
  }

  return (
    <>
      <button type="button" onClick={open} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold text-brand-700 hover:bg-brand-100">
        <ImageIcon className="h-3.5 w-3.5" /> UPI photo{paths.length > 1 ? `s (${paths.length})` : ''}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
      <Modal open={!!urls} onOpenChange={o => { if (!o) setUrls(null) }} title="UPI payment" className="max-w-lg">
        <div className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {urls?.map(u => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="UPI payment" className="w-full rounded-xl ring-1 ring-brand-200" /></a>)}
        </div>
      </Modal>
    </>
  )
}
