import { ChevronRight } from 'lucide-react'
import { type AnchorHTMLAttributes, Fragment, forwardRef, type ReactNode } from 'react'

import styles from './Breadcrumb.module.css'

export interface BreadcrumbItem {
  /** Visible label for the crumb. */
  label: ReactNode
  /**
   * Destination for the crumb. When omitted the crumb renders as plain text
   * (useful for the trailing/current item or non-navigable segments).
   */
  href?: string
  /**
   * Marks this crumb as the current page. The current crumb is rendered as
   * non-interactive text with `aria-current="page"` and emphasized styling.
   * When no item sets this, the last item is treated as current.
   */
  current?: boolean
  /** Extra attributes forwarded to the crumb's anchor element when it links. */
  linkProps?: AnchorHTMLAttributes<HTMLAnchorElement>
}

export interface BreadcrumbProps {
  /** Ordered crumbs from root to current page. */
  items: BreadcrumbItem[]
  /** Accessible label for the landmark. @default 'Breadcrumb' */
  label?: string
  /** Extra class applied to the `<nav>` landmark. */
  className?: string
}

/**
 * Imprint Breadcrumb. A static navigation landmark rendering an ordered list of
 * crumbs joined by chevron separators — 1:1 with the Imprint specimen.
 *
 * Non-current crumbs with an `href` render as anchors; the current crumb (the
 * last item, or any item flagged `current`) renders as emphasized text carrying
 * `aria-current="page"`. Separators are decorative and hidden from a11y.
 *
 * The ref forwards to the `<nav>` landmark element.
 */
export const Breadcrumb = forwardRef<HTMLElement, BreadcrumbProps>(function Breadcrumb(
  { items, label = 'Breadcrumb', className },
  ref
) {
  const lastIndex = items.length - 1
  // The current crumb is whichever item flags itself current; if none does, the
  // trailing item is treated as the current page.
  const hasExplicitCurrent = items.some(item => item.current)

  return (
    <nav ref={ref} aria-label={label} className={className ? `${styles.nav} ${className}` : styles.nav}>
      <ol className={styles.list}>
        {items.map((item, index) => {
          const isCurrent = hasExplicitCurrent ? Boolean(item.current) : index === lastIndex
          const showSeparator = index < lastIndex

          return (
            <Fragment key={index}>
              <li className={styles.item}>
                {isCurrent || !item.href ? (
                  <span
                    className={styles.current}
                    data-current={isCurrent ? 'true' : undefined}
                    aria-current={isCurrent ? 'page' : undefined}
                  >
                    {item.label}
                  </span>
                ) : (
                  <a {...item.linkProps} href={item.href} className={styles.link}>
                    {item.label}
                  </a>
                )}
              </li>
              {showSeparator ? (
                <li className={styles.separator} aria-hidden="true">
                  <ChevronRight />
                </li>
              ) : null}
            </Fragment>
          )
        })}
      </ol>
    </nav>
  )
})
