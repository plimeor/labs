import { Menu as ArkMenu, type MenuSelectionDetails, Portal } from '@ark-ui/react'
import type { LucideIcon } from 'lucide-react'
import { Fragment, forwardRef, type ReactNode } from 'react'

import styles from './Menu.module.css'

export type { MenuSelectionDetails }

/** A single actionable menu entry. */
export interface MenuItemDef {
  /** Discriminates this entry as an action item (default). */
  type?: 'item'
  /** Unique value used for selection + typeahead. */
  value: string
  /** Visible label. */
  label: ReactNode
  /** Optional leading icon, passed as a lucide-react icon component. */
  icon?: LucideIcon
  /** Optional trailing shortcut hint (e.g. "⌘N"). */
  shortcut?: ReactNode
  /** Danger styling for destructive actions. */
  danger?: boolean
  /** Disables the item. */
  disabled?: boolean
  /** Called when this specific item is selected. */
  onSelect?: () => void
  /** Whether selecting the item closes the menu. @default true */
  closeOnSelect?: boolean
}

/** A horizontal divider between groups of entries. */
export interface MenuSeparatorDef {
  type: 'separator'
}

/** A labelled group of items. */
export interface MenuGroupDef {
  type: 'group'
  /** Stable id used to wire the group label to its group. */
  id: string
  /** Group heading. */
  label: ReactNode
  /** Items belonging to the group. */
  items: MenuItemDef[]
}

export type MenuEntry = MenuItemDef | MenuSeparatorDef | MenuGroupDef

export interface MenuProps {
  /** The element that opens the menu. Rendered via Ark's trigger (asChild). */
  trigger: ReactNode
  /** Flat list of items, separators, and groups rendered in order. */
  items: MenuEntry[]
  /** Controlled open state. */
  open?: boolean
  /** Initial open state when uncontrolled. */
  defaultOpen?: boolean
  /** Called when the open state changes. */
  onOpenChange?: (open: boolean) => void
  /** Called when any item is selected, with its value. */
  onSelect?: (details: MenuSelectionDetails) => void
  /** Whether selecting an item closes the menu. @default true */
  closeOnSelect?: boolean
  /** Extra class applied to the menu surface (Content). */
  className?: string
}

function renderItem(item: MenuItemDef): ReactNode {
  const { value, label, icon: Icon, shortcut, danger, disabled, onSelect, closeOnSelect } = item
  return (
    <ArkMenu.Item
      key={value}
      value={value}
      disabled={disabled}
      closeOnSelect={closeOnSelect}
      onSelect={onSelect}
      className={styles.item}
      data-danger={danger ? '' : undefined}
    >
      {Icon ? <Icon className={styles.icon} aria-hidden="true" /> : null}
      <span className={styles.label}>{label}</span>
      {shortcut != null ? <span className={styles.shortcut}>{shortcut}</span> : null}
    </ArkMenu.Item>
  )
}

/**
 * Imprint Menu. Ark UI Menu behavior (trigger, focus management, typeahead,
 * arrow-key navigation, Esc-to-close, ARIA wiring) skinned with Imprint tokens.
 * Renders an elev-2 raised surface with hover-filled items, optional leading
 * icons and trailing shortcuts, dividers, and labelled groups — 1:1 with the
 * Imprint specimen.
 *
 * The ref forwards to the menu Content element.
 */
export const Menu = forwardRef<HTMLDivElement, MenuProps>(function Menu(
  { trigger, items, open, defaultOpen, onOpenChange, onSelect, closeOnSelect, className },
  ref
) {
  return (
    <ArkMenu.Root
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange ? details => onOpenChange(details.open) : undefined}
      onSelect={onSelect}
      closeOnSelect={closeOnSelect}
    >
      <ArkMenu.Trigger asChild>{trigger}</ArkMenu.Trigger>
      <Portal>
        <ArkMenu.Positioner className={styles.positioner}>
          <ArkMenu.Content ref={ref} className={className ? `${styles.content} ${className}` : styles.content}>
            {items.map((entry, index) => {
              if (entry.type === 'separator') {
                // Separators carry no value; index keying is stable for a static list.
                return <ArkMenu.Separator key={`sep-${index}`} className={styles.separator} />
              }
              if (entry.type === 'group') {
                return (
                  <ArkMenu.ItemGroup key={entry.id} id={entry.id} className={styles.group}>
                    <ArkMenu.ItemGroupLabel className={styles.groupLabel}>{entry.label}</ArkMenu.ItemGroupLabel>
                    {entry.items.map(item => (
                      <Fragment key={item.value}>{renderItem(item)}</Fragment>
                    ))}
                  </ArkMenu.ItemGroup>
                )
              }
              return <Fragment key={entry.value}>{renderItem(entry)}</Fragment>
            })}
          </ArkMenu.Content>
        </ArkMenu.Positioner>
      </Portal>
    </ArkMenu.Root>
  )
})
