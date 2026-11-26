import { describe, expect, it } from 'vitest'
import { DEFAULT_TODAY, cardIds, todayConfigFrom, todayContentFrom } from './today-config'

describe('todayContentFrom', () => {
  it('falls back to the built-in text when nothing is stored', () => {
    expect(todayContentFrom(null)).toEqual(DEFAULT_TODAY)
    expect(todayContentFrom({})).toEqual(DEFAULT_TODAY)
  })

  it('uses what the admin saved, even an empty list', () => {
    const c = todayContentFrom({ tips: ['One'], updates: [], news: '', off: ['review'] })
    expect(c.tips).toEqual(['One'])
    expect(c.updates).toEqual([])
    expect(c.news).toBe('')
    expect(c.off).toEqual(['review'])
    expect(c.reviews).toEqual(DEFAULT_TODAY.reviews)
  })

  it('drops malformed reviews and unknown card ids', () => {
    const c = todayContentFrom({ reviews: [{ quote: 'Great', by: 'A drummer' }, { quote: 5 }], off: ['tip', 'nope'] })
    expect(c.reviews).toEqual([{ quote: 'Great', by: 'A drummer' }])
    expect(c.off).toEqual(['tip'])
  })
})

describe('todayConfigFrom', () => {
  it('joins cards off for everyone with cards off for this workspace', () => {
    const cfg = todayConfigFrom({ content: { off: ['news'] }, workspace_off: ['money', 'bad'], announcements: [] })
    expect([...cfg.off].sort()).toEqual(['money', 'news'])
  })

  it('keeps only well-formed announcements', () => {
    const cfg = todayConfigFrom({ announcements: [{ id: 'a', title: 'Hi', tone: 'info' }, { title: 'no id' }] })
    expect(cfg.announcements.map(a => a.id)).toEqual(['a'])
  })

  it('gives the defaults when the database returns nothing (not a member, or the migration not run)', () => {
    const cfg = todayConfigFrom(null)
    expect(cfg.content).toEqual(DEFAULT_TODAY)
    expect(cfg.off.size).toBe(0)
    expect(cfg.announcements).toEqual([])
  })
})

describe('cardIds', () => {
  it('filters to known ids', () => {
    expect(cardIds(['tasks', 'x', 3, 'tip2'])).toEqual(['tasks', 'tip2'])
    expect(cardIds('tasks')).toEqual([])
  })
})
