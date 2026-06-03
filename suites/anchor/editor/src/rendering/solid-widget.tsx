import type { JSX } from 'solid-js'
import { render } from 'solid-js/web'

export interface SolidWidgetElement extends HTMLElement {
  __disposeSolidWidget?: () => void
}

export function renderSolidWidget(create: () => unknown): HTMLElement {
  const mount = document.createElement('span')
  const dispose = render(create as () => JSX.Element, mount)
  const root = mount.firstElementChild

  if (!(root instanceof HTMLElement)) {
    dispose()
    throw new Error('Solid widget must render one HTMLElement root')
  }

  ;(root as SolidWidgetElement).__disposeSolidWidget = dispose
  return root
}

export function disposeSolidWidget(dom: HTMLElement): void {
  ;(dom as SolidWidgetElement).__disposeSolidWidget?.()
}
