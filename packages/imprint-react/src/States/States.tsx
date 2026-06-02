import type { LucideIcon } from 'lucide-react'
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'

import styles from './States.module.css'

/* ============================================================================
   Imprint States — static feedback primitives, 1:1 with preview/cmp-states.html
   EmptyState (icon + title + desc + optional action), Skeleton (shimmer block),
   Spinner (token-colored). All token-driven, no hardcoded colors. Static markup
   + CSS; no Ark behavior needed.
   ========================================================================== */

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Leading glyph, passed as a lucide-react icon component. */
  icon?: LucideIcon
  /** Primary message. */
  title: ReactNode
  /** Supporting copy under the title. */
  description?: ReactNode
  /** Optional action region, typically a Button. Rendered below the copy. */
  action?: ReactNode
  children?: ReactNode
}

/**
 * Imprint EmptyState. A centered, dashed-border placeholder for empty result
 * regions: a muted lucide glyph, a title, supporting copy, and an optional
 * action — 1:1 with the Imprint specimen. Static semantic markup, no behavior.
 */
export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState(
  { icon: Icon, title, description, action, className, children, ...rest },
  ref
) {
  return (
    <div ref={ref} className={className ? `${styles.empty} ${className}` : styles.empty} {...rest}>
      {Icon ? <Icon className={styles.emptyIcon} aria-hidden="true" /> : null}
      <div className={styles.emptyTitle}>{title}</div>
      {description != null ? <div className={styles.emptyDesc}>{description}</div> : null}
      {children}
      {action != null ? <div className={styles.emptyAction}>{action}</div> : null}
    </div>
  )
})

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Block width (any CSS length). @default '100%' */
  width?: string | number
  /** Block height (any CSS length). @default a single text line */
  height?: string | number
  /** Render the block as a circle (e.g. avatar placeholder). @default false */
  circle?: boolean
}

/**
 * Imprint Skeleton. A token-tinted loading placeholder block with a quiet
 * shimmer sweep — 1:1 with the Imprint specimen rows. Decorative by default:
 * exposes `aria-hidden` so it is skipped by assistive tech; pair it with an
 * accessible loading status elsewhere. Honors prefers-reduced-motion.
 */
export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(function Skeleton(
  { width = '100%', height, circle = false, className, style, 'aria-hidden': ariaHidden, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      data-circle={circle ? '' : undefined}
      aria-hidden={ariaHidden ?? true}
      className={className ? `${styles.skeleton} ${className}` : styles.skeleton}
      style={{ width, ...(height != null ? { height } : null), ...style }}
      {...rest}
    />
  )
})

export type SpinnerSize = 'sm' | 'md' | 'lg'

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  /** Diameter token. @default 'md' */
  size?: SpinnerSize
  /** Accessible label announced to assistive tech. @default 'Loading' */
  label?: string
}

/**
 * Imprint Spinner. A token-colored indeterminate loading ring: a muted track
 * with an accent arc that spins. Exposes `role="status"` with an accessible
 * label so screen readers announce the loading state. Honors
 * prefers-reduced-motion (the arc stops spinning).
 */
export const Spinner = forwardRef<HTMLSpanElement, SpinnerProps>(function Spinner(
  { size = 'md', label = 'Loading', className, ...rest },
  ref
) {
  return (
    <span
      ref={ref}
      role="status"
      aria-live="polite"
      aria-label={label}
      data-size={size}
      className={className ? `${styles.spinner} ${className}` : styles.spinner}
      {...rest}
    >
      <span className={styles.spinnerRing} aria-hidden="true" />
    </span>
  )
})
