import h from 'solid-js/h'

import { taskCheckbox } from './styles'

interface TaskCheckboxProps {
  checked: boolean
  onToggle: (event: MouseEvent) => void
}

export function TaskCheckbox(props: TaskCheckboxProps) {
  return h('input', {
    'aria-label': props.checked ? 'Done' : 'Todo',
    checked: props.checked,
    class: taskCheckbox(),
    'data-editor-role': 'task-checkbox',
    'on:mousedown': props.onToggle,
    type: 'checkbox'
  })
}
