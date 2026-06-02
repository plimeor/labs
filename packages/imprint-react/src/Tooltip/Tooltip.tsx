import { Tooltip as ArkTooltip, Portal, type TooltipOpenChangeDetails } from '@ark-ui/react'
import { forwardRef, type ReactNode } from 'react'

import styles from './Tooltip.module.css'

export type { TooltipOpenChangeDetails }

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
        <ArkTooltip.Positioner className={styles.positioner}>
          <ArkTooltip.Content ref={ref} className={className ? `${styles.content} ${className}` : styles.content}>
            <ArkTooltip.Arrow className={styles.arrow}>
              <ArkTooltip.ArrowTip className={styles.arrowTip} />
            </ArkTooltip.Arrow>
            {content}
          </ArkTooltip.Content>
        </ArkTooltip.Positioner>
      </Portal>
    </ArkTooltip.Root>
  )
})
