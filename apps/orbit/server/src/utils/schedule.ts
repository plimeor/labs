import type { ScheduleType } from '@orbit/shared/types'
import { CronExpressionParser } from 'cron-parser'

/**
 * Calculate the next run time for a scheduled task.
 * Returns ISO timestamp string, or undefined if the schedule is invalid.
 */
export function calculateNextRun(scheduleType: ScheduleType, scheduleValue: string): string | undefined {
  if (scheduleType === 'cron') {
    try {
      const interval = CronExpressionParser.parse(scheduleValue)
      return interval.next().toDate().toISOString()
    } catch {
      return undefined
    }
  } else if (scheduleType === 'interval') {
    const ms = Number.parseInt(scheduleValue, 10)
    if (Number.isNaN(ms) || ms <= 0) return undefined
    return new Date(Date.now() + ms).toISOString()
  } else if (scheduleType === 'once') {
    const date = new Date(scheduleValue)
    if (Number.isNaN(date.getTime())) return undefined
    return date.toISOString()
  }
  return undefined
}
