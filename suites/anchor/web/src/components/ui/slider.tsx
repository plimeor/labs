/**
 * Slider — Anchor's single-value numeric slider.
 *
 * Part of src/components/ui (see ./README.md). Renders HeroUI's Slider (built on
 * react-aria: drag / keyboard / ARIA) with its default styling. The canonical
 * control for adjusting a numeric setting (Settings → Appearance → Typography).
 *
 * `markers` is accepted for API compatibility with callers but no longer drives
 * custom tick rendering — HeroUI's default slider track is used as-is.
 */

import { Slider as HeroSlider } from '@heroui/react'

export interface SliderProps {
  value: number
  onValueChange: (value: number) => void
  min: number
  max: number
  step?: number
  /** Accepted for API compatibility; HeroUI's default track has no custom ticks. */
  markers?: number
  'aria-label'?: string
}

export function Slider({ value, onValueChange, min, max, step, ...rest }: SliderProps) {
  const ariaLabel = rest['aria-label']

  return (
    <HeroSlider
      aria-label={ariaLabel}
      maxValue={max}
      minValue={min}
      step={step ?? 1}
      value={value}
      onChange={next => onValueChange(typeof next === 'number' ? next : next[0])}
    >
      <HeroSlider.Track>
        <HeroSlider.Fill />
        <HeroSlider.Thumb />
      </HeroSlider.Track>
    </HeroSlider>
  )
}
