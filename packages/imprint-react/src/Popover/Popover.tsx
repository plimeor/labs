import { Popover as ArkPopover, type PopoverOpenChangeDetails, Portal } from '@ark-ui/react'
import { X } from 'lucide-react'
import { forwardRef, type ReactNode } from 'react'
import { tv } from 'tailwind-variants'

import './Popover.css'

export type { PopoverOpenChangeDetails }

// One tv() with a slot per Ark part. Named utilities emit the same var(--token)
// the old CSS Module used; primitives/motion tokens use the arbitrary
// [var(--token)] form. Enter/exit motion is bound to the co-located keyframes
// via Ark's data-state.
const popover = tv({
  slots: {
    arrow: '[--arrow-size:var(--space-2)] [--arrow-background:var(--color-raised)]',
    arrowTip: 'border-t border-l border-border-subtle',
    body: 'mb-3 text-sm leading-normal text-body',
    description: 'm-0 mb-3 text-sm leading-normal text-secondary',
    footer: 'flex justify-end gap-2',
    positioner: 'z-50',
    title: 'm-0 mb-1 font-ui text-sm font-semibold leading-snug text-ink',
    closeTrigger: [
      'absolute top-2 right-2 inline-flex items-center justify-center w-[24px] h-[24px] p-0',
      'border border-transparent rounded-sm bg-transparent text-tertiary cursor-pointer',
      'transition-colors duration-[var(--dur-fast)] ease-standard',
      '[&>svg]:w-[16px] [&>svg]:h-[16px] [&>svg]:shrink-0',
      'hover:bg-hover hover:text-secondary active:bg-active',
      'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2'
    ],
    content: [
      'relative w-[260px] max-w-[calc(100vw-var(--space-4))] bg-raised text-body',
      'border border-border-subtle rounded-md shadow-3 p-4 font-ui',
      'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
      'data-[state=open]:animate-[imprint-popover-in_var(--dur-base)_var(--ease-out)]',
      'data-[state=closed]:animate-[imprint-popover-out_var(--dur-fast)_var(--ease-in)]'
    ]
  }
})

const styles = popover()

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
        <ArkPopover.Positioner className={styles.positioner()}>
          <ArkPopover.Content ref={ref} className={styles.content({ className })}>
            {showArrow ? (
              <ArkPopover.Arrow className={styles.arrow()}>
                <ArkPopover.ArrowTip className={styles.arrowTip()} />
              </ArkPopover.Arrow>
            ) : null}
            {title ? <ArkPopover.Title className={styles.title()}>{title}</ArkPopover.Title> : null}
            {description ? (
              <ArkPopover.Description className={styles.description()}>{description}</ArkPopover.Description>
            ) : null}
            {children ? <div className={styles.body()}>{children}</div> : null}
            {footer ? <div className={styles.footer()}>{footer}</div> : null}
            {showCloseButton ? (
              <ArkPopover.CloseTrigger className={styles.closeTrigger()} aria-label={closeLabel}>
                <X aria-hidden="true" />
              </ArkPopover.CloseTrigger>
            ) : null}
          </ArkPopover.Content>
        </ArkPopover.Positioner>
      </Portal>
    </ArkPopover.Root>
  )
})
