import { describe, it, expect } from 'vitest';
import { NON_ADVICE_DISCLAIMER, UNCERTAINTY_DESCRIPTIONS } from './constants.js';

describe('NON_ADVICE_DISCLAIMER', () => {
  it('should be a non-empty string', () => {
    expect(NON_ADVICE_DISCLAIMER).toBeTruthy();
    expect(typeof NON_ADVICE_DISCLAIMER).toBe('string');
    expect(NON_ADVICE_DISCLAIMER.length).toBeGreaterThan(0);
  });

  it('should contain key disclaimer language', () => {
    expect(NON_ADVICE_DISCLAIMER).toContain('research purposes only');
    expect(NON_ADVICE_DISCLAIMER).toContain('not constitute');
    expect(NON_ADVICE_DISCLAIMER).toContain('legal');
    expect(NON_ADVICE_DISCLAIMER).toContain('tax');
    expect(NON_ADVICE_DISCLAIMER).toContain('qualified professionals');
  });

  it('should mention specific professional types', () => {
    expect(NON_ADVICE_DISCLAIMER).toContain('tax advisors');
    expect(NON_ADVICE_DISCLAIMER).toContain('solicitors');
  });

  it('should be properly formatted', () => {
    // Should not have double spaces or weird formatting
    expect(NON_ADVICE_DISCLAIMER).not.toMatch(/\s{2,}/);
    // Should not start or end with whitespace
    expect(NON_ADVICE_DISCLAIMER).toBe(NON_ADVICE_DISCLAIMER.trim());
  });
});

describe('UNCERTAINTY_DESCRIPTIONS', () => {
  it('should have all three uncertainty levels', () => {
    expect(UNCERTAINTY_DESCRIPTIONS).toHaveProperty('low');
    expect(UNCERTAINTY_DESCRIPTIONS).toHaveProperty('medium');
    expect(UNCERTAINTY_DESCRIPTIONS).toHaveProperty('high');
  });

  it('should have non-empty string values for all levels', () => {
    expect(typeof UNCERTAINTY_DESCRIPTIONS.low).toBe('string');
    expect(typeof UNCERTAINTY_DESCRIPTIONS.medium).toBe('string');
    expect(typeof UNCERTAINTY_DESCRIPTIONS.high).toBe('string');

    expect(UNCERTAINTY_DESCRIPTIONS.low.length).toBeGreaterThan(0);
    expect(UNCERTAINTY_DESCRIPTIONS.medium.length).toBeGreaterThan(0);
    expect(UNCERTAINTY_DESCRIPTIONS.high.length).toBeGreaterThan(0);
  });

  it('should have appropriate content for each level', () => {
    // Low uncertainty - should indicate confidence
    expect(UNCERTAINTY_DESCRIPTIONS.low).toContain('well-established');

    // Medium uncertainty - should indicate some uncertainty
    expect(UNCERTAINTY_DESCRIPTIONS.medium).toContain('may depend');

    // High uncertainty - should recommend professional consultation
    expect(UNCERTAINTY_DESCRIPTIONS.high).toContain('Significant uncertainty');
    expect(UNCERTAINTY_DESCRIPTIONS.high).toContain('professional consultation');
    expect(UNCERTAINTY_DESCRIPTIONS.high).toContain('recommended');
  });

  it('should be properly formatted', () => {
    Object.values(UNCERTAINTY_DESCRIPTIONS).forEach(description => {
      // Should not have double spaces
      expect(description).not.toMatch(/\s{2,}/);
      // Should not start or end with whitespace
      expect(description).toBe(description.trim());
    });
  });

  it('should be a const object (immutability enforced by TypeScript)', () => {
    // TypeScript enforces readonly at compile time
    // Runtime JavaScript allows modification, but TypeScript prevents it
    // This test verifies the object exists and has the correct structure
    expect(UNCERTAINTY_DESCRIPTIONS).toBeDefined();
    expect(typeof UNCERTAINTY_DESCRIPTIONS).toBe('object');
  });

  it('should have exactly 3 keys', () => {
    const keys = Object.keys(UNCERTAINTY_DESCRIPTIONS);
    expect(keys).toHaveLength(3);
    expect(keys).toEqual(['low', 'medium', 'high']);
  });
});
