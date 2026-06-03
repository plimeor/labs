import { type AccordionValueChangeDetails, Accordion as ArkAccordion } from '@ark-ui/react'
import { ChevronDown } from 'lucide-react'
import { forwardRef, type ReactNode } from 'react'
import { tv } from 'tailwind-variants'

import './Accordion.css'

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

// One tv() with a slot per Ark part. Title open-state lifts via the ancestor
// trigger's data-state ([[data-state=open]_&]); the chevron rotates on its own
// data-state; the content height animation is bound to the co-located keyframes.
const accordion = tv({
  slots: {
    item: 'border-b border-border-subtle last:border-b-0',
    root: 'font-ui w-full max-w-[440px] bg-content border border-border-subtle rounded-md overflow-hidden',
    content: [
      'pt-0 px-4 pb-4 font-read text-base leading-relaxed text-body',
      'data-[state=open]:animate-[imprint-accordion-down_var(--dur-base)_var(--ease-standard)]',
      'data-[state=closed]:animate-[imprint-accordion-up_var(--dur-fast)_var(--ease-standard)]'
    ],
    indicator: [
      'inline-flex items-center justify-center shrink-0 text-tertiary',
      '-rotate-90 data-[state=open]:rotate-0',
      'transition-transform duration-[var(--dur-base)] ease-standard',
      '[&>svg]:size-[16px]'
    ],
    title: [
      'text-base font-medium text-secondary',
      'transition-[color,font-weight] duration-[var(--dur-base)] ease-standard',
      '[[data-state=open]_&]:font-semibold [[data-state=open]_&]:text-ink'
    ],
    trigger: [
      'flex items-center justify-between gap-3 w-full m-0 py-3 px-4',
      'border-0 bg-transparent font-ui text-left cursor-pointer',
      'transition-colors duration-[var(--dur-fast)] ease-standard',
      'hover:bg-hover',
      'data-disabled:cursor-not-allowed data-disabled:opacity-55',
      'focus-visible:outline-2 focus-visible:outline-focus focus-visible:-outline-offset-2'
    ]
  }
})

const styles = accordion()

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
    <ArkAccordion.Root ref={ref} collapsible={collapsible} className={styles.root({ className })} {...rest}>
      {items.map(({ value, title, content, disabled }) => (
        <ArkAccordion.Item key={value} value={value} disabled={disabled} className={styles.item()}>
          <ArkAccordion.ItemTrigger className={styles.trigger()}>
            <span className={styles.title()}>{title}</span>
            <ArkAccordion.ItemIndicator className={styles.indicator()}>
              <ChevronDown aria-hidden="true" />
            </ArkAccordion.ItemIndicator>
          </ArkAccordion.ItemTrigger>
          <ArkAccordion.ItemContent className={styles.content()}>{content}</ArkAccordion.ItemContent>
        </ArkAccordion.Item>
      ))}
    </ArkAccordion.Root>
  )
})
