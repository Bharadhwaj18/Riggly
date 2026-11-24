/**
 * Merch crew (not owners or admins) only belong in Merch: they're left out of the band's member lists, pickers and
 * band-wide notifications everywhere else.
 */
export const isMerchCrewRow = (m: { role: string; permissions: unknown }) =>
  m.role !== 'owner' && m.role !== 'admin' && !!m.permissions && typeof m.permissions === 'object' && !Array.isArray(m.permissions) &&
  (m.permissions as Record<string, unknown>).merch_crew === true

/** Setlist guests: only ever see the setlists picked for them. */
export const isSetlistGuestMember = (m: { role: string; permissions: unknown }) =>
  m.role !== 'owner' && m.role !== 'admin' && !!m.permissions && typeof m.permissions === 'object' && !Array.isArray(m.permissions) &&
  (m.permissions as Record<string, unknown>).setlist_guest === true

/** People outside the band (Merch crew, setlist guests): left out of member lists, pickers and band-wide notifications. */
export const isOutsiderRow = (m: { role: string; permissions: unknown }) => isMerchCrewRow(m) || isSetlistGuestMember(m)
