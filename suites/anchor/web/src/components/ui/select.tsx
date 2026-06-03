/**
 * Select — Anchor's single-value dropdown select.
 *
 * Part of src/components/ui (see ./README.md). Wraps @ark-ui/react's headless
 * Select primitive (listbox behavior, keyboard nav, focus, ARIA) and styles it
 * with Tailwind utilities bound to the theme tokens. Used for the font picker
 * in Settings → Appearance.
 */

import { Portal } from '@ark-ui/react'
import { Select as ArkSelect, createListCollection, type SelectValueChangeDetails } from '@ark-ui/react/select'
import { Check, ChevronDown } from 'lucide-react'
import { useMemo } from 'react'

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

export function Select({ value, onValueChange, options, placeholder, previewFont, ...rest }: SelectProps) {
  const ariaLabel = rest['aria-label']
  const collection = useMemo(() => createListCollection({ items: options as SelectOption[] }), [options])

  return (
    <ArkSelect.Root
      aria-label={ariaLabel}
      collection={collection}
      positioning={{ sameWidth: true }}
      value={[value]}
      onValueChange={(details: SelectValueChangeDetails<SelectOption>) => onValueChange(details.value[0] ?? '')}
    >
      <ArkSelect.Control>
        <ArkSelect.Trigger className="flex min-h-8 w-full items-center justify-between gap-2 rounded-[7px] border border-line-input bg-[var(--surface-button)] px-2.5 text-[13px] text-fg hover:border-line-strong">
          <ArkSelect.ValueText placeholder={placeholder ?? 'Select…'} style={{ fontFamily: previewFont?.(value) }} />
          <ArkSelect.Indicator className="grid place-items-center text-fg-secondary">
            <ChevronDown size={15} />
          </ArkSelect.Indicator>
        </ArkSelect.Trigger>
      </ArkSelect.Control>
      <Portal>
        <ArkSelect.Positioner>
          <ArkSelect.Content className="surface-floating z-50 grid max-h-[280px] gap-0.5 overflow-auto rounded-lg bg-popover p-1">
            {options.map(option => (
              <ArkSelect.Item
                key={option.value}
                className="flex min-h-[30px] cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1 text-[13px] text-fg data-[highlighted]:bg-hover data-[state=checked]:bg-selected"
                item={option}
              >
                <ArkSelect.ItemText style={{ fontFamily: previewFont?.(option.value) }}>
                  {option.label}
                </ArkSelect.ItemText>
                <ArkSelect.ItemIndicator className="grid place-items-center text-accent">
                  <Check size={14} />
                </ArkSelect.ItemIndicator>
              </ArkSelect.Item>
            ))}
          </ArkSelect.Content>
        </ArkSelect.Positioner>
      </Portal>
    </ArkSelect.Root>
  )
}
