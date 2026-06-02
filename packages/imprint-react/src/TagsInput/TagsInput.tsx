import {
  TagsInput as ArkTagsInput,
  type TagsInputInputValueChangeDetails,
  type TagsInputValueChangeDetails
} from '@ark-ui/react'
import { X } from 'lucide-react'
import { forwardRef } from 'react'

import styles from './TagsInput.module.css'

export type { TagsInputInputValueChangeDetails, TagsInputValueChangeDetails }

export interface TagsInputProps {
  /** Controlled list of tag values. */
  value?: string[]
  /** Initial tag values for uncontrolled usage. */
  defaultValue?: string[]
  /** Fires when the tag list changes (add / remove / edit). */
  onValueChange?: (details: TagsInputValueChangeDetails) => void
  /** Fires when the entry input's text changes. */
  onInputValueChange?: (details: TagsInputInputValueChangeDetails) => void
  /** Placeholder shown in the entry input when it is empty. */
  placeholder?: string
  /** Disables the whole control. */
  disabled?: boolean
  /** Marks the control read-only. */
  readOnly?: boolean
  /** Marks the underlying input as required, for form submission. */
  required?: boolean
  /** Marks the control invalid (surfaces `data-invalid` for styling). */
  invalid?: boolean
  /** Maximum number of tags allowed. */
  max?: number
  /** Whether a tag can be edited after creation. @default true */
  editable?: boolean
  /** Whether duplicate tags are allowed. @default false */
  allowDuplicates?: boolean
  /** Name of the underlying hidden input, for form submission. */
  name?: string
  /** Id of the form the control belongs to. */
  form?: string
  /** Id forwarded to the Ark root for composition. */
  id?: string
  /** Visible label rendered above the control. */
  label?: string
  /** Render a leading `#` glyph inside each chip, matching the specimen. */
  hash?: boolean
  /** Accessible label template for each tag's delete trigger. */
  deleteLabel?: (value: string) => string
  /** Extra className merged onto the root element. */
  className?: string
}

/**
 * Imprint TagsInput. Ark UI TagsInput behavior skinned with Imprint tokens —
 * token-colored accent chips with a leading `#`, an inline entry input, and a
 * per-chip delete affordance. The control surfaces Ark's `data-state` /
 * `data-disabled` / `data-invalid` attributes for token-driven styling and
 * exposes an always-visible focus ring on focus-within.
 *
 * The ref forwards to the Ark root element.
 */
export const TagsInput = forwardRef<HTMLDivElement, TagsInputProps>(function TagsInput(
  { label, hash = true, deleteLabel = value => `Remove ${value}`, className, placeholder = 'Add tag…', ...rest },
  ref
) {
  return (
    <ArkTagsInput.Root ref={ref} className={className ? `${styles.root} ${className}` : styles.root} {...rest}>
      {label != null ? <ArkTagsInput.Label className={styles.label}>{label}</ArkTagsInput.Label> : null}
      <ArkTagsInput.Control className={styles.control}>
        <ArkTagsInput.Context>
          {api =>
            api.value.map((value, index) => (
              <ArkTagsInput.Item key={`${value}-${index}`} index={index} value={value} className={styles.item}>
                <ArkTagsInput.ItemPreview className={styles.itemPreview}>
                  {hash ? (
                    <span className={styles.hash} aria-hidden="true">
                      #
                    </span>
                  ) : null}
                  <ArkTagsInput.ItemText className={styles.itemText}>{value}</ArkTagsInput.ItemText>
                  <ArkTagsInput.ItemDeleteTrigger className={styles.itemDeleteTrigger} aria-label={deleteLabel(value)}>
                    <X aria-hidden="true" />
                  </ArkTagsInput.ItemDeleteTrigger>
                </ArkTagsInput.ItemPreview>
                <ArkTagsInput.ItemInput className={styles.itemInput} />
              </ArkTagsInput.Item>
            ))
          }
        </ArkTagsInput.Context>
        <ArkTagsInput.Input className={styles.input} placeholder={placeholder} />
      </ArkTagsInput.Control>
      <ArkTagsInput.HiddenInput />
    </ArkTagsInput.Root>
  )
})
