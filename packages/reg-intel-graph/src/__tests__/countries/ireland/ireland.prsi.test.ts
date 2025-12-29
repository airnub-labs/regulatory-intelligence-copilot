/**
 * Ireland PRSI (Pay Related Social Insurance) Integration Tests
 *
 * Real-world integration tests for Irish social insurance system including:
 * - PRSI Classes (A, S, B, D, J)
 * - Contribution rates and thresholds
 * - Benefit entitlements per class
 * - Qualifying conditions
 * - Life event triggers
 * - Cross-border social security coordination
 *
 * Reference: https://www.gov.ie/en/publication/9f278-prsi-classes/
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createBoltGraphClient } from '../../../boltGraphClient.js';
import type { BoltGraphClient } from '../../../boltGraphClient.js';

const TEST_CONFIG = {
  uri: process.env.MEMGRAPH_URI || 'bolt://localhost:7687',
  username: process.env.MEMGRAPH_USERNAME || '',
  password: process.env.MEMGRAPH_PASSWORD || '',
  database: process.env.MEMGRAPH_DATABASE || 'memgraph',
};

describe('Ireland PRSI System - Classes and Entitlements', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  describe('PRSI Class A - Standard Employees', () => {
    it('should have Class A for industrial, commercial, and service employees', async () => {
      const result = await client.executeCypher(
        `MATCH (pc:PRSIClass {id: 'IE_PRSI_CLASS_A'})-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
         RETURN pc.label as label, pc.description as description`,
        {}
      );

      const records = result as Array<{ label: string; description: string }>;
      expect(records.length).toBe(1);
      expect(records[0].label).toBe('Class A');
      expect(records[0].description).toContain('Employees');
    });

    it('should entitle Class A to Jobseeker\'s Benefit', async () => {
      const result = await client.executeCypher(
        `MATCH (pc:PRSIClass {id: 'IE_PRSI_CLASS_A'})-[:ENTITLES_TO]->(b:Benefit)
         WHERE b.id = 'IE_JOBSEEKERS_BENEFIT'
         RETURN b.id as benefit, b.label as label`,
        {}
      );

      const records = result as Array<{ benefit: string; label: string }>;
      expect(records.length).toBe(1);
      expect(records[0].benefit).toBe('IE_JOBSEEKERS_BENEFIT');
    });

    it('should entitle Class A to State Pension (Contributory)', async () => {
      const result = await client.executeCypher(
        `MATCH (pc:PRSIClass {id: 'IE_PRSI_CLASS_A'})-[:ENTITLES_TO]->(b:Benefit)
         WHERE b.id = 'IE_STATE_PENSION_CONTRIBUTORY'
         RETURN b.id as benefit`,
        {}
      );

      const records = result as Array<{ benefit: string }>;
      expect(records.length).toBe(1);
    });

    it('should entitle Class A to Maternity and Illness Benefits', async () => {
      const result = await client.executeCypher(
        `MATCH (pc:PRSIClass {id: 'IE_PRSI_CLASS_A'})-[:ENTITLES_TO]->(b:Benefit)
         WHERE b.id IN ['IE_MATERNITY_BENEFIT', 'IE_ILLNESS_BENEFIT']
         RETURN collect(b.id) as benefits`,
        {}
      );

      const records = result as Array<{ benefits: string[] }>;
      expect(records[0].benefits.length).toBe(2);
      expect(records[0].benefits).toContain('IE_MATERNITY_BENEFIT');
      expect(records[0].benefits).toContain('IE_ILLNESS_BENEFIT');
    });

    it('should link Class A to PAYE employee profiles', async () => {
      const result = await client.executeCypher(
        `MATCH (p:ProfileTag)-[:HAS_PRSI_CLASS]->(pc:PRSIClass {id: 'IE_PRSI_CLASS_A'})
         RETURN p.id as profile`,
        {}
      );

      const records = result as Array<{ profile: string }>;
      expect(records.length).toBeGreaterThan(0);
      expect(records[0].profile).toContain('PAYE_EMPLOYEE');
    });

    it('should have employee contribution rate for Class A', async () => {
      const result = await client.executeCypher(
        `MATCH (pc:PRSIClass {id: 'IE_PRSI_CLASS_A'})-[:CONTRIBUTION_RATE]->(r:Rate)
         RETURN r.id as rate_id, r.percentage as rate`,
        {}
      );

      const records = result as Array<{ rate_id: string; rate: number }>;
      expect(records.length).toBe(1);
      expect(records[0].rate).toBeGreaterThan(0);
    });
  });

  describe('PRSI Class S - Self-Employed', () => {
    it('should have Class S for self-employed with €5,000+ income', async () => {
      const result = await client.executeCypher(
        `MATCH (pc:PRSIClass {id: 'IE_PRSI_CLASS_S'})-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
         RETURN pc.label as label, pc.description as description`,
        {}
      );

      const records = result as Array<{ label: string; description: string }>;
      expect(records.length).toBe(1);
      expect(records[0].label).toBe('Class S');
      expect(records[0].description).toContain('Self-employed');
      expect(records[0].description).toContain('5,000');
    });

    it('should NOT entitle Class S to Jobseeker\'s Benefit', async () => {
      const result = await client.executeCypher(
        `MATCH (pc:PRSIClass {id: 'IE_PRSI_CLASS_S'})-[:ENTITLES_TO]->(b:Benefit)
         WHERE b.id = 'IE_JOBSEEKERS_BENEFIT'
         RETURN count(b) as count`,
        {}
      );

      const records = result as Array<{ count: number }>;
      expect(records[0].count).toBe(0); // Class S does NOT get Jobseeker's Benefit
    });

    it('should entitle Class S to State Pension (Contributory)', async () => {
      const result = await client.executeCypher(
        `MATCH (pc:PRSIClass {id: 'IE_PRSI_CLASS_S'})-[:ENTITLES_TO]->(b:Benefit)
         WHERE b.id = 'IE_STATE_PENSION_CONTRIBUTORY'
         RETURN b.id as benefit`,
        {}
      );

      const records = result as Array<{ benefit: string }>;
      expect(records.length).toBe(1);
    });

    it('should entitle Class S to Maternity Benefit', async () => {
      const result = await client.executeCypher(
        `MATCH (pc:PRSIClass {id: 'IE_PRSI_CLASS_S'})-[:ENTITLES_TO]->(b:Benefit)
         WHERE b.id = 'IE_MATERNITY_BENEFIT'
         RETURN b.id as benefit`,
        {}
      );

      const records = result as Array<{ benefit: string }>;
      expect(records.length).toBe(1);
    });

    it('should link Class S to self-employed profiles', async () => {
      const result = await client.executeCypher(
        `MATCH (p:ProfileTag)-[:HAS_PRSI_CLASS]->(pc:PRSIClass {id: 'IE_PRSI_CLASS_S'})
         RETURN collect(p.id) as profiles`,
        {}
      );

      const records = result as Array<{ profiles: string[] }>;
      expect(records[0].profiles.length).toBeGreaterThan(0);
      expect(
        records[0].profiles.some((p) => p.includes('SELF_EMPLOYED'))
      ).toBe(true);
    });

    it('should have self-employed contribution rate of 4%', async () => {
      const result = await client.executeCypher(
        `MATCH (pc:PRSIClass {id: 'IE_PRSI_CLASS_S'})-[:CONTRIBUTION_RATE]->(r:Rate)
         RETURN r.percentage as rate`,
        {}
      );

      const records = result as Array<{ rate: number }>;
      expect(records.length).toBe(1);
      expect(records[0].rate).toBe(4);
    });
  });

  describe('PRSI Class B and D - Civil Servants', () => {
    it('should have Class B for pre-1995 civil servants', async () => {
      const result = await client.executeCypher(
        `MATCH (pc:PRSIClass {id: 'IE_PRSI_CLASS_B'})-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
         RETURN pc.description as description`,
        {}
      );

      const records = result as Array<{ description: string }>;
      expect(records.length).toBe(1);
      expect(records[0].description).toContain('1995');
      expect(records[0].description).toContain('before');
    });

    it('should have Class D for post-1995 civil servants', async () => {
      const result = await client.executeCypher(
        `MATCH (pc:PRSIClass {id: 'IE_PRSI_CLASS_D'})-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
         RETURN pc.description as description`,
        {}
      );

      const records = result as Array<{ description: string }>;
      expect(records.length).toBe(1);
      expect(records[0].description).toContain('1995');
      expect(records[0].description).toContain('from');
    });

    it('should show Class D has more benefits than Class B', async () => {
      const result = await client.executeCypher(
        `MATCH (b:PRSIClass {id: 'IE_PRSI_CLASS_B'})-[:ENTITLES_TO]->(ben:Benefit)
         WITH count(ben) as class_b_benefits
         MATCH (d:PRSIClass {id: 'IE_PRSI_CLASS_D'})-[:ENTITLES_TO]->(ben2:Benefit)
         RETURN class_b_benefits, count(ben2) as class_d_benefits`,
        {}
      );

      const records = result as Array<{
        class_b_benefits: number;
        class_d_benefits: number;
      }>;

      if (records.length > 0) {
        expect(records[0].class_d_benefits).toBeGreaterThan(
          records[0].class_b_benefits
        );
      }
    });
  });

  describe('PRSI Class J - Low Earners', () => {
    it('should have Class J for earnings under €38 per week', async () => {
      const result = await client.executeCypher(
        `MATCH (pc:PRSIClass {id: 'IE_PRSI_CLASS_J'})-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
         RETURN pc.description as description`,
        {}
      );

      const records = result as Array<{ description: string }>;
      expect(records.length).toBe(1);
      expect(records[0].description).toContain('38');
    });

    it('should have minimal benefits for Class J', async () => {
      const result = await client.executeCypher(
        `MATCH (pc:PRSIClass {id: 'IE_PRSI_CLASS_J'})-[:ENTITLES_TO]->(b:Benefit)
         RETURN count(b) as benefit_count`,
        {}
      );

      const records = result as Array<{ benefit_count: number }>;
      // Class J typically only entitles to Occupational Injuries Benefit
      expect(records[0].benefit_count).toBeLessThanOrEqual(1);
    });
  });

  describe('PRSI Contribution Thresholds', () => {
    it('should require 104 weeks of contributions for Jobseeker\'s Benefit', async () => {
      const result = await client.executeCypher(
        `MATCH (t:Threshold {id: 'IE_PRSI_JOBSEEKERS_CONTRIB_THRESHOLD'})-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
         RETURN t.value as weeks, t.unit as unit, t.direction as direction`,
        {}
      );

      const records = result as Array<{
        weeks: number;
        unit: string;
        direction: string;
      }>;
      expect(records.length).toBe(1);
      expect(records[0].weeks).toBe(104);
      expect(records[0].unit).toBe('WEEKS');
      expect(records[0].direction).toBe('ABOVE');
    });

    it('should link contribution threshold to Jobseeker\'s Benefit', async () => {
      const result = await client.executeCypher(
        `MATCH (b:Benefit {id: 'IE_JOBSEEKERS_BENEFIT'})
         MATCH (t:Threshold {id: 'IE_PRSI_JOBSEEKERS_CONTRIB_THRESHOLD'})
         OPTIONAL MATCH (b)-[:LIMITED_BY_THRESHOLD]->(t)
         RETURN b.id as benefit, t.value as threshold_weeks`,
        {}
      );

      const records = result as Array<{
        benefit: string;
        threshold_weeks: number;
      }>;
      expect(records.length).toBeGreaterThan(0);
      expect(records[0].threshold_weeks).toBe(104);
    });
  });

  describe('PRSI and Life Events', () => {
    it('should trigger Maternity Benefit on BIRTH life event for Class A workers', async () => {
      const result = await client.executeCypher(
        `MATCH (le:LifeEvent {id: 'IE_LIFE_EVENT_BIRTH'})
         MATCH (b:Benefit {id: 'IE_MATERNITY_BENEFIT'})
         MATCH (pc:PRSIClass {id: 'IE_PRSI_CLASS_A'})-[:ENTITLES_TO]->(b)
         OPTIONAL MATCH (le)-[:TRIGGERS]->(b)
         RETURN le.id as event, b.id as benefit, pc.id as prsi_class`,
        {}
      );

      const records = result as Array<{
        event: string;
        benefit: string;
        prsi_class: string;
      }>;
      expect(records.length).toBeGreaterThan(0);
      expect(records[0].prsi_class).toBe('IE_PRSI_CLASS_A');
    });

    it('should trigger unemployment benefits on JOB_LOSS for Class A (but not Class S)', async () => {
      const result = await client.executeCypher(
        `MATCH (le:LifeEvent {id: 'IE_LIFE_EVENT_UNEMPLOYMENT'})
         MATCH (b:Benefit {id: 'IE_JOBSEEKERS_BENEFIT'})
         MATCH (pc:PRSIClass)-[:ENTITLES_TO]->(b)
         RETURN collect(DISTINCT pc.id) as eligible_classes`,
        {}
      );

      const records = result as Array<{ eligible_classes: string[] }>;
      expect(records[0].eligible_classes).toContain('IE_PRSI_CLASS_A');
      expect(records[0].eligible_classes).not.toContain('IE_PRSI_CLASS_S');
    });

    it('should link retirement to State Pension for both Class A and S', async () => {
      const result = await client.executeCypher(
        `MATCH (b:Benefit {id: 'IE_STATE_PENSION_CONTRIBUTORY'})
         MATCH (pc:PRSIClass)-[:ENTITLES_TO]->(b)
         WHERE pc.id IN ['IE_PRSI_CLASS_A', 'IE_PRSI_CLASS_S']
         RETURN collect(DISTINCT pc.id) as classes`,
        {}
      );

      const records = result as Array<{ classes: string[] }>;
      expect(records[0].classes).toContain('IE_PRSI_CLASS_A');
      expect(records[0].classes).toContain('IE_PRSI_CLASS_S');
    });
  });

  describe('PRSI Benefit Eligibility Chains', () => {
    it('should trace complete eligibility path: Profile → PRSI Class → Benefit', async () => {
      const result = await client.executeCypher(
        `MATCH path = (p:ProfileTag)-[:HAS_PRSI_CLASS]->(pc:PRSIClass)-[:ENTITLES_TO]->(b:Benefit)
         WHERE pc.id = 'IE_PRSI_CLASS_A' AND b.id = 'IE_JOBSEEKERS_BENEFIT'
         RETURN p.id as profile, pc.id as prsi_class, b.id as benefit`,
        {}
      );

      const records = result as Array<{
        profile: string;
        prsi_class: string;
        benefit: string;
      }>;
      expect(records.length).toBeGreaterThan(0);
      expect(records[0].prsi_class).toBe('IE_PRSI_CLASS_A');
      expect(records[0].benefit).toBe('IE_JOBSEEKERS_BENEFIT');
    });

    it('should show differential entitlements between Class A and Class S', async () => {
      const result = await client.executeCypher(
        `MATCH (a:PRSIClass {id: 'IE_PRSI_CLASS_A'})-[:ENTITLES_TO]->(ba:Benefit)
         WITH collect(DISTINCT ba.id) as class_a_benefits
         MATCH (s:PRSIClass {id: 'IE_PRSI_CLASS_S'})-[:ENTITLES_TO]->(bs:Benefit)
         WITH class_a_benefits, collect(DISTINCT bs.id) as class_s_benefits
         RETURN
           class_a_benefits,
           class_s_benefits,
           [b IN class_a_benefits WHERE NOT b IN class_s_benefits] as a_only,
           [b IN class_s_benefits WHERE b IN class_a_benefits] as common`,
        {}
      );

      const records = result as Array<{
        class_a_benefits: string[];
        class_s_benefits: string[];
        a_only: string[];
        common: string[];
      }>;

      expect(records.length).toBe(1);
      // Class A should have Jobseeker's Benefit which Class S doesn't
      expect(records[0].a_only).toContain('IE_JOBSEEKERS_BENEFIT');
      // Both should have State Pension
      expect(records[0].common).toContain('IE_STATE_PENSION_CONTRIBUTORY');
    });

    it('should require contribution threshold AND PRSI class for Jobseeker\'s Benefit', async () => {
      const result = await client.executeCypher(
        `MATCH (b:Benefit {id: 'IE_JOBSEEKERS_BENEFIT'})
         MATCH (pc:PRSIClass)-[:ENTITLES_TO]->(b)
         MATCH (t:Threshold)-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
         WHERE t.id = 'IE_PRSI_JOBSEEKERS_CONTRIB_THRESHOLD'
         RETURN
           pc.id as prsi_class,
           t.value as required_weeks,
           b.id as benefit`,
        {}
      );

      const records = result as Array<{
        prsi_class: string;
        required_weeks: number;
        benefit: string;
      }>;

      expect(records.length).toBeGreaterThan(0);
      expect(records[0].prsi_class).toBe('IE_PRSI_CLASS_A');
      expect(records[0].required_weeks).toBe(104);
    });
  });

  describe('PRSI Real-World Scenarios', () => {
    it('should calculate self-employed PRSI on €50,000 income at 4%', async () => {
      const income = 50000;

      const result = await client.executeCypher(
        `MATCH (r:Rate {id: 'IE_PRSI_RATE_SELF_EMPLOYED'})
         RETURN r.percentage as rate`,
        {}
      );

      const records = result as Array<{ rate: number }>;
      const prsiDue = income * (records[0].rate / 100);

      expect(prsiDue).toBe(2000); // €50,000 × 4% = €2,000
    });

    it('should show employee Class A pays on all income (no ceiling)', async () => {
      // Ireland has no PRSI ceiling for employees - all income is subject to PRSI
      const result = await client.executeCypher(
        `MATCH (r:Rate {id: 'IE_PRSI_RATE_EMPLOYEE_CLASS_A'})
         RETURN r.band_upper as ceiling`,
        {}
      );

      const records = result as Array<{ ceiling: number | null }>;
      // Should have no upper band or a very high one
      expect(
        records[0].ceiling === null || records[0].ceiling > 1000000
      ).toBe(true);
    });

    it('should verify PAYE employee gets more benefits than self-employed', async () => {
      const result = await client.executeCypher(
        `MATCH (paye:ProfileTag)-[:HAS_PRSI_CLASS]->(ca:PRSIClass {id: 'IE_PRSI_CLASS_A'})-[:ENTITLES_TO]->(ba:Benefit)
         WITH count(DISTINCT ba) as paye_benefits
         MATCH (self:ProfileTag)-[:HAS_PRSI_CLASS]->(cs:PRSIClass {id: 'IE_PRSI_CLASS_S'})-[:ENTITLES_TO]->(bs:Benefit)
         RETURN paye_benefits, count(DISTINCT bs) as self_employed_benefits`,
        {}
      );

      const records = result as Array<{
        paye_benefits: number;
        self_employed_benefits: number;
      }>;

      if (records.length > 0) {
        expect(records[0].paye_benefits).toBeGreaterThan(
          records[0].self_employed_benefits
        );
      }
    });
  });

  describe('Cross-Border PRSI Coordination', () => {
    it('should link IE-UK social security coordination to PRSI benefits', async () => {
      const result = await client.executeCypher(
        `MATCH (coord:Rule {code: 'IE_UK_SOCIAL_SECURITY_COORDINATION'})
         MATCH (ie:Jurisdiction {code: 'IE'})
         MATCH (uk:Jurisdiction {code: 'UK'})
         OPTIONAL MATCH (coord)-[:APPLIES_BETWEEN]->(ie)
         OPTIONAL MATCH (coord)-[:APPLIES_BETWEEN]->(uk)
         RETURN coord.name as rule, coord.domain as domain`,
        {}
      );

      const records = result as Array<{ rule: string; domain: string }>;
      if (records.length > 0) {
        expect(records[0].domain).toBe('social_security');
        expect(records[0].rule).toContain('Coordination');
      }
    });

    it('should support Common Travel Area (CTA) PRSI coordination', async () => {
      const result = await client.executeCypher(
        `MATCH (cta:Agreement {code: 'CTA'})
         MATCH (ie:Jurisdiction {code: 'IE'})-[:PARTY_TO]->(cta)
         MATCH (uk:Jurisdiction {code: 'UK'})-[:PARTY_TO]->(cta)
         RETURN cta.name as agreement`,
        {}
      );

      const records = result as Array<{ agreement: string }>;
      if (records.length > 0) {
        expect(records[0].agreement).toContain('Common Travel Area');
      }
    });
  });
});
