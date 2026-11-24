import { describe, expect, it } from 'vitest'
import { isDemoWorkspace, visibleFrom, withoutDemos } from './demo'

const m = (id: string, demo = false) => ({ workspace: { id, settings: demo ? { demo: true } : {} } })
const all = [m('personal'), m('tarana'), m('demo', true)]

describe('withoutDemos', () => {
  it('leaves the demo band out of everywhere else', () => {
    expect(withoutDemos(all, 'personal').map(x => x.workspace.id)).toEqual(['personal', 'tarana'])
  })
  it('shows only the demo band while you are in it', () => {
    expect(withoutDemos(all, 'demo').map(x => x.workspace.id)).toEqual(['demo'])
  })
})

describe('visibleFrom', () => {
  it('keeps demo notifications inside the demo', () => {
    expect(visibleFrom(all, 'tarana', 'demo')).toBe(false)
    expect(visibleFrom(all, 'demo', 'demo')).toBe(true)
  })
  it('keeps real ones out of the demo', () => {
    expect(visibleFrom(all, 'tarana', 'tarana')).toBe(true)
    expect(visibleFrom(all, 'personal', 'tarana')).toBe(true)
    expect(visibleFrom(all, 'demo', 'tarana')).toBe(false)
    expect(visibleFrom(all, 'tarana', null)).toBe(true)
  })
})

describe('isDemoWorkspace', () => {
  it('spots a demo band by its settings', () => {
    expect(isDemoWorkspace({ settings: { demo: true, features: {} } })).toBe(true)
  })
  it('treats everything else as a real workspace', () => {
    expect(isDemoWorkspace({ settings: {} })).toBe(false)
    expect(isDemoWorkspace({ settings: { demo: 'true' } })).toBe(false)
    expect(isDemoWorkspace({ settings: null })).toBe(false)
    expect(isDemoWorkspace(null)).toBe(false)
  })
})
