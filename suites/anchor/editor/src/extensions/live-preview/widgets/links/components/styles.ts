import { tv } from 'tailwind-variants'

export const markdownLinkChip = tv({
  base:
    'inline-block rounded px-1.5 text-[0.875em] font-medium text-[var(--link-color)] underline bg-[var(--state-selected)] cursor-pointer'
})

export const wikilinkChip = tv({
  base:
    'inline-block rounded border-b border-dotted border-[var(--wikilink-color)] px-1.5 text-[0.875em] font-medium text-[var(--wikilink-color)] bg-[var(--wikilink-tint)] cursor-pointer'
})
