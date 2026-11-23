import { describe, expect, it } from 'vitest'
import { featuresFrom, sectionLevelsFrom, withFeatures } from './workspace-sections'

describe('workspace features', () => {
  it('treats missing settings as everything on', () => {
    expect(Object.values(featuresFrom(null)).every(Boolean)).toBe(true)
    expect(Object.values(featuresFrom({ finance: { currency: 'INR' } })).every(Boolean)).toBe(true)
  })
  it('reads switched-off sections', () => {
    const f = featuresFrom({ features: { merch: false, finance: false, shows: true } })
    expect(f.merch).toBe(false)
    expect(f.finance).toBe(false)
    expect(f.shows).toBe(true)
    expect(f.songs).toBe(true)
  })
  it('hides a switched-off section even for owners', () => {
    const levels = withFeatures(sectionLevelsFrom(null, 'owner'), featuresFrom({ features: { merch: false } }))
    expect(levels.merch).toBe('none')
    expect(levels.shows).toBe('edit')
  })
  it('keeps member levels for sections that are on', () => {
    const levels = withFeatures(sectionLevelsFrom({ sections: { finance: 'view', notes: 'none' } }, 'member'), featuresFrom({ features: { notes: true } }))
    expect(levels.finance).toBe('view')
    expect(levels.notes).toBe('none')
  })
})
