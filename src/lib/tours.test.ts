import { describe, expect, it } from 'vitest'
import { buildWalkthrough, pathMatches, tourForPath, TOURS, toursFor } from './tours'

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
    expect(tourForPath('/finance')?.id).toBe('finance')
    expect(tourForPath('/merch')).toBeUndefined()
  })
  it('has unique ids', () => {
    expect(new Set(TOURS.map(t => t.id)).size).toBe(TOURS.length)
  })
})

describe('full walkthrough', () => {
  it('runs every tour in order, with a step that moves to each next section', () => {
    const w = buildWalkthrough(TOURS)
    expect(w.steps.length).toBe(TOURS.reduce((n, t) => n + t.steps.length, 0) + (TOURS.length - 1) + 1)
    const moves = w.steps.filter(s => s.goTo).map(s => s.goTo)
    expect(moves).toEqual(TOURS.slice(1).map(t => t.startPath))
  })
  it('only covers the sections it is given', () => {
    const w = buildWalkthrough(TOURS.filter(t => t.id !== 'songs'))
    expect(w.steps.some(s => s.path.startsWith('^/songs'))).toBe(false)
    expect(w.steps.some(s => s.goTo === '/songs')).toBe(false)
  })
  it('a move step sits on the page the previous step was on', () => {
    const w = buildWalkthrough(TOURS)
    w.steps.forEach((s, i) => { if (s.goTo) expect(s.path).toBe(w.steps[i - 1].path) })
  })
})

describe('toursFor', () => {
  it('drops tours for sections that are off', () => {
    const ids = toursFor(['tasks']).map(t => t.id)
    expect(ids).not.toContain('tasks')
    expect(ids).toContain('finance')
  })
  it('drops steps about a section that is off, but keeps the rest of the tour', () => {
    const today = toursFor(['tasks']).find(t => t.id === 'today')!
    expect(today.steps.some(s => s.section === 'tasks')).toBe(false)
    expect(today.steps.length).toBeGreaterThan(1)
    expect(toursFor([]).find(t => t.id === 'today')!.steps.some(s => s.section === 'tasks')).toBe(true)
  })
  it('a core-only workspace walks through exactly its sections', () => {
    const w = buildWalkthrough(toursFor(['recordings', 'merch', 'tasks', 'notes', 'agencies']))
    const stops = w.steps.filter(s => s.goTo).map(s => s.goTo)
    expect(stops).toEqual(['/shows', '/setlists', '/songs', '/finance', '/calendar'])
  })
})
