import { tv } from 'tailwind-variants'

export const taskCheckbox = tv({
  base: 'mr-1.5 h-[18px] w-[18px] cursor-pointer align-middle accent-[var(--checkbox-accent)]'
})

export const listMarker = tv({
  base:
    'mx-1 inline-block h-1.5 w-1.5 rounded-full bg-[var(--text-muted)] align-middle'
})
