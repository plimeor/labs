/**
 * Select — Anchor's single-value dropdown select.
 *
 * Part of src/components/ui (see ./README.md). Renders HeroUI's Select (built on
 * react-aria: listbox behavior, keyboard nav, focus, ARIA) with its default
 * styling. Used for the font picker in Settings → Appearance, so the selected
 * value and each option can preview their own font via `previewFont`.
 */

import { Select as HeroSelect, ListBox } from '@heroui/react'

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

  return (
    <HeroSelect
      aria-label={ariaLabel}
      placeholder={placeholder ?? 'Select…'}
      selectedKey={value}
      onSelectionChange={key => onValueChange(key === null ? '' : String(key))}
    >
      <HeroSelect.Trigger>
        <HeroSelect.Value style={{ fontFamily: previewFont?.(value) }} />
        <HeroSelect.Indicator />
      </HeroSelect.Trigger>
      <HeroSelect.Popover>
        <ListBox>
          {options.map(option => (
            <ListBox.Item
              key={option.value}
              id={option.value}
              style={{ fontFamily: previewFont?.(option.value) }}
              textValue={option.label}
            >
              {option.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </HeroSelect.Popover>
    </HeroSelect>
  )
}
