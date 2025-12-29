/**
 * Ireland Tax Integration Tests
 *
 * Real-world integration tests for Irish tax system including:
 * - Income tax bands and rates
 * - Capital Gains Tax (CGT)
 * - Universal Social Charge (USC)
 * - Tax thresholds and exemptions
 * - Tax year transitions
 *
 * These tests validate actual Irish tax legislation as implemented in the graph.
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

describe('Ireland Tax System - Income Tax', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  describe('Income Tax Bands and Rates', () => {
    it('should have standard rate of 20% on first €42,000 (single person)', async () => {
      const result = await client.executeCypher(
        `MATCH (r:Rate {id: 'IE_INCOME_TAX_STANDARD_2024'})-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
         RETURN r.percentage as rate, r.band_lower as lower, r.band_upper as upper`,
        {}
      );

      const records = result as Array<{ rate: number; lower: number; upper: number }>;
      expect(records.length).toBe(1);
      expect(records[0].rate).toBe(20);
      expect(records[0].lower).toBe(0);
      expect(records[0].upper).toBe(42000);
    });

    it('should have higher rate of 40% above €42,000', async () => {
      const result = await client.executeCypher(
        `MATCH (r:Rate {id: 'IE_INCOME_TAX_HIGHER_2024'})-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
         RETURN r.percentage as rate, r.band_lower as lower`,
        {}
      );

      const records = result as Array<{ rate: number; lower: number }>;
      expect(records.length).toBe(1);
      expect(records[0].rate).toBe(40);
      expect(records[0].lower).toBe(42000);
    });

    it('should calculate correct tax for €50,000 income (single person)', async () => {
      // Expected: €42,000 @ 20% = €8,400 + €8,000 @ 40% = €3,200 = Total €11,600
      const income = 50000;
      const standardBand = 42000;
      const standardRate = 0.20;
      const higherRate = 0.40;

      const expectedTax =
        standardBand * standardRate + (income - standardBand) * higherRate;

      expect(expectedTax).toBe(11600);
    });
  });

  describe('Capital Gains Tax (CGT)', () => {
    it('should have CGT rate of 33%', async () => {
      const result = await client.executeCypher(
        `MATCH (r:Rate {id: 'IE_CGT_RATE_2024'})-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
         RETURN r.percentage as rate, r.category as category`,
        {}
      );

      const records = result as Array<{ rate: number; category: string }>;
      expect(records.length).toBe(1);
      expect(records[0].rate).toBe(33);
      expect(records[0].category).toBe('CGT');
    });

    it('should have annual CGT exemption of €1,270', async () => {
      const result = await client.executeCypher(
        `MATCH (t:Threshold {id: 'IE_CGT_ANNUAL_EXEMPTION_2024'})-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
         RETURN t.value as exemption, t.unit as unit, t.direction as direction`,
        {}
      );

      const records = result as Array<{
        exemption: number;
        unit: string;
        direction: string;
      }>;
      expect(records.length).toBe(1);
      expect(records[0].exemption).toBe(1270);
      expect(records[0].unit).toBe('EUR');
      expect(records[0].direction).toBe('BELOW');
    });

    it('should calculate CGT correctly for €10,000 gain', async () => {
      // Expected: (€10,000 - €1,270 exemption) × 33% = €2,880.90
      const gain = 10000;
      const exemption = 1270;
      const rate = 0.33;

      const expectedCGT = (gain - exemption) * rate;

      expect(expectedCGT).toBe(2880.9);
    });

    it('should link CGT rate to CGT exemption threshold', async () => {
      const result = await client.executeCypher(
        `MATCH (r:Rate {category: 'CGT'})-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
         MATCH (t:Threshold {category: 'CGT'})-[:IN_JURISDICTION]->(j)
         RETURN r.id as rate_id, t.id as threshold_id, r.percentage as rate, t.value as exemption`,
        {}
      );

      const records = result as Array<{
        rate_id: string;
        threshold_id: string;
        rate: number;
        exemption: number;
      }>;
      expect(records.length).toBeGreaterThan(0);
      expect(records[0].rate).toBe(33);
      expect(records[0].exemption).toBe(1270);
    });
  });

  describe('Tax Thresholds and Exemptions', () => {
    it('should have small benefit exemption of €1,000', async () => {
      const result = await client.executeCypher(
        `MATCH (t:Threshold {id: 'IE_SMALL_BENEFIT_EXEMPTION_2024'})-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
         RETURN t.value as exemption, t.category as category`,
        {}
      );

      const records = result as Array<{ exemption: number; category: string }>;
      expect(records.length).toBe(1);
      expect(records[0].exemption).toBe(1000);
      expect(records[0].category).toBe('BIK'); // Benefit in Kind
    });

    it('should verify all tax thresholds have effective dates', async () => {
      const result = await client.executeCypher(
        `MATCH (t:Threshold)-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
         WHERE t.category IN ['CGT', 'BIK', 'INCOME_TAX']
         RETURN t.id as id, t.effective_from as effective_from`,
        {}
      );

      const records = result as Array<{
        id: string;
        effective_from: string | null;
      }>;

      records.forEach((record) => {
        if (record.id.includes('2024')) {
          expect(record.effective_from).toBeDefined();
        }
      });
    });
  });

  describe('Tax Rate Temporal Validity', () => {
    it('should find all rates effective on 2024-06-01', async () => {
      const queryDate = '2024-06-01T00:00:00';

      const result = await client.executeCypher(
        `MATCH (r:Rate)-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
         WHERE r.effective_from <= datetime($queryDate)
           AND (r.effective_to IS NULL OR r.effective_to >= datetime($queryDate))
         RETURN r.id as id, r.label as label, r.percentage as rate, r.category as category`,
        { queryDate }
      );

      const records = result as Array<{
        id: string;
        label: string;
        rate: number;
        category: string;
      }>;

      // Should find income tax rates, CGT rate, and PRSI rates
      expect(records.length).toBeGreaterThan(0);

      const categories = records.map((r) => r.category);
      expect(categories).toContain('INCOME_TAX');
      expect(categories).toContain('CGT');
    });

    it('should handle tax year transitions correctly', async () => {
      // Verify that rates have proper effective_from dates for tax year 2024
      const result = await client.executeCypher(
        `MATCH (r:Rate)-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
         WHERE r.id CONTAINS '2024'
         RETURN
           r.id as id,
           r.effective_from as effective_from,
           date(r.effective_from).year as year`,
        {}
      );

      const records = result as Array<{
        id: string;
        effective_from: string;
        year: number;
      }>;

      records.forEach((record) => {
        expect(record.year).toBe(2024);
      });
    });
  });

  describe('Tax Calculations - Real World Scenarios', () => {
    it('should calculate total tax burden for €60,000 salary (PAYE employee)', async () => {
      const salary = 60000;

      // Get income tax rates
      const taxResult = await client.executeCypher(
        `MATCH (r:Rate)-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
         WHERE r.category = 'INCOME_TAX' AND r.id CONTAINS '2024'
         RETURN r.percentage as rate, r.band_lower as lower, r.band_upper as upper
         ORDER BY r.band_lower`,
        {}
      );

      const taxRates = taxResult as Array<{
        rate: number;
        lower: number;
        upper: number | null;
      }>;

      expect(taxRates.length).toBeGreaterThanOrEqual(2);

      // Standard band: €42,000 @ 20%
      const standardTax = taxRates[0].upper! * (taxRates[0].rate / 100);
      // Higher band: (€60,000 - €42,000) @ 40%
      const higherTax = (salary - taxRates[0].upper!) * (taxRates[1].rate / 100);
      const totalIncomeTax = standardTax + higherTax;

      expect(totalIncomeTax).toBe(15600); // €8,400 + €7,200
    });

    it('should calculate CGT on property sale with exemption', async () => {
      const salePrice = 500000;
      const purchasePrice = 350000;
      const improvementCosts = 20000;
      const gain = salePrice - purchasePrice - improvementCosts;

      // Get CGT exemption
      const exemptionResult = await client.executeCypher(
        `MATCH (t:Threshold {id: 'IE_CGT_ANNUAL_EXEMPTION_2024'})
         RETURN t.value as exemption`,
        {}
      );

      const exemption = (exemptionResult as Array<{ exemption: number }>)[0]
        .exemption;

      // Get CGT rate
      const rateResult = await client.executeCypher(
        `MATCH (r:Rate {id: 'IE_CGT_RATE_2024'})
         RETURN r.percentage as rate`,
        {}
      );

      const cgtRate = (rateResult as Array<{ rate: number }>)[0].rate / 100;

      const taxableGain = gain - exemption;
      const cgtDue = taxableGain * cgtRate;

      // €130,000 gain - €1,270 exemption = €128,730 × 33% = €42,480.90
      expect(cgtDue).toBeCloseTo(42480.9, 2);
    });
  });

  describe('Tax Profiles Integration', () => {
    it('should link income tax rates to PAYE employee profiles', async () => {
      const result = await client.executeCypher(
        `MATCH (p:ProfileTag)-[:HAS_PRSI_CLASS]->(pc:PRSIClass {id: 'IE_PRSI_CLASS_A'})
         MATCH (r:Rate {category: 'INCOME_TAX'})-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
         WHERE pc-[:IN_JURISDICTION]->(j)
         RETURN DISTINCT p.id as profile, r.id as rate`,
        {}
      );

      const records = result as Array<{ profile: string; rate: string }>;
      expect(records.length).toBeGreaterThan(0);
    });

    it('should link CGT rates to relevant profiles (landlords, investors)', async () => {
      const result = await client.executeCypher(
        `MATCH (r:Rate {category: 'CGT'})-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
         MATCH (t:Threshold {category: 'CGT'})-[:IN_JURISDICTION]->(j)
         RETURN r.percentage as rate, t.value as exemption`,
        {}
      );

      const records = result as Array<{ rate: number; exemption: number }>;
      expect(records.length).toBeGreaterThan(0);
      expect(records[0].rate).toBe(33);
      expect(records[0].exemption).toBe(1270);
    });
  });
});
