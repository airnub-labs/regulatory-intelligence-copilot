/**
 * Tests for Tier 2: LegalEntity and TaxCredit
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

describe('Seed Data - Legal Entities', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  it('should have Irish LTD entity', async () => {
    const result = await client.executeCypher(
      `MATCH (e:LegalEntity {id: 'IE_ENTITY_LTD'}) RETURN e`,
      {}
    );
    const records = result as Array<{ e: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
    expect(records[0].e.properties.abbreviation).toBe('LTD');
    expect(records[0].e.properties.limited_liability).toBe(true);
  });

  it('should have all main Irish entity types', async () => {
    const result = await client.executeCypher(
      `MATCH (e:LegalEntity)-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
       RETURN count(e) as count`,
      {}
    );
    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThanOrEqual(7);
  });

  it('should have tax-transparent entities marked correctly', async () => {
    const result = await client.executeCypher(
      `MATCH (e:LegalEntity) WHERE e.tax_transparent = true
       RETURN e.id as id`,
      {}
    );
    const records = result as Array<{ id: string }>;
    const ids = records.map(r => r.id);
    expect(ids).toContain('IE_ENTITY_PARTNERSHIP');
    expect(ids).toContain('IE_ENTITY_SOLE_TRADER');
  });

  it('should have obligations linked to entity types', async () => {
    const result = await client.executeCypher(
      `MATCH (o:Obligation)-[:APPLIES_TO_ENTITY]->(e:LegalEntity)
       RETURN count(*) as count`,
      {}
    );
    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThan(0);
  });
});

describe('Seed Data - Tax Credits', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  it('should have personal tax credit', async () => {
    const result = await client.executeCypher(
      `MATCH (c:TaxCredit) WHERE c.id CONTAINS 'PERSONAL' RETURN count(c) as count`,
      {}
    );
    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThanOrEqual(2);
  });

  it('should have employee tax credit', async () => {
    const result = await client.executeCypher(
      `MATCH (c:TaxCredit {id: 'IE_EMPLOYEE_TAX_CREDIT_2024'}) RETURN c`,
      {}
    );
    const records = result as Array<{ c: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
    expect(records[0].c.properties.amount).toBe(1875);
  });

  it('should have earned income tax credit', async () => {
    const result = await client.executeCypher(
      `MATCH (c:TaxCredit {id: 'IE_EARNED_INCOME_TAX_CREDIT_2024'}) RETURN c`,
      {}
    );
    const records = result as Array<{ c: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
  });

  it('should have stacking relationships between credits', async () => {
    const result = await client.executeCypher(
      `MATCH (c1:TaxCredit)-[:STACKS_WITH]->(c2:TaxCredit)
       RETURN count(*) as count`,
      {}
    );
    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThan(0);
  });

  it('should have mutual exclusion between Employee and Earned Income credits', async () => {
    const result = await client.executeCypher(
      `MATCH (c1:TaxCredit {id: 'IE_EMPLOYEE_TAX_CREDIT_2024'})
             -[:MUTUALLY_EXCLUSIVE_WITH]-
             (c2:TaxCredit {id: 'IE_EARNED_INCOME_TAX_CREDIT_2024'})
       RETURN count(*) as count`,
      {}
    );
    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBe(1);
  });

  it('should have profiles entitled to tax credits', async () => {
    const result = await client.executeCypher(
      `MATCH (p:ProfileTag)-[:ENTITLED_TO]->(c:TaxCredit)
       RETURN count(*) as count`,
      {}
    );
    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThan(0);
  });
});

describe('GraphClient - Legal Entities', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  it('should get legal entities for jurisdiction', async () => {
    const entities = await client.getLegalEntitiesForJurisdiction('IE');
    expect(entities.length).toBeGreaterThanOrEqual(7);
    expect(entities.some(e => e.id === 'IE_ENTITY_LTD')).toBe(true);
    expect(entities.some(e => e.id === 'IE_ENTITY_DAC')).toBe(true);
  });

  it('should get obligations for entity type', async () => {
    const obligations = await client.getObligationsForEntityType('IE_ENTITY_LTD');
    expect(obligations.length).toBeGreaterThan(0);
    expect(obligations.some(o => o.id === 'IE_CT1_FILING')).toBe(true);
  });

  it('should distinguish tax-transparent entities', async () => {
    const entities = await client.getLegalEntitiesForJurisdiction('IE');
    const transparentEntities = entities.filter(e => e.tax_transparent === true);
    expect(transparentEntities.length).toBeGreaterThan(0);
    expect(transparentEntities.some(e => e.id === 'IE_ENTITY_PARTNERSHIP')).toBe(true);
  });
});

describe('GraphClient - Tax Credits', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  it('should get tax credits for PAYE employee profile', async () => {
    const credits = await client.getTaxCreditsForProfile(
      'PROFILE_PAYE_EMPLOYEE_IE',
      2024,
      'IE'
    );
    expect(credits.length).toBeGreaterThan(0);
    expect(credits.some(c => c.id === 'IE_EMPLOYEE_TAX_CREDIT_2024')).toBe(true);
  });

  it('should get tax credits for self-employed profile', async () => {
    const credits = await client.getTaxCreditsForProfile(
      'PROFILE_SELF_EMPLOYED_IE',
      2024,
      'IE'
    );
    expect(credits.length).toBeGreaterThan(0);
    expect(credits.some(c => c.id === 'IE_EARNED_INCOME_TAX_CREDIT_2024')).toBe(true);
  });

  it('should get stacking options for tax credit', async () => {
    const stackable = await client.getStackingOptions('IE_PERSONAL_TAX_CREDIT_SINGLE_2024');
    expect(stackable.length).toBeGreaterThan(0);
  });
});

describe('Real-world Integration - Entity and Tax Credit Scenarios', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  it('should determine correct obligations for LTD vs sole trader', async () => {
    const ltdObligations = await client.getObligationsForEntityType('IE_ENTITY_LTD');
    const soleTraderObligations = await client.getObligationsForEntityType('IE_ENTITY_SOLE_TRADER');

    // LTD should have CT1 filing
    expect(ltdObligations.some(o => o.id === 'IE_CT1_FILING')).toBe(true);

    // Sole trader should have Form 11 filing
    expect(soleTraderObligations.some(o => o.id === 'IE_FORM_11_FILING')).toBe(true);

    // Obligations should be different
    expect(ltdObligations).not.toEqual(soleTraderObligations);
  });

  it('should correctly identify which tax credits stack and which are mutually exclusive', async () => {
    // Personal credit should stack with Employee credit
    const stacksWithEmployee = await client.getStackingOptions('IE_PERSONAL_TAX_CREDIT_SINGLE_2024');
    expect(stacksWithEmployee.some(n => n.id === 'IE_EMPLOYEE_TAX_CREDIT_2024')).toBe(true);

    // Personal credit should stack with Earned Income credit
    const stacksWithEarned = await client.getStackingOptions('IE_PERSONAL_TAX_CREDIT_SINGLE_2024');
    expect(stacksWithEarned.some(n => n.id === 'IE_EARNED_INCOME_TAX_CREDIT_2024')).toBe(true);

    // Employee and Earned Income should be mutually exclusive
    const employeeMutex = await client.executeCypher(
      `MATCH (c1:TaxCredit {id: 'IE_EMPLOYEE_TAX_CREDIT_2024'})-[:MUTUALLY_EXCLUSIVE_WITH]-(c2)
       RETURN c2.id as id`,
      {}
    );
    const mutexRecords = employeeMutex as Array<{ id: string }>;
    expect(mutexRecords.some(r => r.id === 'IE_EARNED_INCOME_TAX_CREDIT_2024')).toBe(true);
  });

  it('should calculate total tax credits for a PAYE employee', async () => {
    const credits = await client.getTaxCreditsForProfile(
      'PROFILE_PAYE_EMPLOYEE_IE',
      2024,
      'IE'
    );

    // Should have Employee Tax Credit
    const employeeCredit = credits.find(c => c.id === 'IE_EMPLOYEE_TAX_CREDIT_2024');
    expect(employeeCredit).toBeDefined();
    expect(employeeCredit?.amount).toBe(1875);
  });

  it('should differentiate between limited liability and unlimited liability entities', async () => {
    const entities = await client.getLegalEntitiesForJurisdiction('IE');

    const limitedLiability = entities.filter(e => e.limited_liability === true);
    const unlimitedLiability = entities.filter(e => e.limited_liability === false);

    expect(limitedLiability.length).toBeGreaterThan(0);
    expect(unlimitedLiability.length).toBeGreaterThan(0);

    // LTD should have limited liability
    expect(limitedLiability.some(e => e.id === 'IE_ENTITY_LTD')).toBe(true);

    // Sole trader should have unlimited liability
    expect(unlimitedLiability.some(e => e.id === 'IE_ENTITY_SOLE_TRADER')).toBe(true);
  });
});
