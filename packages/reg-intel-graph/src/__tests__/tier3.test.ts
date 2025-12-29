/**
 * Tests for Tier 3: Enhanced Queries & Temporal
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

describe('Seed Data - Regulatory Bodies', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  it('should have Revenue Commissioners', async () => {
    const result = await client.executeCypher(
      `MATCH (rb:RegulatoryBody {id: 'IE_REVENUE'}) RETURN rb`,
      {}
    );
    const records = result as Array<{ rb: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
    expect(records[0].rb.properties.abbreviation).toBe('Revenue');
    expect(records[0].rb.properties.domain).toBe('TAX');
  });

  it('should have all main Irish regulatory bodies', async () => {
    const result = await client.executeCypher(
      `MATCH (rb:RegulatoryBody)-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
       RETURN count(rb) as count`,
      {}
    );
    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThanOrEqual(4);
  });

  it('should have obligations linked to regulatory bodies', async () => {
    const result = await client.executeCypher(
      `MATCH (o:Obligation)-[:ADMINISTERED_BY]->(rb:RegulatoryBody)
       RETURN count(*) as count`,
      {}
    );
    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThan(0);
  });

  it('should have forms linked to issuing bodies', async () => {
    const result = await client.executeCypher(
      `MATCH (f:Form)-[:ISSUED_BY]->(rb:RegulatoryBody)
       RETURN count(*) as count`,
      {}
    );
    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThan(0);
  });
});

describe('Seed Data - Asset Classes', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  it('should have residential property asset class', async () => {
    const result = await client.executeCypher(
      `MATCH (ac:AssetClass {id: 'IE_ASSET_RESIDENTIAL_PROPERTY'}) RETURN ac`,
      {}
    );
    const records = result as Array<{ ac: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
    expect(records[0].ac.properties.category).toBe('PROPERTY');
    expect(records[0].ac.properties.tangible).toBe(true);
    expect(records[0].ac.properties.cgt_applicable).toBe(true);
  });

  it('should have all main Irish asset classes', async () => {
    const result = await client.executeCypher(
      `MATCH (ac:AssetClass)-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
       RETURN count(ac) as count`,
      {}
    );
    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThanOrEqual(6);
  });

  it('should have crypto marked as non-tangible', async () => {
    const result = await client.executeCypher(
      `MATCH (ac:AssetClass {id: 'IE_ASSET_CRYPTO'}) RETURN ac`,
      {}
    );
    const records = result as Array<{ ac: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
    expect(records[0].ac.properties.tangible).toBe(false);
    expect(records[0].ac.properties.cgt_applicable).toBe(true);
    expect(records[0].ac.properties.stamp_duty_applicable).toBe(false);
  });

  it('should have CGT rates linked to asset classes', async () => {
    const result = await client.executeCypher(
      `MATCH (ac:AssetClass)-[:HAS_CGT_RATE]->(r:Rate)
       RETURN count(*) as count`,
      {}
    );
    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThan(0);
  });
});

describe('Seed Data - Tax Years', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  it('should have tax year 2024', async () => {
    const result = await client.executeCypher(
      `MATCH (ty:TaxYear {id: 'IE_TAX_YEAR_2024'}) RETURN ty`,
      {}
    );
    const records = result as Array<{ ty: { properties: Record<string, unknown> } }>;
    expect(records.length).toBe(1);
    expect(records[0].ty.properties.year).toBe(2024);
    expect(records[0].ty.properties.jurisdiction).toBe('IE');
  });

  it('should have multiple tax years', async () => {
    const result = await client.executeCypher(
      `MATCH (ty:TaxYear)-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
       RETURN count(ty) as count`,
      {}
    );
    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThanOrEqual(3);
  });

  it('should have rates linked to tax years', async () => {
    const result = await client.executeCypher(
      `MATCH (r:Rate)-[:APPLIES_IN_YEAR]->(ty:TaxYear)
       RETURN count(*) as count`,
      {}
    );
    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThan(0);
  });

  it('should have tax credits linked to tax years', async () => {
    const result = await client.executeCypher(
      `MATCH (c:TaxCredit)-[:APPLIES_IN_YEAR]->(ty:TaxYear)
       RETURN count(*) as count`,
      {}
    );
    const records = result as Array<{ count: number }>;
    expect(records[0].count).toBeGreaterThan(0);
  });
});

describe('GraphClient - Regulatory Bodies', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  it('should get regulatory bodies for jurisdiction', async () => {
    const bodies = await client.getRegulatoryBodiesForJurisdiction('IE');
    expect(bodies.length).toBeGreaterThanOrEqual(4);
    expect(bodies.some(rb => rb.id === 'IE_REVENUE')).toBe(true);
    expect(bodies.some(rb => rb.id === 'IE_DSP')).toBe(true);
    expect(bodies.some(rb => rb.id === 'IE_CRO')).toBe(true);
  });

  it('should get administering body for obligation', async () => {
    const body = await client.getAdministeringBody('IE_CT1_FILING');
    expect(body).not.toBeNull();
    expect(body?.id).toBe('IE_REVENUE');
    expect(body?.domain).toBe('TAX');
  });

  it('should distinguish tax vs social welfare vs company regulators', async () => {
    const bodies = await client.getRegulatoryBodiesForJurisdiction('IE');

    const taxBodies = bodies.filter(rb => rb.domain === 'TAX');
    const socialBodies = bodies.filter(rb => rb.domain === 'SOCIAL_WELFARE');
    const companyBodies = bodies.filter(rb => rb.domain === 'COMPANY');

    expect(taxBodies.length).toBeGreaterThan(0);
    expect(socialBodies.length).toBeGreaterThan(0);
    expect(companyBodies.length).toBeGreaterThan(0);
  });
});

describe('GraphClient - Asset Classes', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  it('should get asset classes for jurisdiction', async () => {
    const assetClasses = await client.getAssetClassesForJurisdiction('IE');
    expect(assetClasses.length).toBeGreaterThanOrEqual(6);
    expect(assetClasses.some(ac => ac.id === 'IE_ASSET_RESIDENTIAL_PROPERTY')).toBe(true);
    expect(assetClasses.some(ac => ac.id === 'IE_ASSET_CRYPTO')).toBe(true);
  });

  it('should get CGT rate for asset class', async () => {
    const rate = await client.getCGTRateForAsset('IE_ASSET_RESIDENTIAL_PROPERTY');
    expect(rate).not.toBeNull();
    expect(rate?.id).toContain('CGT_RATE');
  });

  it('should distinguish tangible vs intangible assets', async () => {
    const assetClasses = await client.getAssetClassesForJurisdiction('IE');

    const tangible = assetClasses.filter(ac => ac.tangible === true);
    const intangible = assetClasses.filter(ac => ac.tangible === false);

    expect(tangible.length).toBeGreaterThan(0);
    expect(intangible.length).toBeGreaterThan(0);

    // Property should be tangible
    expect(tangible.some(ac => ac.id === 'IE_ASSET_RESIDENTIAL_PROPERTY')).toBe(true);
    // Crypto should be intangible
    expect(intangible.some(ac => ac.id === 'IE_ASSET_CRYPTO')).toBe(true);
  });
});

describe('GraphClient - Tax Years (Temporal Queries)', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  it('should get rates and thresholds for tax year 2024', async () => {
    const result = await client.getRatesForTaxYear(2024, 'IE');

    // Should have some rates
    expect(result.rates.length).toBeGreaterThan(0);

    // Should have some thresholds
    expect(result.thresholds.length).toBeGreaterThan(0);

    // Should have some tax credits
    expect(result.credits.length).toBeGreaterThan(0);
  });

  it('should enable point-in-time queries', async () => {
    // Query for 2024 tax year data
    const result2024 = await client.getRatesForTaxYear(2024, 'IE');

    // All returned items should be for 2024
    result2024.credits.forEach(credit => {
      expect(credit.tax_year).toBe(2024);
    });
  });
});

describe('Real-World Integration - Tier 3 Scenarios', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  it('should answer: Who do I contact about CT1 filing?', async () => {
    const body = await client.getAdministeringBody('IE_CT1_FILING');

    expect(body).not.toBeNull();
    expect(body?.label).toBe('Revenue Commissioners');
    expect(body?.website).toBe('https://www.revenue.ie');
    expect(body?.domain).toBe('TAX');
  });

  it('should answer: What tax rate applies to selling cryptocurrency?', async () => {
    const assetClasses = await client.getAssetClassesForJurisdiction('IE');
    const crypto = assetClasses.find(ac => ac.id === 'IE_ASSET_CRYPTO');

    expect(crypto).toBeDefined();
    expect(crypto?.cgt_applicable).toBe(true);

    // CGT applies to crypto disposals
    if (crypto) {
      const cgtRate = await client.getCGTRateForAsset(crypto.id);
      expect(cgtRate).not.toBeNull();
    }
  });

  it('should answer: What were the tax credits for 2024?', async () => {
    const result = await client.getRatesForTaxYear(2024, 'IE');

    expect(result.credits.length).toBeGreaterThan(0);

    // Should include personal tax credit
    const personalCredit = result.credits.find(c => c.id.includes('PERSONAL'));
    expect(personalCredit).toBeDefined();

    // Should include employee tax credit
    const employeeCredit = result.credits.find(c => c.id.includes('EMPLOYEE'));
    expect(employeeCredit).toBeDefined();
  });

  it('should answer: Is property a tangible asset for tax purposes?', async () => {
    const assetClasses = await client.getAssetClassesForJurisdiction('IE');
    const property = assetClasses.find(ac => ac.id === 'IE_ASSET_RESIDENTIAL_PROPERTY');

    expect(property).toBeDefined();
    expect(property?.tangible).toBe(true);
    expect(property?.category).toBe('PROPERTY');
  });

  it('should answer: What regulatory bodies exist in Ireland?', async () => {
    const bodies = await client.getRegulatoryBodiesForJurisdiction('IE');

    // Should have tax authority
    const revenue = bodies.find(rb => rb.domain === 'TAX');
    expect(revenue).toBeDefined();
    expect(revenue?.abbreviation).toBe('Revenue');

    // Should have social welfare authority
    const dsp = bodies.find(rb => rb.domain === 'SOCIAL_WELFARE');
    expect(dsp).toBeDefined();
    expect(dsp?.abbreviation).toBe('DSP');

    // Should have company registrar
    const cro = bodies.find(rb => rb.domain === 'COMPANY');
    expect(cro).toBeDefined();
    expect(cro?.abbreviation).toBe('CRO');
  });

  it('should enable temporal comparison: 2024 vs future years', async () => {
    const result2024 = await client.getRatesForTaxYear(2024, 'IE');

    // In future, could compare with 2025
    // const result2025 = await client.getRatesForTaxYear(2025, 'IE');

    // For now, just verify 2024 data is accessible
    expect(result2024.credits.length).toBeGreaterThan(0);
    expect(result2024.rates.length).toBeGreaterThan(0);
    expect(result2024.thresholds.length).toBeGreaterThan(0);
  });
});
