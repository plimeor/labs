/**
 * Slider — Anchor's single-value numeric slider.
 *
 * Part of src/components/ui (see ./README.md). Wraps @ark-ui/react's headless
 * Slider primitive and styles it with Tailwind utilities bound to the theme
 * tokens — Ark owns the drag / keyboard / ARIA behavior, we own the look. This
 * is the canonical control for adjusting a numeric setting (Settings →
 * Appearance → Typography).
 */

import { Slider as ArkSlider, type SliderValueChangeDetails } from '@ark-ui/react/slider'
import { useMemo } from 'react'

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

export function Slider({ value, onValueChange, min, max, step, markers, ...rest }: SliderProps) {
  const ariaLabel = rest['aria-label']

  const markerValues = useMemo(() => {
    const count = markers ?? 0
    if (count < 2) return []
    const span = max - min
    return Array.from({ length: count }, (_, i) => min + (span * i) / (count - 1))
  }, [markers, min, max])

  return (
    <ArkSlider.Root
      className="flex min-h-6 w-full touch-none items-center"
      max={max}
      min={min}
      step={step ?? 1}
      value={[value]}
      onValueChange={(details: SliderValueChangeDetails) => onValueChange(details.value[0])}
    >
      <ArkSlider.Control className="relative flex w-full items-center py-2">
        <ArkSlider.Track className="relative h-1 flex-1 rounded-full bg-[var(--surface-button)]">
          <ArkSlider.Range className="h-full rounded-full bg-accent" />
        </ArkSlider.Track>
        <ArkSlider.Thumb
          aria-label={ariaLabel}
          className="size-4 cursor-grab rounded-full border border-line-input bg-popover shadow-[0_1px_3px_rgb(0_0_0/0.25)] outline-none focus-visible:outline-2 focus-visible:outline-[var(--state-focus-ring)] focus-visible:outline-offset-2 data-[dragging]:cursor-grabbing"
          index={0}
        >
          <ArkSlider.HiddenInput />
        </ArkSlider.Thumb>
        {markerValues.length > 0 ? (
          <ArkSlider.MarkerGroup className="pointer-events-none absolute inset-0">
            {markerValues.map(markerValue => (
              <ArkSlider.Marker
                key={markerValue}
                className="size-0.5 -translate-x-px rounded-full bg-fg-faint"
                value={markerValue}
              />
            ))}
          </ArkSlider.MarkerGroup>
        ) : null}
      </ArkSlider.Control>
    </ArkSlider.Root>
  )
}
