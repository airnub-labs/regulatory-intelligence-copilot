/**
 * Timeline Engine for Regulatory Intelligence Copilot
 *
 * Provides time-based reasoning over regulatory rules, windows, lock-ins, and eligibility periods.
 * All functions are pure and return both machine-usable results and human-readable descriptions.
 */

import type {
  Timeline,
  TimelineEngine,
  LookbackResult,
  LookbackCheckResult,
  LockInResult,
  LockInCheckResult,
  DateRange,
} from '../types.js';

/**
 * Format a date as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Add time window to a date
 */
function addWindow(date: Date, timeline: Timeline, subtract = false): Date {
  const result = new Date(date);
  const multiplier = subtract ? -1 : 1;

  if (timeline.window_years) {
    result.setFullYear(result.getFullYear() + timeline.window_years * multiplier);
  }
  if (timeline.window_months) {
    result.setMonth(result.getMonth() + timeline.window_months * multiplier);
  }
  if (timeline.window_days) {
    result.setDate(result.getDate() + timeline.window_days * multiplier);
  }

  return result;
}

/**
 * Generate human-readable description of window duration
 */
function describeWindow(timeline: Timeline): string {
  const parts: string[] = [];

  if (timeline.window_years) {
    parts.push(`${timeline.window_years} year${timeline.window_years === 1 ? '' : 's'}`);
  }
  if (timeline.window_months) {
    parts.push(`${timeline.window_months} month${timeline.window_months === 1 ? '' : 's'}`);
  }
  if (timeline.window_days) {
    parts.push(`${timeline.window_days} day${timeline.window_days === 1 ? '' : 's'}`);
  }

  if (parts.length === 0) {
    return 'unspecified duration';
  }

  return parts.join(', ');
}

/**
 * Compute the lookback range for a timeline node
 */
export function computeLookbackRange(timeline: Timeline, now: Date): LookbackResult {
  // Check if timeline has any window properties
  if (!timeline.window_days && !timeline.window_months && !timeline.window_years) {
    return {
      range: { start: now, end: now },
      description: `This timeline node ("${timeline.label}") doesn't define a concrete window; the rule may need more manual interpretation.`,
    };
  }

  const start = addWindow(now, timeline, true);
  const range: DateRange = { start, end: now };

  const windowDesc = describeWindow(timeline);
  const description =
    `This rule uses a ${windowDesc} lookback window (${formatDate(start)} to ${formatDate(now)}). ` +
    `Events within this period may be relevant to eligibility or calculations.`;

  return { range, description };
}

/**
 * Check if an event date falls within a lookback window
 */
export function isWithinLookback(
  eventDate: Date,
  timeline: Timeline,
  now: Date
): LookbackCheckResult {
  const { range, description: rangeDesc } = computeLookbackRange(timeline, now);

  const within = eventDate >= range.start && eventDate <= range.end;

  const windowDesc = describeWindow(timeline);
  const description = within
    ? `This rule uses a ${windowDesc} lookback window (${formatDate(range.start)} to ${formatDate(range.end)}). ` +
      `Your event date (${formatDate(eventDate)}) falls **within** that window.`
    : `This rule uses a ${windowDesc} lookback window (${formatDate(range.start)} to ${formatDate(range.end)}). ` +
      `Your event date (${formatDate(eventDate)}) falls **outside** that window.`;

  return { within, range, description };
}

/**
 * Compute when a lock-in period ends
 */
export function computeLockInEnd(triggerDate: Date, timeline: Timeline): LockInResult {
  // Check if timeline has any window properties
  if (!timeline.window_days && !timeline.window_months && !timeline.window_years) {
    return {
      end: triggerDate,
      description: `This timeline node ("${timeline.label}") doesn't define a concrete lock-in period; the rule may need more manual interpretation.`,
    };
  }

  const end = addWindow(triggerDate, timeline);
  const windowDesc = describeWindow(timeline);

  const description =
    `Claiming this relief appears to lock in your position for approximately ${windowDesc} ` +
    `from ${formatDate(triggerDate)}, to around ${formatDate(end)}, according to this rule.`;

  return { end, description };
}

/**
 * Check if a lock-in period is currently active
 */
export function isLockInActive(
  triggerDate: Date,
  timeline: Timeline,
  now: Date
): LockInCheckResult {
  const { end, description: lockInDesc } = computeLockInEnd(triggerDate, timeline);

  // Lock-in is active only if we're between start and end (inclusive)
  const active = now >= triggerDate && now <= end;
  const windowDesc = describeWindow(timeline);

  const description = now < triggerDate
    ? `The check date (${formatDate(now)}) is before the lock-in period started (${formatDate(triggerDate)}). ` +
      `The lock-in will run for ${windowDesc} once triggered, ending around ${formatDate(end)}.`
    : active
    ? `The lock-in period appears to still be active. ` +
      `It started on ${formatDate(triggerDate)} and runs for ${windowDesc}, ending around ${formatDate(end)}. ` +
      `Other options with mutual exclusions may not be available during this period.`
    : `The lock-in period appears to have ended. ` +
      `It started on ${formatDate(triggerDate)} and ran for ${windowDesc}, ending around ${formatDate(end)}. ` +
      `Options that were previously excluded may now be available.`;

  return { active, end, description };
}

/**
 * Create a TimelineEngine instance
 */
export function createTimelineEngine(): TimelineEngine {
  return {
    computeLookbackRange,
    isWithinLookback,
    computeLockInEnd,
    isLockInActive,
  };
}
