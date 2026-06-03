import { Tabs as ArkTabs, type TabsValueChangeDetails } from '@ark-ui/react'
import type { LucideIcon } from 'lucide-react'
import { forwardRef, type ReactNode } from 'react'
import { tv } from 'tailwind-variants'

export type { TabsValueChangeDetails }

export type TabsVariant = 'underline' | 'pill'
export type TabsSize = 'sm' | 'md'

export interface TabsItem {
  /** Unique value identifying the tab. */
  value: string
  /** Visible label for the trigger. */
  label: ReactNode
  /** Optional leading icon, passed as a lucide-react icon component. */
  icon?: LucideIcon
  /** Optional trailing count badge (tabular figures). */
  count?: ReactNode
  /** Disables this tab. */
  disabled?: boolean
  /** Panel content revealed when this tab is active. Omit to render triggers only. */
  content?: ReactNode
}

export interface TabsProps {
  /** The tabs to render, in order. */
  items: TabsItem[]
  /** Visual style. `underline` is a gliding hairline bar; `pill` is a contained sliding thumb. */
  variant?: TabsVariant
  /** Size token. */
  size?: TabsSize
  /** Controlled active tab value. */
  value?: string | null
  /** Initial active tab value for uncontrolled usage. */
  defaultValue?: string | null
  /** Fires when the active tab changes. */
  onValueChange?: (details: TabsValueChangeDetails) => void
  /**
   * Activation mode. `automatic` selects a tab as it receives focus;
   * `manual` requires Enter/Space.
   * @default 'automatic'
   */
  activationMode?: 'automatic' | 'manual'
  /** Accessible label for the tab list. */
  'aria-label'?: string
  /** Id forwarded to the Ark root for composition. */
  id?: string
  /** Extra className merged onto the root element. */
  className?: string
}

// One tv() with a slot per Ark part, plus variant/size variants that re-skin the
// descendant slots (list rail, trigger spacing, the gliding indicator). The
// underline/pill split and the sm padding/margin overrides resolve via
// tailwind-merge in the same order the old `.root[data-variant][data-size]`
// cascade did — later variant/compound classes win, matching computed CSS.
const tabs = tv({
  defaultVariants: { size: 'md', variant: 'underline' },
  compoundVariants: [
    { class: { trigger: 'py-[6px] px-[12px]' }, size: 'sm', variant: 'pill' },
    { class: { trigger: 'mx-[8px] first-of-type:ml-0' }, size: 'sm', variant: 'underline' }
  ],
  slots: {
    emptyPanel: 'm-0 p-0',
    indicator: 'absolute',
    list: 'relative flex gap-[2px]',
    root: 'relative font-ui leading-none select-none',
    count: [
      'text-xs font-semibold leading-none',
      "[font-feature-settings:'tnum']",
      'py-[2px] px-[6px] rounded-full bg-sunken text-tertiary',
      'transition-colors duration-[var(--dur-base)] ease-standard',
      '[[data-selected]_&]:bg-accent-subtle [[data-selected]_&]:text-accent-fg'
    ],
    panel: [
      'mt-[18px] p-[18px] border border-border-subtle rounded-md bg-raised',
      'text-sm text-secondary leading-normal min-h-[38px]',
      'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
      '[&_b]:text-ink [&_b]:font-semibold'
    ],
    trigger: [
      'relative z-[1] appearance-none border-0 bg-transparent cursor-pointer',
      'font-[inherit] text-base font-medium text-secondary',
      'inline-flex items-center gap-[7px] whitespace-nowrap py-[11px] px-[14px] rounded-sm',
      'transition-[color,background] duration-[var(--dur-base)] ease-standard',
      '[&>svg]:size-[15px] [&>svg]:shrink-0 [&>svg]:opacity-85',
      'hover:text-ink',
      'data-[selected]:text-accent-fg data-[selected]:font-semibold data-[selected]:[&>svg]:opacity-100',
      'disabled:text-disabled disabled:cursor-not-allowed',
      'data-disabled:text-disabled data-disabled:cursor-not-allowed',
      'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2'
    ]
  },
  variants: {
    size: {
      md: {},
      sm: {
        trigger: 'text-sm py-[8px] px-[4px]'
      }
    },
    variant: {
      pill: {
        count: '[[data-selected]_&]:bg-sunken',
        list: 'p-1 bg-sunken rounded-sm gap-[2px] w-max',
        trigger: 'text-tertiary hover:text-secondary hover:bg-transparent data-[selected]:text-ink',
        indicator: [
          'left-[var(--left)] top-[var(--top)] w-[var(--width)] h-[var(--height)] z-0',
          'bg-raised rounded-[calc(var(--radius-sm)_-_3px)] shadow-2',
          'transition-[left,top,width,height] duration-[var(--dur-base)] ease-standard'
        ]
      },
      underline: {
        list: 'shadow-[inset_0_-1px_0_var(--color-border-subtle)]',
        trigger: 'rounded-none px-[4px] mx-[10px] first-of-type:ml-0 hover:bg-transparent',
        indicator: [
          'left-[var(--left)] bottom-[-1px] w-[var(--width)] h-[2px] z-[2]',
          'bg-accent rounded-[2px]',
          'transition-[left,width] duration-[var(--dur-base)] ease-out'
        ]
      }
    }
  }
})

/**
 * Imprint Tabs. Ark UI Tabs behavior (roving focus, arrow-key navigation,
 * `data-state`/`data-selected` ARIA wiring) skinned with Imprint tokens.
 * A single accent indicator glides to the active trigger — a 2px underline
 * bar in the `underline` variant, a soft raised thumb in the `pill` variant.
 *
 * The ref forwards to the Ark Tabs root element.
 */
export const Tabs = forwardRef<HTMLDivElement, TabsProps>(function Tabs(
  { items, variant = 'underline', size = 'md', className, ...rest },
  ref
) {
  const styles = tabs({ variant, size })
  return (
    <ArkTabs.Root ref={ref} data-variant={variant} data-size={size} className={styles.root({ className })} {...rest}>
      <ArkTabs.List className={styles.list()}>
        {items.map(({ value, label, icon: Icon, count, disabled }) => (
          <ArkTabs.Trigger key={value} value={value} disabled={disabled} className={styles.trigger()}>
            {Icon ? <Icon aria-hidden="true" /> : null}
            {label}
            {count != null ? <span className={styles.count()}>{count}</span> : null}
          </ArkTabs.Trigger>
        ))}
        <ArkTabs.Indicator className={styles.indicator()} />
      </ArkTabs.List>
      {/* A content panel is rendered for every tab so each trigger's
          aria-controls always resolves. Tabs without content render an empty,
          unstyled panel that adds no visual surface. */}
      {items.map(({ value, content }) => (
        <ArkTabs.Content key={value} value={value} className={content != null ? styles.panel() : styles.emptyPanel()}>
          {content}
        </ArkTabs.Content>
      ))}
    </ArkTabs.Root>
  )
})
