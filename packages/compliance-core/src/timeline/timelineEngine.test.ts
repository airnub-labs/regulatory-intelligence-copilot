/**
 * Timeline Engine Tests
 *
 * Comprehensive tests for timeline-based regulatory reasoning:
 * - Lookback window calculations
 * - Lock-in period calculations
 * - Date range checks
 * - Edge cases and boundary conditions
 */

import { describe, it, expect } from 'vitest';
import {
  computeLookbackRange,
  isWithinLookback,
  computeLockInEnd,
  isLockInActive,
} from './timelineEngine.js';
import type { Timeline } from '../types.js';

describe('Timeline Engine', () => {
  describe('computeLookbackRange', () => {
    it('should compute 2-year lookback correctly', () => {
      const timeline: Timeline = {
        id: 'test-2y',
        label: '2-Year Lookback',
        window_years: 2,
      };

      const now = new Date('2024-01-15');
      const result = computeLookbackRange(timeline, now);

      expect(result.range.start).toEqual(new Date('2022-01-15'));
      expect(result.range.end).toEqual(now);
      expect(result.description).toContain('2 years');
      expect(result.description).toContain('2022-01-15');
      expect(result.description).toContain('2024-01-15');
    });

    it('should compute 12-month lookback correctly', () => {
      const timeline: Timeline = {
        id: 'test-12m',
        label: '12-Month Lookback',
        window_months: 12,
      };

      const now = new Date('2024-06-30');
      const result = computeLookbackRange(timeline, now);

      expect(result.range.start).toEqual(new Date('2023-06-30'));
      expect(result.range.end).toEqual(now);
      expect(result.description).toContain('12 months');
    });

    it('should compute 39-week (273 day) lookback correctly', () => {
      const timeline: Timeline = {
        id: 'test-39w',
        label: '39-Week Lookback',
        window_days: 273,
      };

      const now = new Date('2024-01-01');
      const result = computeLookbackRange(timeline, now);

      const expectedStart = new Date('2024-01-01');
      expectedStart.setDate(expectedStart.getDate() - 273);

      expect(result.range.start).toEqual(expectedStart);
      expect(result.range.end).toEqual(now);
      expect(result.description).toContain('273 days');
    });

    it('should handle combined periods (years + months + days)', () => {
      const timeline: Timeline = {
        id: 'test-combined',
        label: 'Combined Period',
        window_years: 1,
        window_months: 6,
        window_days: 15,
      };

      const now = new Date('2024-12-31');
      const result = computeLookbackRange(timeline, now);

      const expectedStart = new Date('2024-12-31');
      expectedStart.setFullYear(expectedStart.getFullYear() - 1);
      expectedStart.setMonth(expectedStart.getMonth() - 6);
      expectedStart.setDate(expectedStart.getDate() - 15);

      expect(result.range.start).toEqual(expectedStart);
      expect(result.description).toContain('1 year');
      expect(result.description).toContain('6 months');
      expect(result.description).toContain('15 days');
    });

    it('should handle timeline with no window specified', () => {
      const timeline: Timeline = {
        id: 'test-empty',
        label: 'No Window',
      };

      const now = new Date('2024-01-01');
      const result = computeLookbackRange(timeline, now);

      expect(result.range.start).toEqual(now);
      expect(result.range.end).toEqual(now);
      expect(result.description).toContain('doesn\'t define a concrete window');
    });

    it('should handle leap years correctly', () => {
      const timeline: Timeline = {
        id: 'test-leap',
        label: 'Leap Year Test',
        window_years: 1,
      };

      const now = new Date('2024-02-29'); // Leap year
      const result = computeLookbackRange(timeline, now);

      // JavaScript Date handles leap year automatically - Feb 29 2024 minus 1 year = Feb 28/Mar 1 2023
      // The actual behavior depends on implementation
      expect(result.range.end).toEqual(now);
      expect(result.range.start.getFullYear()).toBe(2023);
    });
  });

  describe('isWithinLookback', () => {
    const timeline: Timeline = {
      id: 'test-2y',
      label: '2-Year Lookback',
      window_years: 2,
    };

    const now = new Date('2024-01-15');

    it('should return true for event within lookback window', () => {
      const eventDate = new Date('2023-06-01');
      const result = isWithinLookback(eventDate, timeline, now);

      expect(result.within).toBe(true);
      expect(result.description).toContain('within');
    });

    it('should return false for event before lookback window', () => {
      const eventDate = new Date('2021-01-01');
      const result = isWithinLookback(eventDate, timeline, now);

      expect(result.within).toBe(false);
      expect(result.description).toContain('outside');
    });

    it('should return false for event after reference date', () => {
      const eventDate = new Date('2024-06-01');
      const result = isWithinLookback(eventDate, timeline, now);

      expect(result.within).toBe(false);
      expect(result.description).toContain('outside');
    });

    it('should handle boundary dates correctly (start of window)', () => {
      const eventDate = new Date('2022-01-15'); // Exactly 2 years ago
      const result = isWithinLookback(eventDate, timeline, now);

      expect(result.within).toBe(true);
    });

    it('should handle boundary dates correctly (end of window)', () => {
      const eventDate = now; // Same as reference date
      const result = isWithinLookback(eventDate, timeline, now);

      expect(result.within).toBe(true);
    });
  });

  describe('computeLockInEnd', () => {
    it('should compute 4-year lock-in end date', () => {
      const timeline: Timeline = {
        id: 'test-4y',
        label: '4-Year Lock-in',
        window_years: 4,
      };

      const startDate = new Date('2020-01-01');
      const result = computeLockInEnd(startDate, timeline);

      expect(result.end).toEqual(new Date('2024-01-01'));
      expect(result.description).toContain('4 years');
      expect(result.description).toContain('2020-01-01');
      expect(result.description).toContain('2024-01-01');
    });

    it('should compute lock-in with months', () => {
      const timeline: Timeline = {
        id: 'test-18m',
        label: '18-Month Lock-in',
        window_months: 18,
      };

      const startDate = new Date('2023-01-01');
      const result = computeLockInEnd(startDate, timeline);

      expect(result.end).toEqual(new Date('2024-07-01'));
      expect(result.description).toContain('18 months');
    });

    it('should handle combined lock-in periods', () => {
      const timeline: Timeline = {
        id: 'test-combined-lock',
        label: 'Combined Lock-in',
        window_years: 2,
        window_months: 6,
        window_days: 15,
      };

      const startDate = new Date('2020-01-01');
      const result = computeLockInEnd(startDate, timeline);

      const expectedEnd = new Date('2020-01-01');
      expectedEnd.setFullYear(expectedEnd.getFullYear() + 2);
      expectedEnd.setMonth(expectedEnd.getMonth() + 6);
      expectedEnd.setDate(expectedEnd.getDate() + 15);

      expect(result.end).toEqual(expectedEnd);
    });
  });

  describe('isLockInActive', () => {
    const timeline: Timeline = {
      id: 'test-4y-lock',
      label: '4-Year Lock-in',
      window_years: 4,
    };

    const startDate = new Date('2020-01-01');

    it('should return true when lock-in is active', () => {
      const checkDate = new Date('2022-06-15');
      const result = isLockInActive(startDate, timeline, checkDate);

      expect(result.active).toBe(true);
      expect(result.description).toContain('active');
    });

    it('should return false when lock-in has expired', () => {
      const checkDate = new Date('2025-01-01');
      const result = isLockInActive(startDate, timeline, checkDate);

      expect(result.active).toBe(false);
      expect(result.description).toContain('ended');
    });

    it('should return false when check date is before start', () => {
      const checkDate = new Date('2019-01-01');
      const result = isLockInActive(startDate, timeline, checkDate);

      expect(result.active).toBe(false);
    });

    it('should handle boundary date at lock-in end', () => {
      const checkDate = new Date('2024-01-01'); // Exactly at lock-in end
      const result = isLockInActive(startDate, timeline, checkDate);

      expect(result.active).toBe(true); // Lock-in is active until the end date
    });

    it('should handle boundary date at lock-in start', () => {
      const checkDate = startDate; // Exactly at start
      const result = isLockInActive(startDate, timeline, checkDate);

      expect(result.active).toBe(true);
    });
  });

  describe('Real-world scenarios', () => {
    describe('PRSI contribution lookback (Ireland)', () => {
      it('should correctly evaluate 104-week contribution requirement', () => {
        const timeline: Timeline = {
          id: 'prsi-104-week',
          label: '104-Week (2-Year) Lookback',
          window_years: 2,
          notes: 'Minimum PRSI contribution requirement for Jobseeker\'s Benefit',
        };

        const claimDate = new Date('2024-01-15');
        const contributionDate = new Date('2022-06-01');

        const result = isWithinLookback(contributionDate, timeline, claimDate);

        expect(result.within).toBe(true);
        expect(result.description).toContain('within');
      });

      it('should correctly evaluate 39-week recent contribution requirement', () => {
        const timeline: Timeline = {
          id: 'prsi-39-week',
          label: '39-Week Recent Contributions',
          window_days: 273, // 39 weeks
          notes: 'Recent contribution requirement for Jobseeker\'s Benefit',
        };

        const claimDate = new Date('2024-01-15');
        const recentContribution = new Date('2023-09-01');

        const result = isWithinLookback(recentContribution, timeline, claimDate);

        expect(result.within).toBe(true);
      });
    });

    describe('Tax relief lock-in periods', () => {
      it('should enforce 4-year R&D credit lock-in', () => {
        const timeline: Timeline = {
          id: 'rd-lock-in',
          label: 'R&D Credit Lock-in',
          window_years: 4,
          notes: 'Must maintain R&D activities for 4 years',
        };

        const claimStartDate = new Date('2020-01-01');
        const checkDate = new Date('2022-06-01');

        const result = isLockInActive(claimStartDate, timeline, checkDate);

        expect(result.active).toBe(true);
        expect(result.description).toContain('active');
      });
    });

    describe('Edge cases', () => {
      it('should handle same-day lookback check', () => {
        const timeline: Timeline = {
          id: 'same-day',
          label: 'Same-Day Window',
          window_days: 0,
        };

        const date = new Date('2024-01-01');
        const result = isWithinLookback(date, timeline, date);

        expect(result.within).toBe(true);
      });

      it('should handle very long lookback periods', () => {
        const timeline: Timeline = {
          id: 'lifetime',
          label: 'Lifetime Contributions',
          window_years: 50,
        };

        const now = new Date('2024-01-01');
        const result = computeLookbackRange(timeline, now);

        expect(result.range.start).toEqual(new Date('1974-01-01'));
        expect(result.range.end).toEqual(now);
      });

      it('should handle fractional years correctly', () => {
        const timeline: Timeline = {
          id: 'frac-year',
          label: 'Fractional Year',
          window_months: 18, // 1.5 years
        };

        const now = new Date('2024-07-15');
        const result = computeLookbackRange(timeline, now);

        expect(result.range.start).toEqual(new Date('2023-01-15'));
      });
    });
  });
});
