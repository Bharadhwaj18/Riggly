import { describe, it, expect } from 'vitest'
import { proofProblem } from './merch-proofs'

describe('proofProblem', () => {
  it('needs a photo when UPI money was taken', () => {
    expect(proofProblem(800, [], 'ws', 'me')).toMatch(/photo/)
    expect(proofProblem(800, undefined, 'ws', 'me')).toMatch(/photo/)
    expect(proofProblem(800, ['ws/me/a.webp'], 'ws', 'me')).toBeNull()
  })
  it('needs nothing for cash or card only', () => {
    expect(proofProblem(0, [], 'ws', 'me')).toBeNull()
  })
  it('only takes photos from the person’s own folder in this workspace', () => {
    expect(proofProblem(800, ['ws/someone-else/a.webp'], 'ws', 'me')).toMatch(/upload/)
    expect(proofProblem(800, ['other/me/a.webp'], 'ws', 'me')).toMatch(/upload/)
    expect(proofProblem(800, ['ws/me/../x/a.webp'], 'ws', 'me')).toMatch(/upload/)
  })
})
