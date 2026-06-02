import { Steps as ArkSteps, type StepsRootProps } from '@ark-ui/react'
import { Check } from 'lucide-react'
import { forwardRef, type ReactNode } from 'react'

import styles from './Steps.module.css'

export type StepChangeDetails = { step: number }

export interface StepItem {
  /** Step label rendered under the indicator. */
  label: ReactNode
  /**
   * Panel content revealed when this step is the current step.
   * Omit to render the stepper as a status rail only.
   */
  content?: ReactNode
}

export interface StepsProps {
  /** The ordered steps to render. */
  items: StepItem[]
  /** Controlled current step index (0-based). */
  step?: number
  /** Initial current step index for uncontrolled usage. @default 0 */
  defaultStep?: number
  /** Fires when the current step changes. */
  onStepChange?: (details: StepChangeDetails) => void
  /**
   * Require the steps to be completed in order. When true, upcoming
   * triggers cannot be activated until prior steps are reached.
   * @default false
   */
  linear?: boolean
  /** Orientation of the stepper. @default 'horizontal' */
  orientation?: 'horizontal' | 'vertical'
  /** Accessible label for the step list. @default 'Progress' */
  'aria-label'?: string
  /** Id forwarded to the Ark root for composition. */
  id?: string
  /** Extra className merged onto the root element. */
  className?: string
}

/**
 * Ark stamps tab-interface ARIA (`aria-orientation`/`aria-owns` on the list,
 * `aria-selected` on each trigger) onto the rendered DOM. The Imprint stepper
 * is a progress indicator, not a tab interface, so these are stripped at
 * runtime by passing `null` — which React removes from the DOM. The DOM prop
 * types don't admit `null`, so the overrides are spread as untyped props.
 */
const stripTablistAria = { 'aria-orientation': null, 'aria-owns': null } as Record<string, unknown>
const stripTabAria = { 'aria-selected': null } as Record<string, unknown>

/**
 * Imprint Steps. Ark UI Steps behavior (step state machine, roving focus,
 * `data-complete`/`data-current`/`data-incomplete` ARIA wiring) skinned with
 * Imprint tokens. Completed and current steps fill with the accent and show a
 * check; upcoming steps render an outlined numbered circle. The connecting
 * separator turns accent once its preceding step is complete — 1:1 with the
 * Imprint specimen.
 *
 * The ref forwards to the Ark Steps root element.
 */
export const Steps = forwardRef<HTMLDivElement, StepsProps>(function Steps(
  { items, onStepChange, className, 'aria-label': ariaLabel = 'Progress', ...rest },
  ref
) {
  const count = items.length
  return (
    <ArkSteps.Root
      ref={ref}
      count={count}
      onStepChange={onStepChange}
      className={className ? `${styles.root} ${className}` : styles.root}
      {...(rest satisfies Omit<StepsRootProps, 'count' | 'onStepChange' | 'className' | 'ref'> as object)}
    >
      {/* The Imprint stepper is a progress indicator, not a tab interface:
          we remap Ark's tablist/tab semantics to a labelled group of buttons
          and let `aria-current="step"` on the active item carry the state.
          The Ark-injected tab ARIA attributes are stripped (set to null). */}
      <ArkSteps.List className={styles.list} role="group" aria-label={ariaLabel} {...stripTablistAria}>
        {items.map((item, index) => (
          <ArkSteps.Item key={index} index={index} className={styles.item}>
            <ArkSteps.Trigger className={styles.trigger} role="button" {...stripTabAria}>
              <ArkSteps.Indicator className={styles.indicator}>
                <Check className={styles.check} aria-hidden="true" />
                <span className={styles.number}>{index + 1}</span>
              </ArkSteps.Indicator>
              <span className={styles.label}>{item.label}</span>
            </ArkSteps.Trigger>
            {index < count - 1 ? <ArkSteps.Separator className={styles.separator} /> : null}
          </ArkSteps.Item>
        ))}
      </ArkSteps.List>
      {/* A content panel is rendered for every step so each trigger's
          aria-controls always resolves. Steps without content render an
          empty, unstyled panel that adds no visual surface. */}
      {items.map((item, index) => (
        <ArkSteps.Content
          key={index}
          index={index}
          className={item.content != null ? styles.content : styles.emptyContent}
        >
          {item.content}
        </ArkSteps.Content>
      ))}
    </ArkSteps.Root>
  )
})
