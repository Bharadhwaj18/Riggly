import { describe, expect, it } from 'vitest'
import { isNetworkError, savedAgo } from './offline'

describe('isNetworkError', () => {
  it('spots each browser’s wording for a request that never got through', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isNetworkError(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(true)
    expect(isNetworkError(new TypeError('Load failed'))).toBe(true)
    expect(isNetworkError(new Error('Title is required'))).toBe(false)
    expect(isNetworkError(undefined)).toBe(false)
  })
})

describe('savedAgo', () => {
  const now = Date.UTC(2026, 10, 25, 12)
  it('reads like a person would say it', () => {
    expect(savedAgo(now - 20_000, now)).toBe('just now')
    expect(savedAgo(now - 12 * 60_000, now)).toBe('12 min ago')
    expect(savedAgo(now - 3 * 3_600_000, now)).toBe('3 h ago')
    expect(savedAgo(now - 26 * 3_600_000, now)).toBe('1 day ago')
    expect(savedAgo(now - 3 * 86_400_000, now)).toBe('3 days ago')
  })
})
