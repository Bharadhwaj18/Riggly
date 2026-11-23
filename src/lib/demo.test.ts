import { describe, expect, it } from 'vitest'
import { isDemoWorkspace } from './demo'

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
