/**
 * Realistic Seed Data Validation Tests
 *
 * Validates that the realistic Memgraph seed data aligns perfectly with
 * the Supabase conversation seed data and supports GraphRAG use cases.
 *
 * Test Coverage:
 * 1. Graph nodes exist for ALL concepts mentioned in Supabase conversations
 * 2. Relationships are correctly established
 * 3. GraphClient can retrieve relevant nodes for conversation queries
 * 4. Regulatory calculations are accurate
 * 5. Timeline constraints are enforced
 * 6. Profile matching works correctly
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import neo4j, { Driver } from 'neo4j-driver';
import { BoltGraphClient } from '../boltGraphClient.js';

describe('Realistic Seed Data Validation', () => {
  let driver: Driver;
  let client: BoltGraphClient;

  beforeAll(async () => {
    const uri = process.env.MEMGRAPH_URI || 'bolt://localhost:7687';
    driver = neo4j.driver(uri, neo4j.auth.basic('', ''));
    client = new BoltGraphClient({ uri });
  });

  afterAll(async () => {
    await driver.close();
  });

  describe('Coverage: DataTech Finance Conversations', () => {
    it('should have R&D Tax Credit nodes for Corporation Tax conversation', async () => {
      const result = await client.executeCypher(`
        MATCH (r:Relief {id: 'IE_RELIEF_RND_CREDIT'})
        OPTIONAL MATCH (r)-[:CITES]->(s:Section)
        OPTIONAL MATCH (r)-[:EFFECTIVE_WINDOW]->(t1:Timeline)
        OPTIONAL MATCH (r)-[:REFUND_WINDOW]->(t2:Timeline)
        RETURN r, s, t1, t2
      `) as any[];

      expect(result).toHaveLength(1);
      expect(result[0].r.properties.name).toBe('R&D Tax Credit');
      expect(result[0].r.properties.tax_type).toBe('CORPORATION_TAX');
      expect(result[0].s.properties.section_number).toBe('766');
      expect(result[0].t1.properties.window_years).toBe(4); // 4-year offset
      expect(result[0].t2.properties.window_years).toBe(3); // 3-year refund
    });

    it('should have Corporation Tax rate node (12.5%)', async () => {
      const result = await client.executeCypher(`
        MATCH (r:Rate {id: 'IE_RATE_CT_TRADING'})
        RETURN r
      `) as any[];

      expect(result).toHaveLength(1);
      expect(result[0].r.properties.percentage).toBe(12.5);
      expect(result[0].r.properties.applies_to).toBe('trading_income');
    });

    it('should have R&D credit calculation rate (25%)', async () => {
      const result = await client.executeCypher(`
        MATCH (r:Rate {id: 'IE_RATE_RND_CREDIT'})
        RETURN r
      `) as any[];

      expect(result).toHaveLength(1);
      expect(result[0].r.properties.percentage).toBe(25);
      expect(result[0].r.properties.applies_to).toBe('qualifying_rnd_expenditure');
    });

    it('should have VAT registration thresholds for VAT conversation', async () => {
      const result = await client.executeCypher(`
        MATCH (t:Threshold)
        WHERE t.id IN ['IE_THRESHOLD_VAT_SERVICES', 'IE_THRESHOLD_VAT_GOODS']
        RETURN t
        ORDER BY t.id
      `) as any[];

      expect(result).toHaveLength(2);
      expect(result[0].t.properties.amount_euro).toBe(40000); // Services
      expect(result[1].t.properties.amount_euro).toBe(80000); // Goods
    });

    it('should have VAT rates (23%, 13.5%, 9%, 4.8%, 0%)', async () => {
      const result = await client.executeCypher(`
        MATCH (r:Rate {tax_type: 'VAT'})
        RETURN r
        ORDER BY r.percentage DESC
      `) as any[];

      expect(result.length).toBeGreaterThanOrEqual(5);
      const rates = result.map((r: any) => r.r.properties.percentage);
      expect(rates).toContain(23);   // Standard
      expect(rates).toContain(13.5); // Reduced (tourism, construction)
      expect(rates).toContain(9);    // Second reduced (newspapers)
      expect(rates).toContain(4.8);  // Livestock
      expect(rates).toContain(0);    // Zero-rated (exports)
    });

    it('should link VAT sections to statute', async () => {
      const result = await client.executeCypher(`
        MATCH (s:Section)-[:PART_OF]->(statute:Statute {id: 'IE_VATA_2010'})
        WHERE s.id IN ['IE_VATCA_2010_S65', 'IE_VATCA_2010_S46']
        RETURN s
      `) as any[];

      expect(result).toHaveLength(2);
    });
  });

  describe('Coverage: DataTech HR Conversations', () => {
    it('should have BIK rates by CO2 emissions for company car conversation', async () => {
      const result = await client.executeCypher(`
        MATCH (r:Rate {tax_type: 'BIK'})
        WHERE r.co2_emissions IS NOT NULL
        RETURN r
        ORDER BY r.co2_emissions_max
      `) as any[];

      expect(result.length).toBeGreaterThanOrEqual(4);

      // EV (0 g/km) = 0%
      const ev = result.find((r: any) => r.r.properties.co2_emissions_max === 0);
      expect(ev.r.properties.percentage).toBe(0);

      // PHEV (1-50 g/km) = 8%
      const phev = result.find((r: any) => r.r.properties.co2_emissions_max === 50);
      expect(phev.r.properties.percentage).toBe(8);
    });

    it('should have KEEP scheme with €300K limit', async () => {
      const result = await client.executeCypher(`
        MATCH (r:Relief {id: 'IE_RELIEF_KEEP'})
        OPTIONAL MATCH (r)-[:HAS_LIMIT]->(l:Threshold)
        RETURN r, l
      `) as any[];

      expect(result).toHaveLength(1);
      expect(result[0].r.properties.name).toContain('KEEP');
      expect(result[0].l.properties.amount_euro).toBe(300000);
      expect(result[0].l.properties.period_years).toBe(3);
    });

    it('should have ESOS scheme with €12,700 annual limit', async () => {
      const result = await client.executeCypher(`
        MATCH (r:Relief {id: 'IE_RELIEF_ESOS'})
        OPTIONAL MATCH (r)-[:HAS_LIMIT]->(l:Threshold)
        RETURN r, l
      `) as any[];

      expect(result).toHaveLength(1);
      expect(result[0].r.properties.name).toContain('ESOS');
      expect(result[0].l.properties.amount_euro).toBe(12700);
      expect(result[0].l.properties.period_type).toBe('annual');
    });

    it('should have KEEP holding period timelines (12 months options, 24 months shares)', async () => {
      const result = await client.executeCypher(`
        MATCH (t:Timeline)
        WHERE t.id IN ['IE_KEEP_12_MONTH_OPTION', 'IE_KEEP_24_MONTH_SHARE']
        RETURN t
        ORDER BY t.id
      `) as any[];

      expect(result).toHaveLength(2);
      expect(result[0].t.properties.window_months).toBe(12);
      expect(result[1].t.properties.window_months).toBe(24);
    });

    it('should have Maternity Benefit with €274/week rate', async () => {
      const result = await client.executeCypher(`
        MATCH (b:Benefit {id: 'IE_BENEFIT_MATERNITY'})
        OPTIONAL MATCH (b)-[:HAS_RATE]->(r:Rate)
        RETURN b, r
      `) as any[];

      expect(result).toHaveLength(1);
      expect(result[0].b.properties.category).toBe('MATERNITY');
      expect(result[0].r.properties.amount_euro).toBe(274);
      expect(result[0].r.properties.period).toBe('weekly');
    });
  });

  describe('Coverage: DataTech Tax Planning Conversations', () => {
    it('should have Close Company Surcharge (20% on undistributed income)', async () => {
      const result = await client.executeCypher(`
        MATCH (s:Section {id: 'IE_TCA_1997_S440'})
        OPTIONAL MATCH (s)<-[:GOVERNED_BY]-(p:ProfileTag {id: 'PROFILE_CLOSE_COMPANY_IE'})
        OPTIONAL MATCH (s)-[:HAS_RATE]->(r:Rate)
        RETURN s, p, r
      `) as any[];

      expect(result).toHaveLength(1);
      expect(result[0].s.properties.title).toContain('Close Company');
      expect(result[0].p).toBeDefined();
      expect(result[0].r.properties.percentage).toBe(20);
    });

    it('should have Knowledge Development Box (6.25% effective rate)', async () => {
      const result = await client.executeCypher(`
        MATCH (r:Relief {id: 'IE_RELIEF_KDB'})
        OPTIONAL MATCH (r)-[:HAS_RATE]->(rate:Rate)
        RETURN r, rate
      `) as any[];

      expect(result).toHaveLength(1);
      expect(result[0].r.properties.short_summary).toContain('6.25%');
      expect(result[0].rate.properties.percentage).toBe(6.25);
    });

    it('should have Entrepreneur Relief (10% CGT, €1M limit)', async () => {
      const result = await client.executeCypher(`
        MATCH (r:Relief {id: 'IE_RELIEF_ENTREPRENEUR'})
        OPTIONAL MATCH (r)-[:HAS_RATE]->(rate:Rate)
        OPTIONAL MATCH (r)-[:HAS_LIMIT]->(limit:Threshold)
        OPTIONAL MATCH (r)-[:ELIGIBILITY_PERIOD]->(t:Timeline)
        RETURN r, rate, limit, t
      `) as any[];

      expect(result).toHaveLength(1);
      expect(result[0].rate.properties.percentage).toBe(10);
      expect(result[0].limit.properties.amount_euro).toBe(1000000);
      expect(result[0].t.properties.window_years).toBe(3); // 3-year working requirement
    });

    it('should have Retirement Relief (€750K exemption, age 55+)', async () => {
      const result = await client.executeCypher(`
        MATCH (r:Relief {id: 'IE_RELIEF_RETIREMENT'})
        OPTIONAL MATCH (r)-[:HAS_LIMIT]->(limit:Threshold)
        OPTIONAL MATCH (r)-[:REQUIRES]->(age:Threshold {threshold_type: 'age'})
        OPTIONAL MATCH (r)-[:ELIGIBILITY_PERIOD]->(t:Timeline)
        RETURN r, limit, age, t
      `) as any[];

      expect(result).toHaveLength(1);
      expect(result[0].limit.properties.amount_euro).toBe(750000);
      expect(result[0].age.properties.minimum_age).toBe(55);
      expect(result[0].t.properties.window_years).toBe(10); // 10-year ownership
    });

    it('should have standard CGT rate (33%)', async () => {
      const result = await client.executeCypher(`
        MATCH (r:Rate {id: 'IE_RATE_CGT_STANDARD'})
        RETURN r
      `) as any[];

      expect(result).toHaveLength(1);
      expect(result[0].r.properties.percentage).toBe(33);
      expect(result[0].r.properties.tax_type).toBe('CAPITAL_GAINS_TAX');
    });
  });

  describe('Coverage: Seán Personal Conversations', () => {
    it('should have PAYE tax bands (20% and 40%)', async () => {
      const result = await client.executeCypher(`
        MATCH (r:Rate {tax_type: 'PAYE'})
        RETURN r
        ORDER BY r.percentage
      `) as any[];

      expect(result).toHaveLength(2);
      expect(result[0].r.properties.percentage).toBe(20); // Standard rate
      expect(result[0].r.properties.threshold_single).toBe(42000);
      expect(result[1].r.properties.percentage).toBe(40); // Higher rate
    });

    it('should have PRSI rates (employee 4.1%, employer 11.05%)', async () => {
      const result = await client.executeCypher(`
        MATCH (r:Rate {tax_type: 'PRSI'})
        WHERE r.prsi_class = 'A'
        RETURN r
        ORDER BY r.rate_type
      `) as any[];

      expect(result).toHaveLength(2);
      const employeeRate = result.find((r: any) => r.r.properties.rate_type === 'employee');
      const employerRate = result.find((r: any) => r.r.properties.rate_type === 'employer');
      expect(employeeRate.r.properties.percentage).toBe(4.1);
      expect(employerRate.r.properties.percentage).toBe(11.05);
    });

    it('should have USC graduated rates (0.5%, 2%, 4.5%, 8%)', async () => {
      const result = await client.executeCypher(`
        MATCH (r:Rate {tax_type: 'USC'})
        RETURN r
        ORDER BY r.band_number
      `) as any[];

      expect(result.length).toBeGreaterThanOrEqual(4);
      expect(result[0].r.properties.percentage).toBe(0.5);
      expect(result[1].r.properties.percentage).toBe(2);
      expect(result[2].r.properties.percentage).toBe(4.5);
      expect(result[3].r.properties.percentage).toBe(8);
    });

    it('should have VAT registration thresholds for services (€40K)', async () => {
      const result = await client.executeCypher(`
        MATCH (t:Threshold {id: 'IE_THRESHOLD_VAT_SERVICES'})
        RETURN t
      `) as any[];

      expect(result).toHaveLength(1);
      expect(result[0].t.properties.amount_euro).toBe(40000);
    });
  });

  describe('Relationship Validation', () => {
    it('should link reliefs to their statute sections via CITES', async () => {
      const result = await client.executeCypher(`
        MATCH (r:Relief)-[:CITES]->(s:Section)
        RETURN count(r) as relief_count, count(s) as section_count
      `) as any[];

      expect(result[0].relief_count).toBeGreaterThanOrEqual(6);
      expect(result[0].section_count).toBeGreaterThanOrEqual(6);
    });

    it('should link reliefs to timeline constraints', async () => {
      const result = await client.executeCypher(`
        MATCH (r:Relief)-[rel]->(t:Timeline)
        WHERE type(rel) IN ['EFFECTIVE_WINDOW', 'REFUND_WINDOW', 'MINIMUM_HOLDING', 'ELIGIBILITY_PERIOD']
        RETURN r.name as relief, type(rel) as rel_type, t.label as timeline
      `) as any[];

      expect(result.length).toBeGreaterThanOrEqual(8);

      // Check specific relationships exist
      const rdnRefund = result.find((r: any) =>
        r.relief === 'R&D Tax Credit' && r.rel_type === 'REFUND_WINDOW'
      );
      expect(rdnRefund).toBeDefined();

      const keepHolding = result.find((r: any) =>
        r.relief.includes('KEEP') && r.rel_type === 'MINIMUM_HOLDING'
      );
      expect(keepHolding).toBeDefined();
    });

    it('should link reliefs to profile tags via APPLIES_TO_PROFILE', async () => {
      const result = await client.executeCypher(`
        MATCH (r:Relief)-[:APPLIES_TO_PROFILE]->(p:ProfileTag)
        RETURN r.name as relief, p.label as profile
      `) as any[];

      expect(result.length).toBeGreaterThanOrEqual(10);

      // Check specific applications
      const rdnCompany = result.find((r: any) =>
        r.relief === 'R&D Tax Credit' && r.profile.includes('Limited Company')
      );
      expect(rdnCompany).toBeDefined();

      const keepEmployee = result.find((r: any) =>
        r.relief.includes('KEEP') && r.profile.includes('Key Employee')
      );
      expect(keepEmployee).toBeDefined();
    });

    it('should link rates to their parent reliefs/taxes', async () => {
      const result = await client.executeCypher(`
        MATCH (parent)-[:HAS_RATE]->(r:Rate)
        WHERE parent:Relief OR parent:Section
        RETURN labels(parent)[0] as parent_type, count(r) as rate_count
      `) as any[];

      expect(result.length).toBeGreaterThan(0);
      const totalRates = result.reduce((sum: number, r: any) => sum + r.rate_count, 0);
      expect(totalRates).toBeGreaterThanOrEqual(15);
    });
  });

  describe('Profile Matching', () => {
    it('should match Single Director profile to appropriate reliefs', async () => {
      const result = await client.executeCypher(`
        MATCH (p:ProfileTag {id: 'PROFILE_SINGLE_DIRECTOR_IE'})<-[:APPLIES_TO_PROFILE]-(r:Relief)
        RETURN r.name as relief
      `) as any[];

      const reliefs = result.map((r: any) => r.relief);
      expect(reliefs).toContain('Entrepreneur Relief');
      expect(reliefs).toContain('Retirement Relief');
    });

    it('should match Key Employee profile to share scheme reliefs', async () => {
      const result = await client.executeCypher(`
        MATCH (p:ProfileTag {id: 'PROFILE_KEY_EMPLOYEE_IE'})<-[:APPLIES_TO_PROFILE]-(r:Relief)
        RETURN r.name as relief
      `) as any[];

      const reliefs = result.map((r: any) => r.relief);
      expect(reliefs).toContainEqual(expect.stringContaining('KEEP'));
      expect(reliefs).toContainEqual(expect.stringContaining('ESOS'));
    });

    it('should match PAYE Employee profile to benefits', async () => {
      const result = await client.executeCypher(`
        MATCH (p:ProfileTag {id: 'PROFILE_PAYE_EMPLOYEE_IE'})<-[:APPLIES_TO_PROFILE]-(b:Benefit)
        RETURN b.name as benefit
      `) as any[];

      const benefits = result.map((b: any) => b.benefit);
      expect(benefits).toContain('Maternity Benefit');
    });
  });

  describe('Calculation Support', () => {
    it('should have all components for R&D tax credit calculation', async () => {
      const result = await client.executeCypher(`
        MATCH (r:Relief {id: 'IE_RELIEF_RND_CREDIT'})
        OPTIONAL MATCH (r)-[:HAS_RATE]->(rate:Rate)
        OPTIONAL MATCH (r)-[:EFFECTIVE_WINDOW]->(window:Timeline)
        OPTIONAL MATCH (r)-[:REFUND_WINDOW]->(refund:Timeline)
        RETURN r, rate, window, refund
      `) as any[];

      expect(result).toHaveLength(1);
      expect(result[0].rate.properties.percentage).toBe(25);
      expect(result[0].window.properties.window_years).toBe(4);
      expect(result[0].refund.properties.window_years).toBe(3);
    });

    it('should have all components for salary/dividend calculation', async () => {
      const result = await client.executeCypher(`
        MATCH (r:Rate)
        WHERE r.tax_type IN ['PAYE', 'PRSI', 'USC']
        RETURN r.tax_type as tax_type, count(r) as count
      `) as any[];

      const taxTypes = result.map((r: any) => r.tax_type);
      expect(taxTypes).toContain('PAYE');
      expect(taxTypes).toContain('PRSI');
      expect(taxTypes).toContain('USC');
    });

    it('should have all components for BIK calculation', async () => {
      const result = await client.executeCypher(`
        MATCH (r:Rate {tax_type: 'BIK'})
        WHERE r.co2_emissions_min IS NOT NULL
        RETURN count(r) as bik_bands
      `) as any[];

      expect(result[0].bik_bands).toBeGreaterThanOrEqual(4);
    });
  });

  describe('Data Completeness', () => {
    it('should have minimum expected node counts', async () => {
      const result = await client.executeCypher(`
        MATCH (n)
        RETURN labels(n)[0] as label, count(n) as count
        ORDER BY count DESC
      `) as any[];

      const nodeCounts = Object.fromEntries(
        result.map((r: any) => [r.label, r.count])
      );

      // Minimum expectations based on seed
      expect(nodeCounts['Rate']).toBeGreaterThanOrEqual(20);
      expect(nodeCounts['Section']).toBeGreaterThanOrEqual(12);
      expect(nodeCounts['Relief']).toBeGreaterThanOrEqual(6);
      expect(nodeCounts['Timeline']).toBeGreaterThanOrEqual(8);
      expect(nodeCounts['Threshold']).toBeGreaterThanOrEqual(8);
      expect(nodeCounts['ProfileTag']).toBeGreaterThanOrEqual(6);
    });

    it('should have minimum expected relationship counts', async () => {
      const result = await client.executeCypher(`
        MATCH ()-[r]->()
        RETURN type(r) as rel_type, count(r) as count
        ORDER BY count DESC
      `) as any[];

      const relCounts = Object.fromEntries(
        result.map((r: any) => [r.rel_type, r.count])
      );

      expect(relCounts['APPLIES_TO_PROFILE']).toBeGreaterThanOrEqual(15);
      expect(relCounts['HAS_RATE']).toBeGreaterThanOrEqual(15);
      expect(relCounts['CITES']).toBeGreaterThanOrEqual(7);
      expect(relCounts['HAS_LIMIT']).toBeGreaterThanOrEqual(6);
    });
  });
});
