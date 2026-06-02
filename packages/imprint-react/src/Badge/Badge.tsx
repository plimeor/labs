import { Check, Clock, type LucideIcon, RotateCcw, Sparkles, X } from 'lucide-react'
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'

import styles from './Badge.module.css'

export type BadgeVariant = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

/** Default leading glyph per variant, matching the specimen pills. */
const VARIANT_ICON: Record<BadgeVariant, LucideIcon> = {
  accent: Sparkles,
  danger: X,
  neutral: RotateCcw,
  success: Check,
  warning: Clock
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Status the badge communicates. Drives the tint and the default glyph. */
  variant?: BadgeVariant
  /** Override the leading icon. Defaults to the variant's glyph. Pass `null` to omit. */
  icon?: LucideIcon | null
  children?: ReactNode
}

/**
 * Imprint Badge. A static, token-tinted status pill: a leading lucide glyph on
 * a tinted fill with a label — 1:1 with the Imprint specimen. The visual status
 * is exposed via `data-variant` for token-driven styling.
 */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { variant = 'neutral', icon, className, children, ...rest },
  ref
) {
  const Icon = icon === null ? null : (icon ?? VARIANT_ICON[variant])

  return (
    <span
      ref={ref}
      data-variant={variant}
      className={className ? `${styles.badge} ${className}` : styles.badge}
      {...rest}
    >
      {Icon ? <Icon className={styles.icon} aria-hidden="true" /> : null}
      {children}
    </span>
  )
})
