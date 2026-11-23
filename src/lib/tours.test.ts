import { describe, expect, it } from 'vitest'
import { pathMatches, tourForPath, TOURS } from './tours'

describe('tours', () => {
  it('each tour starts on its own page', () => {
    for (const t of TOURS) expect(pathMatches(t.steps[0], t.startPath), t.id).toBe(true)
  })
  it('a step that waits for a tap leads to a step that can be reached', () => {
    for (const t of TOURS) {
      t.steps.forEach((s, i) => {
        if (s.action === 'tap') {
          expect(s.target?.length, `${t.id} step ${i + 1} needs something to tap`).toBeGreaterThan(0)
          expect(t.steps[i + 1], `${t.id} step ${i + 1} is the last step`).toBeDefined()
        }
      })
    }
  })
  it('matches pages exactly', () => {
    expect(pathMatches({ path: '^/shows/[^/]+$', title: '', body: '' }, '/shows/abc')).toBe(true)
    expect(pathMatches({ path: '^/shows/[^/]+$', title: '', body: '' }, '/shows/abc/edit')).toBe(false)
    expect(pathMatches({ path: '^/shows$', title: '', body: '' }, '/shows')).toBe(true)
  })
  it('finds the tour for a page', () => {
    expect(tourForPath('/shows')?.id).toBe('shows')
    expect(tourForPath('/')?.id).toBe('today')
    expect(tourForPath('/finance')).toBeUndefined()
  })
  it('has unique ids', () => {
    expect(new Set(TOURS.map(t => t.id)).size).toBe(TOURS.length)
  })
})
