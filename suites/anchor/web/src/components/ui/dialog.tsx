/**
 * Dialog — Anchor's modal dialog shell.
 *
 * Part of src/components/ui (see ./README.md). Renders HeroUI's Modal (built on
 * react-aria: focus trap, scroll lock, Escape, ARIA) with its default styling.
 * `open`/`onOpenChange` map to the Modal root's `isOpen`/`onOpenChange`; children
 * render directly inside the dialog surface, so callers own the inner layout
 * (e.g. the Settings dialog's own sidebar). `title` names the dialog (a visible
 * header bar with a close button when `showHeader`, otherwise a visually hidden
 * heading).
 *
 * The wrapper releases HeroUI's default size cap and surface padding so the
 * caller's `className` fully governs the surface size and layout — matching the
 * "className controls size/layout" contract callers rely on.
 */

import { Modal } from '@heroui/react'
import type { ReactNode } from 'react'

// Neutralizes HeroUI's default dialog max-width (`size`) and padding so the
// caller-supplied className is the single source of truth for the surface box.
const SURFACE_RESET = 'max-w-none p-0'

export interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Accessible title (visually hidden unless `showHeader`). */
  title: string
  /** Render a visible header bar with the title and a close button. */
  showHeader?: boolean
  /** Extra classes for the content surface (controls its size/layout). */
  className?: string
  children: ReactNode
}

export function Dialog({ open, onOpenChange, title, showHeader, className, children }: DialogProps) {
  const surfaceClass = className ? `${SURFACE_RESET} ${className}` : SURFACE_RESET

  return (
    <Modal isOpen={open} onOpenChange={onOpenChange}>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className={surfaceClass}>
            {showHeader ? (
              <Modal.Header>
                <Modal.Heading>{title}</Modal.Heading>
                <Modal.CloseTrigger aria-label="Close" />
              </Modal.Header>
            ) : (
              <Modal.Heading className="sr-only">{title}</Modal.Heading>
            )}
            {children}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
