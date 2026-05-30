import type { CookieMeta, StoreRecord, StoreType } from '../types'
import { color } from './ansi'

const MAX_NAME = 36
const MAX_VALUE = 70
const MAX_ORIGIN = 48
const STORE_LABEL: Record<StoreType, string> = {
  cookie: 'Cookies',
  'local-storage': 'Local Storage'
}

export type ListView = {
  store: StoreType
  browser: string
  profile: string
  /** Max rows (detail) or origins (summary) to show; Infinity means no cap. */
  limit: number
  /** A domain filter is active, so show per-entry rows instead of an overview. */
  detail: boolean
  full?: boolean
}

export function renderList(records: StoreRecord[], view: ListView): void {
  if (records.length === 0) {
    process.stdout.write(`${color.dim('No records found.')}\n`)
    return
  }

  const lines = view.detail ? detailLines(records, view) : summaryLines(records, view)
  process.stdout.write(`${lines.join('\n')}\n`)
}

function summaryLines(records: StoreRecord[], view: ListView): string[] {
  const origins = countByOrigin(records)
  const lines = [header(view, records.length, origins.length), '']

  const shown = origins.slice(0, view.limit)
  const width = Math.min(MAX_ORIGIN, Math.max(...shown.map(([origin]) => truncate(origin, MAX_ORIGIN).length)))
  for (const [origin, count] of shown) {
    lines.push(`  ${color.cyan(truncate(origin, MAX_ORIGIN).padEnd(width))}  ${color.dim(String(count))}`)
  }

  const hidden = origins.length - shown.length
  if (hidden > 0) {
    lines.push(
      '',
      `  ${color.dim(`${hidden} more ${plural(hidden, 'origin', 'origins')} — narrow with --domain or use --all`)}`
    )
  }
  return lines
}

function detailLines(records: StoreRecord[], view: ListView): string[] {
  const groups = groupByOrigin(records)
  const lines = [header(view, records.length, groups.size), '']

  let shown = 0
  for (const [origin, group] of groups) {
    if (shown >= view.limit) {
      break
    }
    lines.push(`  ${color.cyan(origin)} ${color.dim(`(${group.length})`)}`)
    const width = Math.min(MAX_NAME, Math.max(...group.map(record => displayName(record).length)))
    for (const record of group) {
      if (shown >= view.limit) {
        break
      }
      lines.push(renderRow(record, width, view.full === true))
      shown++
    }
  }

  const hidden = records.length - shown
  if (hidden > 0) {
    lines.push('', `  ${color.dim(`… and ${hidden} more — raise --limit or use --all`)}`)
  }
  return lines
}

function header(view: ListView, total: number, originCount: number): string {
  const meta = [
    view.browser,
    view.profile,
    `${total} ${plural(total, 'entry', 'entries')}`,
    `${originCount} ${plural(originCount, 'origin', 'origins')}`
  ].join(' · ')
  return `${color.bold(STORE_LABEL[view.store])}  ${color.dim(meta)}`
}

export function renderDetail(record: StoreRecord): void {
  const lines: string[] = [
    '',
    `${color.bold(STORE_LABEL[record.store])}  ${color.cyan(record.origin)} ${color.dim('/')} ${record.name}`,
    `  ${color.dim('value'.padEnd(9))}${sanitize(record.value)}`
  ]

  if (record.meta.kind === 'cookie') {
    const meta = record.meta
    lines.push(detailLine('path', meta.path ?? '/'))
    lines.push(detailLine('secure', String(meta.secure === true)))
    lines.push(detailLine('httpOnly', String(meta.httpOnly === true)))
    lines.push(detailLine('sameSite', meta.sameSite ?? 'unspecified'))
    lines.push(detailLine('expires', meta.expires ?? 'session'))
  }

  lines.push(detailLine('profile', `${record.profile} (${record.browser})`))
  process.stdout.write(`${lines.join('\n')}\n`)
}

function detailLine(label: string, value: string): string {
  return `  ${color.dim(label.padEnd(9))}${value}`
}

function countByOrigin(records: StoreRecord[]): [string, number][] {
  const counts = new Map<string, number>()
  for (const record of records) {
    counts.set(record.origin, (counts.get(record.origin) ?? 0) + 1)
  }
  // Busiest origins first; alphabetical within ties so output is deterministic.
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

function groupByOrigin(records: StoreRecord[]): Map<string, StoreRecord[]> {
  const groups = new Map<string, StoreRecord[]>()
  for (const record of records) {
    const group = groups.get(record.origin)
    if (group) {
      group.push(record)
    } else {
      groups.set(record.origin, [record])
    }
  }
  for (const group of groups.values()) {
    group.sort((a, b) => displayName(a).localeCompare(displayName(b)))
  }
  return new Map([...groups].sort((a, b) => a[0].localeCompare(b[0])))
}

function renderRow(record: StoreRecord, width: number, full: boolean): string {
  const name = truncate(displayName(record), MAX_NAME).padEnd(width)
  const rawValue = sanitize(record.value)
  const value = full ? rawValue : truncate(rawValue, MAX_VALUE)
  const flags = record.meta.kind === 'cookie' ? cookieFlags(record.meta) : ''
  const suffix = flags ? `  ${color.dim(flags)}` : ''
  return `    ${name}  ${color.dim(value)}${suffix}`
}

function displayName(record: StoreRecord): string {
  return record.name === '' ? '(empty)' : record.name
}

function cookieFlags(meta: CookieMeta): string {
  const flags: string[] = []
  if (meta.secure) {
    flags.push('secure')
  }
  if (meta.httpOnly) {
    flags.push('httpOnly')
  }
  if (meta.sameSite && meta.sameSite !== 'unspecified') {
    flags.push(meta.sameSite)
  }
  return flags.join(' ')
}

function sanitize(value: string): string {
  let out = ''
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0
    out += code < 0x20 || code === 0x7f ? ' ' : ch
  }
  return out
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many
}
