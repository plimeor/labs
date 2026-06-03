import { Check, Clock, type LucideIcon, RotateCcw, Sparkles, X } from 'lucide-react'
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'
import { tv } from 'tailwind-variants'

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

// One tv() with a slot for the pill (badge) and the leading glyph (icon). The
// per-variant tint switches only the badge slot's fill/text; the icon box is
// fixed. Named utilities (bg-active, rounded-full, …) emit the same var(--token)
// the old CSS Module used; the font-size token uses the [length:var(--token)]
// form so it isn't parsed as a color.
const badge = tv({
  defaultVariants: { variant: 'neutral' },
  slots: {
    icon: 'size-[12px] shrink-0',
    root: [
      'inline-flex items-center gap-1 py-1 px-2',
      'rounded-full font-ui text-xs font-semibold leading-snug',
      'whitespace-nowrap',
      'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2'
    ]
  },
  variants: {
    variant: {
      accent: { root: 'bg-accent-subtle text-accent-fg' },
      danger: { root: 'bg-danger-bg text-danger' },
      neutral: { root: 'bg-active text-secondary' },
      success: { root: 'bg-success-bg text-success' },
      warning: { root: 'bg-warning-bg text-warning' }
    }
  }
})

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
  const styles = badge({ variant })

  return (
    <span ref={ref} data-variant={variant} className={styles.root({ className })} {...rest}>
      {Icon ? <Icon className={styles.icon()} aria-hidden="true" /> : null}
      {children}
    </span>
  )
})
