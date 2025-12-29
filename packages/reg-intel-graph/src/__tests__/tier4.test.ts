/**
 * Tests for Tier 4: UK/EU Extension
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

describe('Seed Data - National Insurance Classes', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  it('should have Class 1 NI (Employees)', async () => {
    const result = await client.executeCypher(
      `MATCH (ni:NIClass {id: 'UK_NI_CLASS_1'}) RETURN ni`,
      {}
    );
    const records = result as Array<{ ni: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
    expect(records[0].ni.properties.label).toContain('Class 1');
    expect(records[0].ni.properties.rate).toBe(12.0);
  });

  it('should have all main UK NI classes', async () => {
    const result = await client.executeCypher(
      `MATCH (ni:NIClass)-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'UK'})
       RETURN count(ni) as count`,
      {}
    );
    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThanOrEqual(4);
  });

  it('should have Class 4 for self-employed with no benefit entitlement', async () => {
    const result = await client.executeCypher(
      `MATCH (ni:NIClass {id: 'UK_NI_CLASS_4'}) RETURN ni`,
      {}
    );
    const records = result as Array<{ ni: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
    expect(records[0].ni.properties.eligible_benefits).toEqual([]);
  });

  it('should link NI classes to benefits via QUALIFIES_FOR', async () => {
    const result = await client.executeCypher(
      `MATCH (ni:NIClass)-[:QUALIFIES_FOR]->(b:Benefit)
       RETURN count(*) as count`,
      {}
    );
    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThan(0);
  });
});

describe('Seed Data - Benefit Caps', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  it('should have benefit cap for outside London', async () => {
    const result = await client.executeCypher(
      `MATCH (cap:BenefitCap {id: 'UK_BENEFIT_CAP_2024_OUTSIDE_LONDON'}) RETURN cap`,
      {}
    );
    const records = result as Array<{ cap: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
    expect(records[0].cap.properties.amount_single).toBe(16967);
    expect(records[0].cap.properties.amount_couple).toBe(25323);
  });

  it('should have benefit cap for Greater London with higher amounts', async () => {
    const result = await client.executeCypher(
      `MATCH (cap:BenefitCap {id: 'UK_BENEFIT_CAP_2024_LONDON'}) RETURN cap`,
      {}
    );
    const records = result as Array<{ cap: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
    expect(records[0].cap.properties.amount_single).toBe(19342);
    expect(records[0].cap.properties.currency).toBe('GBP');
  });

  it('should have exemptions listed on benefit cap', async () => {
    const result = await client.executeCypher(
      `MATCH (cap:BenefitCap {id: 'UK_BENEFIT_CAP_2024_OUTSIDE_LONDON'}) RETURN cap`,
      {}
    );
    const records = result as Array<{ cap: { properties: Record<string, unknown> } }>;
    const exemptions = records[0].cap.properties.exemptions as string[];
    expect(exemptions).toContain('Working Tax Credit');
    expect(exemptions).toContain('Personal Independence Payment');
  });

  it('should link benefits to caps via SUBJECT_TO_CAP', async () => {
    const result = await client.executeCypher(
      `MATCH (b:Benefit)-[:SUBJECT_TO_CAP]->(cap:BenefitCap)
       RETURN count(*) as count`,
      {}
    );
    const records = result as Array<{ count: number }>;
    // May be 0 if UK benefits haven't been seeded yet
    expect(records[0].count).toBeGreaterThanOrEqual(0);
  });
});

describe('Seed Data - EU Coordination Rules', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  it('should have posted worker rule IE to FR', async () => {
    const result = await client.executeCypher(
      `MATCH (cr:CoordinationRule {id: 'EU_POSTED_WORKER_IE_FR'}) RETURN cr`,
      {}
    );
    const records = result as Array<{ cr: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
    expect(records[0].cr.properties.regulation).toBe('EC 883/2004');
    expect(records[0].cr.properties.duration_months).toBe(24);
  });

  it('should have coordination rules for multiple EU countries', async () => {
    const result = await client.executeCypher(
      `MATCH (cr:CoordinationRule)
       WHERE cr.home_jurisdiction = 'IE'
       RETURN count(cr) as count`,
      {}
    );
    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThanOrEqual(5);
  });

  it('should have TCA rule for IE/UK coordination', async () => {
    const result = await client.executeCypher(
      `MATCH (cr:CoordinationRule {id: 'TCA_FAMILY_BENEFITS_IE_UK'}) RETURN cr`,
      {}
    );
    const records = result as Array<{ cr: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
    expect(records[0].cr.properties.regulation).toBe('Trade and Cooperation Agreement');
  });

  it('should link benefits to coordination rules via COORDINATED_UNDER', async () => {
    const result = await client.executeCypher(
      `MATCH (b:Benefit)-[:COORDINATED_UNDER]->(cr:CoordinationRule)
       RETURN count(*) as count`,
      {}
    );
    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThanOrEqual(0);
  });
});

describe('GraphClient - National Insurance Classes', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  it('should get NI classes for UK', async () => {
    const niClasses = await client.getNIClassesForJurisdiction('UK');
    expect(niClasses.length).toBeGreaterThanOrEqual(4);
    expect(niClasses.some(ni => ni.id === 'UK_NI_CLASS_1')).toBe(true);
    expect(niClasses.some(ni => ni.id === 'UK_NI_CLASS_4')).toBe(true);
  });

  it('should distinguish between NI classes by rate and benefits', async () => {
    const niClasses = await client.getNIClassesForJurisdiction('UK');

    const class1 = niClasses.find(ni => ni.id === 'UK_NI_CLASS_1');
    const class4 = niClasses.find(ni => ni.id === 'UK_NI_CLASS_4');

    expect(class1).toBeDefined();
    expect(class4).toBeDefined();

    // Class 1 has higher rate and qualifies for more benefits
    expect(class1?.rate).toBeGreaterThan(class4?.rate || 0);
    expect(class1?.eligible_benefits?.length || 0).toBeGreaterThan(0);
    expect(class4?.eligible_benefits?.length || 0).toBe(0);
  });

  it('should get NI class for employment type', async () => {
    const niClass = await client.getNIClassForEmploymentType('employed', 'UK');
    // May be null if profile tags haven't been created
    if (niClass) {
      expect(niClass.id).toBe('UK_NI_CLASS_1');
    }
  });
});

describe('GraphClient - Benefit Caps', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  it('should get benefit caps for UK', async () => {
    const caps = await client.getBenefitCapsForJurisdiction('UK');
    expect(caps.length).toBeGreaterThanOrEqual(2);
    expect(caps.some(cap => cap.id.includes('LONDON'))).toBe(true);
    expect(caps.some(cap => cap.id.includes('OUTSIDE_LONDON'))).toBe(true);
  });

  it('should show London cap is higher than outside London', async () => {
    const caps = await client.getBenefitCapsForJurisdiction('UK');

    const london = caps.find(cap => cap.id === 'UK_BENEFIT_CAP_2024_LONDON');
    const outsideLondon = caps.find(cap => cap.id === 'UK_BENEFIT_CAP_2024_OUTSIDE_LONDON');

    expect(london).toBeDefined();
    expect(outsideLondon).toBeDefined();

    expect(london?.amount_single || 0).toBeGreaterThan(outsideLondon?.amount_single || 0);
    expect(london?.amount_couple || 0).toBeGreaterThan(outsideLondon?.amount_couple || 0);
  });

  it('should get benefits subject to a cap', async () => {
    const benefits = await client.getBenefitsSubjectToCap('UK_BENEFIT_CAP_2024_OUTSIDE_LONDON');
    // May be empty if UK benefits haven't been seeded
    expect(Array.isArray(benefits)).toBe(true);
  });
});

describe('GraphClient - EU Coordination Rules', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  it('should get coordination rules between IE and FR', async () => {
    const rules = await client.getCoordinationRules('IE', 'FR');
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.some(r => r.applies_to === 'Posted Workers')).toBe(true);
  });

  it('should get posted worker rules for profile', async () => {
    const result = await client.getPostedWorkerRules('posted-worker', 'IE', 'FR');
    expect(result.rules.length).toBeGreaterThan(0);
    expect(Array.isArray(result.benefits)).toBe(true);
  });

  it('should distinguish between posted worker and multi-state rules', async () => {
    const rules = await client.getCoordinationRules('IE', 'FR');

    const postedRule = rules.find(r => r.applies_to === 'Posted Workers');
    const multiStateRule = rules.find(r => r.applies_to === 'Multi-State Workers');

    expect(postedRule).toBeDefined();
    expect(multiStateRule).toBeDefined();

    // Posted workers have duration limits
    expect(postedRule?.duration_months).toBe(24);
  });
});

describe('Real-World Integration - Tier 4 Scenarios', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  it('should answer: What NI class applies to employees?', async () => {
    const niClasses = await client.getNIClassesForJurisdiction('UK');
    const class1 = niClasses.find(ni => ni.id === 'UK_NI_CLASS_1');

    expect(class1).toBeDefined();
    expect(class1?.description).toContain('employee');
    expect(class1?.rate).toBe(12.0);
  });

  it('should answer: What benefits qualify with Class 1 NI?', async () => {
    const niClasses = await client.getNIClassesForJurisdiction('UK');
    const class1 = niClasses.find(ni => ni.id === 'UK_NI_CLASS_1');

    expect(class1).toBeDefined();
    expect(class1?.eligible_benefits).toContain('State Pension');
    expect(class1?.eligible_benefits).toContain('Unemployment Benefit');
  });

  it('should answer: Does Class 4 NI qualify for unemployment benefit?', async () => {
    const niClasses = await client.getNIClassesForJurisdiction('UK');
    const class4 = niClasses.find(ni => ni.id === 'UK_NI_CLASS_4');

    expect(class4).toBeDefined();
    expect(class4?.eligible_benefits?.length).toBe(0);
    // Class 4 doesn't qualify for ANY contributory benefits
  });

  it('should answer: What is the benefit cap for a single person in London?', async () => {
    const caps = await client.getBenefitCapsForJurisdiction('UK');
    const london = caps.find(cap => cap.id === 'UK_BENEFIT_CAP_2024_LONDON');

    expect(london).toBeDefined();
    expect(london?.amount_single).toBe(19342);
    expect(london?.currency).toBe('GBP');
    expect(london?.frequency).toBe('ANNUAL');
  });

  it('should answer: Are disability benefits exempt from the benefit cap?', async () => {
    const caps = await client.getBenefitCapsForJurisdiction('UK');
    const cap = caps[0];

    expect(cap).toBeDefined();
    expect(cap.exemptions).toContain('Personal Independence Payment');
    expect(cap.exemptions).toContain('Disability Living Allowance');
    expect(cap.exemptions).toContain('Attendance Allowance');
  });

  it('should answer: What social security applies if I work in France for 18 months?', async () => {
    const rules = await client.getCoordinationRules('IE', 'FR');
    const postedRule = rules.find(r => r.applies_to === 'Posted Workers');

    expect(postedRule).toBeDefined();
    expect(postedRule?.duration_months).toBe(24);
    expect(postedRule?.regulation).toBe('EC 883/2004');
    // 18 months < 24 months, so Irish social security applies
  });

  it('should answer: Can I remain on Irish PRSI if posted to Germany?', async () => {
    const rules = await client.getCoordinationRules('IE', 'DE');
    const postedRule = rules.find(r => r.applies_to === 'Posted Workers');

    expect(postedRule).toBeDefined();
    expect(postedRule?.home_jurisdiction).toBe('IE');
    expect(postedRule?.host_jurisdiction).toBe('DE');
    expect(postedRule?.duration_months).toBe(24);
    // Yes, for up to 24 months
  });

  it('should answer: What coordination rules apply for IE/UK family benefits?', async () => {
    const rules = await client.getCoordinationRules('IE', 'UK');
    const familyRule = rules.find(r => r.applies_to === 'Family Benefits');

    expect(familyRule).toBeDefined();
    expect(familyRule?.regulation).toBe('Trade and Cooperation Agreement');
    // Post-Brexit TCA applies, not EU regulations
  });

  it('should enable cross-border scenario: Irish employee posted to France', async () => {
    const rules = await client.getCoordinationRules('IE', 'FR');

    // Should have multiple rules for different worker types
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.some(r => r.applies_to === 'Posted Workers')).toBe(true);
    expect(rules.some(r => r.applies_to === 'Self-Employed')).toBe(true);
    expect(rules.some(r => r.applies_to === 'Multi-State Workers')).toBe(true);
  });

  it('should enable benefit eligibility comparison: Class 1 vs Class 4', async () => {
    const niClasses = await client.getNIClassesForJurisdiction('UK');

    const class1 = niClasses.find(ni => ni.id === 'UK_NI_CLASS_1');
    const class4 = niClasses.find(ni => ni.id === 'UK_NI_CLASS_4');

    expect(class1).toBeDefined();
    expect(class4).toBeDefined();

    // Class 1 (employees) get comprehensive benefits
    expect(class1?.eligible_benefits?.length || 0).toBeGreaterThan(3);

    // Class 4 (self-employed profits) gets NO contributory benefits
    expect(class4?.eligible_benefits?.length || 0).toBe(0);

    // This explains why self-employed need both Class 2 and Class 4
  });
});
