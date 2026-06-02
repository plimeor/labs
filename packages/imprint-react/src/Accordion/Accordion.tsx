import { type AccordionValueChangeDetails, Accordion as ArkAccordion } from '@ark-ui/react'
import { ChevronDown } from 'lucide-react'
import { forwardRef, type ReactNode } from 'react'

import styles from './Accordion.module.css'

export type { AccordionValueChangeDetails }

export interface AccordionItem {
  /** Unique value identifying the item. Used for open/close state. */
  value: string
  /** Visible header label, rendered inside the trigger. */
  title: ReactNode
  /** Body content revealed when the item is expanded. */
  content: ReactNode
  /** Disables this item. */
  disabled?: boolean
}

export interface AccordionProps {
  /** The items to render, in order. */
  items: AccordionItem[]
  /** Allow multiple items to be open at once. @default false */
  multiple?: boolean
  /** Allow an open item to be collapsed again. @default false */
  collapsible?: boolean
  /** Controlled set of open item values. */
  value?: string[]
  /** Initial open item values for uncontrolled usage. */
  defaultValue?: string[]
  /** Fires when the set of open items changes. */
  onValueChange?: (details: AccordionValueChangeDetails) => void
  /** Disables every item. */
  disabled?: boolean
  /** Id forwarded to the Ark root for composition. */
  id?: string
  /** Extra className merged onto the root element. */
  className?: string
}

/**
 * Imprint Accordion. Ark UI Accordion behavior (open/close state, roving focus,
 * arrow-key navigation, `data-state` ARIA wiring) skinned with Imprint tokens.
 * A bordered, content-surface stack of disclosure items; each header carries a
 * chevron that rotates from a closed (pointing right) to an open (pointing
 * down) position — 1:1 with the Imprint specimen.
 *
 * The ref forwards to the Ark Accordion root element.
 */
export const Accordion = forwardRef<HTMLDivElement, AccordionProps>(function Accordion(
  { items, collapsible = true, className, ...rest },
  ref
) {
  return (
    <ArkAccordion.Root
      ref={ref}
      collapsible={collapsible}
      className={className ? `${styles.root} ${className}` : styles.root}
      {...rest}
    >
      {items.map(({ value, title, content, disabled }) => (
        <ArkAccordion.Item key={value} value={value} disabled={disabled} className={styles.item}>
          <ArkAccordion.ItemTrigger className={styles.trigger}>
            <span className={styles.title}>{title}</span>
            <ArkAccordion.ItemIndicator className={styles.indicator}>
              <ChevronDown aria-hidden="true" />
            </ArkAccordion.ItemIndicator>
          </ArkAccordion.ItemTrigger>
          <ArkAccordion.ItemContent className={styles.content}>{content}</ArkAccordion.ItemContent>
        </ArkAccordion.Item>
      ))}
    </ArkAccordion.Root>
  )
})
