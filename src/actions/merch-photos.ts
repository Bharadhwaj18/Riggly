'use server'

import { createClient } from '@/lib/supabase/server'
import { getFromWebsite } from '@/lib/store-api'

export interface WebsitePhotos {
  error?: string
  /** False when no website product is linked to this item yet */
  linked?: boolean
  photos?: string[]
}

/** The photos the band website shows for the product linked to this merch item, in shop order. */
export async function getWebsitePhotos(itemId: string): Promise<WebsitePhotos> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }
  // Looked up as the signed-in person, so they can only ask about items they can see
  const { data: item } = await supabase.from('merch_items').select('id').eq('id', itemId).maybeSingle()
  if (!item) return { error: 'Couldn’t find that item.' }

  const result = await getFromWebsite(`/api/store/photos?item=${encodeURIComponent(item.id)}`)
  if (!result.ok) return { error: result.error }
  const photos = Array.isArray(result.data.photos)
    ? result.data.photos.filter((u): u is string => typeof u === 'string' && /^https:\/\//i.test(u))
    : []
  return { linked: result.data.linked === true, photos }
}
