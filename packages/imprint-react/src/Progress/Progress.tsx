import { Progress as ArkProgress, type ProgressValueChangeDetails } from '@ark-ui/react'
import { forwardRef, type ReactNode } from 'react'

import styles from './Progress.module.css'

export type { ProgressValueChangeDetails }

export type ProgressVariant = 'linear' | 'circular'

export interface ProgressProps {
  /** Visual form of the indicator. @default 'linear' */
  variant?: ProgressVariant
  /** Controlled value. Pass `null` for an indeterminate (unknown-progress) bar. */
  value?: number | null
  /** Initial value for uncontrolled usage. @default 50 */
  defaultValue?: number | null
  /** Minimum value. @default 0 */
  min?: number
  /** Maximum value. @default 100 */
  max?: number
  /** Fires when the value changes. */
  onValueChange?: (details: ProgressValueChangeDetails) => void
  /** Options forwarded to the value formatter. @default { style: 'percent' } */
  formatOptions?: Intl.NumberFormatOptions
  /** Locale used to format the value text. @default 'en-US' */
  locale?: string
  /**
   * Visible label. Rendered as Ark's `Progress.Label`, which is wired to the
   * progressbar as its accessible name.
   */
  label?: ReactNode
  /** Show the formatted value text. For `linear`, beside the label; for `circular`, centered. @default true */
  showValueText?: boolean
  /** Id forwarded to the Ark root for composition. */
  id?: string
  /** Extra className merged onto the root element. */
  className?: string
}

/**
 * Imprint Progress. Ark UI Progress behavior skinned with Imprint tokens.
 * Renders either a linear track/range bar or a circular ring, with full
 * indeterminate support (pass `value={null}`). Determinate bars expose the
 * native `progressbar` role with `aria-valuenow/min/max`; the indeterminate
 * state drops `aria-valuenow` and animates, matching the spec for unknown
 * progress. Parts surface Ark's `data-state` for token styling.
 */
export const Progress = forwardRef<HTMLDivElement, ProgressProps>(function Progress(
  { variant = 'linear', label, showValueText = true, className, ...rest },
  ref
) {
  const rootClassName = className
    ? `${styles.root} ${variant === 'circular' ? styles.circular : styles.linear} ${className}`
    : `${styles.root} ${variant === 'circular' ? styles.circular : styles.linear}`

  return (
    <ArkProgress.Root ref={ref} className={rootClassName} {...rest}>
      {variant === 'circular' ? (
        <>
          {label != null ? <ArkProgress.Label className={styles.label}>{label}</ArkProgress.Label> : null}
          <ArkProgress.Circle className={styles.circle}>
            <ArkProgress.CircleTrack className={styles.circleTrack} />
            <ArkProgress.CircleRange className={styles.circleRange} />
            {showValueText ? (
              <foreignObject className={styles.circleTextWrap} x="0" y="0" width="100%" height="100%">
                <ArkProgress.ValueText className={styles.circleValueText} />
              </foreignObject>
            ) : null}
          </ArkProgress.Circle>
        </>
      ) : (
        <>
          {label != null || showValueText ? (
            <div className={styles.header}>
              {label != null ? <ArkProgress.Label className={styles.label}>{label}</ArkProgress.Label> : null}
              {showValueText ? <ArkProgress.ValueText className={styles.valueText} /> : null}
            </div>
          ) : null}
          <ArkProgress.Track className={styles.track}>
            <ArkProgress.Range className={styles.range} />
          </ArkProgress.Track>
        </>
      )}
    </ArkProgress.Root>
  )
})
