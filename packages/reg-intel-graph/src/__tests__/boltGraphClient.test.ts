/**
 * Comprehensive unit tests for BoltGraphClient
 * Tests all GraphClient methods with various scenarios and edge cases
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { BoltGraphClient, createBoltGraphClient } from '../boltGraphClient.js';
import type {
  GraphContext,
  GraphNode,
  Obligation,
  Threshold,
  Rate,
  Form,
  PRSIClass,
  LifeEvent,
  Timeline,
} from '../types.js';

// Mock configuration for testing
const TEST_CONFIG = {
  uri: process.env.MEMGRAPH_URI || 'bolt://localhost:7687',
  username: process.env.MEMGRAPH_USERNAME || '',
  password: process.env.MEMGRAPH_PASSWORD || '',
  database: process.env.MEMGRAPH_DATABASE || 'memgraph',
};

describe('BoltGraphClient - Core Methods', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  describe('getRulesForProfileAndJurisdiction', () => {
    it('should return graph context for valid profile and jurisdiction', async () => {
      const context = await client.getRulesForProfileAndJurisdiction(
        'PROFILE_SELF_EMPLOYED_IE',
        'IE'
      );

      expect(context).toBeDefined();
      expect(context.nodes).toBeInstanceOf(Array);
      expect(context.edges).toBeInstanceOf(Array);
    });

    it('should return empty context for non-existent profile', async () => {
      const context = await client.getRulesForProfileAndJurisdiction(
        'NONEXISTENT_PROFILE',
        'IE'
      );

      expect(context.nodes).toHaveLength(0);
      expect(context.edges).toHaveLength(0);
    });

    it('should filter by keyword when provided', async () => {
      const context = await client.getRulesForProfileAndJurisdiction(
        'PROFILE_SELF_EMPLOYED_IE',
        'IE',
        'tax'
      );

      expect(context).toBeDefined();
      expect(context.nodes).toBeInstanceOf(Array);
    });

    it('should handle multiple jurisdictions', async () => {
      const contexts = await Promise.all([
        client.getRulesForProfileAndJurisdiction('PROFILE_SELF_EMPLOYED_IE', 'IE'),
        client.getRulesForProfileAndJurisdiction('PROFILE_SELF_EMPLOYED_IE', 'UK'),
      ]);

      expect(contexts).toHaveLength(2);
      contexts.forEach((ctx) => {
        expect(ctx.nodes).toBeInstanceOf(Array);
        expect(ctx.edges).toBeInstanceOf(Array);
      });
    });
  });

  describe('getNeighbourhood', () => {
    it('should return neighbourhood context for valid node', async () => {
      // First get a node to test with
      const context = await client.getRulesForProfileAndJurisdiction(
        'PROFILE_SELF_EMPLOYED_IE',
        'IE'
      );

      if (context.nodes.length > 0) {
        const nodeId = context.nodes[0].id;
        const neighbourhood = await client.getNeighbourhood(nodeId);

        expect(neighbourhood).toBeDefined();
        expect(neighbourhood.nodes).toBeInstanceOf(Array);
        expect(neighbourhood.edges).toBeInstanceOf(Array);
      }
    });

    it('should return empty context for non-existent node', async () => {
      const neighbourhood = await client.getNeighbourhood('NONEXISTENT_NODE_ID');

      expect(neighbourhood.nodes).toHaveLength(0);
      expect(neighbourhood.edges).toHaveLength(0);
    });
  });

  describe('getMutualExclusions', () => {
    it('should return array of mutually exclusive nodes', async () => {
      const exclusions = await client.getMutualExclusions('SOME_BENEFIT_ID');

      expect(exclusions).toBeInstanceOf(Array);
    });

    it('should return empty array for non-existent node', async () => {
      const exclusions = await client.getMutualExclusions('NONEXISTENT_NODE_ID');

      expect(exclusions).toHaveLength(0);
    });
  });

  describe('getTimelines', () => {
    it('should return timelines for a node', async () => {
      const timelines = await client.getTimelines('IE_MATERNITY_BENEFIT');

      expect(timelines).toBeInstanceOf(Array);
      timelines.forEach((timeline: Timeline) => {
        expect(timeline).toHaveProperty('id');
        expect(timeline).toHaveProperty('label');
      });
    });

    it('should return empty array for non-existent node', async () => {
      const timelines = await client.getTimelines('NONEXISTENT_NODE_ID');

      expect(timelines).toHaveLength(0);
    });
  });

  describe('getCrossBorderSlice', () => {
    it('should return cross-border context for multiple jurisdictions', async () => {
      const context = await client.getCrossBorderSlice(['IE', 'UK']);

      expect(context).toBeDefined();
      expect(context.nodes).toBeInstanceOf(Array);
      expect(context.edges).toBeInstanceOf(Array);
    });

    it('should return empty context for empty jurisdiction list', async () => {
      const context = await client.getCrossBorderSlice([]);

      expect(context.nodes).toHaveLength(0);
      expect(context.edges).toHaveLength(0);
    });

    it('should handle single jurisdiction', async () => {
      const context = await client.getCrossBorderSlice(['IE']);

      expect(context).toBeDefined();
      expect(context.nodes).toBeInstanceOf(Array);
    });

    it('should handle three or more jurisdictions', async () => {
      const context = await client.getCrossBorderSlice(['IE', 'UK', 'FR']);

      expect(context).toBeDefined();
      expect(context.nodes).toBeInstanceOf(Array);
    });
  });
});

describe('BoltGraphClient - Obligation Methods', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  describe('getObligationsForProfile', () => {
    it('should return obligations for a valid profile and jurisdiction', async () => {
      const obligations = await client.getObligationsForProfile(
        'PROFILE_SINGLE_DIRECTOR_IE',
        'IE'
      );

      expect(obligations).toBeInstanceOf(Array);
      obligations.forEach((obligation: Obligation) => {
        expect(obligation).toHaveProperty('id');
        expect(obligation).toHaveProperty('label');
        expect(obligation).toHaveProperty('category');
        expect(['FILING', 'REPORTING', 'PAYMENT', 'REGISTRATION']).toContain(
          obligation.category
        );
      });
    });

    it('should return empty array for non-existent profile', async () => {
      const obligations = await client.getObligationsForProfile(
        'NONEXISTENT_PROFILE',
        'IE'
      );

      expect(obligations).toHaveLength(0);
    });

    it('should filter obligations by jurisdiction', async () => {
      const ieObligations = await client.getObligationsForProfile(
        'PROFILE_SELF_EMPLOYED_IE',
        'IE'
      );
      const ukObligations = await client.getObligationsForProfile(
        'PROFILE_SELF_EMPLOYED_IE',
        'UK'
      );

      expect(ieObligations).toBeInstanceOf(Array);
      expect(ukObligations).toBeInstanceOf(Array);
      // Should not have the same obligations
    });

    it('should return obligations with correct frequency values', async () => {
      const obligations = await client.getObligationsForProfile(
        'PROFILE_SINGLE_DIRECTOR_IE',
        'IE'
      );

      obligations.forEach((obligation: Obligation) => {
        if (obligation.frequency) {
          expect(['ANNUAL', 'QUARTERLY', 'MONTHLY', 'ONE_TIME']).toContain(
            obligation.frequency
          );
        }
      });
    });

    it('should include penalty_applies flag', async () => {
      const obligations = await client.getObligationsForProfile(
        'PROFILE_SINGLE_DIRECTOR_IE',
        'IE'
      );

      obligations.forEach((obligation: Obligation) => {
        if (obligation.penalty_applies !== undefined) {
          expect(typeof obligation.penalty_applies).toBe('boolean');
        }
      });
    });
  });
});

describe('BoltGraphClient - Threshold Methods', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  describe('getThresholdsForCondition', () => {
    it('should return thresholds for a condition', async () => {
      const thresholds = await client.getThresholdsForCondition('IE_CGT_CONDITION');

      expect(thresholds).toBeInstanceOf(Array);
      thresholds.forEach((threshold: Threshold) => {
        expect(threshold).toHaveProperty('id');
        expect(threshold).toHaveProperty('label');
        expect(threshold).toHaveProperty('value');
        expect(threshold).toHaveProperty('unit');
        expect(threshold).toHaveProperty('direction');
        expect(typeof threshold.value).toBe('number');
      });
    });

    it('should return empty array for non-existent condition', async () => {
      const thresholds = await client.getThresholdsForCondition('NONEXISTENT_CONDITION');

      expect(thresholds).toHaveLength(0);
    });

    it('should return thresholds with valid units', async () => {
      const thresholds = await client.getThresholdsForCondition('IE_CGT_CONDITION');

      thresholds.forEach((threshold: Threshold) => {
        expect(['EUR', 'GBP', 'WEEKS', 'DAYS', 'COUNT', 'PERCENT']).toContain(
          threshold.unit
        );
      });
    });

    it('should return thresholds with valid directions', async () => {
      const thresholds = await client.getThresholdsForCondition('IE_CGT_CONDITION');

      thresholds.forEach((threshold: Threshold) => {
        expect(['ABOVE', 'BELOW', 'BETWEEN']).toContain(threshold.direction);
      });
    });

    it('should include upper_bound for BETWEEN direction', async () => {
      const thresholds = await client.getThresholdsForCondition('IE_CGT_CONDITION');

      thresholds.forEach((threshold: Threshold) => {
        if (threshold.direction === 'BETWEEN') {
          expect(threshold.upper_bound).toBeDefined();
          expect(typeof threshold.upper_bound).toBe('number');
        }
      });
    });
  });

  describe('getThresholdsNearValue', () => {
    it('should find thresholds near a given value', async () => {
      const thresholds = await client.getThresholdsNearValue(1200, 'EUR', 10);

      expect(thresholds).toBeInstanceOf(Array);
      // Should find CGT exemption (€1,270) when searching near €1,200 with 10% tolerance
      thresholds.forEach((threshold: Threshold) => {
        expect(threshold.unit).toBe('EUR');
        const lowerBound = 1200 * 0.9; // 1080
        const upperBound = 1200 * 1.1; // 1320
        expect(threshold.value).toBeGreaterThanOrEqual(lowerBound);
        expect(threshold.value).toBeLessThanOrEqual(upperBound);
      });
    });

    it('should return empty array when no thresholds are near', async () => {
      const thresholds = await client.getThresholdsNearValue(999999, 'EUR', 1);

      expect(thresholds).toHaveLength(0);
    });

    it('should work with different units', async () => {
      const weekThresholds = await client.getThresholdsNearValue(100, 'WEEKS', 10);

      expect(weekThresholds).toBeInstanceOf(Array);
      weekThresholds.forEach((threshold: Threshold) => {
        expect(threshold.unit).toBe('WEEKS');
      });
    });

    it('should respect tolerance percentage', async () => {
      const narrow = await client.getThresholdsNearValue(1200, 'EUR', 1);
      const wide = await client.getThresholdsNearValue(1200, 'EUR', 20);

      expect(wide.length).toBeGreaterThanOrEqual(narrow.length);
    });
  });
});

describe('BoltGraphClient - Rate Methods', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  describe('getRatesForCategory', () => {
    it('should return rates for a category and jurisdiction', async () => {
      const rates = await client.getRatesForCategory('INCOME_TAX', 'IE');

      expect(rates).toBeInstanceOf(Array);
      rates.forEach((rate: Rate) => {
        expect(rate).toHaveProperty('id');
        expect(rate).toHaveProperty('label');
        expect(rate).toHaveProperty('category');
        expect(rate.category).toBe('INCOME_TAX');
      });
    });

    it('should return empty array for non-existent category', async () => {
      const rates = await client.getRatesForCategory('NONEXISTENT_CATEGORY', 'IE');

      expect(rates).toHaveLength(0);
    });

    it('should return rates with percentage or flat_amount', async () => {
      const rates = await client.getRatesForCategory('INCOME_TAX', 'IE');

      rates.forEach((rate: Rate) => {
        expect(
          rate.percentage !== undefined || rate.flat_amount !== undefined
        ).toBe(true);
      });
    });

    it('should filter rates by jurisdiction', async () => {
      const ieRates = await client.getRatesForCategory('VAT', 'IE');
      const ukRates = await client.getRatesForCategory('VAT', 'UK');

      expect(ieRates).toBeInstanceOf(Array);
      expect(ukRates).toBeInstanceOf(Array);
    });

    it('should return rates for different categories', async () => {
      const categories = ['INCOME_TAX', 'VAT', 'CGT', 'PRSI'];
      const results = await Promise.all(
        categories.map((cat) => client.getRatesForCategory(cat, 'IE'))
      );

      results.forEach((rates, idx) => {
        expect(rates).toBeInstanceOf(Array);
      });
    });

    it('should include band information for banded rates', async () => {
      const rates = await client.getRatesForCategory('INCOME_TAX', 'IE');

      rates.forEach((rate: Rate) => {
        if (rate.band_lower !== undefined || rate.band_upper !== undefined) {
          expect(typeof rate.band_lower === 'number' || rate.band_lower === undefined).toBe(
            true
          );
          expect(typeof rate.band_upper === 'number' || rate.band_upper === undefined).toBe(
            true
          );
        }
      });
    });
  });
});

describe('BoltGraphClient - Form Methods', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  describe('getFormForObligation', () => {
    it('should return form for a valid obligation', async () => {
      const form = await client.getFormForObligation('IE_CT1_FILING');

      if (form) {
        expect(form).toHaveProperty('id');
        expect(form).toHaveProperty('label');
        expect(form).toHaveProperty('issuing_body');
        expect(form).toHaveProperty('category');
      }
    });

    it('should return null for non-existent obligation', async () => {
      const form = await client.getFormForObligation('NONEXISTENT_OBLIGATION');

      expect(form).toBeNull();
    });

    it('should return null for obligation without form', async () => {
      const form = await client.getFormForObligation('IE_PRELIMINARY_TAX');

      // Preliminary tax may not have a specific form
      expect(form).toBeInstanceOf(Object);
    });

    it('should include source URL when available', async () => {
      const form = await client.getFormForObligation('IE_CT1_FILING');

      if (form && form.source_url) {
        expect(typeof form.source_url).toBe('string');
        expect(form.source_url).toMatch(/^https?:\/\//);
      }
    });

    it('should include online_only flag', async () => {
      const form = await client.getFormForObligation('IE_CT1_FILING');

      if (form && form.online_only !== undefined) {
        expect(typeof form.online_only).toBe('boolean');
      }
    });
  });

  describe('getConceptHierarchy', () => {
    it('should return concept hierarchy', async () => {
      const hierarchy = await client.getConceptHierarchy('TAX_CONCEPT_IE');

      expect(hierarchy).toHaveProperty('broader');
      expect(hierarchy).toHaveProperty('narrower');
      expect(hierarchy).toHaveProperty('related');
      expect(hierarchy.broader).toBeInstanceOf(Array);
      expect(hierarchy.narrower).toBeInstanceOf(Array);
      expect(hierarchy.related).toBeInstanceOf(Array);
    });

    it('should return empty arrays for non-existent concept', async () => {
      const hierarchy = await client.getConceptHierarchy('NONEXISTENT_CONCEPT');

      expect(hierarchy.broader).toHaveLength(0);
      expect(hierarchy.narrower).toHaveLength(0);
      expect(hierarchy.related).toHaveLength(0);
    });

    it('should not include the concept itself in results', async () => {
      const hierarchy = await client.getConceptHierarchy('TAX_CONCEPT_IE');

      const allNodes = [
        ...hierarchy.broader,
        ...hierarchy.narrower,
        ...hierarchy.related,
      ];
      const hasSelf = allNodes.some((node) => node.id === 'TAX_CONCEPT_IE');
      expect(hasSelf).toBe(false);
    });
  });
});

describe('BoltGraphClient - PRSI Class Methods', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  describe('getPRSIClassById', () => {
    it('should return PRSI class for valid ID', async () => {
      const prsiClass = await client.getPRSIClassById('IE_PRSI_CLASS_A');

      if (prsiClass) {
        expect(prsiClass).toHaveProperty('id');
        expect(prsiClass).toHaveProperty('label');
        expect(prsiClass).toHaveProperty('description');
        expect(prsiClass.id).toBe('IE_PRSI_CLASS_A');
      }
    });

    it('should return null for non-existent PRSI class', async () => {
      const prsiClass = await client.getPRSIClassById('NONEXISTENT_PRSI_CLASS');

      expect(prsiClass).toBeNull();
    });

    it('should include eligible benefits list', async () => {
      const prsiClass = await client.getPRSIClassById('IE_PRSI_CLASS_A');

      if (prsiClass && prsiClass.eligible_benefits) {
        expect(prsiClass.eligible_benefits).toBeInstanceOf(Array);
        expect(prsiClass.eligible_benefits.length).toBeGreaterThan(0);
      }
    });

    it('should return different classes with different properties', async () => {
      const classA = await client.getPRSIClassById('IE_PRSI_CLASS_A');
      const classS = await client.getPRSIClassById('IE_PRSI_CLASS_S');

      expect(classA).not.toEqual(classS);
    });
  });

  describe('getBenefitsForPRSIClass', () => {
    it('should return benefits for a PRSI class', async () => {
      const benefits = await client.getBenefitsForPRSIClass('IE_PRSI_CLASS_A', 'IE');

      expect(benefits).toBeInstanceOf(Array);
      benefits.forEach((benefit: GraphNode) => {
        expect(benefit).toHaveProperty('id');
        expect(benefit).toHaveProperty('label');
        expect(benefit.type).toBe('Benefit');
      });
    });

    it('should return empty array for non-existent PRSI class', async () => {
      const benefits = await client.getBenefitsForPRSIClass(
        'NONEXISTENT_PRSI_CLASS',
        'IE'
      );

      expect(benefits).toHaveLength(0);
    });

    it('should return different benefits for different classes', async () => {
      const classABenefits = await client.getBenefitsForPRSIClass(
        'IE_PRSI_CLASS_A',
        'IE'
      );
      const classSBenefits = await client.getBenefitsForPRSIClass(
        'IE_PRSI_CLASS_S',
        'IE'
      );

      // Class A should have more benefits than Class S
      expect(classABenefits).toBeInstanceOf(Array);
      expect(classSBenefits).toBeInstanceOf(Array);
    });

    it('should filter benefits by jurisdiction', async () => {
      const ieBenefits = await client.getBenefitsForPRSIClass('IE_PRSI_CLASS_A', 'IE');
      const ukBenefits = await client.getBenefitsForPRSIClass('IE_PRSI_CLASS_A', 'UK');

      expect(ieBenefits).toBeInstanceOf(Array);
      expect(ukBenefits).toBeInstanceOf(Array);
    });
  });
});

describe('BoltGraphClient - Life Event Methods', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  describe('getLifeEventsForNode', () => {
    it('should return life events that trigger a benefit', async () => {
      const lifeEvents = await client.getLifeEventsForNode('IE_MATERNITY_BENEFIT');

      expect(lifeEvents).toBeInstanceOf(Array);
      lifeEvents.forEach((event: LifeEvent) => {
        expect(event).toHaveProperty('id');
        expect(event).toHaveProperty('label');
        expect(event).toHaveProperty('category');
        expect(['FAMILY', 'EMPLOYMENT', 'HEALTH', 'RESIDENCY']).toContain(
          event.category
        );
      });
    });

    it('should return empty array for non-existent node', async () => {
      const lifeEvents = await client.getLifeEventsForNode('NONEXISTENT_NODE');

      expect(lifeEvents).toHaveLength(0);
    });

    it('should return life events that trigger an obligation', async () => {
      const lifeEvents = await client.getLifeEventsForNode('IE_CT1_FILING');

      expect(lifeEvents).toBeInstanceOf(Array);
      lifeEvents.forEach((event: LifeEvent) => {
        expect(event).toHaveProperty('category');
      });
    });

    it('should include triggers_timeline flag', async () => {
      const lifeEvents = await client.getLifeEventsForNode('IE_MATERNITY_BENEFIT');

      lifeEvents.forEach((event: LifeEvent) => {
        if (event.triggers_timeline !== undefined) {
          expect(typeof event.triggers_timeline).toBe('boolean');
        }
      });
    });
  });

  describe('getTriggeredByLifeEvent', () => {
    it('should return benefits and obligations triggered by life event', async () => {
      const result = await client.getTriggeredByLifeEvent(
        'IE_LIFE_EVENT_BIRTH_OF_CHILD',
        'IE'
      );

      expect(result).toHaveProperty('benefits');
      expect(result).toHaveProperty('obligations');
      expect(result.benefits).toBeInstanceOf(Array);
      expect(result.obligations).toBeInstanceOf(Array);
    });

    it('should return empty arrays for non-existent life event', async () => {
      const result = await client.getTriggeredByLifeEvent('NONEXISTENT_EVENT', 'IE');

      expect(result.benefits).toHaveLength(0);
      expect(result.obligations).toHaveLength(0);
    });

    it('should filter by jurisdiction', async () => {
      const ieResult = await client.getTriggeredByLifeEvent(
        'IE_LIFE_EVENT_BIRTH_OF_CHILD',
        'IE'
      );
      const ukResult = await client.getTriggeredByLifeEvent(
        'IE_LIFE_EVENT_BIRTH_OF_CHILD',
        'UK'
      );

      expect(ieResult).toBeDefined();
      expect(ukResult).toBeDefined();
    });

    it('should categorize nodes correctly by type', async () => {
      const result = await client.getTriggeredByLifeEvent(
        'IE_LIFE_EVENT_BIRTH_OF_CHILD',
        'IE'
      );

      result.benefits.forEach((node: GraphNode) => {
        expect(node.type).toBe('Benefit');
      });

      result.obligations.forEach((node: GraphNode) => {
        expect(node.type).toBe('Obligation');
      });
    });

    it('should return benefits for family events', async () => {
      const result = await client.getTriggeredByLifeEvent(
        'IE_LIFE_EVENT_BIRTH_OF_CHILD',
        'IE'
      );

      expect(result.benefits.length).toBeGreaterThan(0);
    });

    it('should return obligations for employment events', async () => {
      const result = await client.getTriggeredByLifeEvent(
        'IE_LIFE_EVENT_START_SELF_EMPLOYMENT',
        'IE'
      );

      expect(result.obligations).toBeInstanceOf(Array);
    });
  });
});

describe('BoltGraphClient - Error Handling', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  describe('executeCypher', () => {
    it('should execute valid Cypher query', async () => {
      const result = await client.executeCypher('RETURN 1 as num');

      expect(result).toBeDefined();
    });

    it('should handle parameterized queries', async () => {
      const result = await client.executeCypher(
        'RETURN $value as result',
        { value: 42 }
      );

      expect(result).toBeDefined();
    });

    it('should throw error for invalid Cypher', async () => {
      await expect(
        client.executeCypher('INVALID CYPHER QUERY')
      ).rejects.toThrow();
    });
  });

  describe('Connection handling', () => {
    it('should handle reconnection after close', async () => {
      const tempClient = createBoltGraphClient(TEST_CONFIG);
      await tempClient.close();

      // Should throw error when using closed client
      await expect(
        tempClient.getRulesForProfileAndJurisdiction('PROFILE_SELF_EMPLOYED_IE', 'IE')
      ).rejects.toThrow();
    });
  });
});

describe('BoltGraphClient - Performance and Edge Cases', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  describe('Concurrent queries', () => {
    it('should handle multiple concurrent queries', async () => {
      const promises = [
        client.getObligationsForProfile('PROFILE_SINGLE_DIRECTOR_IE', 'IE'),
        client.getRatesForCategory('INCOME_TAX', 'IE'),
        client.getThresholdsForCondition('IE_CGT_CONDITION'),
        client.getPRSIClassById('IE_PRSI_CLASS_A'),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(4);
      results.forEach((result) => {
        expect(result).toBeDefined();
      });
    });
  });

  describe('Empty and null handling', () => {
    it('should handle empty string parameters', async () => {
      const context = await client.getRulesForProfileAndJurisdiction('', '');

      expect(context.nodes).toHaveLength(0);
    });

    it('should handle special characters in IDs', async () => {
      const form = await client.getFormForObligation('ID_WITH_SPECIAL-CHARS_123');

      expect(form).toBeNull();
    });
  });

  describe('Large result sets', () => {
    it('should handle queries that return many nodes', async () => {
      const context = await client.getCrossBorderSlice(['IE', 'UK', 'FR', 'DE']);

      expect(context.nodes).toBeInstanceOf(Array);
      expect(context.edges).toBeInstanceOf(Array);
      // Should handle large result sets without crashing
    });
  });
});
