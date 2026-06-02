import {
  Toast as ArkToast,
  Toaster as ArkToaster,
  type CreateToasterReturn,
  createToaster,
  type ToastStoreProps
} from '@ark-ui/react'
import { Check, CircleAlert, Info, TriangleAlert, X } from 'lucide-react'
import { type ComponentType, forwardRef, type ReactNode } from 'react'

import styles from './Toast.module.css'

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
      className={className ? `${styles.region} ${className}` : styles.region}
    >
      {toast => {
        const status = (toast.meta?.status as ToastStatus | undefined) ?? (toast.type as ToastStatus)
        const Icon = status && status in STATUS_ICONS ? STATUS_ICONS[status] : undefined
        return (
          <ArkToast.Root className={styles.root} data-status={status}>
            {Icon ? (
              <span className={styles.icon} aria-hidden="true">
                <Icon aria-hidden />
              </span>
            ) : null}
            <div className={styles.body}>
              {toast.title != null ? <ArkToast.Title className={styles.title}>{toast.title}</ArkToast.Title> : null}
              {toast.description != null ? (
                <ArkToast.Description className={styles.description}>{toast.description}</ArkToast.Description>
              ) : null}
            </div>
            {toast.action ? (
              <ArkToast.ActionTrigger className={styles.action}>{toast.action.label}</ArkToast.ActionTrigger>
            ) : (
              <ArkToast.CloseTrigger className={styles.close} aria-label="Dismiss">
                <X aria-hidden />
              </ArkToast.CloseTrigger>
            )}
          </ArkToast.Root>
        )
      }}
    </ArkToaster>
  )
})
