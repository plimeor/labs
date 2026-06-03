import { SegmentGroup as ArkSegmentGroup, type SegmentGroupValueChangeDetails } from '@ark-ui/react'
import type { LucideIcon } from 'lucide-react'
import { forwardRef, type ReactNode } from 'react'
import { tv } from 'tailwind-variants'

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

// One tv() with a slot per Ark part, plus size/fill variants targeting the
// affected slots. Named utilities (bg-sunken, rounded-sm, …) emit the same
// var(--token) the old CSS Module used; primitives/motion/fixed-px values use
// the arbitrary [var(--token)] / [15px] form. The item-state-driven control
// styling (hover/checked color, focus ring) lives on the itemControl slot via
// descendant-state selectors ([[data-state=…]_&]); the active pill-dip is a
// sibling selector mirrored verbatim on the indicator slot.
const segmentgroup = tv({
  defaultVariants: { size: 'md' },
  slots: {
    itemText: 'leading-none',
    indicator: [
      'absolute top-1 bottom-1 z-[1] w-[var(--width)]',
      'bg-raised rounded-xs shadow-2',
      '[:not([data-disabled])>[data-part=item]:active~&]:scale-[0.97]'
    ],
    item: [
      'relative z-[2] inline-flex cursor-pointer',
      '[&[data-state=checked]:not([data-disabled])]:cursor-default',
      'data-disabled:cursor-not-allowed'
    ],
    itemControl: [
      'inline-flex items-center justify-center gap-1 w-full',
      'py-2 px-4 whitespace-nowrap rounded-xs',
      'text-sm font-medium text-tertiary',
      'transition-colors duration-[var(--dur-base)] ease-standard',
      '[&>svg]:size-[15px] [&>svg]:shrink-0',
      '[[data-state=unchecked]:not([data-disabled]):hover_&]:text-secondary',
      '[[data-state=checked]_&]:text-ink',
      '[[data-focus-visible]_&]:outline-2 [[data-focus-visible]_&]:outline-focus [[data-focus-visible]_&]:outline-offset-2'
    ],
    root: [
      'relative inline-grid grid-flow-col auto-cols-fr p-1',
      'rounded-sm bg-sunken font-ui leading-none select-none w-max',
      'data-disabled:opacity-50'
    ]
  },
  variants: {
    fill: {
      true: {
        root: 'grid w-full'
      }
    },
    size: {
      md: {},
      lg: {
        itemControl: 'text-base py-3 px-5'
      },
      sm: {
        itemControl: ['text-xs py-1 px-3', '[&>svg]:size-[13px]']
      }
    }
  }
})

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
  const styles = segmentgroup({ size, fill })

  return (
    <ArkSegmentGroup.Root ref={ref} className={styles.root({ className })} {...rest}>
      <ArkSegmentGroup.Indicator className={styles.indicator()} />
      {items.map(({ value, label, icon: Icon, iconOnly, disabled }) => (
        <ArkSegmentGroup.Item key={value} value={value} disabled={disabled} className={styles.item()}>
          {/* Ark marks ItemControl aria-hidden; the accessible name for the
              radio comes from ItemText via aria-labelledby, so we always
              render ItemText (visually hidden when the segment is icon-only). */}
          <ArkSegmentGroup.ItemControl className={styles.itemControl({ class: iconOnly ? 'pr-3 pl-3' : undefined })}>
            {Icon ? <Icon aria-hidden="true" /> : null}
            <ArkSegmentGroup.ItemText
              className={
                iconOnly
                  ? 'absolute -m-px h-px w-px overflow-hidden whitespace-nowrap border-0 p-0 [clip:rect(0,0,0,0)]'
                  : styles.itemText()
              }
            >
              {label}
            </ArkSegmentGroup.ItemText>
          </ArkSegmentGroup.ItemControl>
          <ArkSegmentGroup.ItemHiddenInput />
        </ArkSegmentGroup.Item>
      ))}
    </ArkSegmentGroup.Root>
  )
})
