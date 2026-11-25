import { describe, it, expect } from 'vitest'
import { songLinksIn, staticAssetsIn } from './offline'

describe('songLinksIn', () => {
  it('finds each song in the setlist once, however the link is spelled', () => {
    const html = `
      <a href="/songs/a1?from=/setlists/s1">One</a>
      <a href="/songs/a1?from=/setlists/s1&amp;stage=1">Stage</a>
      <a href="/songs/b2?from=%2Fsetlists%2Fs1">Next</a>
      <a href="/songs/zz?from=/setlists/s1">Not in this setlist</a>
      <a href="/songs">All songs</a>
      <a href="/songs/a1/edit?from=%2Fsetlists%2Fs1">Edit details</a>`
    expect(songLinksIn(html, new Set(['a1', 'b2']))).toEqual([
      '/songs/a1?from=/setlists/s1',
      '/songs/b2?from=/setlists/s1',
    ])
  })
})

describe('staticAssetsIn', () => {
  it('finds scripts, styles and fonts, with or without the /_next/ prefix', () => {
    const html = `
      <script src="/_next/static/chunks/main-abc.js" async></script>
      <link rel="stylesheet" href="/_next/static/css/app-1.css">
      <script>self.__next_f.push([1,"3:I[\\"static/chunks/page-9.js\\"]"])</script>`
    expect(staticAssetsIn(html).sort()).toEqual([
      '/_next/static/chunks/main-abc.js',
      '/_next/static/chunks/page-9.js',
      '/_next/static/css/app-1.css',
    ])
    expect(staticAssetsIn('@font-face{src:url(/_next/static/media/font.woff2) format("woff2")}')).toEqual(['/_next/static/media/font.woff2'])
  })
})
