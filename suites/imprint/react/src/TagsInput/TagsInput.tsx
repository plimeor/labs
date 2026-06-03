import {
  TagsInput as ArkTagsInput,
  type TagsInputInputValueChangeDetails,
  type TagsInputValueChangeDetails
} from '@ark-ui/react'
import { X } from 'lucide-react'
import { forwardRef } from 'react'
import { tv } from 'tailwind-variants'

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

// One tv() with a slot per Ark part. Named utilities (bg-content, rounded-sm,
// text-body, …) emit the same var(--token) the old CSS Module used; font sizes
// use the length-hinted arbitrary form; color-mix() fills and fixed px sizes use
// the arbitrary [..] form so the exact same value is referenced. The field's
// focus-within ring lifts via Ark's data-focus on the Control.
const tagsinput = tv({
  slots: {
    hash: 'opacity-50 font-semibold',
    item: 'inline-flex',
    itemText: 'leading-none',
    label: 'font-mono text-xs text-tertiary',
    root: 'font-ui flex flex-col gap-2',
    control: [
      'flex flex-wrap items-center gap-2 bg-content border border-border rounded-sm px-3 py-2',
      'transition-[border-color,box-shadow] duration-[var(--dur-fast)] ease-standard',
      'data-[focus]:border-accent data-[focus]:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-focus)_30%,transparent)]',
      'data-disabled:opacity-55 data-disabled:cursor-not-allowed',
      'data-invalid:border-danger-solid'
    ],
    input: [
      'flex-1 min-w-[80px] font-ui text-sm leading-[1.5]',
      'text-body bg-transparent border-0 p-[2px] outline-none',
      'placeholder:text-tertiary',
      'disabled:cursor-not-allowed'
    ],
    itemDeleteTrigger: [
      'inline-flex items-center justify-center w-[17px] h-[17px] p-0 border-0 rounded-full',
      'bg-transparent text-accent-fg opacity-60 cursor-pointer',
      'transition-[background,opacity] duration-[var(--dur-fast)] ease-standard',
      'hover:bg-[color-mix(in_srgb,var(--color-accent)_20%,transparent)] hover:opacity-100',
      'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2 focus-visible:opacity-100',
      '[&>svg]:w-[12px] [&>svg]:h-[12px] [&>svg]:shrink-0'
    ],
    itemInput: [
      'font-ui text-sm text-body bg-raised',
      'border border-accent rounded-xs px-1 py-0 outline-none'
    ],
    itemPreview: [
      'inline-flex items-center gap-1',
      'text-sm font-medium leading-none',
      'text-accent-fg bg-accent-subtle',
      'border border-[color-mix(in_srgb,var(--color-accent)_22%,transparent)] rounded-full',
      'pt-[3px] pr-[4px] pb-[3px] pl-2',
      'data-[highlighted]:bg-[color-mix(in_srgb,var(--color-accent)_24%,transparent)]'
    ]
  }
})

const styles = tagsinput()

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
    <ArkTagsInput.Root ref={ref} className={styles.root({ className })} {...rest}>
      {label != null ? <ArkTagsInput.Label className={styles.label()}>{label}</ArkTagsInput.Label> : null}
      <ArkTagsInput.Control className={styles.control()}>
        <ArkTagsInput.Context>
          {api =>
            api.value.map((value, index) => (
              <ArkTagsInput.Item key={`${value}-${index}`} index={index} value={value} className={styles.item()}>
                <ArkTagsInput.ItemPreview className={styles.itemPreview()}>
                  {hash ? (
                    <span className={styles.hash()} aria-hidden="true">
                      #
                    </span>
                  ) : null}
                  <ArkTagsInput.ItemText className={styles.itemText()}>{value}</ArkTagsInput.ItemText>
                  <ArkTagsInput.ItemDeleteTrigger
                    className={styles.itemDeleteTrigger()}
                    aria-label={deleteLabel(value)}
                  >
                    <X aria-hidden="true" />
                  </ArkTagsInput.ItemDeleteTrigger>
                </ArkTagsInput.ItemPreview>
                <ArkTagsInput.ItemInput className={styles.itemInput()} />
              </ArkTagsInput.Item>
            ))
          }
        </ArkTagsInput.Context>
        <ArkTagsInput.Input className={styles.input()} placeholder={placeholder} />
      </ArkTagsInput.Control>
      <ArkTagsInput.HiddenInput />
    </ArkTagsInput.Root>
  )
})
