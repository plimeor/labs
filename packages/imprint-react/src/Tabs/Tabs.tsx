import { Tabs as ArkTabs, type TabsValueChangeDetails } from '@ark-ui/react'
import type { LucideIcon } from 'lucide-react'
import { forwardRef, type ReactNode } from 'react'

import styles from './Tabs.module.css'

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
  return (
    <ArkTabs.Root
      ref={ref}
      data-variant={variant}
      data-size={size}
      className={className ? `${styles.root} ${className}` : styles.root}
      {...rest}
    >
      <ArkTabs.List className={styles.list}>
        {items.map(({ value, label, icon: Icon, count, disabled }) => (
          <ArkTabs.Trigger key={value} value={value} disabled={disabled} className={styles.trigger}>
            {Icon ? <Icon aria-hidden="true" /> : null}
            {label}
            {count != null ? <span className={styles.count}>{count}</span> : null}
          </ArkTabs.Trigger>
        ))}
        <ArkTabs.Indicator className={styles.indicator} />
      </ArkTabs.List>
      {/* A content panel is rendered for every tab so each trigger's
          aria-controls always resolves. Tabs without content render an empty,
          unstyled panel that adds no visual surface. */}
      {items.map(({ value, content }) => (
        <ArkTabs.Content key={value} value={value} className={content != null ? styles.panel : styles.emptyPanel}>
          {content}
        </ArkTabs.Content>
      ))}
    </ArkTabs.Root>
  )
})
