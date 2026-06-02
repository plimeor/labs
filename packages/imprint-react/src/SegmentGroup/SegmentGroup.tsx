import { SegmentGroup as ArkSegmentGroup, type SegmentGroupValueChangeDetails } from '@ark-ui/react'
import type { LucideIcon } from 'lucide-react'
import { forwardRef, type ReactNode } from 'react'

import styles from './SegmentGroup.module.css'

export type { SegmentGroupValueChangeDetails }

export type SegmentGroupSize = 'sm' | 'md' | 'lg'

export interface SegmentGroupItem {
  /** The value submitted / reported when this segment is selected. */
  value: string
  /**
   * Segment label. Always provide it: it gives the segment its accessible
   * name. For an icon-only segment, set `iconOnly` to keep this label for
   * assistive tech while hiding it visually.
   */
  label?: ReactNode
  /** Optional leading icon, passed as a lucide-react icon component. */
  icon?: LucideIcon
  /**
   * Render the segment as icon-only: the `label` is kept for the accessible
   * name but visually hidden. Requires `icon` and a string-ish `label`.
   */
  iconOnly?: boolean
  /** Disables this individual segment. */
  disabled?: boolean
}

export interface SegmentGroupProps {
  /** The segments to render, in order. */
  items: SegmentGroupItem[]
  /** Controlled selected value. */
  value?: string | null
  /** Initial selected value for uncontrolled usage. */
  defaultValue?: string | null
  /** Fires when the selected segment changes. */
  onValueChange?: (details: SegmentGroupValueChangeDetails) => void
  /** Disables the whole control. */
  disabled?: boolean
  /** Marks the underlying inputs as required. */
  required?: boolean
  /** Name of the underlying inputs, for form submission. */
  name?: string
  /** Id of the form the control belongs to. */
  form?: string
  /** Optional id forwarded to the Ark root for composition. */
  id?: string
  /** Size token. @default 'md' */
  size?: SegmentGroupSize
  /** Stretch the control to fill its container, with equal-width segments. */
  fill?: boolean
  /** Extra className merged onto the root element. */
  className?: string
}

/**
 * Imprint SegmentGroup. A single-select, mutually-exclusive segmented control
 * built on Ark UI's headless SegmentGroup (radio-group semantics, roving
 * focus, arrow-key navigation, ARIA wiring) skinned with Imprint tokens.
 *
 * A soft raised pill (Ark's Indicator) slides to the active segment. Items
 * expose Ark's `data-state` / `data-disabled` attributes for token styling.
 *
 * The ref forwards to the Ark root element.
 */
export const SegmentGroup = forwardRef<HTMLDivElement, SegmentGroupProps>(function SegmentGroup(
  { items, size = 'md', fill = false, className, ...rest },
  ref
) {
  const rootClassName = [styles.root, styles[size], fill ? styles.fill : null, className].filter(Boolean).join(' ')

  return (
    <ArkSegmentGroup.Root ref={ref} className={rootClassName} {...rest}>
      <ArkSegmentGroup.Indicator className={styles.indicator} />
      {items.map(({ value, label, icon: Icon, iconOnly, disabled }) => (
        <ArkSegmentGroup.Item key={value} value={value} disabled={disabled} className={styles.item}>
          {/* Ark marks ItemControl aria-hidden; the accessible name for the
              radio comes from ItemText via aria-labelledby, so we always
              render ItemText (visually hidden when the segment is icon-only). */}
          <ArkSegmentGroup.ItemControl
            className={iconOnly ? `${styles.itemControl} ${styles.iconOnly}` : styles.itemControl}
          >
            {Icon ? <Icon aria-hidden="true" /> : null}
            <ArkSegmentGroup.ItemText className={iconOnly ? styles.srOnly : styles.itemText}>
              {label}
            </ArkSegmentGroup.ItemText>
          </ArkSegmentGroup.ItemControl>
          <ArkSegmentGroup.ItemHiddenInput />
        </ArkSegmentGroup.Item>
      ))}
    </ArkSegmentGroup.Root>
  )
})
