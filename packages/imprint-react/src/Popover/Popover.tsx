import { Popover as ArkPopover, type PopoverOpenChangeDetails, Portal } from '@ark-ui/react'
import { X } from 'lucide-react'
import { forwardRef, type ReactNode } from 'react'

import styles from './Popover.module.css'

export type { PopoverOpenChangeDetails }

/** Placement of the content relative to the trigger. */
export type PopoverPlacement =
  | 'top'
  | 'top-start'
  | 'top-end'
  | 'bottom'
  | 'bottom-start'
  | 'bottom-end'
  | 'left'
  | 'left-start'
  | 'left-end'
  | 'right'
  | 'right-start'
  | 'right-end'

export interface PopoverProps {
  /** The element that opens the popover. Rendered via Ark's trigger (asChild). */
  trigger: ReactNode
  /** Optional heading. Rendered as the accessible title. */
  title?: ReactNode
  /** Supporting copy under the title. Rendered as the accessible description. */
  description?: ReactNode
  /** Body content rendered between the description and the footer. */
  children?: ReactNode
  /**
   * Footer content — typically the action buttons. Rendered in a
   * right-aligned action row matching the specimen.
   */
  footer?: ReactNode
  /** Controlled open state. */
  open?: boolean
  /** Initial open state when uncontrolled. */
  defaultOpen?: boolean
  /** Called when the open state changes. */
  onOpenChange?: (open: boolean) => void
  /** Where the content sits relative to the trigger. @default 'bottom' */
  placement?: PopoverPlacement
  /** Gap in px between the trigger and the content. @default 8 */
  gutter?: number
  /** Render a pointer arrow connecting the content to the trigger. @default false */
  showArrow?: boolean
  /** Show the top-right close affordance. @default false */
  showCloseButton?: boolean
  /** Accessible label for the close button. @default 'Close' */
  closeLabel?: string
  /**
   * Whether the popover traps focus, blocks scroll, and hides the rest of the
   * page from assistive tech. @default false
   */
  modal?: boolean
  /** Whether Esc closes the popover. @default true */
  closeOnEscape?: boolean
  /** Whether an outside click closes the popover. @default true */
  closeOnInteractOutside?: boolean
  /** Extra class applied to the popover surface (Content). */
  className?: string
}

/**
 * Imprint Popover. A floating surface anchored to a trigger, built on Ark UI's
 * headless popover (positioning, dismiss, focus management, ARIA wiring) and
 * skinned entirely with Imprint tokens. Renders a raised surface with an
 * always-visible focus ring, an optional pointer arrow, and a right-aligned
 * action footer — 1:1 with the Imprint specimen.
 *
 * The ref forwards to the popover Content element.
 */
export const Popover = forwardRef<HTMLDivElement, PopoverProps>(function Popover(
  {
    trigger,
    title,
    description,
    children,
    footer,
    open,
    defaultOpen,
    onOpenChange,
    placement = 'bottom',
    gutter = 8,
    showArrow = false,
    showCloseButton = false,
    closeLabel = 'Close',
    modal = false,
    closeOnEscape = true,
    closeOnInteractOutside = true,
    className
  },
  ref
) {
  return (
    <ArkPopover.Root
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange ? details => onOpenChange(details.open) : undefined}
      modal={modal}
      closeOnEscape={closeOnEscape}
      closeOnInteractOutside={closeOnInteractOutside}
      positioning={{ placement, gutter }}
    >
      <ArkPopover.Trigger asChild>{trigger}</ArkPopover.Trigger>
      <Portal>
        <ArkPopover.Positioner className={styles.positioner}>
          <ArkPopover.Content ref={ref} className={className ? `${styles.content} ${className}` : styles.content}>
            {showArrow ? (
              <ArkPopover.Arrow className={styles.arrow}>
                <ArkPopover.ArrowTip className={styles.arrowTip} />
              </ArkPopover.Arrow>
            ) : null}
            {title ? <ArkPopover.Title className={styles.title}>{title}</ArkPopover.Title> : null}
            {description ? (
              <ArkPopover.Description className={styles.description}>{description}</ArkPopover.Description>
            ) : null}
            {children ? <div className={styles.body}>{children}</div> : null}
            {footer ? <div className={styles.footer}>{footer}</div> : null}
            {showCloseButton ? (
              <ArkPopover.CloseTrigger className={styles.closeTrigger} aria-label={closeLabel}>
                <X aria-hidden="true" />
              </ArkPopover.CloseTrigger>
            ) : null}
          </ArkPopover.Content>
        </ArkPopover.Positioner>
      </Portal>
    </ArkPopover.Root>
  )
})
