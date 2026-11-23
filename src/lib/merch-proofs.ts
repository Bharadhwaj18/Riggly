// UPI payment photos for merch sales: the rule that UPI money needs one, and that the photos are the person's own.

/** Why a sale can't be saved for want of a UPI photo, or null when it's fine. */
export function proofProblem(upiAmount: number, paths: string[] | undefined, workspaceId: string, userId: string): string | null {
  const list = paths ?? []
  if (upiAmount > 0 && list.length === 0) return 'Add a photo of the UPI payment.'
  const folder = `${workspaceId}/${userId}/`
  if (list.some(p => !p.startsWith(folder) || p.includes('..'))) return 'A payment photo didn’t upload properly. Add it again.'
  if (list.length > 20) return 'That’s too many photos for one sale.'
  return null
}
