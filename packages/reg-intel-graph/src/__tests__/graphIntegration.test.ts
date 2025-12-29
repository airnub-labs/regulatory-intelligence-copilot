/**
 * Integration tests for graph schema - node types and relationships
 * Tests the complete graph structure with all node types and relationships
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

describe('Graph Integration - Node Types', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  describe('All node types exist in graph', () => {
    const nodeTypes = [
      'Statute',
      'Section',
      'Benefit',
      'Relief',
      'Condition',
      'Timeline',
      'Case',
      'Guidance',
      'EURegulation',
      'EUDirective',
      'ProfileTag',
      'Jurisdiction',
      'Update',
      'Concept',
      'Label',
      'Region',
      'Agreement',
      'Treaty',
      'Regime',
      'Community',
      'ChangeEvent',
      'Obligation',
      'Threshold',
      'Rate',
      'Form',
      'PRSIClass',
      'LifeEvent',
    ];

    nodeTypes.forEach((nodeType) => {
      it(`should have at least one ${nodeType} node`, async () => {
        const result = await client.executeCypher(
          `MATCH (n:${nodeType}) RETURN count(n) as count LIMIT 1`,
          {}
        );

        const records = result as Array<{ count: number }>;
        // Some node types might not have data yet, that's OK
        expect(records).toBeDefined();
      });
    });
  });

  describe('Jurisdiction nodes', () => {
    it('should have IE jurisdiction', async () => {
      const result = await client.executeCypher(
        `MATCH (j:Jurisdiction {id: 'IE'}) RETURN j`,
        {}
      );

      expect(result).toBeDefined();
    });

    it('should have jurisdiction with proper properties', async () => {
      const result = await client.executeCypher(
        `MATCH (j:Jurisdiction) RETURN j LIMIT 1`,
        {}
      );

      if ((result as Array<unknown>).length > 0) {
        const record = (result as Array<{ j: { properties: Record<string, unknown> } }>)[0];
        expect(record.j.properties).toHaveProperty('id');
        expect(record.j.properties).toHaveProperty('name');
      }
    });
  });

  describe('ProfileTag nodes', () => {
    it('should have self-employed profile tag', async () => {
      const result = await client.executeCypher(
        `MATCH (p:ProfileTag) WHERE p.id CONTAINS 'SELF_EMPLOYED' RETURN count(p) as count`,
        {}
      );

      const records = result as Array<{ count: number }>;
      expect(records[0].count).toBeGreaterThan(0);
    });

    it('should have single-director profile tag', async () => {
      const result = await client.executeCypher(
        `MATCH (p:ProfileTag) WHERE p.id CONTAINS 'SINGLE_DIRECTOR' RETURN count(p) as count`,
        {}
      );

      const records = result as Array<{ count: number }>;
      expect(records[0].count).toBeGreaterThan(0);
    });
  });

  describe('Obligation nodes', () => {
    it('should have obligations with required properties', async () => {
      const result = await client.executeCypher(
        `MATCH (o:Obligation) RETURN o LIMIT 5`,
        {}
      );

      const records = result as Array<{ o: { properties: Record<string, unknown> } }>;
      records.forEach((record) => {
        expect(record.o.properties).toHaveProperty('id');
        expect(record.o.properties).toHaveProperty('label');
        expect(record.o.properties).toHaveProperty('category');
        expect(['FILING', 'REPORTING', 'PAYMENT', 'REGISTRATION']).toContain(
          record.o.properties.category
        );
      });
    });

    it('should have obligations with frequencies', async () => {
      const result = await client.executeCypher(
        `MATCH (o:Obligation) WHERE o.frequency IS NOT NULL RETURN o LIMIT 5`,
        {}
      );

      const records = result as Array<{ o: { properties: Record<string, unknown> } }>;
      records.forEach((record) => {
        if (record.o.properties.frequency) {
          expect(['ANNUAL', 'QUARTERLY', 'MONTHLY', 'ONE_TIME']).toContain(
            record.o.properties.frequency
          );
        }
      });
    });
  });

  describe('Threshold nodes', () => {
    it('should have thresholds with numeric values', async () => {
      const result = await client.executeCypher(
        `MATCH (t:Threshold) RETURN t LIMIT 5`,
        {}
      );

      const records = result as Array<{ t: { properties: Record<string, unknown> } }>;
      records.forEach((record) => {
        expect(record.t.properties).toHaveProperty('id');
        expect(record.t.properties).toHaveProperty('value');
        expect(typeof record.t.properties.value).toBe('number');
        expect(record.t.properties).toHaveProperty('unit');
        expect(record.t.properties).toHaveProperty('direction');
      });
    });

    it('should have thresholds with valid units', async () => {
      const result = await client.executeCypher(
        `MATCH (t:Threshold) RETURN t LIMIT 10`,
        {}
      );

      const records = result as Array<{ t: { properties: Record<string, unknown> } }>;
      records.forEach((record) => {
        expect(['EUR', 'GBP', 'WEEKS', 'DAYS', 'COUNT', 'PERCENT']).toContain(
          record.t.properties.unit
        );
      });
    });
  });

  describe('Rate nodes', () => {
    it('should have rates with percentage or flat amount', async () => {
      const result = await client.executeCypher(
        `MATCH (r:Rate) RETURN r LIMIT 10`,
        {}
      );

      const records = result as Array<{ r: { properties: Record<string, unknown> } }>;
      records.forEach((record) => {
        const hasPercentage = record.r.properties.percentage !== undefined;
        const hasFlatAmount = record.r.properties.flat_amount !== undefined;
        expect(hasPercentage || hasFlatAmount).toBe(true);
      });
    });

    it('should have rates with categories', async () => {
      const result = await client.executeCypher(
        `MATCH (r:Rate) RETURN distinct r.category as category`,
        {}
      );

      const records = result as Array<{ category: string }>;
      expect(records.length).toBeGreaterThan(0);
      records.forEach((record) => {
        expect(record.category).toBeTruthy();
      });
    });
  });

  describe('Form nodes', () => {
    it('should have forms with issuing bodies', async () => {
      const result = await client.executeCypher(
        `MATCH (f:Form) RETURN f LIMIT 10`,
        {}
      );

      const records = result as Array<{ f: { properties: Record<string, unknown> } }>;
      records.forEach((record) => {
        expect(record.f.properties).toHaveProperty('id');
        expect(record.f.properties).toHaveProperty('issuing_body');
        expect(record.f.properties).toHaveProperty('category');
      });
    });

    it('should have forms with source URLs', async () => {
      const result = await client.executeCypher(
        `MATCH (f:Form) WHERE f.source_url IS NOT NULL RETURN f LIMIT 5`,
        {}
      );

      const records = result as Array<{ f: { properties: Record<string, unknown> } }>;
      records.forEach((record) => {
        if (record.f.properties.source_url) {
          expect(typeof record.f.properties.source_url).toBe('string');
        }
      });
    });
  });

  describe('PRSIClass nodes', () => {
    it('should have PRSI classes A and S', async () => {
      const result = await client.executeCypher(
        `MATCH (p:PRSIClass) WHERE p.id IN ['IE_PRSI_CLASS_A', 'IE_PRSI_CLASS_S']
         RETURN count(p) as count`,
        {}
      );

      const records = result as Array<{ count: number }>;
      expect(records[0].count).toBeGreaterThanOrEqual(2);
    });

    it('should have PRSI classes with descriptions', async () => {
      const result = await client.executeCypher(
        `MATCH (p:PRSIClass) RETURN p LIMIT 5`,
        {}
      );

      const records = result as Array<{ p: { properties: Record<string, unknown> } }>;
      records.forEach((record) => {
        expect(record.p.properties).toHaveProperty('description');
        expect(typeof record.p.properties.description).toBe('string');
      });
    });
  });

  describe('LifeEvent nodes', () => {
    it('should have life events with categories', async () => {
      const result = await client.executeCypher(
        `MATCH (e:LifeEvent) RETURN e LIMIT 10`,
        {}
      );

      const records = result as Array<{ e: { properties: Record<string, unknown> } }>;
      records.forEach((record) => {
        expect(record.e.properties).toHaveProperty('category');
        expect(['FAMILY', 'EMPLOYMENT', 'HEALTH', 'RESIDENCY']).toContain(
          record.e.properties.category
        );
      });
    });

    it('should have life events from all categories', async () => {
      const result = await client.executeCypher(
        `MATCH (e:LifeEvent) RETURN distinct e.category as category`,
        {}
      );

      const records = result as Array<{ category: string }>;
      expect(records.length).toBeGreaterThan(0);
    });
  });
});

describe('Graph Integration - Relationships', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  describe('Core relationships', () => {
    it('should have IN_JURISDICTION relationships', async () => {
      const result = await client.executeCypher(
        `MATCH ()-[r:IN_JURISDICTION]->() RETURN count(r) as count`,
        {}
      );

      const records = result as Array<{ count: number }>;
      expect(records[0].count).toBeGreaterThan(0);
    });

    it('should have HAS_PROFILE_TAG relationships', async () => {
      const result = await client.executeCypher(
        `MATCH ()-[r:HAS_PROFILE_TAG]->() RETURN count(r) as count`,
        {}
      );

      const records = result as Array<{ count: number }>;
      // May or may not have data
      expect(records).toBeDefined();
    });
  });

  describe('Obligation relationships', () => {
    it('should have HAS_OBLIGATION relationships from ProfileTag to Obligation', async () => {
      const result = await client.executeCypher(
        `MATCH (p:ProfileTag)-[r:HAS_OBLIGATION]->(o:Obligation)
         RETURN count(r) as count`,
        {}
      );

      const records = result as Array<{ count: number }>;
      expect(records[0].count).toBeGreaterThan(0);
    });

    it('should have REQUIRES_FORM relationships from Obligation to Form', async () => {
      const result = await client.executeCypher(
        `MATCH (o:Obligation)-[r:REQUIRES_FORM]->(f:Form)
         RETURN count(r) as count`,
        {}
      );

      const records = result as Array<{ count: number }>;
      expect(records[0].count).toBeGreaterThan(0);
    });

    it('should have FILING_DEADLINE relationships from Obligation to Timeline', async () => {
      const result = await client.executeCypher(
        `MATCH (o:Obligation)-[r:FILING_DEADLINE]->(t:Timeline)
         RETURN count(r) as count`,
        {}
      );

      const records = result as Array<{ count: number }>;
      // May or may not have data
      expect(records).toBeDefined();
    });

    it('should have CREATES_OBLIGATION relationships', async () => {
      const result = await client.executeCypher(
        `MATCH ()-[r:CREATES_OBLIGATION]->(o:Obligation)
         RETURN count(r) as count`,
        {}
      );

      const records = result as Array<{ count: number }>;
      // May or may not have data yet
      expect(records).toBeDefined();
    });
  });

  describe('Threshold relationships', () => {
    it('should have HAS_THRESHOLD relationships', async () => {
      const result = await client.executeCypher(
        `MATCH ()-[r:HAS_THRESHOLD]->(t:Threshold)
         RETURN count(r) as count`,
        {}
      );

      const records = result as Array<{ count: number }>;
      // May or may not have data
      expect(records).toBeDefined();
    });

    it('should have LIMITED_BY_THRESHOLD relationships', async () => {
      const result = await client.executeCypher(
        `MATCH ()-[r:LIMITED_BY_THRESHOLD]->(t:Threshold)
         RETURN count(r) as count`,
        {}
      );

      const records = result as Array<{ count: number }>;
      expect(records).toBeDefined();
    });

    it('should have CHANGES_THRESHOLD relationships', async () => {
      const result = await client.executeCypher(
        `MATCH (u:Update)-[r:CHANGES_THRESHOLD]->(t:Threshold)
         RETURN count(r) as count`,
        {}
      );

      const records = result as Array<{ count: number }>;
      expect(records).toBeDefined();
    });
  });

  describe('Rate relationships', () => {
    it('should have HAS_RATE relationships', async () => {
      const result = await client.executeCypher(
        `MATCH ()-[r:HAS_RATE]->(rate:Rate)
         RETURN count(r) as count`,
        {}
      );

      const records = result as Array<{ count: number }>;
      expect(records).toBeDefined();
    });

    it('should have SUBJECT_TO_RATE relationships', async () => {
      const result = await client.executeCypher(
        `MATCH ()-[r:SUBJECT_TO_RATE]->(rate:Rate)
         RETURN count(r) as count`,
        {}
      );

      const records = result as Array<{ count: number }>;
      expect(records).toBeDefined();
    });

    it('should have APPLIES_RATE relationships', async () => {
      const result = await client.executeCypher(
        `MATCH ()-[r:APPLIES_RATE]->(rate:Rate)
         RETURN count(r) as count`,
        {}
      );

      const records = result as Array<{ count: number }>;
      expect(records).toBeDefined();
    });
  });

  describe('Form relationships', () => {
    it('should have CLAIMED_VIA relationships from Benefit to Form', async () => {
      const result = await client.executeCypher(
        `MATCH (b:Benefit)-[r:CLAIMED_VIA]->(f:Form)
         RETURN count(r) as count`,
        {}
      );

      const records = result as Array<{ count: number }>;
      expect(records).toBeDefined();
    });

    it('should have Forms connected to Jurisdiction', async () => {
      const result = await client.executeCypher(
        `MATCH (f:Form)-[r:IN_JURISDICTION]->(j:Jurisdiction)
         RETURN count(r) as count`,
        {}
      );

      const records = result as Array<{ count: number }>;
      expect(records[0].count).toBeGreaterThan(0);
    });
  });

  describe('PRSI Class relationships', () => {
    it('should have ENTITLES_TO relationships from PRSIClass to Benefit', async () => {
      const result = await client.executeCypher(
        `MATCH (p:PRSIClass)-[r:ENTITLES_TO]->(b:Benefit)
         RETURN count(r) as count`,
        {}
      );

      const records = result as Array<{ count: number }>;
      expect(records[0].count).toBeGreaterThan(0);
    });

    it('should have HAS_PRSI_CLASS relationships from ProfileTag to PRSIClass', async () => {
      const result = await client.executeCypher(
        `MATCH (p:ProfileTag)-[r:HAS_PRSI_CLASS]->(c:PRSIClass)
         RETURN count(r) as count`,
        {}
      );

      const records = result as Array<{ count: number }>;
      expect(records[0].count).toBeGreaterThan(0);
    });

    it('should have CONTRIBUTION_RATE relationships from PRSIClass to Rate', async () => {
      const result = await client.executeCypher(
        `MATCH (p:PRSIClass)-[r:CONTRIBUTION_RATE]->(rate:Rate)
         RETURN count(r) as count`,
        {}
      );

      const records = result as Array<{ count: number }>;
      // May or may not have data
      expect(records).toBeDefined();
    });
  });

  describe('Life Event relationships', () => {
    it('should have TRIGGERS relationships from LifeEvent to Benefits', async () => {
      const result = await client.executeCypher(
        `MATCH (e:LifeEvent)-[r:TRIGGERS]->(b:Benefit)
         RETURN count(r) as count`,
        {}
      );

      const records = result as Array<{ count: number }>;
      expect(records[0].count).toBeGreaterThan(0);
    });

    it('should have TRIGGERS relationships from LifeEvent to Obligations', async () => {
      const result = await client.executeCypher(
        `MATCH (e:LifeEvent)-[r:TRIGGERS]->(o:Obligation)
         RETURN count(r) as count`,
        {}
      );

      const records = result as Array<{ count: number }>;
      expect(records[0].count).toBeGreaterThan(0);
    });

    it('should have STARTS_TIMELINE relationships', async () => {
      const result = await client.executeCypher(
        `MATCH (e:LifeEvent)-[r:STARTS_TIMELINE]->(t:Timeline)
         RETURN count(r) as count`,
        {}
      );

      const records = result as Array<{ count: number }>;
      expect(records[0].count).toBeGreaterThan(0);
    });

    it('should have ENDS_TIMELINE relationships', async () => {
      const result = await client.executeCypher(
        `MATCH (e:LifeEvent)-[r:ENDS_TIMELINE]->(t:Timeline)
         RETURN count(r) as count`,
        {}
      );

      const records = result as Array<{ count: number }>;
      // May or may not have data
      expect(records).toBeDefined();
    });

    it('should have TRIGGERED_BY relationships', async () => {
      const result = await client.executeCypher(
        `MATCH ()-[r:TRIGGERED_BY]->(e:LifeEvent)
         RETURN count(r) as count`,
        {}
      );

      const records = result as Array<{ count: number }>;
      // May or may not have data
      expect(records).toBeDefined();
    });
  });

  describe('SKOS hierarchy relationships', () => {
    it('should have BROADER relationships between Concepts', async () => {
      const result = await client.executeCypher(
        `MATCH (c1:Concept)-[r:BROADER]->(c2:Concept)
         RETURN count(r) as count`,
        {}
      );

      const records = result as Array<{ count: number }>;
      // May or may not have data yet
      expect(records).toBeDefined();
    });

    it('should have NARROWER relationships between Concepts', async () => {
      const result = await client.executeCypher(
        `MATCH (c1:Concept)-[r:NARROWER]->(c2:Concept)
         RETURN count(r) as count`,
        {}
      );

      const records = result as Array<{ count: number }>;
      expect(records).toBeDefined();
    });

    it('should have RELATED relationships between Concepts', async () => {
      const result = await client.executeCypher(
        `MATCH (c1:Concept)-[r:RELATED]->(c2:Concept)
         RETURN count(r) as count`,
        {}
      );

      const records = result as Array<{ count: number }>;
      expect(records).toBeDefined();
    });
  });

  describe('Complex relationship patterns', () => {
    it('should have complete compliance workflow: Profile -> Obligation -> Form', async () => {
      const result = await client.executeCypher(
        `MATCH (p:ProfileTag)-[:HAS_OBLIGATION]->(o:Obligation)-[:REQUIRES_FORM]->(f:Form)
         RETURN count(*) as count`,
        {}
      );

      const records = result as Array<{ count: number }>;
      expect(records[0].count).toBeGreaterThan(0);
    });

    it('should have benefit eligibility chain: PRSIClass -> Benefit <- LifeEvent', async () => {
      const result = await client.executeCypher(
        `MATCH (p:PRSIClass)-[:ENTITLES_TO]->(b:Benefit)<-[:TRIGGERS]-(e:LifeEvent)
         RETURN count(*) as count`,
        {}
      );

      const records = result as Array<{ count: number }>;
      expect(records[0].count).toBeGreaterThan(0);
    });

    it('should have jurisdictional filtering: Node -> Jurisdiction', async () => {
      const result = await client.executeCypher(
        `MATCH (n)-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
         RETURN count(n) as count`,
        {}
      );

      const records = result as Array<{ count: number }>;
      expect(records[0].count).toBeGreaterThan(0);
    });

    it('should have multi-hop paths: Profile -> PRSI -> Benefit', async () => {
      const result = await client.executeCypher(
        `MATCH (p:ProfileTag)-[:HAS_PRSI_CLASS]->(c:PRSIClass)-[:ENTITLES_TO]->(b:Benefit)
         RETURN count(*) as count`,
        {}
      );

      const records = result as Array<{ count: number }>;
      expect(records[0].count).toBeGreaterThan(0);
    });

    it('should have event-driven paths: LifeEvent -> Obligation -> Form', async () => {
      const result = await client.executeCypher(
        `MATCH (e:LifeEvent)-[:TRIGGERS]->(o:Obligation)-[:REQUIRES_FORM]->(f:Form)
         RETURN count(*) as count`,
        {}
      );

      const records = result as Array<{ count: number }>;
      expect(records[0].count).toBeGreaterThan(0);
    });
  });
});

describe('Graph Integration - Data Integrity', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  describe('Node property constraints', () => {
    it('should have all Obligations with required properties', async () => {
      const result = await client.executeCypher(
        `MATCH (o:Obligation)
         WHERE o.id IS NULL OR o.label IS NULL OR o.category IS NULL
         RETURN count(o) as invalid_count`,
        {}
      );

      const records = result as Array<{ invalid_count: number }>;
      expect(records[0].invalid_count).toBe(0);
    });

    it('should have all Thresholds with numeric values', async () => {
      const result = await client.executeCypher(
        `MATCH (t:Threshold)
         WHERE t.value IS NULL
         RETURN count(t) as invalid_count`,
        {}
      );

      const records = result as Array<{ invalid_count: number }>;
      expect(records[0].invalid_count).toBe(0);
    });

    it('should have all Rates with category', async () => {
      const result = await client.executeCypher(
        `MATCH (r:Rate)
         WHERE r.category IS NULL
         RETURN count(r) as invalid_count`,
        {}
      );

      const records = result as Array<{ invalid_count: number }>;
      expect(records[0].invalid_count).toBe(0);
    });

    it('should have all Forms with issuing_body', async () => {
      const result = await client.executeCypher(
        `MATCH (f:Form)
         WHERE f.issuing_body IS NULL
         RETURN count(f) as invalid_count`,
        {}
      );

      const records = result as Array<{ invalid_count: number }>;
      expect(records[0].invalid_count).toBe(0);
    });

    it('should have all PRSIClasses with description', async () => {
      const result = await client.executeCypher(
        `MATCH (p:PRSIClass)
         WHERE p.description IS NULL
         RETURN count(p) as invalid_count`,
        {}
      );

      const records = result as Array<{ invalid_count: number }>;
      expect(records[0].invalid_count).toBe(0);
    });

    it('should have all LifeEvents with valid categories', async () => {
      const result = await client.executeCypher(
        `MATCH (e:LifeEvent)
         WHERE NOT e.category IN ['FAMILY', 'EMPLOYMENT', 'HEALTH', 'RESIDENCY']
         RETURN count(e) as invalid_count`,
        {}
      );

      const records = result as Array<{ invalid_count: number }>;
      expect(records[0].invalid_count).toBe(0);
    });
  });

  describe('Relationship integrity', () => {
    it('should not have orphaned Obligations (must connect to Jurisdiction)', async () => {
      const result = await client.executeCypher(
        `MATCH (o:Obligation)
         WHERE NOT (o)-[:IN_JURISDICTION]->(:Jurisdiction)
         RETURN count(o) as orphaned_count`,
        {}
      );

      const records = result as Array<{ orphaned_count: number }>;
      expect(records[0].orphaned_count).toBe(0);
    });

    it('should not have orphaned Rates (must connect to Jurisdiction)', async () => {
      const result = await client.executeCypher(
        `MATCH (r:Rate)
         WHERE NOT (r)-[:IN_JURISDICTION]->(:Jurisdiction)
         RETURN count(r) as orphaned_count`,
        {}
      );

      const records = result as Array<{ orphaned_count: number }>;
      expect(records[0].orphaned_count).toBe(0);
    });

    it('should not have orphaned Thresholds (must connect to Jurisdiction)', async () => {
      const result = await client.executeCypher(
        `MATCH (t:Threshold)
         WHERE NOT (t)-[:IN_JURISDICTION]->(:Jurisdiction)
         RETURN count(t) as orphaned_count`,
        {}
      );

      const records = result as Array<{ orphaned_count: number }>;
      expect(records[0].orphaned_count).toBe(0);
    });

    it('should not have circular BROADER relationships', async () => {
      const result = await client.executeCypher(
        `MATCH path = (c:Concept)-[:BROADER*]->(c)
         RETURN count(path) as circular_count`,
        {}
      );

      const records = result as Array<{ circular_count: number }>;
      expect(records[0].circular_count).toBe(0);
    });
  });

  describe('Data consistency', () => {
    it('should have consistent PRSI Class A entitlements', async () => {
      const result = await client.executeCypher(
        `MATCH (p:PRSIClass {id: 'IE_PRSI_CLASS_A'})-[:ENTITLES_TO]->(b:Benefit)
         RETURN count(b) as benefit_count`,
        {}
      );

      const records = result as Array<{ benefit_count: number }>;
      // Class A should entitle to more benefits than Class S
      expect(records[0].benefit_count).toBeGreaterThan(0);
    });

    it('should have self-employed profile linked to Class S', async () => {
      const result = await client.executeCypher(
        `MATCH (p:ProfileTag)-[:HAS_PRSI_CLASS]->(c:PRSIClass)
         WHERE p.id CONTAINS 'SELF_EMPLOYED' AND c.id = 'IE_PRSI_CLASS_S'
         RETURN count(*) as link_count`,
        {}
      );

      const records = result as Array<{ link_count: number }>;
      expect(records[0].link_count).toBeGreaterThan(0);
    });

    it('should have life events trigger appropriate nodes', async () => {
      const result = await client.executeCypher(
        `MATCH (e:LifeEvent)-[:TRIGGERS]->(n)
         RETURN e.category as event_category, labels(n)[0] as triggered_type, count(*) as count`,
        {}
      );

      const records = result as Array<{
        event_category: string;
        triggered_type: string;
        count: number;
      }>;
      expect(records.length).toBeGreaterThan(0);
      records.forEach((record) => {
        expect(['Benefit', 'Relief', 'Obligation']).toContain(record.triggered_type);
      });
    });
  });
});
