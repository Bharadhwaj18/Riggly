import { Shirt } from 'lucide-react'

/** An item's name above its size buttons at the stall, with its photo so it's easy to spot at a glance. */
export function ItemHeading({ name, image }: { name: string; image: string | null | undefined }) {
  return (
    <div className="mb-2 flex items-center gap-2.5">
      {image
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={image} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-brand-200" />
        : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-500"><Shirt className="h-5 w-5" /></span>}
      <p className="min-w-0 truncate text-sm font-bold text-gray-900">{name}</p>
    </div>
  )
}
