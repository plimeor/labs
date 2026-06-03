import type { LucideIcon } from 'lucide-react'
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'
import { tv } from 'tailwind-variants'

import './States.css'

/* ============================================================================
   Imprint States — static feedback primitives, 1:1 with preview/cmp-states.html
   EmptyState (icon + title + desc + optional action), Skeleton (shimmer block),
   Spinner (token-colored). All token-driven, no hardcoded colors. Static markup
   + CSS; no Ark behavior needed.
   ========================================================================== */

// Imprint tokens applied as inline Tailwind utilities, composed with
// tailwind-variants. Named utilities (bg-active, rounded-md, …) emit the same
// var(--token) the old CSS Module used; primitives/motion tokens use the
// arbitrary [var(--token)] form. The shimmer/spin keyframes and the
// prefers-reduced-motion override live in the co-located States.css; the stable
// `imprint-skeleton` / `imprint-spinner-ring` marker classes let that media
// query keep targeting the shimmer pseudo-element and the ring.
const empty = tv({
  slots: {
    action: 'mt-4',
    desc: 'text-xs leading-snug text-tertiary mt-1',
    icon: 'size-[24px] shrink-0 text-tertiary',
    root: ['flex flex-col items-center text-center font-ui', 'py-5 px-4 border border-dashed border-border rounded-md'],
    title: 'text-base font-semibold leading-snug text-secondary mt-2'
  }
})

const emptyStyles = empty()

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
    <div ref={ref} className={emptyStyles.root({ className })} {...rest}>
      {Icon ? <Icon className={emptyStyles.icon()} aria-hidden="true" /> : null}
      <div className={emptyStyles.title()}>{title}</div>
      {description != null ? <div className={emptyStyles.desc()}>{description}</div> : null}
      {children}
      {action != null ? <div className={emptyStyles.action()}>{action}</div> : null}
    </div>
  )
})

// Default to a single text line; consumers override via width/height. The quiet
// shimmer sweep rides the warm hover tint and is bound to the co-located
// keyframes. The marker class keeps the reduced-motion media query targeting it.
const skeleton = tv({
  base: [
    'imprint-skeleton relative overflow-hidden h-[11px] rounded-xs bg-active',
    "after:content-[''] after:absolute after:inset-0 after:-translate-x-full",
    'after:bg-[linear-gradient(90deg,transparent,var(--color-hover),transparent)]',
    'after:animate-[imprint-skeleton-shimmer_1.4s_var(--ease-standard)_infinite]',
    'data-[circle]:rounded-full'
  ]
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
      className={skeleton({ className })}
      style={{ width, ...(height != null ? { height } : null), ...style }}
      {...rest}
    />
  )
})

export type SpinnerSize = 'sm' | 'md' | 'lg'

// The size token sets the ring diameter + stroke via CSS vars the ring reads.
// Muted track + one accent arc, riding the currentColor accent. The marker class
// keeps the reduced-motion media query targeting the ring.
const spinner = tv({
  defaultVariants: { size: 'md' },
  slots: {
    root: 'inline-flex items-center justify-center shrink-0 text-accent',
    ring: [
      'imprint-spinner-ring block size-[var(--imprint-spinner-size)] rounded-full',
      'border-[length:var(--imprint-spinner-thickness)] border-solid border-active border-t-current',
      'animate-[imprint-spinner-spin_0.7s_linear_infinite]'
    ]
  },
  variants: {
    size: {
      lg: { root: '[--imprint-spinner-size:40px] [--imprint-spinner-thickness:4px]' },
      md: { root: '[--imprint-spinner-size:24px] [--imprint-spinner-thickness:3px]' },
      sm: { root: '[--imprint-spinner-size:16px] [--imprint-spinner-thickness:2px]' }
    }
  }
})

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
  const styles = spinner({ size })
  return (
    <span
      ref={ref}
      role="status"
      aria-live="polite"
      aria-label={label}
      data-size={size}
      className={styles.root({ className })}
      {...rest}
    >
      <span className={styles.ring()} aria-hidden="true" />
    </span>
  )
})
