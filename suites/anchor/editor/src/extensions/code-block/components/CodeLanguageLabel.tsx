import { codeLanguageOptions, languageOptionValue } from '../language'
import {
  codeLanguageControl,
  codeLanguageLabel,
  codeLanguageMenu,
  codeLanguageOption,
  codeLanguageOptionsList,
  codeLanguageSearch
} from './styles'

interface CodeLanguageLabelProps {
  label: string
  onLanguageChange: (language: string) => void
  value: string
}

export interface CodeLanguageLabelElement extends HTMLElement {
  __disposeCodeLanguageLabel?: () => void
}

export function CodeLanguageLabel(props: CodeLanguageLabelProps): CodeLanguageLabelElement {
  const root = document.createElement('span') as CodeLanguageLabelElement
  const button = document.createElement('button')
  let menu: HTMLSpanElement | undefined
  let search = ''
  let open = false

  const selectedValue = () => languageOptionValue(props.value)

  const stopEditorEvent = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const stopEditorPropagation = (event: Event) => {
    event.stopPropagation()
  }

  const filteredOptions = () => {
    const query = search.trim().toLowerCase()
    if (!query) return codeLanguageOptions

    return codeLanguageOptions.filter(
      option => option.label.toLowerCase().includes(query) || option.value.toLowerCase().includes(query)
    )
  }

  const renderOptions = (optionsRoot: HTMLSpanElement) => {
    optionsRoot.replaceChildren(
      ...filteredOptions().map(option => {
        const optionButton = document.createElement('button')
        const selected = option.value === selectedValue()

        optionButton.className = codeLanguageOption({ selected })
        optionButton.dataset.editorRole = 'code-language-option'
        optionButton.dataset.languageValue = option.value
        optionButton.setAttribute('aria-selected', String(selected))
        optionButton.setAttribute('role', 'option')
        optionButton.type = 'button'
        optionButton.textContent = option.label

        optionButton.addEventListener('mousedown', stopEditorEvent)
        optionButton.addEventListener('click', event => {
          stopEditorEvent(event)
          setOpen(false)
          if (option.value !== selectedValue()) props.onLanguageChange(option.value)
        })

        return optionButton
      })
    )
  }

  const renderMenu = () => {
    menu?.remove()
    menu = undefined

    if (!open) return

    const nextMenu = document.createElement('span')
    const searchInput = document.createElement('input')
    const optionsRoot = document.createElement('span')

    nextMenu.className = codeLanguageMenu()
    nextMenu.dataset.editorRole = 'code-language-menu'

    searchInput.autocomplete = 'off'
    searchInput.className = codeLanguageSearch()
    searchInput.dataset.editorRole = 'code-language-search'
    searchInput.placeholder = 'Search languages'
    searchInput.setAttribute('aria-label', 'Search code languages')
    searchInput.setAttribute('role', 'searchbox')
    searchInput.type = 'search'
    searchInput.value = search
    searchInput.addEventListener('mousedown', stopEditorPropagation)
    searchInput.addEventListener('keydown', stopEditorPropagation)
    searchInput.addEventListener('input', event => {
      stopEditorPropagation(event)
      search = searchInput.value
      renderOptions(optionsRoot)
    })

    optionsRoot.className = codeLanguageOptionsList()
    optionsRoot.dataset.editorRole = 'code-language-options'
    optionsRoot.setAttribute('role', 'listbox')
    renderOptions(optionsRoot)

    nextMenu.replaceChildren(searchInput, optionsRoot)
    root.append(nextMenu)
    menu = nextMenu
  }

  const setOpen = (nextOpen: boolean) => {
    open = nextOpen
    button.setAttribute('aria-expanded', String(open))
    if (open) search = ''
    renderMenu()
  }

  const handleDocumentMouseDown = (event: MouseEvent) => {
    if (!event.target || root.contains(event.target as Node)) return
    setOpen(false)
  }

  root.className = codeLanguageControl()
  root.dataset.editorRole = 'code-language-control'

  button.className = codeLanguageLabel()
  button.dataset.editorRole = 'code-language'
  button.dataset.languageValue = selectedValue()
  button.setAttribute('aria-expanded', 'false')
  button.setAttribute('aria-haspopup', 'listbox')
  button.setAttribute('aria-label', `Change code language: ${props.label}`)
  button.title = 'Change code language'
  button.type = 'button'
  button.textContent = props.label
  button.addEventListener('mousedown', stopEditorEvent)
  button.addEventListener('click', event => {
    stopEditorEvent(event)
    setOpen(!open)
  })

  document.addEventListener('mousedown', handleDocumentMouseDown)
  root.__disposeCodeLanguageLabel = () => {
    document.removeEventListener('mousedown', handleDocumentMouseDown)
  }

  root.append(button)
  return root
}
