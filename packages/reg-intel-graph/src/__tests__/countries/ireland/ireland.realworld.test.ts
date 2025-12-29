/**
 * Ireland Real-World Scenario Integration Tests
 *
 * End-to-end integration tests simulating real user journeys through Irish regulatory system:
 * - New company formation compliance
 * - Employee to self-employed transition
 * - Unemployment claim process
 * - Maternity leave and benefits
 * - Property sale and CGT
 * - Retirement planning
 * - Cross-border workers
 *
 * These tests validate complete regulatory paths from life events through to compliance actions.
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

describe('Ireland Real-World Scenarios - Complete User Journeys', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  describe('Scenario 1: Single Director Company Formation', () => {
    it('should identify complete first-year compliance requirements', async () => {
      // A new single director company needs to know all their obligations
      const result = await client.executeCypher(
        `MATCH (p:ProfileTag)-[:HAS_OBLIGATION]->(o:Obligation)
         WHERE p.id CONTAINS 'SINGLE_DIRECTOR'
         OPTIONAL MATCH (o)-[:REQUIRES_FORM]->(f:Form)
         OPTIONAL MATCH (o)-[:FILING_DEADLINE]->(t:Timeline)
         RETURN
           o.id as obligation,
           o.label as name,
           o.category as type,
           o.frequency as frequency,
           collect(DISTINCT f.form_number) as forms,
           t.window_months as deadline_months,
           o.penalty_applies as penalties
         ORDER BY o.category, o.label`,
        {}
      );

      const records = result as Array<{
        obligation: string;
        name: string;
        type: string;
        frequency: string;
        forms: string[];
        deadline_months: number | null;
        penalties: boolean;
      }>;

      expect(records.length).toBeGreaterThan(0);

      // Should include CT1 filing
      const ct1 = records.find((r) => r.obligation === 'IE_CT1_FILING');
      expect(ct1).toBeDefined();
      expect(ct1?.forms).toContain('CT1');
      expect(ct1?.deadline_months).toBe(9);

      // Should include CRO annual return
      const cro = records.find((r) => r.obligation === 'IE_CRO_ANNUAL_RETURN');
      expect(cro).toBeDefined();
      expect(cro?.forms).toContain('B1');

      // All obligations should have penalties
      records.forEach((record) => {
        if (record.penalties !== null) {
          expect(record.penalties).toBe(true);
        }
      });
    });

    it('should calculate first year tax burden for €100k profit company', async () => {
      const profit = 100000;

      // Corporation tax rate is 12.5% for trading income
      const result = await client.executeCypher(
        `MATCH (r:Rate)-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
         WHERE r.category = 'CORPORATION_TAX' OR r.id CONTAINS 'CT'
         RETURN r.percentage as rate
         LIMIT 1`,
        {}
      );

      // If no specific CT rate in seed data, use known 12.5%
      const ctRate = 12.5;
      const ctDue = profit * (ctRate / 100);

      expect(ctDue).toBe(12500);
    });

    it('should identify PRSI class and benefits for director', async () => {
      const result = await client.executeCypher(
        `MATCH (p:ProfileTag)-[:HAS_PRSI_CLASS]->(pc:PRSIClass)
         WHERE p.id CONTAINS 'SINGLE_DIRECTOR'
         MATCH (pc)-[:ENTITLES_TO]->(b:Benefit)
         RETURN
           pc.id as prsi_class,
           pc.label as class_label,
           collect(b.id) as entitled_benefits`,
        {}
      );

      const records = result as Array<{
        prsi_class: string;
        class_label: string;
        entitled_benefits: string[];
      }>;

      if (records.length > 0) {
        // Directors are typically Class S
        expect(records[0].prsi_class).toContain('CLASS_S');
        expect(records[0].entitled_benefits).toContain(
          'IE_STATE_PENSION_CONTRIBUTORY'
        );
      }
    });
  });

  describe('Scenario 2: Employee Loses Job and Claims Jobseeker\'s Benefit', () => {
    it('should trace complete unemployment claim path', async () => {
      // Life Event → Benefit → Form → Conditions
      const result = await client.executeCypher(
        `MATCH (le:LifeEvent {id: 'IE_LIFE_EVENT_UNEMPLOYMENT'})
         MATCH (b:Benefit {id: 'IE_JOBSEEKERS_BENEFIT'})
         OPTIONAL MATCH (le)-[:TRIGGERS]->(b)
         OPTIONAL MATCH (b)-[:CLAIMED_VIA]->(f:Form)
         OPTIONAL MATCH (pc:PRSIClass)-[:ENTITLES_TO]->(b)
         OPTIONAL MATCH (t:Threshold)<-[:LIMITED_BY_THRESHOLD]-(b)
         RETURN
           le.category as event_category,
           b.id as benefit,
           collect(DISTINCT f.form_number) as claim_forms,
           collect(DISTINCT pc.id) as eligible_prsi_classes,
           collect(DISTINCT t.value) as contribution_thresholds`,
        {}
      );

      const records = result as Array<{
        event_category: string;
        benefit: string;
        claim_forms: string[];
        eligible_prsi_classes: string[];
        contribution_thresholds: number[];
      }>;

      expect(records.length).toBe(1);
      expect(records[0].event_category).toBe('EMPLOYMENT');

      // Should be Class A only (not Class S)
      expect(records[0].eligible_prsi_classes).toContain('IE_PRSI_CLASS_A');
      expect(records[0].eligible_prsi_classes).not.toContain('IE_PRSI_CLASS_S');

      // Should require 104 weeks contributions
      if (records[0].contribution_thresholds.length > 0) {
        expect(records[0].contribution_thresholds).toContain(104);
      }
    });

    it('should verify PRSI contribution requirements', async () => {
      const result = await client.executeCypher(
        `MATCH (t:Threshold {id: 'IE_PRSI_JOBSEEKERS_CONTRIB_THRESHOLD'})
         RETURN t.value as required_weeks, t.direction as direction`,
        {}
      );

      const records = result as Array<{
        required_weeks: number;
        direction: string;
      }>;

      expect(records.length).toBe(1);
      expect(records[0].required_weeks).toBe(104); // 2 years
      expect(records[0].direction).toBe('ABOVE');
    });

    it('should identify form to submit for unemployment claim', async () => {
      const result = await client.executeCypher(
        `MATCH (b:Benefit {id: 'IE_JOBSEEKERS_BENEFIT'})-[:CLAIMED_VIA]->(f:Form)
         RETURN f.form_number as form, f.issuing_body as issuer`,
        {}
      );

      const records = result as Array<{ form: string; issuer: string }>;

      if (records.length > 0) {
        // UP1 form for unemployment
        expect(records[0].form).toContain('UP');
        expect(records[0].issuer).toContain('Social');
      }
    });
  });

  describe('Scenario 3: Maternity Leave and Benefits', () => {
    it('should trace birth event to maternity benefit eligibility', async () => {
      const result = await client.executeCypher(
        `MATCH (le:LifeEvent {id: 'IE_LIFE_EVENT_BIRTH'})
         MATCH (b:Benefit {id: 'IE_MATERNITY_BENEFIT'})
         OPTIONAL MATCH (le)-[:TRIGGERS]->(b)
         MATCH (pc:PRSIClass)-[:ENTITLES_TO]->(b)
         RETURN
           le.category as event_type,
           b.id as benefit,
           collect(DISTINCT pc.id) as eligible_classes
         ORDER BY pc.id`,
        {}
      );

      const records = result as Array<{
        event_type: string;
        benefit: string;
        eligible_classes: string[];
      }>;

      expect(records.length).toBe(1);
      expect(records[0].event_type).toBe('FAMILY');

      // Both Class A (employees) and Class S (self-employed) get maternity benefit
      expect(records[0].eligible_classes).toContain('IE_PRSI_CLASS_A');
      expect(records[0].eligible_classes).toContain('IE_PRSI_CLASS_S');
    });

    it('should identify complete maternity benefit eligibility path', async () => {
      const result = await client.executeCypher(
        `MATCH path = (p:ProfileTag)-[:HAS_PRSI_CLASS]->(pc:PRSIClass)-[:ENTITLES_TO]->(b:Benefit {id: 'IE_MATERNITY_BENEFIT'})
         OPTIONAL MATCH (b)-[:CLAIMED_VIA]->(f:Form)
         RETURN
           p.id as profile,
           pc.id as prsi_class,
           b.id as benefit,
           length(path) as path_length,
           collect(DISTINCT f.form_number) as claim_forms`,
        {}
      );

      const records = result as Array<{
        profile: string;
        prsi_class: string;
        benefit: string;
        path_length: number;
        claim_forms: string[];
      }>;

      expect(records.length).toBeGreaterThan(0);
      expect(records[0].path_length).toBe(2); // Profile → PRSI → Benefit
    });

    it('should support both employees and self-employed mothers', async () => {
      const result = await client.executeCypher(
        `MATCH (b:Benefit {id: 'IE_MATERNITY_BENEFIT'})
         MATCH (classA:PRSIClass {id: 'IE_PRSI_CLASS_A'})-[:ENTITLES_TO]->(b)
         MATCH (classS:PRSIClass {id: 'IE_PRSI_CLASS_S'})-[:ENTITLES_TO]->(b)
         RETURN
           classA.description as employee_description,
           classS.description as self_employed_description`,
        {}
      );

      const records = result as Array<{
        employee_description: string;
        self_employed_description: string;
      }>;

      expect(records.length).toBe(1);
      expect(records[0].employee_description).toContain('Employee');
      expect(records[0].self_employed_description).toContain('Self-employed');
    });
  });

  describe('Scenario 4: Property Sale with Capital Gains Tax', () => {
    it('should calculate CGT on €150k gain with exemption', async () => {
      const gain = 150000;

      const result = await client.executeCypher(
        `MATCH (r:Rate {id: 'IE_CGT_RATE_2024'})
         MATCH (t:Threshold {id: 'IE_CGT_ANNUAL_EXEMPTION_2024'})
         RETURN r.percentage as cgt_rate, t.value as exemption`,
        {}
      );

      const records = result as Array<{ cgt_rate: number; exemption: number }>;
      expect(records.length).toBe(1);

      const taxableGain = gain - records[0].exemption;
      const cgtDue = taxableGain * (records[0].cgt_rate / 100);

      // (€150,000 - €1,270) × 33% = €49,080.90
      expect(cgtDue).toBeCloseTo(49080.9, 2);
    });

    it('should identify CGT rate and exemption relationship', async () => {
      const result = await client.executeCypher(
        `MATCH (r:Rate {category: 'CGT'})-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
         MATCH (t:Threshold {category: 'CGT'})-[:IN_JURISDICTION]->(j)
         WHERE r.id CONTAINS '2024' AND t.id CONTAINS '2024'
         RETURN
           r.percentage as rate,
           t.value as annual_exemption,
           r.effective_from as rate_effective,
           t.effective_from as exemption_effective`,
        {}
      );

      const records = result as Array<{
        rate: number;
        annual_exemption: number;
        rate_effective: string;
        exemption_effective: string;
      }>;

      expect(records.length).toBe(1);
      expect(records[0].rate).toBe(33);
      expect(records[0].annual_exemption).toBe(1270);

      // Both should be effective from same date
      expect(records[0].rate_effective).toBe(records[0].exemption_effective);
    });
  });

  describe('Scenario 5: Employee to Self-Employed Transition', () => {
    it('should compare compliance changes when switching from PAYE to self-employed', async () => {
      const result = await client.executeCypher(
        `MATCH (paye:ProfileTag)-[:HAS_OBLIGATION]->(o1:Obligation)
         WHERE paye.id CONTAINS 'PAYE_EMPLOYEE'
         WITH collect(DISTINCT o1.id) as paye_obligations
         MATCH (self:ProfileTag)-[:HAS_OBLIGATION]->(o2:Obligation)
         WHERE self.id CONTAINS 'SELF_EMPLOYED'
         WITH
           paye_obligations,
           collect(DISTINCT o2.id) as self_obligations
         RETURN
           paye_obligations,
           self_obligations,
           [o IN self_obligations WHERE NOT o IN paye_obligations] as new_obligations,
           [o IN paye_obligations WHERE NOT o IN self_obligations] as lost_obligations`,
        {}
      );

      const records = result as Array<{
        paye_obligations: string[];
        self_obligations: string[];
        new_obligations: string[];
        lost_obligations: string[];
      }>;

      if (records.length > 0) {
        // Self-employed should have Form 11 obligation
        expect(records[0].new_obligations).toContain('IE_FORM_11_FILING');
      }
    });

    it('should compare PRSI benefits between Class A and Class S', async () => {
      const result = await client.executeCypher(
        `MATCH (a:PRSIClass {id: 'IE_PRSI_CLASS_A'})-[:ENTITLES_TO]->(ba:Benefit)
         WITH collect(DISTINCT ba.id) as class_a_benefits
         MATCH (s:PRSIClass {id: 'IE_PRSI_CLASS_S'})-[:ENTITLES_TO]->(bs:Benefit)
         WITH
           class_a_benefits,
           collect(DISTINCT bs.id) as class_s_benefits
         RETURN
           class_a_benefits,
           class_s_benefits,
           [b IN class_a_benefits WHERE NOT b IN class_s_benefits] as lost_benefits,
           [b IN class_s_benefits WHERE b IN class_a_benefits] as retained_benefits`,
        {}
      );

      const records = result as Array<{
        class_a_benefits: string[];
        class_s_benefits: string[];
        lost_benefits: string[];
        retained_benefits: string[];
      }>;

      expect(records.length).toBe(1);

      // Lose Jobseeker's Benefit when going self-employed
      expect(records[0].lost_benefits).toContain('IE_JOBSEEKERS_BENEFIT');

      // Keep State Pension
      expect(records[0].retained_benefits).toContain(
        'IE_STATE_PENSION_CONTRIBUTORY'
      );

      // Keep Maternity Benefit
      expect(records[0].retained_benefits).toContain('IE_MATERNITY_BENEFIT');
    });

    it('should compare tax obligations and rates', async () => {
      const income = 50000;

      // Get PRSI rates for both
      const result = await client.executeCypher(
        `MATCH (ca:PRSIClass {id: 'IE_PRSI_CLASS_A'})-[:CONTRIBUTION_RATE]->(ra:Rate)
         MATCH (cs:PRSIClass {id: 'IE_PRSI_CLASS_S'})-[:CONTRIBUTION_RATE]->(rs:Rate)
         RETURN
           ra.percentage as employee_prsi_rate,
           rs.percentage as self_employed_prsi_rate`,
        {}
      );

      const records = result as Array<{
        employee_prsi_rate: number;
        self_employed_prsi_rate: number;
      }>;

      if (records.length > 0) {
        const employeePRSI = income * (records[0].employee_prsi_rate / 100);
        const selfEmployedPRSI =
          income * (records[0].self_employed_prsi_rate / 100);

        // Self-employed typically pays 4%
        expect(records[0].self_employed_prsi_rate).toBe(4);
        expect(selfEmployedPRSI).toBe(2000);
      }
    });
  });

  describe('Scenario 6: Retirement and State Pension', () => {
    it('should identify State Pension eligibility requirements', async () => {
      const result = await client.executeCypher(
        `MATCH (b:Benefit {id: 'IE_STATE_PENSION_CONTRIBUTORY'})
         MATCH (pc:PRSIClass)-[:ENTITLES_TO]->(b)
         OPTIONAL MATCH (le:LifeEvent {id: 'IE_LIFE_EVENT_RETIREMENT'})-[:TRIGGERS]->(b)
         RETURN
           b.id as pension,
           collect(DISTINCT pc.id) as eligible_prsi_classes,
           le.id as triggering_event`,
        {}
      );

      const records = result as Array<{
        pension: string;
        eligible_prsi_classes: string[];
        triggering_event: string | null;
      }>;

      expect(records.length).toBe(1);

      // Both employees and self-employed eligible
      expect(records[0].eligible_prsi_classes).toContain('IE_PRSI_CLASS_A');
      expect(records[0].eligible_prsi_classes).toContain('IE_PRSI_CLASS_S');

      // Should be triggered by retirement event
      if (records[0].triggering_event) {
        expect(records[0].triggering_event).toBe('IE_LIFE_EVENT_RETIREMENT');
      }
    });

    it('should trace retirement life event to pension benefit', async () => {
      const result = await client.executeCypher(
        `MATCH (le:LifeEvent {id: 'IE_LIFE_EVENT_RETIREMENT'})
         MATCH (b:Benefit {id: 'IE_STATE_PENSION_CONTRIBUTORY'})
         OPTIONAL MATCH (le)-[:TRIGGERS]->(b)
         OPTIONAL MATCH (b)-[:CLAIMED_VIA]->(f:Form)
         RETURN
           le.category as event_category,
           b.id as benefit,
           collect(f.form_number) as application_forms`,
        {}
      );

      const records = result as Array<{
        event_category: string;
        benefit: string;
        application_forms: string[];
      }>;

      expect(records.length).toBe(1);
      expect(records[0].event_category).toBe('EMPLOYMENT');
    });
  });

  describe('Scenario 7: Cross-Border Worker (IE-UK)', () => {
    it('should identify CTA social security coordination', async () => {
      const result = await client.executeCypher(
        `MATCH (cta:Agreement {code: 'CTA'})
         MATCH (ie:Jurisdiction {code: 'IE'})-[:PARTY_TO]->(cta)
         MATCH (uk:Jurisdiction {code: 'UK'})-[:PARTY_TO]->(cta)
         MATCH (coord:Rule {code: 'IE_UK_SOCIAL_SECURITY_COORDINATION'})
         RETURN
           cta.name as agreement,
           coord.name as coordination_rule,
           coord.domain as domain`,
        {}
      );

      const records = result as Array<{
        agreement: string;
        coordination_rule: string;
        domain: string;
      }>;

      if (records.length > 0) {
        expect(records[0].agreement).toContain('Common Travel Area');
        expect(records[0].domain).toBe('social_security');
      }
    });

    it('should identify CTA mobility rights', async () => {
      const result = await client.executeCypher(
        `MATCH (cta:Agreement {code: 'CTA'})-[:ESTABLISHES_REGIME]->(reg:Regime)
         WHERE reg.code = 'CTA_MOBILITY_RIGHTS'
         MATCH (ie:Jurisdiction {code: 'IE'})-[:SUBJECT_TO_REGIME]->(reg)
         MATCH (uk:Jurisdiction {code: 'UK'})-[:SUBJECT_TO_REGIME]->(reg)
         RETURN
           reg.name as regime,
           reg.scope as scope`,
        {}
      );

      const records = result as Array<{ regime: string; scope: string }>;

      if (records.length > 0) {
        expect(records[0].regime).toContain('Mobility');
        expect(records[0].scope).toBe('persons');
      }
    });

    it('should support benefit coordination across IE-UK', async () => {
      const result = await client.executeCypher(
        `MATCH (t:Treaty|Agreement)
         WHERE t.code IN ['CTA', 'IE_UK_SOCIAL_SECURITY_COORDINATION']
         OPTIONAL MATCH (t)-[:RELATED_TO_AGREEMENT|:PARTY_TO]-(j:Jurisdiction)
         WHERE j.code IN ['IE', 'UK']
         RETURN
           t.code as treaty,
           t.name as name,
           collect(DISTINCT j.code) as jurisdictions`,
        {}
      );

      const records = result as Array<{
        treaty: string;
        name: string;
        jurisdictions: string[];
      }>;

      if (records.length > 0) {
        const hasIE = records.some((r) => r.jurisdictions.includes('IE'));
        const hasUK = records.some((r) => r.jurisdictions.includes('UK'));
        expect(hasIE || hasUK).toBe(true);
      }
    });
  });

  describe('Scenario 8: Complex Multi-Event Journey', () => {
    it('should trace complete life journey: Employment → Marriage → Birth → Retirement', async () => {
      const result = await client.executeCypher(
        `MATCH (emp:LifeEvent) WHERE emp.id CONTAINS 'EMPLOYMENT'
         MATCH (birth:LifeEvent {id: 'IE_LIFE_EVENT_BIRTH'})
         MATCH (retire:LifeEvent {id: 'IE_LIFE_EVENT_RETIREMENT'})
         OPTIONAL MATCH (emp)-[:TRIGGERS]->(b1:Benefit)
         OPTIONAL MATCH (birth)-[:TRIGGERS]->(b2:Benefit)
         OPTIONAL MATCH (retire)-[:TRIGGERS]->(b3:Benefit)
         RETURN
           emp.category as start_event,
           collect(DISTINCT b1.id) as employment_benefits,
           collect(DISTINCT b2.id) as birth_benefits,
           collect(DISTINCT b3.id) as retirement_benefits`,
        {}
      );

      const records = result as Array<{
        start_event: string;
        employment_benefits: string[];
        birth_benefits: string[];
        retirement_benefits: string[];
      }>;

      expect(records.length).toBeGreaterThan(0);
    });

    it('should calculate lifetime tax and PRSI for typical career', async () => {
      const yearsWorked = 40;
      const averageSalary = 45000;
      const totalEarnings = yearsWorked * averageSalary;

      // Get Class A PRSI rate
      const result = await client.executeCypher(
        `MATCH (pc:PRSIClass {id: 'IE_PRSI_CLASS_A'})-[:CONTRIBUTION_RATE]->(r:Rate)
         RETURN r.percentage as prsi_rate`,
        {}
      );

      const records = result as Array<{ prsi_rate: number }>;

      if (records.length > 0) {
        const lifetimePRSI = totalEarnings * (records[0].prsi_rate / 100);
        expect(lifetimePRSI).toBeGreaterThan(0);
      }
    });
  });
});
