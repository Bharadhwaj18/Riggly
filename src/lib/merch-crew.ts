import { isLimitedMember } from '@/lib/access'

/**
 * Merch crew (not owners or admins): Merch set to 'only these items' (their kits), or the old merch_crew flag.
 */
export const isMerchCrewRow = (m: { role: string; permissions: unknown }) => {
  if (m.role === 'owner' || m.role === 'admin' || !m.permissions || typeof m.permissions !== 'object' || Array.isArray(m.permissions)) return false
  const p = m.permissions as Record<string, unknown>
  const sections = p.sections && typeof p.sections === 'object' && !Array.isArray(p.sections) ? (p.sections as Record<string, unknown>) : {}
  return p.merch_crew === true || sections.merch === 'items'
}

/**
 * People outside the band's day-to-day (no whole feature open to them, e.g. Merch crew or someone with only a few
 * setlists): left out of member lists, pickers and band-wide notifications.
 */
export const isOutsiderRow = (m: { role: string; permissions: unknown }) => isLimitedMember(m)
