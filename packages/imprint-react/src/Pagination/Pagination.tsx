import { Pagination as ArkPagination, type PaginationPageChangeDetails } from '@ark-ui/react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { forwardRef } from 'react'

import styles from './Pagination.module.css'

export type { PaginationPageChangeDetails }

export interface PaginationProps {
  /** Total number of data items across all pages. */
  count: number
  /** Number of data items per page. @default 10 */
  pageSize?: number
  /** Initial page size for uncontrolled usage. @default 10 */
  defaultPageSize?: number
  /** Controlled active page (1-based). */
  page?: number
  /** Initial active page for uncontrolled usage. @default 1 */
  defaultPage?: number
  /** Fires when the active page changes. */
  onPageChange?: (details: PaginationPageChangeDetails) => void
  /** Number of pages to show beside the active page. @default 1 */
  siblingCount?: number
  /** Number of pages to show at the start and end. @default 1 */
  boundaryCount?: number
  /** Accessible label for the navigation landmark. @default 'Pagination' */
  ariaLabel?: string
  /** Accessible label for the previous-page trigger. @default 'Previous' */
  prevLabel?: string
  /** Accessible label for the next-page trigger. @default 'Next' */
  nextLabel?: string
  /** Id forwarded to the Ark root for composition. */
  id?: string
  /** Extra className merged onto the root element. */
  className?: string
}

/**
 * Imprint Pagination. Ark UI Pagination behavior (page math, prev/next edges,
 * ellipsis truncation, full ARIA wiring) skinned with Imprint tokens. Renders
 * a navigation landmark with chevron edge triggers, numbered page cells, and a
 * non-interactive ellipsis — 1:1 with the Imprint specimen. The active page is
 * surfaced via Ark's `data-selected` / `aria-current="page"`; edge triggers
 * expose `data-disabled` and the native `disabled` attribute at the bounds.
 *
 * The ref forwards to the underlying `<nav>` element.
 */
export const Pagination = forwardRef<HTMLElement, PaginationProps>(function Pagination(
  { ariaLabel = 'Pagination', prevLabel = 'Previous', nextLabel = 'Next', className, ...rest },
  ref
) {
  return (
    <ArkPagination.Root
      ref={ref}
      className={className ? `${styles.root} ${className}` : styles.root}
      translations={{ nextTriggerLabel: nextLabel, prevTriggerLabel: prevLabel, rootLabel: ariaLabel }}
      {...rest}
    >
      <ArkPagination.PrevTrigger className={`${styles.cell} ${styles.nav} ${styles.edge}`}>
        <ChevronLeft aria-hidden="true" />
      </ArkPagination.PrevTrigger>
      <ArkPagination.Context>
        {pagination =>
          pagination.pages.map((page, index) =>
            page.type === 'page' ? (
              <ArkPagination.Item key={page.value} {...page} className={styles.cell}>
                {page.value}
              </ArkPagination.Item>
            ) : (
              <ArkPagination.Ellipsis
                key={`ellipsis-${index}`}
                index={index}
                className={`${styles.cell} ${styles.dots}`}
              >
                &#8230;
              </ArkPagination.Ellipsis>
            )
          )
        }
      </ArkPagination.Context>
      <ArkPagination.NextTrigger className={`${styles.cell} ${styles.nav} ${styles.edge}`}>
        <ChevronRight aria-hidden="true" />
      </ArkPagination.NextTrigger>
    </ArkPagination.Root>
  )
})
