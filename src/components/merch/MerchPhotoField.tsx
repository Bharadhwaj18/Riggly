'use client'

import { useRef, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'

export const MERCH_PHOTO_BUCKET = 'merch-photos'
const MAX_SIDE = 1200
const MAX_BYTES = 15 * 1024 * 1024

/** What the photo field holds: the saved URL, a new picture waiting to upload, or nothing. */
export type PhotoChoice = { kind: 'keep'; url: string | null } | { kind: 'new'; file: File; preview: string } | { kind: 'remove' }

/** Shrinks a picture to at most `maxSide` px on its longest side and re-encodes it as WebP (or JPEG where WebP isn't available). */
export async function shrink(file: File, maxSide = MAX_SIDE): Promise<{ blob: Blob; type: string } | null> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    for (const type of ['image/webp', 'image/jpeg']) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, 0.85))
      if (blob && blob.type === type) return { blob, type }
    }
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Uploads the chosen picture into the workspace's folder and returns its public URL. */
export async function uploadMerchPhoto(workspaceId: string, file: File): Promise<{ url?: string; error?: string }> {
  const out = await shrink(file).catch(() => null)
  if (!out) return { error: 'Couldn’t read that picture. Try a JPG or PNG.' }
  const path = `${workspaceId}/${crypto.randomUUID()}.${out.type === 'image/webp' ? 'webp' : 'jpg'}`
  const storage = createClient().storage.from(MERCH_PHOTO_BUCKET)
  const { error } = await storage.upload(path, out.blob, { contentType: out.type, upsert: false })
  if (error) {
    return { error: /bucket not found|not found/i.test(error.message) ? 'Photo uploads aren’t switched on yet. Run the merch photos SQL first.' : error.message }
  }
  return { url: storage.getPublicUrl(path).data.publicUrl }
}

/** Pick, preview and remove an item's photo. Nothing uploads until the form is saved. */
export function MerchPhotoField({ value, onChange }: { value: PhotoChoice; onChange: (c: PhotoChoice) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const preview = value.kind === 'new' ? value.preview : value.kind === 'keep' ? value.url : null
  // Let go of an in-memory preview once it's replaced.
  const replace = (next: PhotoChoice) => { if (value.kind === 'new') URL.revokeObjectURL(value.preview); onChange(next) }

  const choose = (file: File | undefined) => {
    setError(null)
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Pick a picture (JPG, PNG or WebP).'); return }
    if (file.size > MAX_BYTES) { setError('That picture is over 15 MB. Pick a smaller one.'); return }
    replace({ kind: 'new', file, preview: URL.createObjectURL(file) })
  }

  return (
    <div className="flex items-center gap-3">
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={e => { choose(e.target.files?.[0]); e.target.value = '' }} />
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); choose(e.dataTransfer.files?.[0]) }}
        aria-label={preview ? 'Change photo' : 'Add a photo'}
        className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-brand-200 bg-brand-50 text-brand-300 hover:border-brand-300"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-7 w-7" />}
      </button>
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => input.current?.click()}>{preview ? 'Change photo' : 'Add a photo'}</Button>
          {preview && <Button type="button" size="sm" variant="ghost" onClick={() => replace({ kind: 'remove' })}><Trash2 className="h-4 w-4" />Remove</Button>}
        </div>
        <p className="text-xs text-gray-500">Shown on the stock cards and the stall buttons. A phone photo is fine; it’s shrunk before upload.</p>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  )
}
