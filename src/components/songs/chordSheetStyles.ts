import { getCss } from '@/lib/chords/formatter'
import { getLightChordSheetCss } from '@/lib/chords/theme'

export const CHORD_VIEWER_CSS_ID = 'chord-viewer-css'

// The base sheet CSS is light-only (fixed hex colours), so everything colour- or size-related is
// re-pointed at theme variables here. Scoped to `.chord-view`, which the in-app sheet wrappers carry.
// Chords use the brand green; in dark mode brand-400 is white like the lyrics, so the lighter green is used.
const THEME_OVERRIDES = `
.chord-view, .rich-chart { --chord-color: var(--color-brand-400); }
.dark .chord-view, .dark .rich-chart { --chord-color: var(--color-brand-600); }
.chord-view { color: var(--color-gray-900); }
.chord-view .chord-sheet { font-size: var(--chord-size, 14px); line-height: 1.55; }
/* Compact sections: no gap after a section's last line, smaller gaps between its paragraphs, and no
   empty chord row above a lyric line that has no chords. */
.chord-view .paragraph { margin-bottom: 0.75rem; }
.chord-view .paragraph:last-child, .chord-view .chart-section:last-child, .chord-view .inline-line:last-child { margin-bottom: 0; }
.chord-view .row:not(:has(.chord:not(:empty))) .chord { display: none; }
.chord-view .chord, .chord-view .ichord { color: var(--chord-color); }
.chord-view .comment { color: var(--color-gray-500); }
.chord-view .section-label { color: var(--color-gray-500); }
.chord-view span[style*="background-color"], .rich-chart span[style*="background-color"] { color: #111; }

/* Block editor: chords it spots by itself, and chords marked by hand (with a soft tint). */
.rich-chart { white-space: pre; }
.rich-chart p { margin: 0; min-height: 1.6em; }
.rich-chart .chord-auto, .rich-chart .chord-mark { color: var(--chord-color); font-weight: 700; }
.rich-chart .chord-mark { background: color-mix(in srgb, var(--chord-color) 18%, transparent); border-radius: 3px; }
.rich-chart p.is-editor-empty:first-child::before {
  content: attr(data-placeholder); color: var(--color-gray-400); float: left; height: 0; pointer-events: none; white-space: pre-wrap;
}
`

/** Injects the chord-sheet CSS once per page (shared by the viewer and the editor preview). */
export function ensureChordSheetCss() {
  if (document.getElementById(CHORD_VIEWER_CSS_ID)) return
  const style = document.createElement('style')
  style.id = CHORD_VIEWER_CSS_ID
  style.textContent = getCss() + '\n' + getLightChordSheetCss() + '\n' + THEME_OVERRIDES
  document.head.appendChild(style)
}
