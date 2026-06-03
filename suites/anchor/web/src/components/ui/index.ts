/**
 * Anchor UI — the app's own component layer.
 *
 * Thin wrappers over HeroUI (https://heroui.com) that pin a small, stable prop
 * API for the app while delegating behavior and look to HeroUI's default
 * components. The wrappers keep Anchor's vocabulary (e.g. Button variants,
 * Dialog open/onOpenChange) so callers stay decoupled from HeroUI. See
 * ./README.md.
 */

export { Button, type ButtonProps, type ButtonVariant } from './button'
export { Dialog, type DialogProps } from './dialog'
export { Select, type SelectOption, type SelectProps } from './select'
export { Slider, type SliderProps } from './slider'
