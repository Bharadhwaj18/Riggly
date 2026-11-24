import { describe, expect, it } from 'vitest'
import { accessSummary, canEditItem, isLimitedMember, isPastLastDay, presetLevels, scopesFrom, type AccessGrant } from './access'

// 10 Dec 2026, 20:00 in India.
const now = new Date('2026-12-10T14:30:00Z')

describe('scopesFrom', () => {
  it('reads each feature, missing ones are full edit', () => {
    const l = scopesFrom({ sections: { setlists: 'items', finance: 'none', shows: 'view' } }, 'member', now)
    expect(l.setlists).toBe('items')
    expect(l.finance).toBe('none')
    expect(l.shows).toBe('view')
    expect(l.tasks).toBe('edit')
  })
  it('gives owners and admins everything, whatever is stored', () => {
    expect(Object.values(scopesFrom({ sections: { finance: 'none' }, access_until: '2020-01-01' }, 'admin', now)).every(v => v === 'edit')).toBe(true)
  })
  it('treats old Merch crew as Merch, only these items', () => {
    expect(scopesFrom({ merch_crew: true }, 'member', now).merch).toBe('items')
  })
  it('hides everything after the last day', () => {
    expect(Object.values(scopesFrom({ access_until: '2026-12-09' }, 'member', now)).every(v => v === 'none')).toBe(true)
    expect(scopesFrom({ access_until: '2026-12-10' }, 'member', now).shows).toBe('edit')
  })
})

describe('isPastLastDay', () => {
  it('runs through the whole last day, India time', () => {
    expect(isPastLastDay('2026-12-10', now)).toBe(false)
    // 00:30 on 11 Dec in India is still 10 Dec in UTC: past.
    expect(isPastLastDay('2026-12-10', new Date('2026-12-10T19:00:00Z'))).toBe(true)
    expect(isPastLastDay(null, now)).toBe(false)
  })
})

describe('canEditItem', () => {
  const grants: AccessGrant[] = [
    { section: 'setlists', itemId: 'a', level: 'edit', until: null },
    { section: 'setlists', itemId: 'b', level: 'view', until: null },
    { section: 'setlists', itemId: 'c', level: 'edit', until: '2020-01-01' },
  ]
  it('follows whole-section edit, then edit grants still in force', () => {
    expect(canEditItem('edit', [], 'setlists', 'x')).toBe(true)
    expect(canEditItem('view', grants, 'setlists', 'a')).toBe(false)
    expect(canEditItem('items', grants, 'setlists', 'a')).toBe(true)
    expect(canEditItem('items', grants, 'setlists', 'b')).toBe(false)
    expect(canEditItem('items', grants, 'setlists', 'c')).toBe(false)
    expect(canEditItem('items', grants, 'shows', 'a')).toBe(false)
  })
})

describe('isLimitedMember', () => {
  it('is true when no whole feature is open', () => {
    expect(isLimitedMember({ role: 'member', permissions: { sections: presetLevels('setlist_guest') } })).toBe(true)
    expect(isLimitedMember({ role: 'member', permissions: { sections: presetLevels('crew') } })).toBe(true)
    expect(isLimitedMember({ role: 'member', permissions: { merch_crew: true } })).toBe(true)
  })
  it('is false for anyone with a whole feature, and for admins', () => {
    expect(isLimitedMember({ role: 'member', permissions: {} })).toBe(false)
    expect(isLimitedMember({ role: 'member', permissions: { sections: { ...presetLevels('nothing'), notes: 'view' } } })).toBe(false)
    expect(isLimitedMember({ role: 'admin', permissions: { sections: presetLevels('nothing') } })).toBe(false)
  })
})

describe('accessSummary', () => {
  it('names presets and shared items', () => {
    expect(accessSummary(presetLevels('member'))).toBe('Everything')
    expect(accessSummary(presetLevels('viewer'))).toBe('View only')
    expect(accessSummary(presetLevels('nothing'))).toBe('Nothing yet')
    expect(accessSummary(presetLevels('setlist_guest'), { setlists: 2 })).toBe('Setlists: 2 setlists')
  })
})
