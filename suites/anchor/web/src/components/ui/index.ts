/**
 * Anchor UI — the app's own component layer.
 *
 * Anchor ships a single robust built-in theme (no user customization), so the UI
 * kit is owned in-repo rather than pulled from a styled component library.
 * Primitives are styled native elements driven by the theme tokens in
 * src/styles/theme/*; complex interactive components wrap @ark-ui/solid
 * (https://ark-ui.com) headless behavior. See ./README.md.
 */

export { Button, type ButtonProps, type ButtonVariant } from './button'
export { Dialog, type DialogProps } from './dialog'
export { Select, type SelectOption, type SelectProps } from './select'
export { Slider, type SliderProps } from './slider'
