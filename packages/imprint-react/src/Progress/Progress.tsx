import { Progress as ArkProgress, type ProgressValueChangeDetails } from '@ark-ui/react'
import { forwardRef, type ReactNode } from 'react'
import { tv } from 'tailwind-variants'

import './Progress.css'

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

// One tv() with a slot per Ark part. The root's layout switches on the
// linear/circular variant. Indeterminate motion is bound to the co-located
// keyframes via Ark's data-state — the travelling sliver lives on the linear
// Range, the spin on the circular Circle. Descendant-state selectors
// (`.track[data-state=indeterminate] .range`) lift via [[data-state=…]_&].
const progress = tv({
  defaultVariants: { variant: 'linear' },
  slots: {
    circleTextWrap: 'flex',
    circleTrack: 'stroke-active',
    header: 'flex items-center justify-between gap-2',
    label: 'text-xs leading-snug text-secondary',
    root: 'font-ui text-body',
    track: 'relative h-2 w-full bg-active rounded-full overflow-hidden',
    valueText: 'font-mono text-xs leading-snug text-tertiary [font-variant-numeric:tabular-nums]',
    circle: [
      '[--size:58px] [--thickness:6px] block',
      'data-[state=indeterminate]:animate-[imprint-progress-circular-spin_1.2s_linear_infinite]',
      'data-[state=indeterminate]:motion-reduce:animate-none'
    ],
    circleRange: [
      'stroke-accent [stroke-linecap:round]',
      'transition-[stroke-dashoffset] duration-[var(--dur-base)] ease-standard',
      '[[data-state=indeterminate]_&]:[stroke-dasharray:60_200]'
    ],
    circleValueText: [
      'flex items-center justify-center w-full h-full',
      'font-mono text-xs leading-none text-secondary [font-variant-numeric:tabular-nums]'
    ],
    range: [
      'h-full bg-accent rounded-full',
      'transition-[width] duration-[var(--dur-base)] ease-standard',
      '[[data-state=indeterminate]_&]:w-[40%] [[data-state=indeterminate]_&]:rounded-full',
      '[[data-state=indeterminate]_&]:animate-[imprint-progress-linear-indeterminate_1.4s_var(--ease-standard)_infinite]',
      '[[data-state=indeterminate]_&]:motion-reduce:animate-none'
    ]
  },
  variants: {
    variant: {
      circular: { root: 'inline-flex flex-col items-center gap-2' },
      linear: { root: 'flex flex-col gap-2 w-full' }
    }
  }
})

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
  const styles = progress({ variant })

  return (
    <ArkProgress.Root ref={ref} className={styles.root({ className })} {...rest}>
      {variant === 'circular' ? (
        <>
          {label != null ? <ArkProgress.Label className={styles.label()}>{label}</ArkProgress.Label> : null}
          <ArkProgress.Circle className={styles.circle()}>
            <ArkProgress.CircleTrack className={styles.circleTrack()} />
            <ArkProgress.CircleRange className={styles.circleRange()} />
            {showValueText ? (
              <foreignObject className={styles.circleTextWrap()} x="0" y="0" width="100%" height="100%">
                <ArkProgress.ValueText className={styles.circleValueText()} />
              </foreignObject>
            ) : null}
          </ArkProgress.Circle>
        </>
      ) : (
        <>
          {label != null || showValueText ? (
            <div className={styles.header()}>
              {label != null ? <ArkProgress.Label className={styles.label()}>{label}</ArkProgress.Label> : null}
              {showValueText ? <ArkProgress.ValueText className={styles.valueText()} /> : null}
            </div>
          ) : null}
          <ArkProgress.Track className={styles.track()}>
            <ArkProgress.Range className={styles.range()} />
          </ArkProgress.Track>
        </>
      )}
    </ArkProgress.Root>
  )
})
