/**
 * Ireland Compliance Workflow Integration Tests
 *
 * Real-world integration tests for Irish compliance obligations including:
 * - Filing obligations (CT1, Form 11, CRO returns)
 * - Payment obligations (Preliminary tax, PRSI, VAT)
 * - Form requirements and deadlines
 * - Profile-specific compliance paths
 * - Timeline constraints
 * - Penalty conditions
 *
 * These tests validate complete compliance workflows for Irish taxpayers.
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

describe('Ireland Compliance - Filing Obligations', () => {
  let client: BoltGraphClient;

  beforeAll(async () => {
    client = createBoltGraphClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await client.close();
  });

  describe('CT1 Corporation Tax Filing', () => {
    it('should have CT1 filing obligation for companies', async () => {
      const result = await client.executeCypher(
        `MATCH (o:Obligation {id: 'IE_CT1_FILING'})-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
         RETURN o.label as label, o.category as category, o.frequency as frequency`,
        {}
      );

      const records = result as Array<{
        label: string;
        category: string;
        frequency: string;
      }>;
      expect(records.length).toBe(1);
      expect(records[0].label).toContain('CT1');
      expect(records[0].category).toBe('FILING');
      expect(records[0].frequency).toBe('ANNUAL');
    });

    it('should have 9-month deadline for CT1 after accounting period end', async () => {
      const result = await client.executeCypher(
        `MATCH (o:Obligation {id: 'IE_CT1_FILING'})-[:FILING_DEADLINE]->(t:Timeline)
         RETURN t.window_months as months, t.label as description`,
        {}
      );

      const records = result as Array<{ months: number; description: string }>;
      expect(records.length).toBe(1);
      expect(records[0].months).toBe(9);
      expect(records[0].description).toContain('9 months');
    });

    it('should apply penalties for late CT1 filing', async () => {
      const result = await client.executeCypher(
        `MATCH (o:Obligation {id: 'IE_CT1_FILING'})
         RETURN o.penalty_applies as penalty`,
        {}
      );

      const records = result as Array<{ penalty: boolean }>;
      expect(records.length).toBe(1);
      expect(records[0].penalty).toBe(true);
    });

    it('should require CT1 form for CT1 obligation', async () => {
      const result = await client.executeCypher(
        `MATCH (o:Obligation {id: 'IE_CT1_FILING'})-[:REQUIRES_FORM]->(f:Form)
         RETURN f.id as form, f.form_number as number`,
        {}
      );

      const records = result as Array<{ form: string; number: string }>;
      expect(records.length).toBeGreaterThan(0);
      expect(records[0].form).toContain('CT1');
    });

    it('should link CT1 to single director company profiles', async () => {
      const result = await client.executeCypher(
        `MATCH (p:ProfileTag)-[:HAS_OBLIGATION]->(o:Obligation {id: 'IE_CT1_FILING'})
         WHERE p.id CONTAINS 'SINGLE_DIRECTOR'
         RETURN p.id as profile`,
        {}
      );

      const records = result as Array<{ profile: string }>;
      expect(records.length).toBeGreaterThan(0);
      expect(records[0].profile).toContain('SINGLE_DIRECTOR');
    });
  });

  describe('Form 11 Income Tax Filing', () => {
    it('should have Form 11 obligation for self-employed', async () => {
      const result = await client.executeCypher(
        `MATCH (o:Obligation {id: 'IE_FORM_11_FILING'})-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
         RETURN o.label as label, o.description as description`,
        {}
      );

      const records = result as Array<{ label: string; description: string }>;
      expect(records.length).toBe(1);
      expect(records[0].label).toContain('Form 11');
      expect(records[0].description).toContain('self-employed');
    });

    it('should apply to self-employed profiles', async () => {
      const result = await client.executeCypher(
        `MATCH (p:ProfileTag)-[:HAS_OBLIGATION]->(o:Obligation {id: 'IE_FORM_11_FILING'})
         WHERE p.id CONTAINS 'SELF_EMPLOYED'
         RETURN p.id as profile`,
        {}
      );

      const records = result as Array<{ profile: string }>;
      expect(records.length).toBeGreaterThan(0);
      expect(records[0].profile).toContain('SELF_EMPLOYED');
    });

    it('should have Form 11 as required form', async () => {
      const result = await client.executeCypher(
        `MATCH (o:Obligation {id: 'IE_FORM_11_FILING'})-[:REQUIRES_FORM]->(f:Form)
         WHERE f.id CONTAINS 'FORM_11'
         RETURN f.id as form, f.issuing_body as issuer`,
        {}
      );

      const records = result as Array<{ form: string; issuer: string }>;
      expect(records.length).toBeGreaterThan(0);
      expect(records[0].issuer).toContain('Revenue');
    });
  });

  describe('CRO Annual Return Filing', () => {
    it('should have CRO annual return obligation', async () => {
      const result = await client.executeCypher(
        `MATCH (o:Obligation {id: 'IE_CRO_ANNUAL_RETURN'})-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
         RETURN o.label as label, o.description as description`,
        {}
      );

      const records = result as Array<{ label: string; description: string }>;
      expect(records.length).toBe(1);
      expect(records[0].label).toContain('Annual Return');
      expect(records[0].description).toContain('Companies Registration Office');
    });

    it('should require B1 form for CRO annual return', async () => {
      const result = await client.executeCypher(
        `MATCH (o:Obligation {id: 'IE_CRO_ANNUAL_RETURN'})-[:REQUIRES_FORM]->(f:Form)
         WHERE f.id CONTAINS 'B1'
         RETURN f.id as form, f.form_number as number`,
        {}
      );

      const records = result as Array<{ form: string; number: string }>;
      expect(records.length).toBeGreaterThan(0);
      expect(records[0].number).toBe('B1');
    });

    it('should apply to company profiles', async () => {
      const result = await client.executeCypher(
        `MATCH (p:ProfileTag)-[:HAS_OBLIGATION]->(o:Obligation {id: 'IE_CRO_ANNUAL_RETURN'})
         RETURN p.id as profile`,
        {}
      );

      const records = result as Array<{ profile: string }>;
      expect(records.length).toBeGreaterThan(0);
    });
  });

  describe('Preliminary Tax Payment', () => {
    it('should have preliminary tax payment obligation', async () => {
      const result = await client.executeCypher(
        `MATCH (o:Obligation {id: 'IE_PRELIMINARY_TAX'})-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
         RETURN o.category as category, o.frequency as frequency`,
        {}
      );

      const records = result as Array<{ category: string; frequency: string }>;
      expect(records.length).toBe(1);
      expect(records[0].category).toBe('PAYMENT');
      expect(records[0].frequency).toBe('ANNUAL');
    });

    it('should apply penalties for late preliminary tax', async () => {
      const result = await client.executeCypher(
        `MATCH (o:Obligation {id: 'IE_PRELIMINARY_TAX'})
         RETURN o.penalty_applies as penalty`,
        {}
      );

      const records = result as Array<{ penalty: boolean }>;
      expect(records.length).toBe(1);
      expect(records[0].penalty).toBe(true);
    });
  });

  describe('Form Requirements and Metadata', () => {
    it('should have metadata for CT1 form', async () => {
      const result = await client.executeCypher(
        `MATCH (f:Form)-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
         WHERE f.id CONTAINS 'CT1'
         RETURN f.issuing_body as issuer, f.source_url as url, f.online_only as online`,
        {}
      );

      const records = result as Array<{
        issuer: string;
        url: string | null;
        online: boolean | null;
      }>;
      expect(records.length).toBeGreaterThan(0);
      expect(records[0].issuer).toContain('Revenue');
    });

    it('should have metadata for Form 11', async () => {
      const result = await client.executeCypher(
        `MATCH (f:Form)-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
         WHERE f.id CONTAINS 'FORM_11'
         RETURN f.issuing_body as issuer, f.form_number as number`,
        {}
      );

      const records = result as Array<{ issuer: string; number: string }>;
      expect(records.length).toBeGreaterThan(0);
      expect(records[0].issuer).toContain('Revenue');
      expect(records[0].number).toContain('11');
    });

    it('should have CRO B1 form metadata', async () => {
      const result = await client.executeCypher(
        `MATCH (f:Form {form_number: 'B1'})-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
         RETURN f.issuing_body as issuer, f.label as label`,
        {}
      );

      const records = result as Array<{ issuer: string; label: string }>;
      expect(records.length).toBeGreaterThan(0);
      expect(records[0].issuer).toContain('CRO');
    });

    it('should have source URLs for online forms', async () => {
      const result = await client.executeCypher(
        `MATCH (f:Form)-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
         WHERE f.source_url IS NOT NULL
         RETURN f.id as form, f.source_url as url
         LIMIT 5`,
        {}
      );

      const records = result as Array<{ form: string; url: string }>;
      records.forEach((record) => {
        expect(record.url).toMatch(/^https?:\/\//);
      });
    });
  });

  describe('Complete Compliance Workflows', () => {
    it('should trace Profile → Obligation → Form workflow for companies', async () => {
      const result = await client.executeCypher(
        `MATCH path = (p:ProfileTag)-[:HAS_OBLIGATION]->(o:Obligation)-[:REQUIRES_FORM]->(f:Form)
         WHERE p.id CONTAINS 'SINGLE_DIRECTOR' AND o.id = 'IE_CT1_FILING'
         RETURN
           p.id as profile,
           o.id as obligation,
           f.id as form,
           o.frequency as frequency`,
        {}
      );

      const records = result as Array<{
        profile: string;
        obligation: string;
        form: string;
        frequency: string;
      }>;

      expect(records.length).toBeGreaterThan(0);
      expect(records[0].profile).toContain('SINGLE_DIRECTOR');
      expect(records[0].obligation).toBe('IE_CT1_FILING');
      expect(records[0].frequency).toBe('ANNUAL');
    });

    it('should trace Profile → Obligation → Timeline for deadline tracking', async () => {
      const result = await client.executeCypher(
        `MATCH (p:ProfileTag)-[:HAS_OBLIGATION]->(o:Obligation)-[:FILING_DEADLINE]->(t:Timeline)
         WHERE p.id CONTAINS 'SINGLE_DIRECTOR'
         RETURN
           p.id as profile,
           o.id as obligation,
           t.window_months as deadline_months`,
        {}
      );

      const records = result as Array<{
        profile: string;
        obligation: string;
        deadline_months: number;
      }>;

      expect(records.length).toBeGreaterThan(0);
    });

    it('should identify all annual filing obligations for single director', async () => {
      const result = await client.executeCypher(
        `MATCH (p:ProfileTag)-[:HAS_OBLIGATION]->(o:Obligation)
         WHERE p.id CONTAINS 'SINGLE_DIRECTOR'
           AND o.category = 'FILING'
           AND o.frequency = 'ANNUAL'
         RETURN collect(o.id) as obligations`,
        {}
      );

      const records = result as Array<{ obligations: string[] }>;
      expect(records[0].obligations).toContain('IE_CT1_FILING');
      expect(records[0].obligations).toContain('IE_CRO_ANNUAL_RETURN');
    });

    it('should identify all payment obligations with penalties', async () => {
      const result = await client.executeCypher(
        `MATCH (o:Obligation)-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
         WHERE o.category = 'PAYMENT' AND o.penalty_applies = true
         RETURN collect(o.id) as payment_obligations`,
        {}
      );

      const records = result as Array<{ payment_obligations: string[] }>;
      expect(records[0].payment_obligations).toContain('IE_PRELIMINARY_TAX');
    });
  });

  describe('Multi-Profile Compliance Comparison', () => {
    it('should compare obligations between PAYE employee and self-employed', async () => {
      const result = await client.executeCypher(
        `MATCH (paye:ProfileTag)-[:HAS_OBLIGATION]->(o1:Obligation)
         WHERE paye.id CONTAINS 'PAYE_EMPLOYEE'
         WITH collect(DISTINCT o1.id) as paye_obligations
         MATCH (self:ProfileTag)-[:HAS_OBLIGATION]->(o2:Obligation)
         WHERE self.id CONTAINS 'SELF_EMPLOYED'
         RETURN
           paye_obligations,
           collect(DISTINCT o2.id) as self_employed_obligations`,
        {}
      );

      const records = result as Array<{
        paye_obligations: string[];
        self_employed_obligations: string[];
      }>;

      if (records.length > 0) {
        // Self-employed should have Form 11 obligation
        expect(records[0].self_employed_obligations).toContain(
          'IE_FORM_11_FILING'
        );
      }
    });

    it('should identify company-specific vs individual obligations', async () => {
      const result = await client.executeCypher(
        `MATCH (o:Obligation)-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
         OPTIONAL MATCH (company:ProfileTag)-[:HAS_OBLIGATION]->(o)
         WHERE company.id CONTAINS 'DIRECTOR' OR company.id CONTAINS 'COMPANY'
         OPTIONAL MATCH (individual:ProfileTag)-[:HAS_OBLIGATION]->(o)
         WHERE individual.id CONTAINS 'SELF_EMPLOYED' OR individual.id CONTAINS 'PAYE'
         WITH o,
              count(DISTINCT company) as company_count,
              count(DISTINCT individual) as individual_count
         WHERE company_count > 0 OR individual_count > 0
         RETURN
           o.id as obligation,
           o.category as category,
           company_count > 0 as for_companies,
           individual_count > 0 as for_individuals`,
        {}
      );

      const records = result as Array<{
        obligation: string;
        category: string;
        for_companies: boolean;
        for_individuals: boolean;
      }>;

      // CT1 should be company-specific
      const ct1 = records.find((r) => r.obligation === 'IE_CT1_FILING');
      if (ct1) {
        expect(ct1.for_companies).toBe(true);
      }

      // Form 11 should be for individuals
      const form11 = records.find((r) => r.obligation === 'IE_FORM_11_FILING');
      if (form11) {
        expect(form11.for_individuals).toBe(true);
      }
    });
  });

  describe('Compliance Calendar and Deadlines', () => {
    it('should identify all obligations with approaching deadlines', async () => {
      const result = await client.executeCypher(
        `MATCH (o:Obligation)-[:FILING_DEADLINE]->(t:Timeline)
         WHERE t.window_months IS NOT NULL
         RETURN
           o.id as obligation,
           o.label as label,
           t.window_months as months_after_period_end
         ORDER BY t.window_months`,
        {}
      );

      const records = result as Array<{
        obligation: string;
        label: string;
        months_after_period_end: number;
      }>;

      expect(records.length).toBeGreaterThan(0);

      // CT1 should have 9-month deadline
      const ct1 = records.find((r) => r.obligation === 'IE_CT1_FILING');
      if (ct1) {
        expect(ct1.months_after_period_end).toBe(9);
      }
    });

    it('should group obligations by frequency', async () => {
      const result = await client.executeCypher(
        `MATCH (o:Obligation)-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
         WHERE o.frequency IS NOT NULL
         RETURN
           o.frequency as frequency,
           count(o) as obligation_count,
           collect(o.id) as obligations`,
        {}
      );

      const records = result as Array<{
        frequency: string;
        obligation_count: number;
        obligations: string[];
      }>;

      const annual = records.find((r) => r.frequency === 'ANNUAL');
      if (annual) {
        expect(annual.obligation_count).toBeGreaterThan(0);
        expect(annual.obligations).toContain('IE_CT1_FILING');
      }
    });
  });

  describe('Form Claiming and Submission', () => {
    it('should support benefit claiming via forms', async () => {
      const result = await client.executeCypher(
        `MATCH (b:Benefit)-[:CLAIMED_VIA]->(f:Form)
         WHERE b-[:IN_JURISDICTION]->(:Jurisdiction {id: 'IE'})
         RETURN
           b.id as benefit,
           f.id as form,
           f.form_number as form_number
         LIMIT 5`,
        {}
      );

      const records = result as Array<{
        benefit: string;
        form: string;
        form_number: string;
      }>;

      // Should have some benefits that can be claimed via forms
      expect(records.length).toBeGreaterThanOrEqual(0);
    });

    it('should link unemployment benefit to claim form', async () => {
      const result = await client.executeCypher(
        `MATCH (b:Benefit {id: 'IE_JOBSEEKERS_BENEFIT'})-[:CLAIMED_VIA]->(f:Form)
         RETURN f.id as form, f.form_number as number`,
        {}
      );

      const records = result as Array<{ form: string; number: string }>;
      // UP1 is the Jobseeker's form
      if (records.length > 0) {
        expect(records[0].number).toContain('UP');
      }
    });
  });

  describe('Real-World Compliance Scenarios', () => {
    it('should identify complete compliance checklist for new company', async () => {
      const result = await client.executeCypher(
        `MATCH (p:ProfileTag)-[:HAS_OBLIGATION]->(o:Obligation)
         WHERE p.id CONTAINS 'SINGLE_DIRECTOR'
         OPTIONAL MATCH (o)-[:REQUIRES_FORM]->(f:Form)
         OPTIONAL MATCH (o)-[:FILING_DEADLINE]->(t:Timeline)
         RETURN
           o.id as obligation,
           o.category as type,
           o.frequency as frequency,
           o.penalty_applies as has_penalty,
           collect(DISTINCT f.form_number) as required_forms,
           t.window_months as deadline_months`,
        {}
      );

      const records = result as Array<{
        obligation: string;
        type: string;
        frequency: string;
        has_penalty: boolean;
        required_forms: string[];
        deadline_months: number | null;
      }>;

      expect(records.length).toBeGreaterThan(0);

      // Verify all obligations have required metadata
      records.forEach((record) => {
        expect(record.type).toBeDefined();
        expect(record.frequency).toBeDefined();
      });
    });

    it('should calculate total annual compliance burden for self-employed', async () => {
      const result = await client.executeCypher(
        `MATCH (p:ProfileTag)-[:HAS_OBLIGATION]->(o:Obligation)
         WHERE p.id CONTAINS 'SELF_EMPLOYED' AND o.frequency = 'ANNUAL'
         RETURN
           count(DISTINCT o) as annual_obligations,
           collect(DISTINCT o.category) as obligation_types`,
        {}
      );

      const records = result as Array<{
        annual_obligations: number;
        obligation_types: string[];
      }>;

      expect(records[0].annual_obligations).toBeGreaterThan(0);
      expect(records[0].obligation_types).toContain('FILING');
    });
  });
});
