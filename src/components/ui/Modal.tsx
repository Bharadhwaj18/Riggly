'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
  children: React.ReactNode
  className?: string
}

export function Modal({ open, onOpenChange, title, description, children, className }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            // Phones: pinned near the top, sized to the visible screen (dvh), so the keyboard opens below it and Safari
            // has no reason to scroll the page to reach a field. Larger screens: centred as before.
            'fixed left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] z-50 max-h-[calc(100dvh-1.5rem)] w-full max-w-lg -translate-x-1/2 overflow-y-auto overscroll-contain rounded-lg bg-white p-6 shadow-xl',
            'sm:top-1/2 sm:max-h-[90dvh] sm:-translate-y-1/2',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            className
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              {title && (
                <Dialog.Title className="text-lg font-semibold text-gray-900">{title}</Dialog.Title>
              )}
              {description && (
                <Dialog.Description className="mt-1 text-sm text-gray-500">{description}</Dialog.Description>
              )}
            </div>
            <Dialog.Close className="rounded-md p-1 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-400">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <div className="mt-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
