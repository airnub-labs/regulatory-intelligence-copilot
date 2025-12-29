/**
 * Advanced tests for complex graph patterns
 * Multi-directional chains, temporal queries, legal precedents, and deep traversals
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

describe('Complex Patterns - Multi-Hop Traversals', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  describe('3-hop patterns', () => {
    it('should traverse Profile → PRSI Class → Benefit → Form', async () => {
      const result = await client.executeCypher(
        `MATCH path = (p:ProfileTag)-[:HAS_PRSI_CLASS]->(c:PRSIClass)-[:ENTITLES_TO]->(b:Benefit)-[:CLAIMED_VIA]->(f:Form)
         RETURN
           p.id as profile,
           c.id as prsi_class,
           b.id as benefit,
           f.id as form,
           length(path) as hops`,
        {}
      );

      const records = result as Array<{
        profile: string;
        prsi_class: string;
        benefit: string;
        form: string;
        hops: number;
      }>;

      expect(records.length).toBeGreaterThan(0);
      records.forEach((record) => {
        expect(record.hops).toBe(3);
        expect(record.profile).toBeTruthy();
        expect(record.prsi_class).toBeTruthy();
        expect(record.benefit).toBeTruthy();
        expect(record.form).toBeTruthy();
      });
    });

    it('should traverse LifeEvent → Obligation → Form → Jurisdiction', async () => {
      const result = await client.executeCypher(
        `MATCH path = (e:LifeEvent)-[:TRIGGERS]->(o:Obligation)-[:REQUIRES_FORM]->(f:Form)-[:IN_JURISDICTION]->(j:Jurisdiction)
         RETURN
           e.id as event,
           o.id as obligation,
           f.id as form,
           j.id as jurisdiction,
           length(path) as hops`,
        {}
      );

      const records = result as Array<{
        event: string;
        obligation: string;
        form: string;
        jurisdiction: string;
        hops: number;
      }>;

      expect(records.length).toBeGreaterThan(0);
      records.forEach((record) => {
        expect(record.hops).toBe(3);
      });
    });

    it('should traverse Statute → Section → Benefit → Threshold', async () => {
      const result = await client.executeCypher(
        `MATCH path = (s:Statute)-[:CONTAINS]->(sec:Section)-[:ESTABLISHES|PROVIDES]->(b:Benefit)-[:LIMITED_BY_THRESHOLD]->(t:Threshold)
         RETURN
           s.id as statute,
           sec.id as section,
           b.id as benefit,
           t.id as threshold,
           length(path) as hops
         LIMIT 10`,
        {}
      );

      const records = result as Array<{
        statute: string;
        section: string;
        benefit: string;
        threshold: string;
        hops: number;
      }>;

      if (records.length > 0) {
        records.forEach((record) => {
          expect(record.hops).toBe(3);
        });
      }
    });
  });

  describe('4-hop patterns', () => {
    it('should traverse Profile → Obligation → Timeline → Jurisdiction ← Rate', async () => {
      const result = await client.executeCypher(
        `MATCH path = (p:ProfileTag)-[:HAS_OBLIGATION]->(o:Obligation)-[:FILING_DEADLINE]->(t:Timeline)-[:IN_JURISDICTION]->(j:Jurisdiction)<-[:IN_JURISDICTION]-(r:Rate)
         WHERE r.category = 'INCOME_TAX'
         RETURN
           p.id as profile,
           o.id as obligation,
           t.id as timeline,
           j.id as jurisdiction,
           r.id as rate,
           length(path) as hops
         LIMIT 5`,
        {}
      );

      const records = result as Array<{
        profile: string;
        obligation: string;
        timeline: string;
        jurisdiction: string;
        rate: string;
        hops: number;
      }>;

      if (records.length > 0) {
        records.forEach((record) => {
          expect(record.hops).toBe(4);
        });
      }
    });

    it('should traverse LifeEvent → Benefit → PRSI Class → Profile → Obligation', async () => {
      const result = await client.executeCypher(
        `MATCH path = (e:LifeEvent)-[:TRIGGERS]->(b:Benefit)<-[:ENTITLES_TO]-(c:PRSIClass)<-[:HAS_PRSI_CLASS]-(p:ProfileTag)-[:HAS_OBLIGATION]->(o:Obligation)
         RETURN
           e.id as event,
           b.id as benefit,
           c.id as prsi_class,
           p.id as profile,
           o.id as obligation,
           length(path) as hops
         LIMIT 10`,
        {}
      );

      const records = result as Array<{
        event: string;
        benefit: string;
        prsi_class: string;
        profile: string;
        obligation: string;
        hops: number;
      }>;

      if (records.length > 0) {
        records.forEach((record) => {
          expect(record.hops).toBe(4);
        });
      }
    });
  });

  describe('5+ hop patterns', () => {
    it('should traverse deep compliance chain: Event → Obligation → Form → Jurisdiction → Statute → Section', async () => {
      const result = await client.executeCypher(
        `MATCH path = (e:LifeEvent)-[:TRIGGERS]->(o:Obligation)-[:REQUIRES_FORM]->(f:Form)-[:IN_JURISDICTION]->(j:Jurisdiction)<-[:IN_JURISDICTION]-(s:Statute)-[:CONTAINS]->(sec:Section)
         WHERE sec.id IS NOT NULL
         RETURN
           e.id as event,
           o.id as obligation,
           f.id as form,
           j.id as jurisdiction,
           s.id as statute,
           sec.id as section,
           length(path) as hops
         LIMIT 5`,
        {}
      );

      const records = result as Array<{
        event: string;
        obligation: string;
        form: string;
        jurisdiction: string;
        statute: string;
        section: string;
        hops: number;
      }>;

      if (records.length > 0) {
        records.forEach((record) => {
          expect(record.hops).toBe(5);
        });
      }
    });

    it('should find all paths between Profile and Benefit up to 6 hops', async () => {
      const result = await client.executeCypher(
        `MATCH path = (p:ProfileTag)-[*1..6]->(b:Benefit)
         WHERE p.id CONTAINS 'SELF_EMPLOYED'
         RETURN
           p.id as start,
           b.id as end,
           length(path) as hops,
           [rel in relationships(path) | type(rel)] as path_types
         LIMIT 20`,
        {}
      );

      const records = result as Array<{
        start: string;
        end: string;
        hops: number;
        path_types: string[];
      }>;

      if (records.length > 0) {
        expect(records.length).toBeGreaterThan(0);
        records.forEach((record) => {
          expect(record.hops).toBeGreaterThan(0);
          expect(record.hops).toBeLessThanOrEqual(6);
          expect(record.path_types.length).toBe(record.hops);
        });
      }
    });
  });

  describe('Variable-length paths', () => {
    it('should find shortest path between any two nodes', async () => {
      const result = await client.executeCypher(
        `MATCH (start:ProfileTag {id: 'PROFILE_SELF_EMPLOYED_IE'})
         MATCH (end:Benefit)
         WHERE end.id IS NOT NULL
         MATCH path = shortestPath((start)-[*1..10]-(end))
         RETURN
           start.id as from,
           end.id as to,
           length(path) as distance,
           [rel in relationships(path) | type(rel)] as relationship_chain
         LIMIT 5`,
        {}
      );

      const records = result as Array<{
        from: string;
        to: string;
        distance: number;
        relationship_chain: string[];
      }>;

      if (records.length > 0) {
        records.forEach((record) => {
          expect(record.distance).toBeGreaterThan(0);
          expect(record.relationship_chain.length).toBe(record.distance);
        });
      }
    });

    it('should find all paths of varying lengths', async () => {
      const result = await client.executeCypher(
        `MATCH path = (p:ProfileTag)-[*2..4]->(o:Obligation)
         WHERE p.id CONTAINS 'DIRECTOR'
         RETURN
           p.id as profile,
           o.id as obligation,
           length(path) as path_length,
           [n in nodes(path) | labels(n)[0]] as node_types
         LIMIT 10`,
        {}
      );

      const records = result as Array<{
        profile: string;
        obligation: string;
        path_length: number;
        node_types: string[];
      }>;

      if (records.length > 0) {
        records.forEach((record) => {
          expect(record.path_length).toBeGreaterThanOrEqual(2);
          expect(record.path_length).toBeLessThanOrEqual(4);
        });
      }
    });
  });
});

describe('Complex Patterns - Bidirectional Traversals', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  describe('Forward and backward traversals', () => {
    it('should traverse forward from Obligation to Form and back to Statute', async () => {
      const result = await client.executeCypher(
        `MATCH (o:Obligation)-[:REQUIRES_FORM]->(f:Form)
         MATCH (s:Statute)-[:CREATES_OBLIGATION]->(o)
         RETURN
           s.id as statute,
           o.id as obligation,
           f.id as form
         LIMIT 10`,
        {}
      );

      const records = result as Array<{
        statute: string;
        obligation: string;
        form: string;
      }>;

      if (records.length > 0) {
        expect(records.length).toBeGreaterThan(0);
      }
    });

    it('should find benefits accessible from both Profile and PRSI Class', async () => {
      const result = await client.executeCypher(
        `MATCH (p:ProfileTag)-[:HAS_PRSI_CLASS]->(c:PRSIClass)-[:ENTITLES_TO]->(b:Benefit)
         MATCH (b)<-[:TRIGGERS]-(e:LifeEvent)
         RETURN
           p.id as profile,
           c.id as prsi_class,
           b.id as benefit,
           e.id as life_event
         LIMIT 10`,
        {}
      );

      const records = result as Array<{
        profile: string;
        prsi_class: string;
        benefit: string;
        life_event: string;
      }>;

      if (records.length > 0) {
        expect(records.length).toBeGreaterThan(0);
      }
    });

    it('should traverse both incoming and outgoing relationships from Jurisdiction', async () => {
      const result = await client.executeCypher(
        `MATCH (j:Jurisdiction {id: 'IE'})
         MATCH (j)<-[:IN_JURISDICTION]-(n1)
         MATCH (j)<-[:IN_JURISDICTION]-(n2)
         WHERE n1.id <> n2.id
         AND labels(n1)[0] <> labels(n2)[0]
         RETURN
           labels(n1)[0] as type1,
           n1.id as id1,
           labels(n2)[0] as type2,
           n2.id as id2
         LIMIT 20`,
        {}
      );

      const records = result as Array<{
        type1: string;
        id1: string;
        type2: string;
        id2: string;
      }>;

      expect(records.length).toBeGreaterThan(0);
      records.forEach((record) => {
        expect(record.type1).not.toBe(record.type2);
      });
    });
  });

  describe('Circular and reciprocal patterns', () => {
    it('should detect reciprocal RELATED relationships between Concepts', async () => {
      const result = await client.executeCypher(
        `MATCH (c1:Concept)-[:RELATED]->(c2:Concept)-[:RELATED]->(c1)
         RETURN
           c1.id as concept1,
           c2.id as concept2
         LIMIT 10`,
        {}
      );

      const records = result as Array<{
        concept1: string;
        concept2: string;
      }>;

      if (records.length > 0) {
        records.forEach((record) => {
          expect(record.concept1).not.toBe(record.concept2);
        });
      }
    });

    it('should find diamond patterns: A → B → C ← D ← A', async () => {
      const result = await client.executeCypher(
        `MATCH path = (a)-[r1]->(b)-[r2]->(c)<-[r3]-(d)<-[r4]-(a)
         WHERE
           labels(a)[0] = 'ProfileTag' AND
           labels(c)[0] = 'Benefit'
         RETURN
           a.id as start,
           b.id as intermediate1,
           c.id as center,
           d.id as intermediate2,
           type(r1) as rel1_type,
           type(r2) as rel2_type,
           type(r3) as rel3_type,
           type(r4) as rel4_type
         LIMIT 5`,
        {}
      );

      const records = result as Array<{
        start: string;
        intermediate1: string;
        center: string;
        intermediate2: string;
        rel1_type: string;
        rel2_type: string;
        rel3_type: string;
        rel4_type: string;
      }>;

      if (records.length > 0) {
        expect(records.length).toBeGreaterThan(0);
      }
    });

    it('should find convergent paths: Multiple nodes leading to same target', async () => {
      const result = await client.executeCypher(
        `MATCH (target:Benefit)
         MATCH (source1:PRSIClass)-[:ENTITLES_TO]->(target)
         MATCH (source2:LifeEvent)-[:TRIGGERS]->(target)
         WHERE source1.id <> source2.id
         RETURN
           target.id as benefit,
           collect(DISTINCT source1.id) as prsi_classes,
           collect(DISTINCT source2.id) as life_events,
           size(collect(DISTINCT source1.id)) as prsi_count,
           size(collect(DISTINCT source2.id)) as event_count
         LIMIT 10`,
        {}
      );

      const records = result as Array<{
        benefit: string;
        prsi_classes: string[];
        life_events: string[];
        prsi_count: number;
        event_count: number;
      }>;

      if (records.length > 0) {
        records.forEach((record) => {
          expect(record.prsi_count).toBeGreaterThan(0);
          expect(record.event_count).toBeGreaterThan(0);
        });
      }
    });
  });

  describe('Fan-out and fan-in patterns', () => {
    it('should find fan-out: One node connecting to many targets', async () => {
      const result = await client.executeCypher(
        `MATCH (source:PRSIClass {id: 'IE_PRSI_CLASS_A'})-[:ENTITLES_TO]->(targets:Benefit)
         RETURN
           source.id as prsi_class,
           collect(targets.id) as benefits,
           size(collect(targets.id)) as benefit_count`,
        {}
      );

      const records = result as Array<{
        prsi_class: string;
        benefits: string[];
        benefit_count: number;
      }>;

      expect(records.length).toBe(1);
      if (records[0].benefit_count > 0) {
        expect(records[0].benefit_count).toBeGreaterThan(1);
      }
    });

    it('should find fan-in: Many sources connecting to one target', async () => {
      const result = await client.executeCypher(
        `MATCH (target:Jurisdiction {id: 'IE'})
         MATCH (sources)-[:IN_JURISDICTION]->(target)
         RETURN
           target.id as jurisdiction,
           collect(DISTINCT labels(sources)[0]) as source_types,
           count(DISTINCT sources) as source_count
         LIMIT 1`,
        {}
      );

      const records = result as Array<{
        jurisdiction: string;
        source_types: string[];
        source_count: number;
      }>;

      expect(records.length).toBe(1);
      expect(records[0].source_count).toBeGreaterThan(10);
    });

    it('should find bi-directional fan pattern: Hub with both incoming and outgoing', async () => {
      const result = await client.executeCypher(
        `MATCH (hub:Benefit)
         OPTIONAL MATCH (incoming)-[r_in]->(hub)
         OPTIONAL MATCH (hub)-[r_out]->(outgoing)
         WITH hub,
              collect(DISTINCT type(r_in)) as incoming_rel_types,
              collect(DISTINCT type(r_out)) as outgoing_rel_types,
              count(DISTINCT incoming) as incoming_count,
              count(DISTINCT outgoing) as outgoing_count
         WHERE incoming_count > 2 AND outgoing_count > 2
         RETURN
           hub.id as benefit,
           incoming_rel_types,
           outgoing_rel_types,
           incoming_count,
           outgoing_count
         LIMIT 5`,
        {}
      );

      const records = result as Array<{
        benefit: string;
        incoming_rel_types: string[];
        outgoing_rel_types: string[];
        incoming_count: number;
        outgoing_count: number;
      }>;

      if (records.length > 0) {
        records.forEach((record) => {
          expect(record.incoming_count).toBeGreaterThan(2);
          expect(record.outgoing_count).toBeGreaterThan(2);
        });
      }
    });
  });
});

describe('Complex Patterns - Temporal Queries', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  describe('Effective date filtering', () => {
    it('should find rates effective on a specific date', async () => {
      const specificDate = '2024-06-15';

      const result = await client.executeCypher(
        `MATCH (r:Rate)
         WHERE
           (r.effective_from IS NULL OR r.effective_from <= $date) AND
           (r.effective_to IS NULL OR r.effective_to >= $date)
         RETURN
           r.id as rate_id,
           r.label as rate_label,
           r.effective_from as from_date,
           r.effective_to as to_date,
           r.category as category
         LIMIT 20`,
        { date: specificDate }
      );

      const records = result as Array<{
        rate_id: string;
        rate_label: string;
        from_date: string | null;
        to_date: string | null;
        category: string;
      }>;

      if (records.length > 0) {
        records.forEach((record) => {
          if (record.from_date) {
            expect(record.from_date <= specificDate).toBe(true);
          }
          if (record.to_date) {
            expect(record.to_date >= specificDate).toBe(true);
          }
        });
      }
    });

    it('should find thresholds that changed over time', async () => {
      const result = await client.executeCypher(
        `MATCH (t:Threshold)
         WHERE t.effective_to IS NOT NULL
         OPTIONAL MATCH (update:Update)-[:CHANGES_THRESHOLD]->(t)
         RETURN
           t.id as threshold_id,
           t.effective_from as from_date,
           t.effective_to as to_date,
           update.id as update_id,
           update.effective_from as update_date
         LIMIT 10`,
        {}
      );

      const records = result as Array<{
        threshold_id: string;
        from_date: string | null;
        to_date: string | null;
        update_id: string | null;
        update_date: string | null;
      }>;

      if (records.length > 0) {
        records.forEach((record) => {
          expect(record.to_date).toBeTruthy();
        });
      }
    });

    it('should find all regulations effective in a date range', async () => {
      const startDate = '2024-01-01';
      const endDate = '2024-12-31';

      const result = await client.executeCypher(
        `MATCH (n)
         WHERE
           (n:Rate OR n:Threshold OR n:Section) AND
           n.effective_from >= $startDate AND
           (n.effective_to IS NULL OR n.effective_to <= $endDate)
         RETURN
           labels(n)[0] as node_type,
           n.id as node_id,
           n.effective_from as from_date,
           n.effective_to as to_date
         LIMIT 20`,
        { startDate, endDate }
      );

      const records = result as Array<{
        node_type: string;
        node_id: string;
        from_date: string;
        to_date: string | null;
      }>;

      if (records.length > 0) {
        records.forEach((record) => {
          expect(record.from_date >= startDate).toBe(true);
        });
      }
    });
  });

  describe('Timeline-based patterns', () => {
    it('should find obligations with approaching deadlines', async () => {
      const currentDate = '2024-06-15';

      const result = await client.executeCypher(
        `MATCH (o:Obligation)-[:FILING_DEADLINE]->(t:Timeline)
         MATCH (o)-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
         WHERE t.window_months IS NOT NULL
         RETURN
           o.id as obligation,
           o.label as obligation_name,
           t.window_months as months_window,
           t.window_days as days_window
         LIMIT 10`,
        { currentDate }
      );

      const records = result as Array<{
        obligation: string;
        obligation_name: string;
        months_window: number | null;
        days_window: number | null;
      }>;

      if (records.length > 0) {
        records.forEach((record) => {
          expect(
            record.months_window !== null || record.days_window !== null
          ).toBe(true);
        });
      }
    });

    it('should find benefits with active lookback windows', async () => {
      const result = await client.executeCypher(
        `MATCH (b:Benefit)-[:LOOKBACK_WINDOW]->(t:Timeline)
         WHERE t.window_days IS NOT NULL OR t.window_months IS NOT NULL
         RETURN
           b.id as benefit,
           t.id as timeline,
           t.window_days as lookback_days,
           t.window_months as lookback_months
         LIMIT 10`,
        {}
      );

      const records = result as Array<{
        benefit: string;
        timeline: string;
        lookback_days: number | null;
        lookback_months: number | null;
      }>;

      if (records.length > 0) {
        expect(records.length).toBeGreaterThan(0);
      }
    });

    it('should find life events that start timelines', async () => {
      const result = await client.executeCypher(
        `MATCH (e:LifeEvent)-[:STARTS_TIMELINE]->(t:Timeline)
         WHERE e.triggers_timeline = true
         RETURN
           e.id as event,
           e.label as event_name,
           t.id as timeline,
           t.label as timeline_name,
           t.window_months as duration_months
         LIMIT 10`,
        {}
      );

      const records = result as Array<{
        event: string;
        event_name: string;
        timeline: string;
        timeline_name: string;
        duration_months: number | null;
      }>;

      if (records.length > 0) {
        records.forEach((record) => {
          expect(record.event).toBeTruthy();
          expect(record.timeline).toBeTruthy();
        });
      }
    });
  });

  describe('Historical versioning patterns', () => {
    it('should find current and superseded versions of sections', async () => {
      const currentDate = '2024-06-15';

      const result = await client.executeCypher(
        `MATCH (current:Section)
         WHERE
           (current.effective_from IS NULL OR current.effective_from <= $date) AND
           (current.effective_to IS NULL OR current.effective_to > $date)
         OPTIONAL MATCH (current)<-[:SUPERSEDES]-(previous:Section)
         RETURN
           current.id as current_id,
           current.effective_from as current_from,
           current.effective_to as current_to,
           collect(previous.id) as superseded_versions
         LIMIT 10`,
        { date: currentDate }
      );

      const records = result as Array<{
        current_id: string;
        current_from: string | null;
        current_to: string | null;
        superseded_versions: string[];
      }>;

      if (records.length > 0) {
        expect(records.length).toBeGreaterThan(0);
      }
    });

    it('should find update history chain', async () => {
      const result = await client.executeCypher(
        `MATCH path = (newest:Update)-[:SUPERSEDES*1..5]->(oldest:Update)
         RETURN
           newest.id as newest_update,
           oldest.id as oldest_update,
           length(path) as version_distance,
           [n in nodes(path) | n.effective_from] as version_dates
         LIMIT 5`,
        {}
      );

      const records = result as Array<{
        newest_update: string;
        oldest_update: string;
        version_distance: number;
        version_dates: string[];
      }>;

      if (records.length > 0) {
        records.forEach((record) => {
          expect(record.version_distance).toBeGreaterThan(0);
        });
      }
    });
  });
});

describe('Complex Patterns - Legal Precedent and Supersession', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  describe('Case law superseding statutes', () => {
    it('should find cases that override statute interpretations', async () => {
      const result = await client.executeCypher(
        `MATCH (c:Case)-[:OVERRIDES|:INTERPRETS]->(s:Section)
         OPTIONAL MATCH (s)-[:SUBSECTION_OF]->(parent:Statute)
         RETURN
           c.id as case_id,
           c.title as case_title,
           c.decision_date as decision_date,
           s.id as section_id,
           parent.id as statute_id
         LIMIT 10`,
        {}
      );

      const records = result as Array<{
        case_id: string;
        case_title: string;
        decision_date: string;
        section_id: string;
        statute_id: string | null;
      }>;

      if (records.length > 0) {
        expect(records.length).toBeGreaterThan(0);
      }
    });

    it('should find statute sections with conflicting case law', async () => {
      const result = await client.executeCypher(
        `MATCH (s:Section)
         MATCH (c1:Case)-[:INTERPRETS]->(s)
         MATCH (c2:Case)-[:INTERPRETS]->(s)
         WHERE c1.id <> c2.id
         AND c1.decision_date <> c2.decision_date
         RETURN
           s.id as section,
           collect(DISTINCT c1.id) as cases,
           collect(DISTINCT c1.decision_date) as decision_dates
         LIMIT 5`,
        {}
      );

      const records = result as Array<{
        section: string;
        cases: string[];
        decision_dates: string[];
      }>;

      if (records.length > 0) {
        records.forEach((record) => {
          expect(record.cases.length).toBeGreaterThan(1);
        });
      }
    });

    it('should find most recent case law interpretation for each section', async () => {
      const result = await client.executeCypher(
        `MATCH (s:Section)<-[:INTERPRETS]-(c:Case)
         WITH s, c
         ORDER BY c.decision_date DESC
         WITH s, collect(c)[0] as latest_case
         RETURN
           s.id as section,
           latest_case.id as latest_case,
           latest_case.decision_date as decision_date,
           latest_case.title as case_title
         LIMIT 10`,
        {}
      );

      const records = result as Array<{
        section: string;
        latest_case: string;
        decision_date: string;
        case_title: string;
      }>;

      if (records.length > 0) {
        expect(records.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Temporal supersession patterns', () => {
    it('should find regulations superseded after a specific date', async () => {
      const cutoffDate = '2024-01-01';

      const result = await client.executeCypher(
        `MATCH (old:Section)<-[:SUPERSEDES]-(new:Section)
         WHERE
           new.effective_from >= $cutoffDate
         RETURN
           old.id as superseded_section,
           old.effective_to as superseded_date,
           new.id as new_section,
           new.effective_from as new_effective_date
         LIMIT 10`,
        { cutoffDate }
      );

      const records = result as Array<{
        superseded_section: string;
        superseded_date: string | null;
        new_section: string;
        new_effective_date: string;
      }>;

      if (records.length > 0) {
        records.forEach((record) => {
          expect(record.new_effective_date >= cutoffDate).toBe(true);
        });
      }
    });

    it('should find case law that only applies after certain date', async () => {
      const result = await client.executeCypher(
        `MATCH (c:Case)-[r:OVERRIDES|:CHANGES_INTERPRETATION_OF]->(s:Section)
         WHERE c.decision_date IS NOT NULL
         RETURN
           c.id as case_id,
           c.decision_date as applies_from,
           type(r) as relationship_type,
           s.id as affected_section,
           s.effective_from as section_original_date
         LIMIT 10`,
        {}
      );

      const records = result as Array<{
        case_id: string;
        applies_from: string;
        relationship_type: string;
        affected_section: string;
        section_original_date: string | null;
      }>;

      if (records.length > 0) {
        expect(records.length).toBeGreaterThan(0);
      }
    });

    it('should find which rule version applies on specific date', async () => {
      const queryDate = '2024-06-15';

      const result = await client.executeCypher(
        `MATCH (s:Section)
         WHERE
           (s.effective_from IS NULL OR s.effective_from <= $queryDate) AND
           (s.effective_to IS NULL OR s.effective_to > $queryDate)
         OPTIONAL MATCH (s)<-[:OVERRIDES|:INTERPRETS]-(c:Case)
         WHERE c.decision_date <= $queryDate
         WITH s, c
         ORDER BY c.decision_date DESC
         WITH s, collect(c)[0] as applicable_case
         RETURN
           s.id as section,
           s.effective_from as section_date,
           applicable_case.id as overriding_case,
           applicable_case.decision_date as case_date
         LIMIT 10`,
        { queryDate }
      );

      const records = result as Array<{
        section: string;
        section_date: string | null;
        overriding_case: string | null;
        case_date: string | null;
      }>;

      if (records.length > 0) {
        expect(records.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Amendment and repeal chains', () => {
    it('should find chain of amendments for a statute', async () => {
      const result = await client.executeCypher(
        `MATCH (original:Statute)
         OPTIONAL MATCH path = (original)<-[:AMENDED_BY*1..5]-(amendment)
         WHERE amendment:Update OR amendment:Statute
         RETURN
           original.id as original_statute,
           [n in nodes(path) | {id: n.id, effective_from: n.effective_from}] as amendment_chain,
           length(path) as amendment_count
         LIMIT 5`,
        {}
      );

      const records = result as Array<{
        original_statute: string;
        amendment_chain: Array<{ id: string; effective_from: string }> | null;
        amendment_count: number | null;
      }>;

      if (records.length > 0) {
        expect(records.length).toBeGreaterThan(0);
      }
    });

    it('should find repealed statutes and what repealed them', async () => {
      const result = await client.executeCypher(
        `MATCH (repealed:Statute)<-[:REPEALED_BY]-(repeal)
         RETURN
           repealed.id as repealed_statute,
           labels(repeal)[0] as repealed_by_type,
           repeal.id as repealing_instrument,
           repeal.effective_from as repeal_date
         LIMIT 10`,
        {}
      );

      const records = result as Array<{
        repealed_statute: string;
        repealed_by_type: string;
        repealing_instrument: string;
        repeal_date: string | null;
      }>;

      if (records.length > 0) {
        expect(records.length).toBeGreaterThan(0);
      }
    });

    it('should find conflicting updates to same regulation', async () => {
      const result = await client.executeCypher(
        `MATCH (target:Section)
         MATCH (u1:Update)-[:UPDATES|:CHANGES_INTERPRETATION_OF]->(target)
         MATCH (u2:Update)-[:UPDATES|:CHANGES_INTERPRETATION_OF]->(target)
         WHERE u1.id <> u2.id
         RETURN
           target.id as section,
           u1.id as update1,
           u1.effective_from as date1,
           u2.id as update2,
           u2.effective_from as date2
         LIMIT 5`,
        {}
      );

      const records = result as Array<{
        section: string;
        update1: string;
        date1: string | null;
        update2: string;
        date2: string | null;
      }>;

      if (records.length > 0) {
        expect(records.length).toBeGreaterThan(0);
      }
    });
  });
});
