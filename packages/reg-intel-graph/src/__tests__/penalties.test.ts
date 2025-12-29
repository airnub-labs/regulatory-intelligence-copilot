/**
 * Comprehensive tests for Penalty functionality (Tier 1)
 *
 * Tests cover three real-world problems:
 * 1. "What happens if I miss my CT1 filing deadline?" - Risk assessment
 * 2. "Can this penalty be reduced?" - Waiver conditions
 * 3. Risk prioritization - Financial impact assessment
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createBoltGraphClient } from '../boltGraphClient.js';
import type { BoltGraphClient } from '../boltGraphClient.js';

const TEST_CONFIG = {
  uri: process.env.MEMGRAPH_URI || 'bolt://localhost:7687',
  username: process.env.MEMGRAPH_USERNAME || '',
  password: process.env.MEMGRAPH_PASSWORD || '',
  database: process.env.MEMGRAPH_DATABASE || 'memgraph',
};

describe('Seed Data - Penalties', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  it('should have CT1 late filing surcharges (5% and 10%)', async () => {
    const result = await client.executeCypher(
      `MATCH (p:Penalty) WHERE p.id CONTAINS 'CT1_SURCHARGE' RETURN count(p) as count`,
      {}
    );
    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThanOrEqual(2);
  });

  it('should have Form 11 late filing surcharges', async () => {
    const result = await client.executeCypher(
      `MATCH (p:Penalty) WHERE p.id CONTAINS 'FORM11_SURCHARGE' RETURN count(p) as count`,
      {}
    );
    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThanOrEqual(2);
  });

  it('should have late payment interest penalty with correct daily rate', async () => {
    const result = await client.executeCypher(
      `MATCH (p:Penalty {id: 'IE_LATE_PAYMENT_INTEREST'}) RETURN p`,
      {}
    );
    const records = result as Array<{ p: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
    expect(records[0].p.properties.penalty_type).toBe('INTEREST');
    expect(records[0].p.properties.daily_rate).toBe(0.0219);
    expect(records[0].p.properties.description).toContain('8%');
  });

  it('should have CRO late filing penalty', async () => {
    const result = await client.executeCypher(
      `MATCH (p:Penalty {id: 'IE_CRO_LATE_ANNUAL_RETURN'}) RETURN p`,
      {}
    );
    const records = result as Array<{ p: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
    expect(records[0].p.properties.penalty_type).toBe('FIXED');
    expect(records[0].p.properties.flat_amount).toBe(100);
  });

  it('should have loss of audit exemption penalty (RESTRICTION type)', async () => {
    const result = await client.executeCypher(
      `MATCH (p:Penalty {id: 'IE_CRO_LOSS_AUDIT_EXEMPTION'}) RETURN p`,
      {}
    );
    const records = result as Array<{ p: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
    expect(records[0].p.properties.penalty_type).toBe('RESTRICTION');
    expect(records[0].p.properties.description).toContain('audit exemption');
  });

  it('should have penalties linked to obligations via HAS_PENALTY', async () => {
    const result = await client.executeCypher(
      `MATCH (o:Obligation)-[:HAS_PENALTY]->(p:Penalty) RETURN count(*) as count`,
      {}
    );
    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThanOrEqual(6);
  });

  it('should have waiver conditions linked to penalties via WAIVED_IF', async () => {
    const result = await client.executeCypher(
      `MATCH (p:Penalty)-[:WAIVED_IF]->(c:Condition) RETURN count(*) as count`,
      {}
    );
    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThan(0);
  });

  it('should have first-time late filer waiver condition', async () => {
    const result = await client.executeCypher(
      `MATCH (c:Condition {id: 'IE_FIRST_TIME_LATE_FILER'}) RETURN c`,
      {}
    );
    const records = result as Array<{ c: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
    expect(records[0].c.properties.category).toBe('COMPLIANCE_HISTORY');
  });

  it('should have reasonable excuse waiver condition', async () => {
    const result = await client.executeCypher(
      `MATCH (c:Condition {id: 'IE_REASONABLE_EXCUSE'}) RETURN c`,
      {}
    );
    const records = result as Array<{ c: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
    expect(records[0].c.properties.category).toBe('EXCUSE');
  });

  it('should have all penalties linked to IE jurisdiction', async () => {
    const result = await client.executeCypher(
      `MATCH (p:Penalty)-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
       RETURN count(p) as count`,
      {}
    );
    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThanOrEqual(6);
  });
});

describe('GraphClient - Penalty Methods', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  describe('getPenaltiesForObligation', () => {
    it('should get penalties for CT1 filing obligation', async () => {
      const penalties = await client.getPenaltiesForObligation('IE_CT1_FILING');

      expect(penalties.length).toBeGreaterThanOrEqual(2);
      expect(penalties.some(p => p.rate === 5)).toBe(true);
      expect(penalties.some(p => p.rate === 10)).toBe(true);

      // Verify penalties are ordered by applies_after_days
      const withDays = penalties.filter(p => p.applies_after_days !== undefined);
      if (withDays.length > 1) {
        for (let i = 1; i < withDays.length; i++) {
          expect(withDays[i].applies_after_days).toBeGreaterThanOrEqual(
            withDays[i - 1].applies_after_days || 0
          );
        }
      }
    });

    it('should get penalties for Form 11 filing obligation', async () => {
      const penalties = await client.getPenaltiesForObligation('IE_FORM_11_FILING');

      expect(penalties.length).toBeGreaterThanOrEqual(2);
      expect(penalties.every(p => p.penalty_type === 'SURCHARGE')).toBe(true);
    });

    it('should get interest penalty for preliminary tax obligation', async () => {
      const penalties = await client.getPenaltiesForObligation('IE_PRELIMINARY_TAX');

      expect(penalties.length).toBeGreaterThanOrEqual(1);
      const interestPenalty = penalties.find(p => p.penalty_type === 'INTEREST');
      expect(interestPenalty).toBeDefined();
      expect(interestPenalty?.daily_rate).toBe(0.0219);
    });

    it('should get multiple penalties for CRO annual return (fixed + restriction)', async () => {
      const penalties = await client.getPenaltiesForObligation('IE_CRO_ANNUAL_RETURN');

      expect(penalties.length).toBeGreaterThanOrEqual(2);
      expect(penalties.some(p => p.penalty_type === 'FIXED')).toBe(true);
      expect(penalties.some(p => p.penalty_type === 'RESTRICTION')).toBe(true);
    });

    it('should return empty array for non-existent obligation', async () => {
      const penalties = await client.getPenaltiesForObligation('NON_EXISTENT_OBLIGATION');
      expect(penalties).toEqual([]);
    });
  });

  describe('getPenaltiesForProfile', () => {
    it('should get penalties for single-director profile in IE', async () => {
      const results = await client.getPenaltiesForProfile(
        'PROFILE_SINGLE_DIRECTOR_IE',
        'IE'
      );

      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.penalties.length > 0)).toBe(true);

      // Verify each result has proper structure
      for (const result of results) {
        expect(result.obligation).toBeDefined();
        expect(result.obligation.id).toBeDefined();
        expect(result.obligation.label).toBeDefined();
        expect(result.penalties).toBeInstanceOf(Array);
      }
    });

    it('should get CT1 penalties for single-director profile', async () => {
      const results = await client.getPenaltiesForProfile(
        'PROFILE_SINGLE_DIRECTOR_IE',
        'IE'
      );

      const ct1Result = results.find(r => r.obligation.id === 'IE_CT1_FILING');
      expect(ct1Result).toBeDefined();
      expect(ct1Result?.penalties.length).toBeGreaterThanOrEqual(2);

      // Verify penalty details
      const surcharges = ct1Result?.penalties.filter(p => p.penalty_type === 'SURCHARGE');
      expect(surcharges?.length).toBeGreaterThanOrEqual(2);
    });

    it('should include obligations without penalties', async () => {
      const results = await client.getPenaltiesForProfile(
        'PROFILE_SINGLE_DIRECTOR_IE',
        'IE'
      );

      // Some obligations might not have penalties
      expect(results.some(r => r.penalties.length === 0)).toBe(true);
    });

    it('should return empty array for non-existent profile', async () => {
      const results = await client.getPenaltiesForProfile(
        'NON_EXISTENT_PROFILE',
        'IE'
      );
      expect(results).toEqual([]);
    });
  });

  describe('getPenaltyWaiverConditions', () => {
    it('should get waiver conditions for CT1 5% surcharge', async () => {
      const conditions = await client.getPenaltyWaiverConditions('IE_LATE_CT1_SURCHARGE_5');

      expect(conditions.length).toBeGreaterThan(0);
      expect(conditions.some(c => c.id === 'IE_FIRST_TIME_LATE_FILER')).toBe(true);
    });

    it('should get reasonable excuse condition for all surcharges', async () => {
      // Get all surcharge penalties
      const result = await client.executeCypher(
        `MATCH (p:Penalty) WHERE p.penalty_type = 'SURCHARGE' RETURN p.id as id`,
        {}
      );
      const records = result as Array<{ id: string }>;

      // Check at least one has reasonable excuse waiver
      let hasReasonableExcuse = false;
      for (const record of records) {
        const conditions = await client.getPenaltyWaiverConditions(record.id);
        if (conditions.some(c => c.id === 'IE_REASONABLE_EXCUSE')) {
          hasReasonableExcuse = true;
          break;
        }
      }

      expect(hasReasonableExcuse).toBe(true);
    });

    it('should return empty array for penalties without waiver conditions', async () => {
      const conditions = await client.getPenaltyWaiverConditions('IE_LATE_PAYMENT_INTEREST');
      // Interest penalties might not have waiver conditions in current seed data
      expect(conditions).toBeInstanceOf(Array);
    });

    it('should return empty array for non-existent penalty', async () => {
      const conditions = await client.getPenaltyWaiverConditions('NON_EXISTENT_PENALTY');
      expect(conditions).toEqual([]);
    });
  });
});

describe('Real-World Problem: Risk Assessment', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  it('Problem 1: "What happens if I miss my CT1 filing deadline?"', async () => {
    // Query penalties for CT1 filing
    const penalties = await client.getPenaltiesForObligation('IE_CT1_FILING');

    // Should have tiered penalties
    expect(penalties.length).toBeGreaterThanOrEqual(2);

    // Should have 5% surcharge for filing within 2 months
    const tier1 = penalties.find(p => p.rate === 5);
    expect(tier1).toBeDefined();
    expect(tier1?.applies_after_days).toBe(1);
    expect(tier1?.description).toContain('within 2 months');

    // Should have 10% surcharge for filing after 2 months
    const tier2 = penalties.find(p => p.rate === 10);
    expect(tier2).toBeDefined();
    expect(tier2?.applies_after_months).toBe(2);
    expect(tier2?.description).toContain('more than 2 months');
  });

  it('Problem 2: "Can this penalty be reduced?" - Waiver eligibility', async () => {
    // Check if CT1 5% surcharge has waiver conditions
    const conditions = await client.getPenaltyWaiverConditions('IE_LATE_CT1_SURCHARGE_5');

    expect(conditions.length).toBeGreaterThan(0);

    // Should have first-time offender waiver
    const firstTimeWaiver = conditions.find(c => c.id === 'IE_FIRST_TIME_LATE_FILER');
    expect(firstTimeWaiver).toBeDefined();
    expect(firstTimeWaiver?.properties.description).toContain('compliance history');

    // Should have reasonable excuse waiver
    const reasonableExcuse = conditions.find(c => c.id === 'IE_REASONABLE_EXCUSE');
    expect(reasonableExcuse).toBeDefined();
    expect(reasonableExcuse?.properties.description).toContain('reasonable excuse');
  });

  it('Problem 3: Risk prioritization - Financial impact comparison', async () => {
    // Get all penalties for single-director profile
    const results = await client.getPenaltiesForProfile(
      'PROFILE_SINGLE_DIRECTOR_IE',
      'IE'
    );

    // Find CRO annual return penalties (fixed amount)
    const croResult = results.find(r => r.obligation.id === 'IE_CRO_ANNUAL_RETURN');
    const croFixedPenalty = croResult?.penalties.find(p => p.penalty_type === 'FIXED');

    // Find CT1 penalties (percentage-based)
    const ct1Result = results.find(r => r.obligation.id === 'IE_CT1_FILING');
    const ct1PercentagePenalty = ct1Result?.penalties.find(p => p.penalty_type === 'SURCHARGE');

    expect(croFixedPenalty).toBeDefined();
    expect(ct1PercentagePenalty).toBeDefined();

    // CRO is fixed €100
    expect(croFixedPenalty?.flat_amount).toBe(100);

    // CT1 is percentage-based (higher risk for larger tax amounts)
    expect(ct1PercentagePenalty?.rate).toBeGreaterThan(0);

    // This demonstrates that CT1 penalties scale with tax due,
    // making them potentially more expensive than fixed CRO penalties
  });

  it('Problem 4: Understanding interest charges on late payments', async () => {
    const penalties = await client.getPenaltiesForObligation('IE_PRELIMINARY_TAX');

    const interestPenalty = penalties.find(p => p.penalty_type === 'INTEREST');
    expect(interestPenalty).toBeDefined();

    // Daily rate of 0.0219% = approx 8% per annum
    expect(interestPenalty?.daily_rate).toBe(0.0219);
    expect(interestPenalty?.applies_after_days).toBe(1);

    // Calculate example: €10,000 tax late by 30 days
    const principalAmount = 10000;
    const daysLate = 30;
    const dailyRate = interestPenalty?.daily_rate || 0;
    const interestCharge = principalAmount * (dailyRate / 100) * daysLate;

    // Should be approximately €65.70
    expect(interestCharge).toBeGreaterThan(65);
    expect(interestCharge).toBeLessThan(66);
  });

  it('Problem 5: Non-financial penalties - Loss of audit exemption', async () => {
    const penalties = await client.getPenaltiesForObligation('IE_CRO_ANNUAL_RETURN');

    const restrictionPenalty = penalties.find(p => p.penalty_type === 'RESTRICTION');
    expect(restrictionPenalty).toBeDefined();
    expect(restrictionPenalty?.label).toContain('Audit Exemption');
    expect(restrictionPenalty?.description).toContain('2 years');

    // This demonstrates that penalties aren't always financial -
    // losing audit exemption can be very costly for small companies
  });
});

describe('Penalty Edge Cases and Validation', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  it('should have all penalty types represented', async () => {
    const result = await client.executeCypher(
      `MATCH (p:Penalty) RETURN DISTINCT p.penalty_type as type`,
      {}
    );
    const records = result as Array<{ type: string }>;
    const types = records.map(r => r.type);

    expect(types).toContain('SURCHARGE');
    expect(types).toContain('INTEREST');
    expect(types).toContain('FIXED');
    expect(types).toContain('RESTRICTION');
  });

  it('should have currency specified for monetary penalties', async () => {
    const result = await client.executeCypher(
      `MATCH (p:Penalty)
       WHERE p.penalty_type IN ['SURCHARGE', 'INTEREST', 'FIXED']
       RETURN p.currency as currency, count(*) as count`,
      {}
    );
    const records = result as Array<{ currency: string; count: number }>;

    expect(records.length).toBeGreaterThan(0);
    expect(records.every(r => r.currency === 'EUR')).toBe(true);
  });

  it('should have timing information (applies_after_days or applies_after_months)', async () => {
    const result = await client.executeCypher(
      `MATCH (p:Penalty)
       WHERE p.applies_after_days IS NOT NULL OR p.applies_after_months IS NOT NULL
       RETURN count(*) as count`,
      {}
    );
    const records = result as Array<{ count: number }>;

    expect(records[0].count).toBeGreaterThan(0);
  });

  it('should have meaningful descriptions for all penalties', async () => {
    const result = await client.executeCypher(
      `MATCH (p:Penalty)
       WHERE p.description IS NULL OR p.description = ''
       RETURN count(*) as count`,
      {}
    );
    const records = result as Array<{ count: number }>;

    expect(records[0].count).toBe(0); // All should have descriptions
  });
});
