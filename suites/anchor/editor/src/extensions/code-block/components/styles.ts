import { tv } from 'tailwind-variants'

export const codeLanguageLabel = tv({
  base: 'select-none rounded border border-transparent bg-transparent px-1.5 py-0.5 text-[0.75em] font-semibold uppercase leading-[1.4] text-[var(--editor-code-block-language)] hover:border-[var(--editor-code-block-border)] hover:text-[var(--editor-code-block-text)]'
})

export const codeLanguageControl = tv({
  base: 'relative inline-flex items-center'
})

export const codeLanguageMenu = tv({
  base: 'absolute left-0 top-[calc(100%+4px)] z-20 grid min-w-36 gap-0.5 rounded-md border border-[var(--border-elevated)] bg-[var(--surface-popover)] p-1 shadow-lg'
})

export const codeLanguageSearch = tv({
  base: 'mb-1 min-h-7 rounded border border-[var(--border-input)] bg-[var(--surface-input)] px-2 text-[0.75em] leading-[1.4] text-[var(--text-primary)] outline-none focus:border-[var(--border-strong)]'
})

export const codeLanguageOptionsList = tv({
  base: 'grid max-h-44 gap-0.5 overflow-y-auto overscroll-contain'
})

export const codeLanguageOption = tv({
  base: 'min-h-7 rounded px-2 text-left text-[0.75em] leading-[1.4] text-[var(--text-primary)] hover:bg-[var(--state-hover)]',
  variants: {
    selected: {
      false: '',
      true: 'bg-[var(--state-selected)] font-semibold'
    }
  }
})

export const codeCopyButton = tv({
  base: 'ml-auto select-none rounded border border-[var(--border-default)] bg-transparent px-2 py-px text-[0.7em] leading-[1.4] text-[var(--editor-code-block-language)] hover:text-[var(--editor-code-block-text)]',
  variants: {
    copied: {
      false: '',
      true: 'bg-[var(--state-hover)] text-[var(--feedback-success)]'
    }
  }
})
