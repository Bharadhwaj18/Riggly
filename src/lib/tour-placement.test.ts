import { describe, expect, it } from 'vitest'
import { placeTourCard } from './tour-placement'

const phone = { width: 375, height: 667 }
const card = { height: 200 }

describe('placeTourCard', () => {
  it('goes below the target when it fits', () => {
    const p = placeTourCard({ top: 100, left: 20, width: 100, height: 40 }, card, phone)
    expect(p.top).toBe(152)
  })

  it('goes above a target near the bottom', () => {
    const p = placeTourCard({ top: 560, left: 20, width: 300, height: 50 }, card, phone)
    expect(p.top).toBe(560 - 12 - 200)
  })

  it('stays on screen when the target fills most of it', () => {
    const p = placeTourCard({ top: 60, left: 0, width: 375, height: 500 }, card, phone)
    expect(p.top).toBeGreaterThanOrEqual(12)
    expect(p.top + card.height).toBeLessThanOrEqual(phone.height - 12)
  })

  it('never goes above the top, even with a tall card and a target high up', () => {
    const p = placeTourCard({ top: 250, left: 0, width: 375, height: 300 }, { height: 320 }, phone)
    expect(p.top).toBeGreaterThanOrEqual(12)
    expect(p.top + 320).toBeLessThanOrEqual(phone.height - 12)
  })

  it('caps a card taller than the screen and keeps it inside', () => {
    const p = placeTourCard({ top: 100, left: 0, width: 100, height: 40 }, { height: 900 }, phone)
    expect(p.maxHeight).toBe(phone.height - 24)
    expect(p.top).toBe(12)
  })

  it('stays inside the sides on a narrow screen', () => {
    const p = placeTourCard({ top: 100, left: 300, width: 70, height: 40 }, card, { width: 320, height: 568 })
    expect(p.left).toBeGreaterThanOrEqual(12)
    expect(p.left + p.width).toBeLessThanOrEqual(320 - 12)
  })
})
