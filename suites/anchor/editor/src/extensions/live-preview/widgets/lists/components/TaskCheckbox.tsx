import { taskCheckbox } from './styles'

interface TaskCheckboxProps {
  checked: boolean
  onToggle: (event: MouseEvent) => void
}

export function TaskCheckbox(props: TaskCheckboxProps): HTMLInputElement {
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.setAttribute('aria-label', props.checked ? 'Done' : 'Todo')
  input.checked = props.checked
  input.className = taskCheckbox()
  input.dataset.editorRole = 'task-checkbox'
  input.addEventListener('mousedown', props.onToggle)
  return input
}
