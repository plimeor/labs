import { Avatar as ArkAvatar, type AvatarStatusChangeDetails } from '@ark-ui/react'
import { type CSSProperties, forwardRef, type ReactNode } from 'react'
import { tv } from 'tailwind-variants'

export type { AvatarStatusChangeDetails }

export type AvatarSize = 'sm' | 'md'

/** Fill treatment for the fallback surface. */
export type AvatarTone = 'accent' | 'neutral'

/** Presence status surfaced as a small dot in the lower-right corner. */
export type AvatarStatus = 'online' | 'offline'

export interface AvatarProps {
  /** Image source. When it loads, the image replaces the fallback. */
  src?: string
  /** Alt text for the image. Also used as the accessible name. */
  alt?: string
  /**
   * Fallback content shown while loading or when no image is available.
   * Typically the person's initials. Falls back to nothing if omitted.
   */
  fallback?: ReactNode
  /** Size token. @default 'md' */
  size?: AvatarSize
  /**
   * Fill treatment of the fallback surface. `accent` is the solid blue tile;
   * `neutral` is the muted warm tile (also used for group overflow chips).
   * @default 'accent'
   */
  tone?: AvatarTone
  /**
   * Optional presence indicator dot. When set, a status dot is rendered in the
   * lower-right corner.
   */
  status?: AvatarStatus
  /** Fires when the image load status changes. */
  onStatusChange?: (details: AvatarStatusChangeDetails) => void
  /** Id forwarded to the Ark root for composition. */
  id?: string
  /** Extra className merged onto the root element. */
  className?: string
  /** Inline styles merged onto the root element (e.g. group overlap). */
  style?: CSSProperties
}

// One tv() with a slot per Ark part. The `size` variant drives the root's box
// dimensions and font-size; the `tone` variant fills the fallback surface; the
// status dot's color switches on its own data-status attribute. Named utilities
// (rounded-full, bg-accent, …) emit the same var(--token) the old CSS Module
// used; primitives use the arbitrary [var(--token)] form.
const avatar = tv({
  defaultVariants: { size: 'md', tone: 'accent' },
  slots: {
    fallback: 'inline-flex w-full h-full items-center justify-center rounded-[inherit]',
    image: 'absolute inset-0 w-full h-full rounded-[inherit] object-cover',
    root: [
      'relative box-border inline-flex shrink-0 items-center justify-center',
      'rounded-full font-ui font-semibold leading-none select-none'
    ],
    status: [
      'absolute right-[-1px] bottom-[-1px] size-[11px] rounded-full border-2 border-canvas',
      'data-[status=online]:bg-success',
      'data-[status=offline]:bg-[var(--warm-400)]'
    ]
  },
  variants: {
    size: {
      md: { root: 'size-[38px] text-md' },
      sm: { root: 'size-[34px] text-sm' }
    },
    tone: {
      accent: { fallback: 'bg-accent text-on-accent' },
      neutral: { fallback: 'bg-[var(--warm-300)] text-ink' }
    }
  }
})

/**
 * Imprint Avatar. Ark UI Avatar behavior (image load tracking with graceful
 * fallback) skinned with Imprint tokens. Renders a circular surface with an
 * initials fallback, an optional image, and an optional presence dot — 1:1
 * with the Imprint specimen. The ref forwards to the Ark root element.
 */
export const Avatar = forwardRef<HTMLDivElement, AvatarProps>(function Avatar(
  { src, alt, fallback, size = 'md', tone = 'accent', status, onStatusChange, id, className, style },
  ref
) {
  const styles = avatar({ size, tone })

  return (
    <ArkAvatar.Root
      ref={ref}
      id={id}
      data-size={size}
      data-tone={tone}
      style={style}
      onStatusChange={onStatusChange}
      className={styles.root({ className })}
    >
      <ArkAvatar.Fallback className={styles.fallback()}>{fallback}</ArkAvatar.Fallback>
      {src != null ? <ArkAvatar.Image className={styles.image()} src={src} alt={alt} /> : null}
      {status != null ? <span className={styles.status()} data-status={status} aria-hidden="true" /> : null}
    </ArkAvatar.Root>
  )
})
