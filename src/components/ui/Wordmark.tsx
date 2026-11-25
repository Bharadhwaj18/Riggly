import { useId } from 'react'
import { APP_NAME } from '@/lib/brand'
import { cn } from '@/lib/utils'

/**
 * The product name as a logo: "Riggly" signed in Yellowtail with a green stage underline. It sizes with the
 * text around it (set the size with a text-* class) and takes its colour from the text colour. `tone` picks the
 * green: "sidebar" for the dark sidebar, "page" for ordinary page backgrounds. `spotlight` adds the stage
 * light aimed down onto the name, for the big logo on the sign-in and setup pages.
 * The same drawing, as images, is in marketing/ (riggly-logo.png and friends).
 */
export function Wordmark({ tone = 'page', spotlight = false, className }: { tone?: 'sidebar' | 'page'; spotlight?: boolean; className?: string }) {
  const id = useId()
  const green = tone === 'sidebar' ? 'var(--color-sidebar-accent)' : 'var(--color-brand-600)'
  return (
    <svg
      role="img"
      aria-label={APP_NAME}
      viewBox={spotlight ? '-18 -75 270 227' : '-18 22 270 126'}
      className={cn('inline-block w-auto', spotlight ? 'h-[4em]' : 'h-[1.6em] align-[-0.61em]', className)}
    >
      {spotlight && (
        <>
          <defs>
            <linearGradient id={`${id}b`} gradientUnits="userSpaceOnUse" x1="185.6" y1="-8" x2="116" y2="140">
              <stop offset="0" stopColor={green} stopOpacity="0.45" />
              <stop offset="1" stopColor={green} stopOpacity="0.06" />
            </linearGradient>
            <radialGradient id={`${id}p`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor={green} stopOpacity="0.35" />
              <stop offset="1" stopColor={green} stopOpacity="0" />
            </radialGradient>
          </defs>
          <path d="M168.8 -1.2 L191.8 9 L241.3 140 L-9.3 140 Z" fill={`url(#${id}b)`} />
          <ellipse cx="116" cy="140" rx="143.8" ry="10" fill={`url(#${id}p)`} />
        </>
      )}
      <text x="0" y="100" fontSize="100" fill="currentColor" style={{ fontFamily: 'var(--font-yellowtail), cursive' }}>
        {APP_NAME}
      </text>
      <path d="M-13.9 141 C69.6 145 174 143 248.2 133" fill="none" stroke={green} strokeWidth="3.4" strokeLinecap="round" />
      {spotlight && (
        <>
          <line x1="185.6" y1="-68.9" x2="185.6" y2="-27.1" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2.6" strokeLinecap="round" />
          <g transform="translate(185.6 -8) rotate(24) scale(0.4348)">
            <path d="M-36 -2 C-36 -54 36 -54 36 -2" fill="none" stroke="#3a3a3a" strokeWidth="6" strokeLinecap="round" />
            <rect x="-24" y="-30" width="48" height="56" rx="10" fill="#161616" stroke={green} strokeWidth="3" />
            <rect x="-30" y="22" width="60" height="11" rx="4" fill={green} />
            <circle cx="0" cy="-4" r="5" fill={green} opacity="0.6" />
          </g>
        </>
      )}
    </svg>
  )
}
