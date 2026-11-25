import { cn } from '@/lib/utils'

/**
 * The Riggly app mark: the "R" from the signature logo with its green stage underline. The R takes the
 * surrounding text colour; the underline is the dark-theme green. Matches the app icons in public/.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <text x="8.3" y="44.7" fontSize="46" fill="currentColor" style={{ fontFamily: 'var(--font-yellowtail), cursive' }}>R</text>
      <path d="M11 53 C24 55.5 40 55 54 50" fill="none" stroke="#7dd3a0" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/** The logo on its black tile, shown wherever the product mark goes. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0b0b0b] text-white shadow-sm', className)}>
      <LogoMark className="h-[88%] w-[88%]" />
    </div>
  )
}
