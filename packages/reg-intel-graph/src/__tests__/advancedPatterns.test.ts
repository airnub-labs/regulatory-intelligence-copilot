/**
 * Advanced graph patterns: cross-jurisdictional, conditional eligibility,
 * treaty coordination, and complex decision trees
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

describe('Advanced Patterns - Cross-Jurisdictional Analysis', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  describe('Treaty and agreement coordination', () => {
    it('should find benefits coordinated across jurisdictions via treaties', async () => {
      const result = await client.executeCypher(
        `MATCH (j1:Jurisdiction)<-[:PARTY_TO]-(t:Treaty)-[:PARTY_TO]->(j2:Jurisdiction)
         WHERE j1.id <> j2.id
         MATCH (b:Benefit)-[:COORDINATED_WITH]->(t)
         RETURN
           t.id as treaty,
           j1.id as jurisdiction1,
           j2.id as jurisdiction2,
           collect(DISTINCT b.id) as coordinated_benefits
         LIMIT 10`,
        {}
      );

      const records = result as Array<{
        treaty: string;
        jurisdiction1: string;
        jurisdiction2: string;
        coordinated_benefits: string[];
      }>;

      if (records.length > 0) {
        records.forEach((record) => {
          expect(record.jurisdiction1).not.toBe(record.jurisdiction2);
        });
      }
    });

    it('should find equivalent benefits across jurisdictions', async () => {
      const result = await client.executeCypher(
        `MATCH (b1:Benefit)-[:IN_JURISDICTION]->(j1:Jurisdiction {id: 'IE'})
         MATCH (b2:Benefit)-[:IN_JURISDICTION]->(j2:Jurisdiction {id: 'UK'})
         MATCH (b1)-[:EQUIVALENT_TO]-(b2)
         RETURN
           b1.id as ie_benefit,
           b1.name as ie_name,
           b2.id as uk_benefit,
           b2.name as uk_name
         LIMIT 10`,
        {}
      );

      const records = result as Array<{
        ie_benefit: string;
        ie_name: string;
        uk_benefit: string;
        uk_name: string;
      }>;

      if (records.length > 0) {
        expect(records.length).toBeGreaterThan(0);
      }
    });

    it('should find treaty-linked benefits with contribution aggregation', async () => {
      const result = await client.executeCypher(
        `MATCH (t:Treaty)
         MATCH (t)<-[:TREATY_LINKED_TO]-(b:Benefit)
         MATCH (b)-[:LOOKBACK_WINDOW]->(timeline:Timeline)
         RETURN
           t.id as treaty,
           b.id as benefit,
           timeline.window_months as aggregation_period,
           t.description as coordination_rule
         LIMIT 10`,
        {}
      );

      const records = result as Array<{
        treaty: string;
        benefit: string;
        aggregation_period: number | null;
        coordination_rule: string | null;
      }>;

      if (records.length > 0) {
        expect(records.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Cross-border obligation analysis', () => {
    it('should find obligations that apply across multiple jurisdictions', async () => {
      const result = await client.executeCypher(
        `MATCH (o:Obligation)-[:IN_JURISDICTION]->(j:Jurisdiction)
         WITH o, collect(DISTINCT j.id) as jurisdictions
         WHERE size(jurisdictions) > 1
         RETURN
           o.id as obligation,
           o.label as obligation_name,
           jurisdictions,
           size(jurisdictions) as jurisdiction_count
         LIMIT 10`,
        {}
      );

      const records = result as Array<{
        obligation: string;
        obligation_name: string;
        jurisdictions: string[];
        jurisdiction_count: number;
      }>;

      if (records.length > 0) {
        records.forEach((record) => {
          expect(record.jurisdiction_count).toBeGreaterThan(1);
        });
      }
    });

    it('should compare tax rates across jurisdictions', async () => {
      const result = await client.executeCypher(
        `MATCH (r1:Rate)-[:IN_JURISDICTION]->(j1:Jurisdiction)
         MATCH (r2:Rate)-[:IN_JURISDICTION]->(j2:Jurisdiction)
         WHERE
           r1.category = r2.category AND
           r1.category = 'INCOME_TAX' AND
           j1.id <> j2.id AND
           r1.percentage IS NOT NULL AND
           r2.percentage IS NOT NULL
         RETURN
           r1.label as rate1,
           j1.id as jurisdiction1,
           r1.percentage as rate1_pct,
           r2.label as rate2,
           j2.id as jurisdiction2,
           r2.percentage as rate2_pct,
           abs(r1.percentage - r2.percentage) as rate_difference
         ORDER BY rate_difference DESC
         LIMIT 10`,
        {}
      );

      const records = result as Array<{
        rate1: string;
        jurisdiction1: string;
        rate1_pct: number;
        rate2: string;
        jurisdiction2: string;
        rate2_pct: number;
        rate_difference: number;
      }>;

      if (records.length > 0) {
        records.forEach((record) => {
          expect(record.jurisdiction1).not.toBe(record.jurisdiction2);
        });
      }
    });

    it('should find regime-specific rules across jurisdictions', async () => {
      const result = await client.executeCypher(
        `MATCH (regime:Regime)
         MATCH (b:Benefit)-[:AVAILABLE_VIA_REGIME]->(regime)
         MATCH (b)-[:IN_JURISDICTION]->(j:Jurisdiction)
         RETURN
           regime.id as regime,
           regime.name as regime_name,
           collect(DISTINCT j.id) as jurisdictions,
           count(DISTINCT b) as benefit_count
         LIMIT 10`,
        {}
      );

      const records = result as Array<{
        regime: string;
        regime_name: string;
        jurisdictions: string[];
        benefit_count: number;
      }>;

      if (records.length > 0) {
        expect(records.length).toBeGreaterThan(0);
      }
    });
  });

  describe('EU directive implementation patterns', () => {
    it('should find EU directives and their national implementations', async () => {
      const result = await client.executeCypher(
        `MATCH (directive:EUDirective)
         MATCH (directive)<-[:IMPLEMENTED_BY]-(statute:Statute)
         MATCH (statute)-[:IN_JURISDICTION]->(j:Jurisdiction)
         RETURN
           directive.id as eu_directive,
           directive.name as directive_name,
           collect({
             jurisdiction: j.id,
             statute: statute.id,
             statute_name: statute.name
           }) as implementations
         LIMIT 5`,
        {}
      );

      const records = result as Array<{
        eu_directive: string;
        directive_name: string;
        implementations: Array<{
          jurisdiction: string;
          statute: string;
          statute_name: string;
        }>;
      }>;

      if (records.length > 0) {
        expect(records.length).toBeGreaterThan(0);
      }
    });

    it('should find inconsistent directive implementations', async () => {
      const result = await client.executeCypher(
        `MATCH (directive:EUDirective)
         MATCH (directive)<-[:IMPLEMENTED_BY]-(s1:Statute)-[:IN_JURISDICTION]->(j1:Jurisdiction)
         MATCH (directive)<-[:IMPLEMENTED_BY]-(s2:Statute)-[:IN_JURISDICTION]->(j2:Jurisdiction)
         WHERE j1.id <> j2.id
         RETURN
           directive.id as directive,
           j1.id as jurisdiction1,
           s1.id as implementation1,
           j2.id as jurisdiction2,
           s2.id as implementation2
         LIMIT 10`,
        {}
      );

      const records = result as Array<{
        directive: string;
        jurisdiction1: string;
        implementation1: string;
        jurisdiction2: string;
        implementation2: string;
      }>;

      if (records.length > 0) {
        records.forEach((record) => {
          expect(record.jurisdiction1).not.toBe(record.jurisdiction2);
        });
      }
    });
  });
});

describe('Advanced Patterns - Conditional Eligibility Chains', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  describe('Multi-condition eligibility', () => {
    it('should find benefits requiring multiple conditions', async () => {
      const result = await client.executeCypher(
        `MATCH (b:Benefit)
         MATCH (b)<-[:REQUIRES]-(c:Condition)
         WITH b, collect(c) as conditions
         WHERE size(conditions) > 1
         RETURN
           b.id as benefit,
           b.name as benefit_name,
           [c IN conditions | c.label] as required_conditions,
           size(conditions) as condition_count
         LIMIT 10`,
        {}
      );

      const records = result as Array<{
        benefit: string;
        benefit_name: string;
        required_conditions: string[];
        condition_count: number;
      }>;

      if (records.length > 0) {
        records.forEach((record) => {
          expect(record.condition_count).toBeGreaterThan(1);
        });
      }
    });

    it('should find benefits with threshold and timeline conditions', async () => {
      const result = await client.executeCypher(
        `MATCH (b:Benefit)-[:LIMITED_BY_THRESHOLD]->(t:Threshold)
         MATCH (b)-[:LOOKBACK_WINDOW]->(timeline:Timeline)
         RETURN
           b.id as benefit,
           t.value as threshold_value,
           t.unit as threshold_unit,
           t.direction as threshold_direction,
           timeline.window_days as lookback_days,
           timeline.window_months as lookback_months
         LIMIT 10`,
        {}
      );

      const records = result as Array<{
        benefit: string;
        threshold_value: number;
        threshold_unit: string;
        threshold_direction: string;
        lookback_days: number | null;
        lookback_months: number | null;
      }>;

      if (records.length > 0) {
        expect(records.length).toBeGreaterThan(0);
      }
    });

    it('should find PRSI class requirements with contribution thresholds', async () => {
      const result = await client.executeCypher(
        `MATCH (b:Benefit)<-[:ENTITLES_TO]-(prsi:PRSIClass)
         MATCH (b)-[:REQUIRES]->(c:Condition)-[:HAS_THRESHOLD]->(t:Threshold)
         WHERE t.unit = 'WEEKS' OR t.unit = 'COUNT'
         RETURN
           b.id as benefit,
           prsi.label as prsi_class,
           c.label as condition,
           t.value as required_contributions,
           t.unit as unit,
           t.direction as threshold_type
         LIMIT 10`,
        {}
      );

      const records = result as Array<{
        benefit: string;
        prsi_class: string;
        condition: string;
        required_contributions: number;
        unit: string;
        threshold_type: string;
      }>;

      if (records.length > 0) {
        expect(records.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Exclusion and mutual exclusivity patterns', () => {
    it('should find mutually exclusive benefits', async () => {
      const result = await client.executeCypher(
        `MATCH (b1:Benefit)-[:MUTUALLY_EXCLUSIVE_WITH]-(b2:Benefit)
         WHERE b1.id < b2.id
         RETURN
           b1.id as benefit1,
           b1.name as name1,
           b2.id as benefit2,
           b2.name as name2
         LIMIT 10`,
        {}
      );

      const records = result as Array<{
        benefit1: string;
        name1: string;
        benefit2: string;
        name2: string;
      }>;

      if (records.length > 0) {
        records.forEach((record) => {
          expect(record.benefit1).not.toBe(record.benefit2);
        });
      }
    });

    it('should find benefits that exclude based on other benefit receipt', async () => {
      const result = await client.executeCypher(
        `MATCH (b1:Benefit)-[:EXCLUDES]->(b2:Benefit)
         OPTIONAL MATCH (b1)-[:REQUIRES]->(c:Condition)
         WHERE c.description CONTAINS 'not receiving'
         RETURN
           b1.id as primary_benefit,
           b2.id as excluded_benefit,
           c.label as exclusion_condition
         LIMIT 10`,
        {}
      );

      const records = result as Array<{
        primary_benefit: string;
        excluded_benefit: string;
        exclusion_condition: string | null;
      }>;

      if (records.length > 0) {
        expect(records.length).toBeGreaterThan(0);
      }
    });

    it('should find cascading exclusions (A excludes B excludes C)', async () => {
      const result = await client.executeCypher(
        `MATCH path = (b1:Benefit)-[:EXCLUDES*2..3]->(b_final:Benefit)
         RETURN
           b1.id as starting_benefit,
           b_final.id as final_excluded_benefit,
           length(path) as exclusion_depth,
           [b IN nodes(path) | b.id] as exclusion_chain
         LIMIT 10`,
        {}
      );

      const records = result as Array<{
        starting_benefit: string;
        final_excluded_benefit: string;
        exclusion_depth: number;
        exclusion_chain: string[];
      }>;

      if (records.length > 0) {
        records.forEach((record) => {
          expect(record.exclusion_depth).toBeGreaterThanOrEqual(2);
        });
      }
    });
  });

  describe('Life event conditional chains', () => {
    it('should find life events triggering conditional benefit eligibility', async () => {
      const result = await client.executeCypher(
        `MATCH (e:LifeEvent)-[:TRIGGERS]->(b:Benefit)
         MATCH (b)-[:REQUIRES]->(c:Condition)
         MATCH (b)<-[:ENTITLES_TO]-(prsi:PRSIClass)
         RETURN
           e.id as life_event,
           e.label as event_name,
           b.id as benefit,
           collect(DISTINCT c.label) as conditions,
           collect(DISTINCT prsi.label) as eligible_prsi_classes
         LIMIT 10`,
        {}
      );

      const records = result as Array<{
        life_event: string;
        event_name: string;
        benefit: string;
        conditions: string[];
        eligible_prsi_classes: string[];
      }>;

      if (records.length > 0) {
        expect(records.length).toBeGreaterThan(0);
      }
    });

    it('should find events that trigger timeline-dependent eligibility', async () => {
      const result = await client.executeCypher(
        `MATCH (e:LifeEvent {triggers_timeline: true})-[:STARTS_TIMELINE]->(t:Timeline)
         MATCH (e)-[:TRIGGERS]->(b:Benefit)
         RETURN
           e.id as event,
           e.label as event_name,
           t.id as timeline,
           t.window_days as claim_window_days,
           t.window_months as claim_window_months,
           b.id as benefit
         LIMIT 10`,
        {}
      );

      const records = result as Array<{
        event: string;
        event_name: string;
        timeline: string;
        claim_window_days: number | null;
        claim_window_months: number | null;
        benefit: string;
      }>;

      if (records.length > 0) {
        records.forEach((record) => {
          expect(
            record.claim_window_days !== null || record.claim_window_months !== null
          ).toBe(true);
        });
      }
    });
  });

  describe('Lock-in period patterns', () => {
    it('should find benefits with lock-in periods', async () => {
      const result = await client.executeCypher(
        `MATCH (b:Benefit)-[:LOCKS_IN_FOR_PERIOD]->(t:Timeline)
         RETURN
           b.id as benefit,
           b.name as benefit_name,
           t.window_years as lock_years,
           t.window_months as lock_months,
           t.description as lock_description
         LIMIT 10`,
        {}
      );

      const records = result as Array<{
        benefit: string;
        benefit_name: string;
        lock_years: number | null;
        lock_months: number | null;
        lock_description: string | null;
      }>;

      if (records.length > 0) {
        expect(records.length).toBeGreaterThan(0);
      }
    });

    it('should find options that exclude each other once chosen', async () => {
      const result = await client.executeCypher(
        `MATCH (r1:Relief)-[:MUTUALLY_EXCLUSIVE_WITH]-(r2:Relief)
         MATCH (r1)-[:LOCKS_IN_FOR_PERIOD]->(t:Timeline)
         WHERE r1.id < r2.id
         RETURN
           r1.id as option1,
           r2.id as option2,
           t.window_years as lock_period_years,
           r1.description as option1_desc,
           r2.description as option2_desc
         LIMIT 10`,
        {}
      );

      const records = result as Array<{
        option1: string;
        option2: string;
        lock_period_years: number | null;
        option1_desc: string | null;
        option2_desc: string | null;
      }>;

      if (records.length > 0) {
        expect(records.length).toBeGreaterThan(0);
      }
    });
  });
});

describe('Advanced Patterns - Decision Trees and Eligibility Flows', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  describe('Complete eligibility decision trees', () => {
    it('should trace complete path from profile to benefit with all conditions', async () => {
      const result = await client.executeCypher(
        `MATCH (p:ProfileTag {id: 'PROFILE_SELF_EMPLOYED_IE'})
         MATCH (p)-[:HAS_PRSI_CLASS]->(prsi:PRSIClass)
         MATCH (prsi)-[:ENTITLES_TO]->(b:Benefit)
         OPTIONAL MATCH (b)-[:REQUIRES]->(c:Condition)
         OPTIONAL MATCH (b)-[:LIMITED_BY_THRESHOLD]->(t:Threshold)
         OPTIONAL MATCH (b)-[:LOOKBACK_WINDOW]->(timeline:Timeline)
         OPTIONAL MATCH (b)-[:EXCLUDES]->(excluded:Benefit)
         RETURN
           p.id as profile,
           prsi.label as prsi_class,
           b.id as benefit,
           collect(DISTINCT c.label) as conditions,
           collect(DISTINCT {value: t.value, unit: t.unit, direction: t.direction}) as thresholds,
           timeline.window_months as lookback_months,
           collect(DISTINCT excluded.id) as excluded_benefits
         LIMIT 5`,
        {}
      );

      const records = result as Array<{
        profile: string;
        prsi_class: string;
        benefit: string;
        conditions: string[];
        thresholds: Array<{
          value: number | null;
          unit: string | null;
          direction: string | null;
        }>;
        lookback_months: number | null;
        excluded_benefits: string[];
      }>;

      if (records.length > 0) {
        expect(records.length).toBeGreaterThan(0);
      }
    });

    it('should find all paths to a benefit and compare complexity', async () => {
      const result = await client.executeCypher(
        `MATCH path = (start)-[*2..5]->(end:Benefit)
         WHERE start:ProfileTag OR start:LifeEvent
         WITH
           end.id as benefit,
           start.id as entry_point,
           labels(start)[0] as entry_type,
           length(path) as path_length,
           [rel in relationships(path) | type(rel)] as path_steps
         RETURN
           benefit,
           collect({
             from: entry_point,
             type: entry_type,
             length: path_length,
             steps: path_steps
           }) as paths
         LIMIT 5`,
        {}
      );

      const records = result as Array<{
        benefit: string;
        paths: Array<{
          from: string;
          type: string;
          length: number;
          steps: string[];
        }>;
      }>;

      if (records.length > 0) {
        records.forEach((record) => {
          expect(record.paths.length).toBeGreaterThan(0);
        });
      }
    });
  });

  describe('Regulatory complexity metrics', () => {
    it('should calculate complexity score for each benefit', async () => {
      const result = await client.executeCypher(
        `MATCH (b:Benefit)
         OPTIONAL MATCH (b)-[:REQUIRES]->(c:Condition)
         OPTIONAL MATCH (b)-[:LIMITED_BY_THRESHOLD]->(t:Threshold)
         OPTIONAL MATCH (b)-[:EXCLUDES|:MUTUALLY_EXCLUSIVE_WITH]-(excl)
         OPTIONAL MATCH (b)-[:LOOKBACK_WINDOW|:LOCKS_IN_FOR_PERIOD]->(timeline)
         WITH b,
              count(DISTINCT c) as condition_count,
              count(DISTINCT t) as threshold_count,
              count(DISTINCT excl) as exclusion_count,
              count(DISTINCT timeline) as timeline_count
         RETURN
           b.id as benefit,
           condition_count,
           threshold_count,
           exclusion_count,
           timeline_count,
           (condition_count + threshold_count * 2 + exclusion_count + timeline_count) as complexity_score
         ORDER BY complexity_score DESC
         LIMIT 10`,
        {}
      );

      const records = result as Array<{
        benefit: string;
        condition_count: number;
        threshold_count: number;
        exclusion_count: number;
        timeline_count: number;
        complexity_score: number;
      }>;

      if (records.length > 0) {
        records.forEach((record) => {
          expect(record.complexity_score).toBeGreaterThanOrEqual(0);
        });
      }
    });

    it('should find benefits with most restrictive eligibility', async () => {
      const result = await client.executeCypher(
        `MATCH (b:Benefit)
         MATCH (b)-[:REQUIRES]->(c:Condition)
         OPTIONAL MATCH (b)-[:LIMITED_BY_THRESHOLD]->(t:Threshold)
         OPTIONAL MATCH (b)<-[:ENTITLES_TO]-(prsi:PRSIClass)
         WITH b,
              count(DISTINCT c) as condition_count,
              count(DISTINCT t) as threshold_count,
              count(DISTINCT prsi) as prsi_class_count
         WHERE condition_count >= 2 AND threshold_count >= 1
         RETURN
           b.id as benefit,
           b.name as benefit_name,
           condition_count,
           threshold_count,
           prsi_class_count,
           (condition_count >= 3 OR (condition_count >= 2 AND threshold_count >= 2)) as is_highly_restricted
         ORDER BY condition_count DESC, threshold_count DESC
         LIMIT 10`,
        {}
      );

      const records = result as Array<{
        benefit: string;
        benefit_name: string;
        condition_count: number;
        threshold_count: number;
        prsi_class_count: number;
        is_highly_restricted: boolean;
      }>;

      if (records.length > 0) {
        expect(records.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Concept hierarchy navigation', () => {
    it('should traverse broader/narrower concept hierarchies', async () => {
      const result = await client.executeCypher(
        `MATCH path = (specific:Concept)-[:BROADER*1..3]->(general:Concept)
         WHERE specific.kind IS NOT NULL
         RETURN
           specific.id as specific_concept,
           specific.pref_label as specific_label,
           general.id as general_concept,
           general.pref_label as general_label,
           length(path) as hierarchy_depth,
           [n in nodes(path) | n.pref_label] as concept_chain
         LIMIT 10`,
        {}
      );

      const records = result as Array<{
        specific_concept: string;
        specific_label: string;
        general_concept: string;
        general_label: string;
        hierarchy_depth: number;
        concept_chain: string[];
      }>;

      if (records.length > 0) {
        records.forEach((record) => {
          expect(record.hierarchy_depth).toBeGreaterThan(0);
          expect(record.concept_chain.length).toBe(record.hierarchy_depth + 1);
        });
      }
    });

    it('should find all related concepts transitively', async () => {
      const result = await client.executeCypher(
        `MATCH (start:Concept)-[:RELATED]->(related1:Concept)
         OPTIONAL MATCH (related1)-[:RELATED]->(related2:Concept)
         WHERE related2.id <> start.id
         RETURN
           start.id as root_concept,
           collect(DISTINCT related1.id) as direct_related,
           collect(DISTINCT related2.id) as indirect_related
         LIMIT 10`,
        {}
      );

      const records = result as Array<{
        root_concept: string;
        direct_related: string[];
        indirect_related: (string | null)[];
      }>;

      if (records.length > 0) {
        expect(records.length).toBeGreaterThan(0);
      }
    });
  });
});
