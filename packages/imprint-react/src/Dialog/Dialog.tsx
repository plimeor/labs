import { Dialog as ArkDialog, Portal } from '@ark-ui/react'
import { X } from 'lucide-react'
import { forwardRef, type ReactNode } from 'react'
import { tv } from 'tailwind-variants'

import './Dialog.css'

export interface DialogProps {
  /** Dialog heading. Rendered as the accessible title. */
  title: ReactNode
  /** Supporting copy under the title. Rendered as the accessible description. */
  description?: ReactNode
  /** Body content rendered between the description and the footer. */
  children?: ReactNode
  /**
   * Footer content — typically the action buttons. Rendered in a divided,
   * right-aligned action row matching the specimen.
   */
  footer?: ReactNode
  /** The element that opens the dialog. Rendered via Ark's trigger (asChild). */
  trigger?: ReactNode
  /** Controlled open state. */
  open?: boolean
  /** Initial open state when uncontrolled. */
  defaultOpen?: boolean
  /** Called when the open state changes. */
  onOpenChange?: (open: boolean) => void
  /**
   * Dialog semantic role. Use `alertdialog` for destructive confirmations
   * that demand an explicit choice.
   * @default 'dialog'
   */
  role?: 'dialog' | 'alertdialog'
  /** Whether Esc closes the dialog. @default true */
  closeOnEscape?: boolean
  /** Whether an outside click closes the dialog. @default true */
  closeOnInteractOutside?: boolean
  /** Hide the top-right close affordance. @default false */
  hideCloseButton?: boolean
  /** Accessible label for the close button. @default 'Close dialog' */
  closeLabel?: string
  /** Extra class applied to the dialog surface (Content). */
  className?: string
}

// One tv() with a slot per Ark part. Enter/exit motion is bound to the
// co-located keyframes via Ark's data-state.
const dialog = tv({
  slots: {
    body: 'pt-0 px-5 pb-4 text-[length:var(--text-base)] leading-normal text-body',
    description: 'm-0 pt-2 px-5 pb-4 text-[length:var(--text-base)] leading-relaxed text-secondary',
    footer: 'flex justify-end gap-2 py-3 px-5 border-t border-border-subtle',
    header: 'pt-5 px-5 pb-1',
    positioner: 'fixed inset-0 flex items-center justify-center p-4',
    title: 'm-0 font-ui text-[length:var(--text-lg)] font-semibold leading-snug tracking-tight text-ink',
    backdrop: [
      'fixed inset-0 bg-scrim',
      'data-[state=open]:animate-[imprint-dialog-fade-in_var(--dur-base)_var(--ease-out)]',
      'data-[state=closed]:animate-[imprint-dialog-fade-out_var(--dur-fast)_var(--ease-in)]'
    ],
    closeTrigger: [
      'absolute top-3 right-3 inline-flex items-center justify-center w-[28px] h-[28px] p-0',
      'border border-transparent rounded-sm bg-transparent text-tertiary cursor-pointer',
      'transition-colors duration-[var(--dur-fast)] ease-standard',
      '[&>svg]:size-[16px] [&>svg]:shrink-0',
      'hover:bg-hover hover:text-secondary active:bg-active',
      'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2'
    ],
    content: [
      'relative w-[420px] max-w-full bg-raised text-body',
      'border border-border-subtle rounded-md shadow-4 font-ui',
      'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
      'data-[state=open]:animate-[imprint-dialog-scale-in_var(--dur-slow)_var(--ease-out)]',
      'data-[state=closed]:animate-[imprint-dialog-scale-out_var(--dur-fast)_var(--ease-in)]'
    ]
  }
})

const styles = dialog()

/**
 * Imprint Dialog. A modal surface built on Ark UI's headless dialog
 * (focus trap, scroll lock, Esc-to-close, ARIA wiring) skinned entirely with
 * Imprint tokens. Renders a warm scrim, an elevated raised surface, and a
 * divided action footer — 1:1 with the Imprint specimen.
 *
 * The ref forwards to the dialog Content element.
 */
export const Dialog = forwardRef<HTMLDivElement, DialogProps>(function Dialog(
  {
    title,
    description,
    children,
    footer,
    trigger,
    open,
    defaultOpen,
    onOpenChange,
    role = 'dialog',
    closeOnEscape = true,
    closeOnInteractOutside = true,
    hideCloseButton = false,
    closeLabel = 'Close dialog',
    className
  },
  ref
) {
  return (
    <ArkDialog.Root
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange ? details => onOpenChange(details.open) : undefined}
      role={role}
      closeOnEscape={closeOnEscape}
      closeOnInteractOutside={closeOnInteractOutside}
    >
      {trigger ? <ArkDialog.Trigger asChild>{trigger}</ArkDialog.Trigger> : null}
      <Portal>
        <ArkDialog.Backdrop className={styles.backdrop()} />
        <ArkDialog.Positioner className={styles.positioner()}>
          <ArkDialog.Content ref={ref} className={styles.content({ className })}>
            <div className={styles.header()}>
              <ArkDialog.Title className={styles.title()}>{title}</ArkDialog.Title>
            </div>
            {description ? (
              <ArkDialog.Description className={styles.description()}>{description}</ArkDialog.Description>
            ) : null}
            {children ? <div className={styles.body()}>{children}</div> : null}
            {footer ? <div className={styles.footer()}>{footer}</div> : null}
            {hideCloseButton ? null : (
              <ArkDialog.CloseTrigger className={styles.closeTrigger()} aria-label={closeLabel}>
                <X aria-hidden="true" />
              </ArkDialog.CloseTrigger>
            )}
          </ArkDialog.Content>
        </ArkDialog.Positioner>
      </Portal>
    </ArkDialog.Root>
  )
})
