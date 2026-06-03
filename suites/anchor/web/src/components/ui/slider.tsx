/**
 * Slider — Anchor's single-value numeric slider.
 *
 * Part of src/components/ui (see ./README.md). Wraps @ark-ui/solid's headless
 * Slider primitive and styles it with Tailwind utilities bound to the theme
 * tokens — Ark owns the drag / keyboard / ARIA behavior, we own the look. This
 * is the canonical control for adjusting a numeric setting (Settings →
 * Appearance → Typography).
 */

import { Slider as ArkSlider, type SliderValueChangeDetails } from '@ark-ui/solid/slider'
import { createMemo, For, Show, splitProps } from 'solid-js'

export interface SliderProps {
  value: number
  onValueChange: (value: number) => void
  min: number
  max: number
  step?: number
  /** Number of evenly spaced tick marks under the track. <2 hides them. */
  markers?: number
  'aria-label'?: string
}

export function Slider(props: SliderProps) {
  const [local] = splitProps(props, ['value', 'onValueChange', 'min', 'max', 'step', 'markers', 'aria-label'])

  const markerValues = createMemo(() => {
    const count = local.markers ?? 0
    if (count < 2) return []
    const span = local.max - local.min
    return Array.from({ length: count }, (_, i) => local.min + (span * i) / (count - 1))
  })

  return (
    <ArkSlider.Root
      class="flex min-h-6 w-full touch-none items-center"
      max={local.max}
      min={local.min}
      step={local.step ?? 1}
      value={[local.value]}
      onValueChange={(details: SliderValueChangeDetails) => local.onValueChange(details.value[0])}
    >
      <ArkSlider.Control class="relative flex w-full items-center py-2">
        <ArkSlider.Track class="relative h-1 flex-1 rounded-full bg-[var(--surface-button)]">
          <ArkSlider.Range class="h-full rounded-full bg-accent" />
        </ArkSlider.Track>
        <ArkSlider.Thumb
          aria-label={local['aria-label']}
          class="size-4 cursor-grab rounded-full border border-line-input bg-popover shadow-[0_1px_3px_rgb(0_0_0/0.25)] outline-none focus-visible:outline-2 focus-visible:outline-[var(--state-focus-ring)] focus-visible:outline-offset-2 data-[dragging]:cursor-grabbing"
          index={0}
        >
          <ArkSlider.HiddenInput />
        </ArkSlider.Thumb>
        <Show when={markerValues().length > 0}>
          <ArkSlider.MarkerGroup class="pointer-events-none absolute inset-0">
            <For each={markerValues()}>
              {value => <ArkSlider.Marker class="size-0.5 -translate-x-px rounded-full bg-fg-faint" value={value} />}
            </For>
          </ArkSlider.MarkerGroup>
        </Show>
      </ArkSlider.Control>
    </ArkSlider.Root>
  )
}
