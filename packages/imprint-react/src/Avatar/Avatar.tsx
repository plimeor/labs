import { Avatar as ArkAvatar, type AvatarStatusChangeDetails } from '@ark-ui/react'
import { type CSSProperties, forwardRef, type ReactNode } from 'react'

import styles from './Avatar.module.css'

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
  return (
    <ArkAvatar.Root
      ref={ref}
      id={id}
      data-size={size}
      data-tone={tone}
      style={style}
      onStatusChange={onStatusChange}
      className={className ? `${styles.root} ${className}` : styles.root}
    >
      <ArkAvatar.Fallback className={styles.fallback}>{fallback}</ArkAvatar.Fallback>
      {src != null ? <ArkAvatar.Image className={styles.image} src={src} alt={alt} /> : null}
      {status != null ? <span className={styles.status} data-status={status} aria-hidden="true" /> : null}
    </ArkAvatar.Root>
  )
})
