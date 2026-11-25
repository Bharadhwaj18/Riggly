'use client'

import { useRouter } from 'next/navigation'
import { CloudOff, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { isNetworkError } from '@/lib/offline'

/**
 * When something on a page fails. Most often that's a change made with no internet: then it says so and offers
 * to go back to the page, which still works from the saved copy.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter()
  const offline = isNetworkError(error) || (typeof navigator !== 'undefined' && !navigator.onLine)
  const Icon = offline ? CloudOff : TriangleAlert
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <Icon className="h-8 w-8 text-gray-400" />
      <h1 className="text-xl font-bold text-gray-900">{offline ? 'You’re offline' : 'Something went wrong'}</h1>
      <p className="text-sm text-gray-500">
        {offline
          ? 'That needed the internet, so nothing was changed. Pages you’ve opened before still work; try the change again once you’re back online.'
          : 'This page hit a problem. Try again, and if it keeps happening, let the band admin know.'}
      </p>
      <div className="mt-2 flex gap-2">
        <Button variant="secondary" onClick={() => router.back()}>Go back</Button>
        <Button onClick={() => reset()}>Try again</Button>
      </div>
    </div>
  )
}
