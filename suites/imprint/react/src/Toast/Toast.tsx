import {
  Toast as ArkToast,
  Toaster as ArkToaster,
  type CreateToasterReturn,
  createToaster,
  type ToastStoreProps
} from '@ark-ui/react'
import { Check, CircleAlert, Info, TriangleAlert, X } from 'lucide-react'
import { type ComponentType, forwardRef } from 'react'
import { tv } from 'tailwind-variants'

export type { ToastStoreProps }

/** Status variants, mapped 1:1 onto Ark/Zag's toast `type`. */
export type ToastStatus = 'info' | 'success' | 'warning' | 'error'

/** Lucide icon shown per status. `null` opts a toast out of the leading icon. */
const STATUS_ICONS: Record<ToastStatus, ComponentType<{ 'aria-hidden'?: boolean }>> = {
  error: CircleAlert,
  info: Info,
  success: Check,
  warning: TriangleAlert
}

// One tv() with a slot per Ark part. The leading icon recolors from its
// ancestor Root's data-status ([[data-status=…]_&]); the close/action triggers
// are quiet buttons with the shared focus ring. Named utilities emit the same
// var(--token) the old CSS Module used; primitives/motion tokens use the
// arbitrary [var(--token)] form.
const toast = tv({
  slots: {
    body: 'flex-1 min-w-0',
    description: 'mt-0 text-xs leading-snug text-secondary',
    region: 'font-ui [--width:360px]',
    title: 'm-0 text-sm font-semibold leading-snug text-ink',
    action: [
      'shrink-0 mt-px p-0',
      'border border-transparent rounded-xs bg-transparent',
      'font-ui text-xs font-medium leading-snug text-accent-fg cursor-pointer',
      'transition-colors duration-[var(--dur-fast)] ease-standard',
      'hover:text-accent',
      'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2'
    ],
    close: [
      'inline-flex items-center justify-center shrink-0 mt-px p-0',
      'border border-transparent rounded-xs bg-transparent text-tertiary cursor-pointer',
      'transition-colors duration-[var(--dur-fast)] ease-standard',
      '[&>svg]:w-[14px] [&>svg]:h-[14px]',
      'hover:text-secondary',
      'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2'
    ],
    icon: [
      'inline-flex shrink-0 mt-px text-secondary',
      '[&>svg]:w-[16px] [&>svg]:h-[16px]',
      '[[data-status=success]_&]:text-success',
      '[[data-status=warning]_&]:text-warning',
      '[[data-status=error]_&]:text-danger',
      '[[data-status=info]_&]:text-accent-fg'
    ],
    root: [
      'flex items-start gap-3 w-[var(--width)] max-w-full p-3',
      'bg-raised text-body border border-border-subtle rounded-md shadow-2'
    ]
  }
})

const styles = toast()

/**
 * Create a toaster store. Mirrors Ark's `createToaster` but with Imprint's
 * defaults (top-end placement, generous remove delay for the exit transition).
 * Call once at module scope and pass the returned store to {@link Toaster} and
 * to `store.create(...)` / `store.success(...)` etc.
 */
export function createToast(props: ToastStoreProps = {}): CreateToasterReturn {
  return createToaster({
    gap: 10,
    placement: 'bottom-end',
    ...props
  })
}

export interface ToasterProps {
  /** The store returned by {@link createToast}. */
  toaster: ReturnType<typeof createToast>
  /** Accessible name for the toast region landmark. @default 'Notifications' */
  label?: string
  /** Extra className merged onto the Ark Toaster region element. */
  className?: string
}

/**
 * Imprint Toast region. Ark UI Toaster behavior (queueing, auto-dismiss,
 * pause-on-hover, focus management, ARIA live region) skinned with Imprint
 * tokens — a raised card with a status-colored leading icon, title,
 * description, and a close affordance. The `meta.status` of each toast drives
 * the variant; an `action` renders an inline action trigger in place of the X.
 *
 * The ref forwards to the toast region element.
 */
export const Toaster = forwardRef<HTMLDivElement, ToasterProps>(function Toaster(
  { toaster, label = 'Notifications', className },
  ref
) {
  return (
    <ArkToaster
      ref={ref}
      toaster={toaster}
      // Ark's Toaster does not thread `label` through to the region; it sets a
      // default aria-label from `getGroupProps()`. Override it directly so the
      // landmark gets the caller-provided accessible name.
      aria-label={label}
      className={styles.region({ className })}
    >
      {toast => {
        const status = (toast.meta?.status as ToastStatus | undefined) ?? (toast.type as ToastStatus)
        const Icon = status && status in STATUS_ICONS ? STATUS_ICONS[status] : undefined
        return (
          <ArkToast.Root className={styles.root()} data-status={status}>
            {Icon ? (
              <span className={styles.icon()} aria-hidden="true">
                <Icon aria-hidden />
              </span>
            ) : null}
            <div className={styles.body()}>
              {toast.title != null ? <ArkToast.Title className={styles.title()}>{toast.title}</ArkToast.Title> : null}
              {toast.description != null ? (
                <ArkToast.Description className={styles.description()}>{toast.description}</ArkToast.Description>
              ) : null}
            </div>
            {toast.action ? (
              <ArkToast.ActionTrigger className={styles.action()}>{toast.action.label}</ArkToast.ActionTrigger>
            ) : (
              <ArkToast.CloseTrigger className={styles.close()} aria-label="Dismiss">
                <X aria-hidden />
              </ArkToast.CloseTrigger>
            )}
          </ArkToast.Root>
        )
      }}
    </ArkToaster>
  )
})
