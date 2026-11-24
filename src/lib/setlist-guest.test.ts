import { describe, expect, it } from 'vitest'
import { guestAccessEnded, guestSectionLevels, isSetlistGuestRow, setlistGuestFrom } from './setlist-guest'

// 10 Dec 2026, 20:00 in India.
const now = new Date('2026-12-10T14:30:00Z')

describe('setlistGuestFrom', () => {
  it('reads the setlists and last day', () => {
    expect(setlistGuestFrom({ setlist_guest: true, setlist_ids: ['a', 'b', 3], access_until: '2026-12-12' }, 'member', now))
      .toEqual({ setlistIds: ['a', 'b'], accessUntil: '2026-12-12', ended: false })
  })
  it('is null for everyone else, and never for owners or admins', () => {
    expect(setlistGuestFrom({}, 'member', now)).toBeNull()
    expect(setlistGuestFrom(null, 'member', now)).toBeNull()
    expect(setlistGuestFrom({ setlist_guest: true }, 'admin', now)).toBeNull()
    expect(setlistGuestFrom({ setlist_guest: true }, 'owner', now)).toBeNull()
  })
  it('has no end date when none is set', () => {
    expect(setlistGuestFrom({ setlist_guest: true }, 'member', now)).toEqual({ setlistIds: [], accessUntil: null, ended: false })
  })
})

describe('guestAccessEnded', () => {
  it('runs through the whole last day, India time', () => {
    expect(guestAccessEnded('2026-12-10', now)).toBe(false)
    // 00:30 on 11 Dec in India is still 10 Dec in UTC: ended.
    expect(guestAccessEnded('2026-12-10', new Date('2026-12-10T19:00:00Z'))).toBe(true)
    expect(guestAccessEnded('2026-12-09', now)).toBe(true)
    expect(guestAccessEnded(null, now)).toBe(false)
  })
})

describe('guestSectionLevels', () => {
  it('opens only Setlists and Songs, view only', () => {
    const l = guestSectionLevels(false)
    expect(l.setlists).toBe('view')
    expect(l.songs).toBe('view')
    expect(l.finance).toBe('none')
    expect(l.merch).toBe('none')
    expect(l.shows).toBe('none')
  })
  it('hides everything once access has ended', () => {
    expect(Object.values(guestSectionLevels(true)).every(v => v === 'none')).toBe(true)
  })
})

describe('isSetlistGuestRow', () => {
  it('spots guests but not admins', () => {
    expect(isSetlistGuestRow({ role: 'member', permissions: { setlist_guest: true } })).toBe(true)
    expect(isSetlistGuestRow({ role: 'member', permissions: {} })).toBe(false)
    expect(isSetlistGuestRow({ role: 'admin', permissions: { setlist_guest: true } })).toBe(false)
  })
})
