/**
 * Select — Anchor's single-value dropdown select.
 *
 * Part of src/components/ui (see ./README.md). Wraps @ark-ui/solid's headless
 * Select primitive (listbox behavior, keyboard nav, focus, ARIA) and styles it
 * with Tailwind utilities bound to the theme tokens. Used for the font picker
 * in Settings → Appearance.
 */

import { Select as ArkSelect, createListCollection, type SelectValueChangeDetails } from '@ark-ui/solid/select'
import { Check, ChevronDown } from 'lucide-solid'
import { createMemo, For } from 'solid-js'
import { Portal } from 'solid-js/web'

export interface SelectOption {
  label: string
  value: string
}

export interface SelectProps {
  value: string
  onValueChange: (value: string) => void
  options: readonly SelectOption[]
  placeholder?: string
  'aria-label'?: string
  /** Render the selected option's label in the chosen font. */
  previewFont?: (value: string) => string | undefined
}

export function Select(props: SelectProps) {
  const collection = createMemo(() => createListCollection({ items: props.options as SelectOption[] }))

  return (
    <ArkSelect.Root
      aria-label={props['aria-label']}
      collection={collection()}
      positioning={{ sameWidth: true }}
      value={[props.value]}
      onValueChange={(details: SelectValueChangeDetails<SelectOption>) => props.onValueChange(details.value[0] ?? '')}
    >
      <ArkSelect.Control>
        <ArkSelect.Trigger class="flex min-h-8 w-full items-center justify-between gap-2 rounded-[7px] border border-line-input bg-[var(--surface-button)] px-2.5 text-[13px] text-fg hover:border-line-strong">
          <ArkSelect.ValueText
            placeholder={props.placeholder ?? 'Select…'}
            style={{ 'font-family': props.previewFont?.(props.value) }}
          />
          <ArkSelect.Indicator class="grid place-items-center text-fg-secondary">
            <ChevronDown size={15} />
          </ArkSelect.Indicator>
        </ArkSelect.Trigger>
      </ArkSelect.Control>
      <Portal>
        <ArkSelect.Positioner>
          <ArkSelect.Content class="surface-floating z-50 grid max-h-[280px] gap-0.5 overflow-auto rounded-lg bg-popover p-1">
            <For each={props.options}>
              {option => (
                <ArkSelect.Item
                  class="flex min-h-[30px] cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1 text-[13px] text-fg data-[highlighted]:bg-hover data-[state=checked]:bg-selected"
                  item={option}
                >
                  <ArkSelect.ItemText style={{ 'font-family': props.previewFont?.(option.value) }}>
                    {option.label}
                  </ArkSelect.ItemText>
                  <ArkSelect.ItemIndicator class="grid place-items-center text-accent">
                    <Check size={14} />
                  </ArkSelect.ItemIndicator>
                </ArkSelect.Item>
              )}
            </For>
          </ArkSelect.Content>
        </ArkSelect.Positioner>
      </Portal>
    </ArkSelect.Root>
  )
}
