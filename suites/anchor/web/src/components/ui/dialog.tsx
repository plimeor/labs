/**
 * Dialog — Anchor's modal dialog shell.
 *
 * Part of src/components/ui (see ./README.md). Wraps @ark-ui/react's headless
 * Dialog (focus trap, scroll lock, Escape, ARIA) and provides the styled
 * backdrop + floating surface via Tailwind utilities. Children render inside
 * the content surface, so callers own the inner layout (e.g. the Settings
 * dialog's own sidebar).
 */

import { Portal } from '@ark-ui/react'
import { Dialog as ArkDialog, type DialogOpenChangeDetails } from '@ark-ui/react/dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

export interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Accessible title (visually hidden unless `showHeader`). */
  title: string
  /** Render a visible header bar with the title and a close button. */
  showHeader?: boolean
  /** Extra classes for the content surface (controls its size/layout). */
  className?: string
  children: ReactNode
}

export function Dialog({ open, onOpenChange, title, showHeader, className, children }: DialogProps) {
  const contentClass = [
    'surface-floating flex max-h-full max-w-full flex-col overflow-hidden rounded-xl bg-popover text-fg',
    className
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <ArkDialog.Root open={open} onOpenChange={(details: DialogOpenChangeDetails) => onOpenChange(details.open)}>
      <Portal>
        <ArkDialog.Backdrop className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px]" />
        <ArkDialog.Positioner className="fixed inset-0 z-[41] grid place-items-center p-6">
          <ArkDialog.Content className={contentClass}>
            {showHeader ? (
              <header className="flex items-center justify-between gap-3 border-line border-b px-4 py-3.5">
                <ArkDialog.Title className="m-0 font-medium text-[15px]">{title}</ArkDialog.Title>
                <ArkDialog.CloseTrigger
                  aria-label="Close"
                  className="grid size-7 place-items-center rounded-md bg-transparent text-fg-secondary hover:bg-hover hover:text-fg"
                >
                  <X size={16} />
                </ArkDialog.CloseTrigger>
              </header>
            ) : (
              <ArkDialog.Title className="sr-only">{title}</ArkDialog.Title>
            )}
            {children}
          </ArkDialog.Content>
        </ArkDialog.Positioner>
      </Portal>
    </ArkDialog.Root>
  )
}
