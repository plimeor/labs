/**
 * Dialog — Anchor's modal dialog shell.
 *
 * Part of src/components/ui (see ./README.md). Wraps @ark-ui/solid's headless
 * Dialog (focus trap, scroll lock, Escape, ARIA) and provides the styled
 * backdrop + floating surface via Tailwind utilities. Children render inside
 * the content surface, so callers own the inner layout (e.g. the Settings
 * dialog's own sidebar).
 */

import { Dialog as ArkDialog, type DialogOpenChangeDetails } from '@ark-ui/solid/dialog'
import { X } from 'lucide-solid'
import { type JSX, Show } from 'solid-js'
import { Portal } from 'solid-js/web'

export interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Accessible title (visually hidden unless `showHeader`). */
  title: string
  /** Render a visible header bar with the title and a close button. */
  showHeader?: boolean
  /** Extra classes for the content surface (controls its size/layout). */
  class?: string
  children: JSX.Element
}

export function Dialog(props: DialogProps) {
  return (
    <ArkDialog.Root
      open={props.open}
      onOpenChange={(details: DialogOpenChangeDetails) => props.onOpenChange(details.open)}
    >
      <Portal>
        <ArkDialog.Backdrop class="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px]" />
        <ArkDialog.Positioner class="fixed inset-0 z-[41] grid place-items-center p-6">
          <ArkDialog.Content
            class={[
              'surface-floating flex max-h-full max-w-full flex-col overflow-hidden rounded-xl bg-popover text-fg',
              props.class
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <Show when={props.showHeader} fallback={<ArkDialog.Title class="sr-only">{props.title}</ArkDialog.Title>}>
              <header class="flex items-center justify-between gap-3 border-line border-b px-4 py-3.5">
                <ArkDialog.Title class="m-0 font-medium text-[15px]">{props.title}</ArkDialog.Title>
                <ArkDialog.CloseTrigger
                  aria-label="Close"
                  class="grid size-7 place-items-center rounded-md bg-transparent text-fg-secondary hover:bg-hover hover:text-fg"
                >
                  <X size={16} />
                </ArkDialog.CloseTrigger>
              </header>
            </Show>
            {props.children}
          </ArkDialog.Content>
        </ArkDialog.Positioner>
      </Portal>
    </ArkDialog.Root>
  )
}
