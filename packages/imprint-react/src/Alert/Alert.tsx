import { CheckCheck, Info, type LucideIcon, OctagonAlert, TriangleAlert } from 'lucide-react'
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'

import styles from './Alert.module.css'

export type AlertKind = 'info' | 'success' | 'warning' | 'danger'

/** Default leading glyph per kind, matching the specimen. */
const KIND_ICON: Record<AlertKind, LucideIcon> = {
  danger: OctagonAlert,
  info: Info,
  success: CheckCheck,
  warning: TriangleAlert
}

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Status the banner communicates. Drives the tint and the leading glyph. */
  kind?: AlertKind
  /** Primary message. */
  title: ReactNode
  /** Optional supporting copy rendered under the title. */
  description?: ReactNode
  /** Override the leading icon. Defaults to the kind's glyph. */
  icon?: LucideIcon
  children?: ReactNode
}

/**
 * Imprint Alert. A static, inline status banner: a leading lucide glyph on a
 * tinted fill with a title and optional description — 1:1 with the Imprint
 * specimen (no colored left rail). The visual status is exposed via
 * `data-kind` for token-driven styling.
 *
 * Defaults to `role="status"` (polite); the `danger` kind defaults to
 * `role="alert"` (assertive). Either can be overridden via `role`.
 */
export const Alert = forwardRef<HTMLDivElement, AlertProps>(function Alert(
  { kind = 'info', title, description, icon, role, className, children, ...rest },
  ref
) {
  const Icon = icon ?? KIND_ICON[kind]
  const resolvedRole = role ?? (kind === 'danger' ? 'alert' : 'status')

  return (
    <div
      ref={ref}
      role={resolvedRole}
      data-kind={kind}
      className={className ? `${styles.alert} ${className}` : styles.alert}
      {...rest}
    >
      <Icon className={styles.icon} aria-hidden="true" />
      <div className={styles.content}>
        <span className={styles.title}>{title}</span>
        {description ? <span className={styles.description}>{description}</span> : null}
        {children}
      </div>
    </div>
  )
})
