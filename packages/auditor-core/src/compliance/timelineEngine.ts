import {
  type LookbackResult,
  type LookbackCheckResult,
  type LockInResult,
  type LockInCheckResult,
  type TimelineEngine,
  type TimelineNode,
  type DateRange,
} from './types.js';

function applyWindow(start: Date, timeline: TimelineNode): Date {
  const result = new Date(start);
  if (timeline.window_years) {
    result.setFullYear(result.getFullYear() + timeline.window_years);
  }
  if (timeline.window_months) {
    result.setMonth(result.getMonth() + timeline.window_months);
  }
  if (timeline.window_days) {
    result.setDate(result.getDate() + timeline.window_days);
  }
  return result;
}

function describeWindow(timeline: TimelineNode): string {
  const parts: string[] = [];
  if (timeline.window_years) parts.push(`${timeline.window_years} year${timeline.window_years > 1 ? 's' : ''}`);
  if (timeline.window_months) parts.push(`${timeline.window_months} month${timeline.window_months > 1 ? 's' : ''}`);
  if (timeline.window_days) parts.push(`${timeline.window_days} day${timeline.window_days > 1 ? 's' : ''}`);
  if (parts.length === 0) return 'an unspecified window';
  return parts.join(', ');
}

export class BasicTimelineEngine implements TimelineEngine {
  computeLookbackRange(timeline: TimelineNode, now: Date): LookbackResult {
    const end = now;
    const start = applyWindow(new Date(now), {
      ...timeline,
      window_years: timeline.window_years ? -timeline.window_years : undefined,
      window_months: timeline.window_months ? -timeline.window_months : undefined,
      window_days: timeline.window_days ? -timeline.window_days : undefined,
    });

    const description = `Lookback window ${timeline.label || ''} spans ${describeWindow(timeline)} ending at ${end.toISOString().split('T')[0]}. Start is approximately ${start.toISOString().split('T')[0]}.`;

    return {
      range: { start, end },
      description,
    } satisfies LookbackResult;
  }

  isWithinLookback(eventDate: Date, timeline: TimelineNode, now: Date): LookbackCheckResult {
    const lookback = this.computeLookbackRange(timeline, now);
    const within = eventDate >= lookback.range.start && eventDate <= lookback.range.end;
    const description = `${lookback.description} Event date ${eventDate.toISOString().split('T')[0]} is ${within ? 'within' : 'outside'} this window.`;

    return {
      within,
      range: lookback.range,
      description,
    } satisfies LookbackCheckResult;
  }

  computeLockInEnd(triggerDate: Date, timeline: TimelineNode): LockInResult {
    const end = applyWindow(new Date(triggerDate), timeline);
    const description = `${timeline.label || 'Lock-in'} lasts for ${describeWindow(timeline)} starting ${triggerDate.toISOString().split('T')[0]}, ending around ${end.toISOString().split('T')[0]}.`;

    return {
      end,
      description,
    } satisfies LockInResult;
  }

  isLockInActive(triggerDate: Date, timeline: TimelineNode, now: Date): LockInCheckResult {
    const lockIn = this.computeLockInEnd(triggerDate, timeline);
    const active = now <= lockIn.end;
    const description = `${lockIn.description} As of ${now.toISOString().split('T')[0]}, the lock-in is ${active ? 'still active' : 'likely elapsed'}.`;

    return {
      active,
      end: lockIn.end,
      description,
    } satisfies LockInCheckResult;
  }
}

export function formatDateRange(range: DateRange): string {
  const start = range.start.toISOString().split('T')[0];
  const end = range.end.toISOString().split('T')[0];
  return `${start} → ${end}`;
}
