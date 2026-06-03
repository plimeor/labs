import { Tooltip as ArkTooltip, Portal, type TooltipOpenChangeDetails } from '@ark-ui/react'
import { forwardRef, type ReactNode } from 'react'
import { tv } from 'tailwind-variants'

import './Tooltip.css'

export type { TooltipOpenChangeDetails }

// One tv() with a slot per Ark part. Ark sizes the arrow from the --arrow-size /
// --arrow-background custom props on the positioner and arrow. Named utilities
// (rounded-sm, shadow-3, font-ui, …) emit the same var(--token) the old CSS
// Module used; primitives/motion tokens use the arbitrary [var(--token)] form.
// Enter/exit motion is bound to the co-located keyframes via Ark's data-state.
const tooltip = tv({
  slots: {
    arrow: '[--arrow-size:8px] [--arrow-background:var(--warm-900)]',
    arrowTip: 'border-0',
    positioner: 'z-50 [--arrow-size:8px] [--arrow-background:var(--warm-900)]',
    content: [
      'font-ui text-xs font-medium leading-snug',
      'text-[var(--warm-50)] bg-[var(--warm-900)]',
      'py-2 px-3 rounded-sm shadow-3 max-w-[240px]',
      'data-[state=open]:animate-[imprint-tooltip-in_var(--dur-fast)_var(--ease-out)]',
      'data-[state=closed]:animate-[imprint-tooltip-out_var(--dur-fast)_var(--ease-in)]'
    ]
  }
})

const styles = tooltip()

export interface TooltipProps {
  /** The element that triggers the tooltip. Rendered via Ark's trigger (asChild). */
  children: ReactNode
  /** The tooltip bubble contents. */
  content: ReactNode
  /**
   * Delay before the tooltip opens, in ms. Short by default to feel responsive.
   * @default 200
   */
  openDelay?: number
  /**
   * Delay before the tooltip closes, in ms.
   * @default 100
   */
  closeDelay?: number
  /** Controlled open state. */
  open?: boolean
  /** Initial open state when uncontrolled. */
  defaultOpen?: boolean
  /** Called when the open state changes. */
  onOpenChange?: (open: boolean) => void
  /** Disables the tooltip. */
  disabled?: boolean
  /** Side the bubble is placed on relative to the trigger. @default 'top' */
  placement?: 'top' | 'bottom' | 'left' | 'right'
  /** Optional id forwarded to the Ark root for composition. */
  id?: string
  /** Extra className merged onto the content bubble. */
  className?: string
}

/**
 * Imprint Tooltip. Ark UI Tooltip behavior (hover/focus open, Esc-to-close,
 * pointer-safe delays, ARIA wiring) skinned with Imprint tokens. Renders a
 * dark, high-contrast bubble with a matching arrow — 1:1 with the Imprint
 * specimen. Opens on a short delay.
 *
 * The ref forwards to the tooltip content (bubble) element.
 */
export const Tooltip = forwardRef<HTMLDivElement, TooltipProps>(function Tooltip(
  {
    children,
    content,
    openDelay = 200,
    closeDelay = 100,
    open,
    defaultOpen,
    onOpenChange,
    disabled,
    placement = 'top',
    id,
    className
  },
  ref
) {
  return (
    <ArkTooltip.Root
      {...(id != null ? { id } : {})}
      openDelay={openDelay}
      closeDelay={closeDelay}
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange ? (details: TooltipOpenChangeDetails) => onOpenChange(details.open) : undefined}
      disabled={disabled}
      positioning={{ placement, gutter: 6 }}
    >
      <ArkTooltip.Trigger asChild>{children}</ArkTooltip.Trigger>
      <Portal>
        <ArkTooltip.Positioner className={styles.positioner()}>
          <ArkTooltip.Content ref={ref} className={styles.content({ className })}>
            <ArkTooltip.Arrow className={styles.arrow()}>
              <ArkTooltip.ArrowTip className={styles.arrowTip()} />
            </ArkTooltip.Arrow>
            {content}
          </ArkTooltip.Content>
        </ArkTooltip.Positioner>
      </Portal>
    </ArkTooltip.Root>
  )
})
