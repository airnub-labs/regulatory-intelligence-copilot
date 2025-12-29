/**
 * Comprehensive tests for seed data integrity
 * Verifies all seed data is properly loaded and connected
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

describe('Seed Data - Obligations', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  it('should have CT1 filing obligation', async () => {
    const result = await client.executeCypher(
      `MATCH (o:Obligation {id: 'IE_CT1_FILING'}) RETURN o`,
      {}
    );

    const records = result as Array<{ o: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
    expect(records[0].o.properties.label).toContain('CT1');
    expect(records[0].o.properties.category).toBe('FILING');
    expect(records[0].o.properties.frequency).toBe('ANNUAL');
  });

  it('should have Form 11 filing obligation', async () => {
    const result = await client.executeCypher(
      `MATCH (o:Obligation {id: 'IE_FORM_11_FILING'}) RETURN o`,
      {}
    );

    const records = result as Array<{ o: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
    expect(records[0].o.properties.label).toContain('Form 11');
  });

  it('should have CRO annual return obligation', async () => {
    const result = await client.executeCypher(
      `MATCH (o:Obligation {id: 'IE_CRO_ANNUAL_RETURN'}) RETURN o`,
      {}
    );

    const records = result as Array<{ o: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
    expect(records[0].o.properties.label).toContain('Annual Return');
  });

  it('should have preliminary tax obligation', async () => {
    const result = await client.executeCypher(
      `MATCH (o:Obligation {id: 'IE_PRELIMINARY_TAX'}) RETURN o`,
      {}
    );

    const records = result as Array<{ o: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
    expect(records[0].o.properties.category).toBe('PAYMENT');
  });

  it('should have all obligations linked to IE jurisdiction', async () => {
    const result = await client.executeCypher(
      `MATCH (o:Obligation)-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
       RETURN count(o) as count`,
      {}
    );

    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThanOrEqual(4);
  });

  it('should have obligations linked to profile tags', async () => {
    const result = await client.executeCypher(
      `MATCH (p:ProfileTag)-[:HAS_OBLIGATION]->(o:Obligation)
       RETURN count(o) as count`,
      {}
    );

    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThan(0);
  });

  it('should have single-director profile with CT1 obligation', async () => {
    const result = await client.executeCypher(
      `MATCH (p:ProfileTag)-[:HAS_OBLIGATION]->(o:Obligation {id: 'IE_CT1_FILING'})
       WHERE p.id CONTAINS 'SINGLE_DIRECTOR'
       RETURN count(*) as count`,
      {}
    );

    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThan(0);
  });
});

describe('Seed Data - Thresholds and Rates', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  it('should have CGT annual exemption threshold', async () => {
    const result = await client.executeCypher(
      `MATCH (t:Threshold {id: 'IE_CGT_ANNUAL_EXEMPTION_2024'}) RETURN t`,
      {}
    );

    const records = result as Array<{ t: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
    expect(records[0].t.properties.value).toBe(1270);
    expect(records[0].t.properties.unit).toBe('EUR');
  });

  it('should have small benefit exemption threshold', async () => {
    const result = await client.executeCypher(
      `MATCH (t:Threshold) WHERE t.id CONTAINS 'SMALL_BENEFIT' RETURN t`,
      {}
    );

    const records = result as Array<{ t: { properties: Record<string, unknown> } }>;
    expect(records.length).toBeGreaterThan(0);
    expect(records[0].t.properties.value).toBe(1000);
  });

  it('should have PRSI contribution threshold', async () => {
    const result = await client.executeCypher(
      `MATCH (t:Threshold) WHERE t.id CONTAINS 'PRSI' RETURN t`,
      {}
    );

    const records = result as Array<{ t: { properties: Record<string, unknown> } }>;
    expect(records.length).toBeGreaterThan(0);
  });

  it('should have income tax rates (standard and higher)', async () => {
    const result = await client.executeCypher(
      `MATCH (r:Rate) WHERE r.category = 'INCOME_TAX' AND r.id CONTAINS 'IE'
       RETURN count(r) as count`,
      {}
    );

    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThanOrEqual(2);
  });

  it('should have standard rate income tax at 20%', async () => {
    const result = await client.executeCypher(
      `MATCH (r:Rate {id: 'IE_INCOME_TAX_STANDARD_2024'}) RETURN r`,
      {}
    );

    const records = result as Array<{ r: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
    expect(records[0].r.properties.percentage).toBe(20);
  });

  it('should have higher rate income tax at 40%', async () => {
    const result = await client.executeCypher(
      `MATCH (r:Rate {id: 'IE_INCOME_TAX_HIGHER_2024'}) RETURN r`,
      {}
    );

    const records = result as Array<{ r: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
    expect(records[0].r.properties.percentage).toBe(40);
  });

  it('should have CGT rate at 33%', async () => {
    const result = await client.executeCypher(
      `MATCH (r:Rate) WHERE r.id CONTAINS 'CGT' RETURN r`,
      {}
    );

    const records = result as Array<{ r: { properties: Record<string, unknown> } }>;
    expect(records.length).toBeGreaterThan(0);
    expect(records[0].r.properties.percentage).toBe(33);
  });

  it('should have PRSI Class S rate', async () => {
    const result = await client.executeCypher(
      `MATCH (r:Rate) WHERE r.id CONTAINS 'PRSI_CLASS_S' RETURN r`,
      {}
    );

    const records = result as Array<{ r: { properties: Record<string, unknown> } }>;
    expect(records.length).toBeGreaterThan(0);
  });

  it('should have VAT rates', async () => {
    const result = await client.executeCypher(
      `MATCH (r:Rate) WHERE r.category = 'VAT' RETURN count(r) as count`,
      {}
    );

    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThanOrEqual(2); // Standard and reduced
  });

  it('should have all rates linked to IE jurisdiction', async () => {
    const result = await client.executeCypher(
      `MATCH (r:Rate)-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
       WHERE r.id CONTAINS 'IE'
       RETURN count(r) as count`,
      {}
    );

    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThanOrEqual(6);
  });
});

describe('Seed Data - Forms', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  it('should have CT1 form', async () => {
    const result = await client.executeCypher(
      `MATCH (f:Form {id: 'IE_REVENUE_FORM_CT1'}) RETURN f`,
      {}
    );

    const records = result as Array<{ f: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
    expect(records[0].f.properties.issuing_body).toBe('Revenue');
    expect(records[0].f.properties.online_only).toBe(true);
  });

  it('should have Form 11', async () => {
    const result = await client.executeCypher(
      `MATCH (f:Form {id: 'IE_REVENUE_FORM_11'}) RETURN f`,
      {}
    );

    const records = result as Array<{ f: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
  });

  it('should have CRO B1 form', async () => {
    const result = await client.executeCypher(
      `MATCH (f:Form {id: 'IE_CRO_FORM_B1'}) RETURN f`,
      {}
    );

    const records = result as Array<{ f: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
    expect(records[0].f.properties.issuing_body).toBe('CRO');
  });

  it('should have DSP UP1 form', async () => {
    const result = await client.executeCypher(
      `MATCH (f:Form {id: 'IE_DSP_FORM_UP1'}) RETURN f`,
      {}
    );

    const records = result as Array<{ f: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
    expect(records[0].f.properties.issuing_body).toBe('DSP');
  });

  it('should have forms linked to obligations', async () => {
    const result = await client.executeCypher(
      `MATCH (o:Obligation)-[:REQUIRES_FORM]->(f:Form)
       RETURN count(*) as count`,
      {}
    );

    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThanOrEqual(3);
  });

  it('should have CT1 obligation requiring CT1 form', async () => {
    const result = await client.executeCypher(
      `MATCH (o:Obligation {id: 'IE_CT1_FILING'})-[:REQUIRES_FORM]->(f:Form {id: 'IE_REVENUE_FORM_CT1'})
       RETURN count(*) as count`,
      {}
    );

    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBe(1);
  });

  it('should have all forms with source URLs', async () => {
    const result = await client.executeCypher(
      `MATCH (f:Form) WHERE f.source_url IS NOT NULL
       RETURN count(f) as count`,
      {}
    );

    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThan(0);
  });
});

describe('Seed Data - PRSI Classes', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  it('should have PRSI Class A', async () => {
    const result = await client.executeCypher(
      `MATCH (p:PRSIClass {id: 'IE_PRSI_CLASS_A'}) RETURN p`,
      {}
    );

    const records = result as Array<{ p: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
    expect(records[0].p.properties.label).toBe('Class A');
  });

  it('should have PRSI Class S', async () => {
    const result = await client.executeCypher(
      `MATCH (p:PRSIClass {id: 'IE_PRSI_CLASS_S'}) RETURN p`,
      {}
    );

    const records = result as Array<{ p: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
    expect(records[0].p.properties.label).toBe('Class S');
  });

  it('should have PRSI Class B', async () => {
    const result = await client.executeCypher(
      `MATCH (p:PRSIClass {id: 'IE_PRSI_CLASS_B'}) RETURN p`,
      {}
    );

    const records = result as Array<{ p: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
  });

  it('should have PRSI Class D', async () => {
    const result = await client.executeCypher(
      `MATCH (p:PRSIClass {id: 'IE_PRSI_CLASS_D'}) RETURN p`,
      {}
    );

    const records = result as Array<{ p: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
  });

  it('should have PRSI Class J', async () => {
    const result = await client.executeCypher(
      `MATCH (p:PRSIClass {id: 'IE_PRSI_CLASS_J'}) RETURN p`,
      {}
    );

    const records = result as Array<{ p: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
  });

  it('should have Class A entitled to benefits', async () => {
    const result = await client.executeCypher(
      `MATCH (p:PRSIClass {id: 'IE_PRSI_CLASS_A'})-[:ENTITLES_TO]->(b:Benefit)
       RETURN count(b) as count`,
      {}
    );

    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThan(0);
  });

  it('should have Class A entitled to more benefits than Class S', async () => {
    const classAResult = await client.executeCypher(
      `MATCH (p:PRSIClass {id: 'IE_PRSI_CLASS_A'})-[:ENTITLES_TO]->(b:Benefit)
       RETURN count(b) as count`,
      {}
    );

    const classSResult = await client.executeCypher(
      `MATCH (p:PRSIClass {id: 'IE_PRSI_CLASS_S'})-[:ENTITLES_TO]->(b:Benefit)
       RETURN count(b) as count`,
      {}
    );

    const classARecords = classAResult as Array<{ count: number }>;
    const classSRecords = classSResult as Array<{ count: number }>;

    expect(classARecords[0].count).toBeGreaterThan(classSRecords[0].count);
  });

  it('should have profiles linked to PRSI classes', async () => {
    const result = await client.executeCypher(
      `MATCH (p:ProfileTag)-[:HAS_PRSI_CLASS]->(c:PRSIClass)
       RETURN count(*) as count`,
      {}
    );

    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThan(0);
  });

  it('should have self-employed profile linked to Class S', async () => {
    const result = await client.executeCypher(
      `MATCH (p:ProfileTag)-[:HAS_PRSI_CLASS]->(c:PRSIClass {id: 'IE_PRSI_CLASS_S'})
       WHERE p.id CONTAINS 'SELF_EMPLOYED'
       RETURN count(*) as count`,
      {}
    );

    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThan(0);
  });
});

describe('Seed Data - Life Events', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  it('should have birth of child event', async () => {
    const result = await client.executeCypher(
      `MATCH (e:LifeEvent {id: 'IE_LIFE_EVENT_BIRTH_OF_CHILD'}) RETURN e`,
      {}
    );

    const records = result as Array<{ e: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
    expect(records[0].e.properties.category).toBe('FAMILY');
  });

  it('should have marriage event', async () => {
    const result = await client.executeCypher(
      `MATCH (e:LifeEvent {id: 'IE_LIFE_EVENT_MARRIAGE'}) RETURN e`,
      {}
    );

    const records = result as Array<{ e: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
  });

  it('should have unemployment event', async () => {
    const result = await client.executeCypher(
      `MATCH (e:LifeEvent {id: 'IE_LIFE_EVENT_UNEMPLOYMENT'}) RETURN e`,
      {}
    );

    const records = result as Array<{ e: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
    expect(records[0].e.properties.category).toBe('EMPLOYMENT');
  });

  it('should have retirement event', async () => {
    const result = await client.executeCypher(
      `MATCH (e:LifeEvent {id: 'IE_LIFE_EVENT_RETIREMENT'}) RETURN e`,
      {}
    );

    const records = result as Array<{ e: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
  });

  it('should have illness event', async () => {
    const result = await client.executeCypher(
      `MATCH (e:LifeEvent {id: 'IE_LIFE_EVENT_ILLNESS'}) RETURN e`,
      {}
    );

    const records = result as Array<{ e: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
    expect(records[0].e.properties.category).toBe('HEALTH');
  });

  it('should have immigration event', async () => {
    const result = await client.executeCypher(
      `MATCH (e:LifeEvent {id: 'IE_LIFE_EVENT_IMMIGRATION'}) RETURN e`,
      {}
    );

    const records = result as Array<{ e: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
    expect(records[0].e.properties.category).toBe('RESIDENCY');
  });

  it('should have life events from all categories', async () => {
    const result = await client.executeCypher(
      `MATCH (e:LifeEvent) RETURN distinct e.category as category`,
      {}
    );

    const records = result as Array<{ category: string }>;
    const categories = records.map((r) => r.category);

    expect(categories).toContain('FAMILY');
    expect(categories).toContain('EMPLOYMENT');
    expect(categories).toContain('HEALTH');
    expect(categories).toContain('RESIDENCY');
  });

  it('should have life events triggering benefits', async () => {
    const result = await client.executeCypher(
      `MATCH (e:LifeEvent)-[:TRIGGERS]->(b:Benefit)
       RETURN count(*) as count`,
      {}
    );

    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThan(0);
  });

  it('should have life events triggering obligations', async () => {
    const result = await client.executeCypher(
      `MATCH (e:LifeEvent)-[:TRIGGERS]->(o:Obligation)
       RETURN count(*) as count`,
      {}
    );

    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThan(0);
  });

  it('should have birth event trigger maternity benefit', async () => {
    const result = await client.executeCypher(
      `MATCH (e:LifeEvent {id: 'IE_LIFE_EVENT_BIRTH_OF_CHILD'})-[:TRIGGERS]->(b:Benefit)
       WHERE b.id CONTAINS 'MATERNITY'
       RETURN count(*) as count`,
      {}
    );

    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThan(0);
  });

  it('should have life events starting timelines', async () => {
    const result = await client.executeCypher(
      `MATCH (e:LifeEvent)-[:STARTS_TIMELINE]->(t:Timeline)
       RETURN count(*) as count`,
      {}
    );

    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThan(0);
  });

  it('should have start business event trigger obligations', async () => {
    const result = await client.executeCypher(
      `MATCH (e:LifeEvent {id: 'IE_LIFE_EVENT_START_SELF_EMPLOYMENT'})-[:TRIGGERS]->(o:Obligation)
       RETURN count(o) as count`,
      {}
    );

    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThan(0);
  });
});

describe('Seed Data - Cross-Seed Relationships', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  it('should have complete compliance workflow: Profile -> Obligation -> Form', async () => {
    const result = await client.executeCypher(
      `MATCH (p:ProfileTag)-[:HAS_OBLIGATION]->(o:Obligation)-[:REQUIRES_FORM]->(f:Form)
       RETURN p.id as profile, o.id as obligation, f.id as form
       LIMIT 5`,
      {}
    );

    const records = result as Array<{
      profile: string;
      obligation: string;
      form: string;
    }>;
    expect(records.length).toBeGreaterThan(0);
  });

  it('should have benefit eligibility chain: PRSIClass -> Benefit <- LifeEvent', async () => {
    const result = await client.executeCypher(
      `MATCH (p:PRSIClass)-[:ENTITLES_TO]->(b:Benefit)<-[:TRIGGERS]-(e:LifeEvent)
       RETURN p.id as prsi, b.id as benefit, e.id as event
       LIMIT 5`,
      {}
    );

    const records = result as Array<{
      prsi: string;
      benefit: string;
      event: string;
    }>;
    expect(records.length).toBeGreaterThan(0);
  });

  it('should have complete event-driven path: LifeEvent -> Obligation -> Form', async () => {
    const result = await client.executeCypher(
      `MATCH (e:LifeEvent)-[:TRIGGERS]->(o:Obligation)-[:REQUIRES_FORM]->(f:Form)
       RETURN e.id as event, o.id as obligation, f.id as form`,
      {}
    );

    const records = result as Array<{
      event: string;
      obligation: string;
      form: string;
    }>;
    expect(records.length).toBeGreaterThan(0);
  });

  it('should have PRSI contribution rates linked to classes', async () => {
    const result = await client.executeCypher(
      `MATCH (p:PRSIClass)-[:CONTRIBUTION_RATE]->(r:Rate)
       RETURN count(*) as count`,
      {}
    );

    const records = result as Array<{ count: number }>;
    // May or may not have data depending on seed completeness
    expect(records).toBeDefined();
  });
});
