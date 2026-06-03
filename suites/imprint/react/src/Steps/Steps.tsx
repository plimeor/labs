import { Steps as ArkSteps, type StepsRootProps } from '@ark-ui/react'
import { Check } from 'lucide-react'
import { forwardRef, type ReactNode } from 'react'
import { tv } from 'tailwind-variants'

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

// One tv() with a slot per Ark part. Imprint tokens applied as inline Tailwind
// utilities: named utilities (bg-accent, rounded-full, …) emit the same
// var(--token) the old CSS Module used; primitives/motion tokens and fixed px
// use the arbitrary [var(--token)] / [px] form. Reached states use Ark's
// data-complete/data-current; descendant states lift via [[data-…]_&].
const steps = tv({
  slots: {
    check: 'w-[12px] h-[12px] hidden [[data-complete]_&]:block [[data-current]_&]:block',
    content: 'mt-4 text-base text-body',
    emptyContent: 'contents',
    item: 'flex items-start data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-start',
    list: 'flex items-start data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-start',
    number: ['font-mono text-xs', '[[data-complete]_&]:hidden [[data-current]_&]:hidden'],
    root: 'font-ui leading-tight',
    indicator: [
      'box-border relative w-[24px] h-[24px] shrink-0 inline-flex items-center justify-center',
      'rounded-full border-2 border-border-strong bg-transparent text-tertiary',
      'transition-[background-color,border-color,color] duration-[var(--dur-base)] ease-standard',
      'data-[complete]:border-accent data-[complete]:bg-accent data-[complete]:text-on-accent',
      'data-[current]:border-accent data-[current]:bg-accent data-[current]:text-on-accent'
    ],
    label: [
      'text-xs font-medium text-tertiary',
      'transition-colors duration-[var(--dur-base)] ease-standard',
      '[[data-complete]_&]:text-ink [[data-complete]_&]:font-semibold',
      '[[data-current]_&]:text-ink [[data-current]_&]:font-semibold'
    ],
    separator: [
      'w-[38px] h-[2px] mt-[11px] bg-border',
      'transition-colors duration-[var(--dur-base)] ease-standard',
      'data-[complete]:bg-accent',
      'data-[orientation=vertical]:w-[2px] data-[orientation=vertical]:h-[24px] data-[orientation=vertical]:mt-0 data-[orientation=vertical]:ml-[11px]'
    ],
    trigger: [
      'appearance-none border-0 bg-transparent cursor-pointer font-[inherit]',
      'inline-flex flex-col items-center gap-2 w-[88px] p-0 rounded-sm',
      'data-[orientation=vertical]:flex-row data-[orientation=vertical]:w-auto',
      'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2'
    ]
  }
})

const styles = steps()

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
      className={styles.root({ className })}
      {...(rest satisfies Omit<StepsRootProps, 'count' | 'onStepChange' | 'className' | 'ref'> as object)}
    >
      {/* The Imprint stepper is a progress indicator, not a tab interface:
          we remap Ark's tablist/tab semantics to a labelled group of buttons
          and let `aria-current="step"` on the active item carry the state.
          The Ark-injected tab ARIA attributes are stripped (set to null). */}
      <ArkSteps.List className={styles.list()} role="group" aria-label={ariaLabel} {...stripTablistAria}>
        {items.map((item, index) => (
          <ArkSteps.Item key={index} index={index} className={styles.item()}>
            <ArkSteps.Trigger className={styles.trigger()} role="button" {...stripTabAria}>
              <ArkSteps.Indicator className={styles.indicator()}>
                <Check className={styles.check()} aria-hidden="true" />
                <span className={styles.number()}>{index + 1}</span>
              </ArkSteps.Indicator>
              <span className={styles.label()}>{item.label}</span>
            </ArkSteps.Trigger>
            {index < count - 1 ? <ArkSteps.Separator className={styles.separator()} /> : null}
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
          className={item.content != null ? styles.content() : styles.emptyContent()}
        >
          {item.content}
        </ArkSteps.Content>
      ))}
    </ArkSteps.Root>
  )
})
