import { describe, expect, it, vi } from 'vitest';
import type { GraphWriteContext, GraphIngressAspect } from './graphIngressGuard.js';
import {
  schemaValidationAspect,
  piiBlockingAspect,
  propertyWhitelistAspect,
  composeIngressAspects,
  createBaselineAspects,
} from './graphIngressGuard.js';

describe('Graph Ingress Guard', () => {
  describe('schemaValidationAspect', () => {
    it('allows whitelisted node labels', async () => {
      const ctx: GraphWriteContext = {
        operation: 'create',
        nodeLabel: 'Concept',
        properties: { id: 'test', pref_label: 'Test' },
        source: 'agent',
      };

      const next = vi.fn(async (c: GraphWriteContext) => c);
      const result = await schemaValidationAspect(ctx, next);

      expect(next).toHaveBeenCalledWith(ctx);
      expect(result).toBe(ctx);
    });

    it('rejects disallowed node labels', async () => {
      const ctx: GraphWriteContext = {
        operation: 'create',
        nodeLabel: 'UnknownLabel',
        properties: { id: 'test' },
        source: 'agent',
      };

      const next = vi.fn();
      await expect(() => schemaValidationAspect(ctx, next)).rejects.toThrow(
        /Disallowed node label "UnknownLabel"/
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('allows all whitelisted node labels', async () => {
      const allowedLabels = [
        'Jurisdiction',
        'Region',
        'Concept',
        'Label',
        'Agreement',
        'Treaty',
        'Regime',
        'Statute',
        'Section',
        'Benefit',
        'Relief',
        'Condition',
        'Timeline',
        'ProfileTag',
        'Community',
        'EURegulation',
        'EUDirective',
        'Guidance',
        'Case',
        'Update',
        'ChangeEvent',
      ];

      const next = vi.fn(async (c: GraphWriteContext) => c);

      for (const label of allowedLabels) {
        const ctx: GraphWriteContext = {
          operation: 'create',
          nodeLabel: label,
          properties: { id: 'test' },
          source: 'agent',
        };

        await expect(schemaValidationAspect(ctx, next)).resolves.not.toThrow();
      }
    });

    it('allows whitelisted relationship types', async () => {
      const ctx: GraphWriteContext = {
        operation: 'create',
        relType: 'IN_JURISDICTION',
        properties: {},
        source: 'agent',
      };

      const next = vi.fn(async (c: GraphWriteContext) => c);
      const result = await schemaValidationAspect(ctx, next);

      expect(next).toHaveBeenCalledWith(ctx);
      expect(result).toBe(ctx);
    });

    it('rejects disallowed relationship types', async () => {
      const ctx: GraphWriteContext = {
        operation: 'create',
        relType: 'UNKNOWN_REL',
        properties: {},
        source: 'agent',
      };

      const next = vi.fn();
      await expect(() => schemaValidationAspect(ctx, next)).rejects.toThrow(
        /Disallowed relationship type "UNKNOWN_REL"/
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('allows all whitelisted relationship types', async () => {
      const allowedRelTypes = [
        'IN_JURISDICTION',
        'PART_OF',
        'PART_OF_REGIME',
        'SUBSECTION_OF',
        'APPLIES_IN',
        'CITES',
        'REFERENCES',
        'REQUIRES',
        'LIMITED_BY',
        'EXCLUDES',
        'MUTUALLY_EXCLUSIVE_WITH',
        'LOOKBACK_WINDOW',
        'LOCKS_IN_FOR_PERIOD',
        'FILING_DEADLINE',
        'EFFECTIVE_WINDOW',
        'USAGE_FREQUENCY',
        'COORDINATED_WITH',
        'TREATY_LINKED_TO',
        'EQUIVALENT_TO',
        'IMPLEMENTED_BY',
        'OVERRIDES',
        'INTERPRETS',
        'AFFECTS',
        'CHANGES_INTERPRETATION_OF',
        'UPDATES',
        'AMENDED_BY',
        'HAS_PROFILE_TAG',
        'APPLIES_TO_PROFILE',
        'CONTAINS',
        'PARTY_TO',
        'MODIFIED_BY',
        'ESTABLISHES_REGIME',
        'IMPLEMENTED_VIA',
        'SUBJECT_TO_REGIME',
        'AVAILABLE_VIA_REGIME',
        'HAS_ALT_LABEL',
        'ALIGNS_WITH',
        'DERIVED_FROM',
        'HAS_SOURCE',
      ];

      const next = vi.fn(async (c: GraphWriteContext) => c);

      for (const relType of allowedRelTypes) {
        const ctx: GraphWriteContext = {
          operation: 'create',
          relType,
          properties: {},
          source: 'agent',
        };

        await expect(schemaValidationAspect(ctx, next)).resolves.not.toThrow();
      }
    });
  });

  describe('piiBlockingAspect', () => {
    it('allows non-PII properties', async () => {
      const ctx: GraphWriteContext = {
        operation: 'create',
        nodeLabel: 'Concept',
        properties: {
          id: 'TEST:IE:VAT',
          pref_label: 'VAT',
          domain: 'TAX',
          jurisdiction: 'IE',
        },
        source: 'agent',
      };

      const next = vi.fn(async (c: GraphWriteContext) => c);
      const result = await piiBlockingAspect(ctx, next);

      expect(next).toHaveBeenCalledWith(ctx);
      expect(result).toBe(ctx);
    });

    it('blocks disallowed PII property keys', async () => {
      const piiKeys = [
        'userId',
        'user_id',
        'userName',
        'user_name',
        'userEmail',
        'user_email',
        'email',
        'tenantId',
        'tenant_id',
        'tenantName',
        'tenant_name',
        'ppsn',
        'PPSN',
        'ssn',
        'SSN',
        'nino',
        'NINO',
        'iban',
        'IBAN',
        'phone',
        'phoneNumber',
        'phone_number',
        'address',
        'firstName',
        'first_name',
        'lastName',
        'last_name',
        'dateOfBirth',
        'date_of_birth',
        'dob',
        'DOB',
      ];

      const next = vi.fn();

      for (const key of piiKeys) {
        const ctx: GraphWriteContext = {
          operation: 'create',
          nodeLabel: 'Concept',
          properties: {
            id: 'test',
            [key]: 'some-value',
          },
          source: 'agent',
        };

        await expect(() => piiBlockingAspect(ctx, next)).rejects.toThrow(
          /Disallowed property key/
        );
      }
    });

    it('blocks email-like patterns in property values', async () => {
      const ctx: GraphWriteContext = {
        operation: 'create',
        nodeLabel: 'Concept',
        properties: {
          id: 'test',
          contact: 'user@example.com',
        },
        source: 'agent',
      };

      const next = vi.fn();
      await expect(() => piiBlockingAspect(ctx, next)).rejects.toThrow(
        /appears to contain an email address/
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('blocks phone-like patterns in property values', async () => {
      const ctx: GraphWriteContext = {
        operation: 'create',
        nodeLabel: 'Concept',
        properties: {
          id: 'test',
          contact: '+353 1 234 5678',
        },
        source: 'agent',
      };

      const next = vi.fn();
      await expect(() => piiBlockingAspect(ctx, next)).rejects.toThrow(
        /appears to contain a phone number/
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('allows legitimate non-PII text with @ symbol', async () => {
      const ctx: GraphWriteContext = {
        operation: 'create',
        nodeLabel: 'Concept',
        properties: {
          id: 'test',
          description: 'Apply @ revenue office',
        },
        source: 'agent',
      };

      const next = vi.fn(async (c: GraphWriteContext) => c);
      await expect(piiBlockingAspect(ctx, next)).resolves.not.toThrow();
    });
  });

  describe('propertyWhitelistAspect', () => {
    it('allows whitelisted properties for Concept nodes', async () => {
      const ctx: GraphWriteContext = {
        operation: 'merge',
        nodeLabel: 'Concept',
        properties: {
          id: 'TEST:IE:VAT',
          pref_label: 'VAT',
          domain: 'TAX',
          kind: 'VAT',
          jurisdiction: 'IE',
          definition: 'Value Added Tax',
          alt_labels: ['Sales Tax'],
          source_urls: ['https://revenue.ie'],
          ingestion_status: 'complete',
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
          last_verified_at: '2024-01-01',
        },
        source: 'agent',
      };

      const next = vi.fn(async (c: GraphWriteContext) => c);
      await expect(propertyWhitelistAspect(ctx, next)).resolves.not.toThrow();
      expect(next).toHaveBeenCalledWith(ctx);
    });

    it('blocks non-whitelisted properties for Concept nodes', async () => {
      const ctx: GraphWriteContext = {
        operation: 'merge',
        nodeLabel: 'Concept',
        properties: {
          id: 'test',
          pref_label: 'Test',
          custom_field: 'not-allowed',
        },
        source: 'agent',
      };

      const next = vi.fn();
      await expect(() => propertyWhitelistAspect(ctx, next)).rejects.toThrow(
        /Property "custom_field" is not whitelisted for node label "Concept"/
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('allows universal properties on any node', async () => {
      const ctx: GraphWriteContext = {
        operation: 'merge',
        nodeLabel: 'Concept',
        properties: {
          id: 'test',
          pref_label: 'Test',
          community_id: 'comm-1',
          centrality_score: 0.85,
        },
        source: 'agent',
      };

      const next = vi.fn(async (c: GraphWriteContext) => c);
      await expect(propertyWhitelistAspect(ctx, next)).resolves.not.toThrow();
    });

    it('allows whitelisted properties for Label nodes', async () => {
      const ctx: GraphWriteContext = {
        operation: 'merge',
        nodeLabel: 'Label',
        properties: {
          id: 'LABEL:1',
          value: 'Sales Tax',
          kind: 'ALT_LABEL',
        },
        source: 'agent',
      };

      const next = vi.fn(async (c: GraphWriteContext) => c);
      await expect(propertyWhitelistAspect(ctx, next)).resolves.not.toThrow();
    });

    it('allows whitelisted properties for Benefit nodes', async () => {
      const ctx: GraphWriteContext = {
        operation: 'merge',
        nodeLabel: 'Benefit',
        properties: {
          id: 'BENEFIT:IE:CHILD_BENEFIT',
          name: 'Child Benefit',
          category: 'FAMILY',
          short_summary: 'Monthly payment',
          description: 'Support for families with children',
        },
        source: 'agent',
      };

      const next = vi.fn(async (c: GraphWriteContext) => c);
      await expect(propertyWhitelistAspect(ctx, next)).resolves.not.toThrow();
    });

    it('allows whitelisted properties for Relief nodes', async () => {
      const ctx: GraphWriteContext = {
        operation: 'merge',
        nodeLabel: 'Relief',
        properties: {
          id: 'RELIEF:IE:TUITION_RELIEF',
          name: 'Tuition Relief',
          tax_type: 'INCOME_TAX',
          short_summary: 'Relief for education fees',
          description: 'Tax relief on tuition fees paid',
        },
        source: 'agent',
      };

      const next = vi.fn(async (c: GraphWriteContext) => c);
      await expect(propertyWhitelistAspect(ctx, next)).resolves.not.toThrow();
    });

    it('allows whitelisted properties for Timeline nodes', async () => {
      const ctx: GraphWriteContext = {
        operation: 'merge',
        nodeLabel: 'Timeline',
        properties: {
          id: 'TIMELINE:1',
          label: '5 year lookback',
          window_days: 1825,
          window_months: 60,
          window_years: 5,
          kind: 'LOOKBACK',
          jurisdictionCode: 'IE',
          description: 'Five year lookback period',
        },
        source: 'agent',
      };

      const next = vi.fn(async (c: GraphWriteContext) => c);
      await expect(propertyWhitelistAspect(ctx, next)).resolves.not.toThrow();
    });

    it('allows whitelisted properties for Jurisdiction nodes', async () => {
      const ctx: GraphWriteContext = {
        operation: 'merge',
        nodeLabel: 'Jurisdiction',
        properties: {
          id: 'JURIS:IE',
          name: 'Ireland',
          type: 'COUNTRY',
          code: 'IE',
          notes: 'Republic of Ireland',
        },
        source: 'agent',
      };

      const next = vi.fn(async (c: GraphWriteContext) => c);
      await expect(propertyWhitelistAspect(ctx, next)).resolves.not.toThrow();
    });

    it('allows whitelisted properties for Section nodes', async () => {
      const ctx: GraphWriteContext = {
        operation: 'merge',
        nodeLabel: 'Section',
        properties: {
          id: 'SECTION:TCA1997:123',
          label: 'Section 123',
          title: 'Tax Relief for Artists',
          text_excerpt: 'Exemption from income tax...',
          effective_from: '1997-01-01',
          effective_to: '2099-12-31',
          section_number: '123',
        },
        source: 'agent',
      };

      const next = vi.fn(async (c: GraphWriteContext) => c);
      await expect(propertyWhitelistAspect(ctx, next)).resolves.not.toThrow();
    });
  });

  describe('composeIngressAspects', () => {
    it('executes aspects in order', async () => {
      const executionOrder: string[] = [];

      const aspect1: GraphIngressAspect = async (ctx, next) => {
        executionOrder.push('aspect1-before');
        const result = await next(ctx);
        executionOrder.push('aspect1-after');
        return result;
      };

      const aspect2: GraphIngressAspect = async (ctx, next) => {
        executionOrder.push('aspect2-before');
        const result = await next(ctx);
        executionOrder.push('aspect2-after');
        return result;
      };

      const terminal = async (ctx: GraphWriteContext) => {
        executionOrder.push('terminal');
        return ctx;
      };

      const pipeline = composeIngressAspects([aspect1, aspect2], terminal);

      const ctx: GraphWriteContext = {
        operation: 'create',
        nodeLabel: 'Concept',
        properties: { id: 'test' },
        source: 'agent',
      };

      await pipeline(ctx);

      expect(executionOrder).toEqual([
        'aspect1-before',
        'aspect2-before',
        'terminal',
        'aspect2-after',
        'aspect1-after',
      ]);
    });

    it('allows aspects to modify context', async () => {
      const addMetadataAspect: GraphIngressAspect = async (ctx, next) => {
        const modifiedCtx = {
          ...ctx,
          metadata: { ...ctx.metadata, custom: 'value' },
        };
        return next(modifiedCtx);
      };

      const terminal = async (ctx: GraphWriteContext) => ctx;

      const pipeline = composeIngressAspects([addMetadataAspect], terminal);

      const ctx: GraphWriteContext = {
        operation: 'create',
        nodeLabel: 'Concept',
        properties: { id: 'test' },
        source: 'agent',
      };

      const result = await pipeline(ctx);

      expect(result.metadata).toEqual({ custom: 'value' });
    });

    it('stops execution when aspect throws error', async () => {
      const executionOrder: string[] = [];

      const aspect1: GraphIngressAspect = async (ctx, next) => {
        executionOrder.push('aspect1');
        throw new Error('Aspect1 error');
      };

      const aspect2: GraphIngressAspect = async (ctx, next) => {
        executionOrder.push('aspect2');
        return next(ctx);
      };

      const terminal = async (ctx: GraphWriteContext) => {
        executionOrder.push('terminal');
        return ctx;
      };

      const pipeline = composeIngressAspects([aspect1, aspect2], terminal);

      const ctx: GraphWriteContext = {
        operation: 'create',
        nodeLabel: 'Concept',
        properties: { id: 'test' },
        source: 'agent',
      };

      await expect(() => pipeline(ctx)).rejects.toThrow('Aspect1 error');
      expect(executionOrder).toEqual(['aspect1']);
    });
  });

  describe('createBaselineAspects', () => {
    it('returns all baseline aspects in correct order', () => {
      const aspects = createBaselineAspects();

      expect(aspects).toHaveLength(3);
      expect(aspects[0]).toBe(schemaValidationAspect);
      expect(aspects[1]).toBe(piiBlockingAspect);
      expect(aspects[2]).toBe(propertyWhitelistAspect);
    });

    it('baseline aspects work together in pipeline', async () => {
      const aspects = createBaselineAspects();
      const next = vi.fn(async (c: GraphWriteContext) => c);
      const terminal = async (ctx: GraphWriteContext) => ctx;

      const pipeline = composeIngressAspects(aspects, terminal);

      const ctx: GraphWriteContext = {
        operation: 'merge',
        nodeLabel: 'Concept',
        properties: {
          id: 'TEST:IE:VAT',
          pref_label: 'VAT',
          domain: 'TAX',
        },
        source: 'agent',
      };

      await expect(pipeline(ctx)).resolves.not.toThrow();
    });

    it('baseline aspects reject invalid writes', async () => {
      const aspects = createBaselineAspects();
      const terminal = async (ctx: GraphWriteContext) => ctx;
      const pipeline = composeIngressAspects(aspects, terminal);

      // Invalid node label
      const ctx1: GraphWriteContext = {
        operation: 'create',
        nodeLabel: 'InvalidLabel',
        properties: { id: 'test' },
        source: 'agent',
      };
      await expect(() => pipeline(ctx1)).rejects.toThrow(/Disallowed node label/);

      // PII in properties
      const ctx2: GraphWriteContext = {
        operation: 'create',
        nodeLabel: 'Concept',
        properties: { id: 'test', userId: 'user-123' },
        source: 'agent',
      };
      await expect(() => pipeline(ctx2)).rejects.toThrow(/Disallowed property key/);

      // Non-whitelisted property
      const ctx3: GraphWriteContext = {
        operation: 'create',
        nodeLabel: 'Concept',
        properties: { id: 'test', pref_label: 'Test', custom_field: 'value' },
        source: 'agent',
      };
      await expect(() => pipeline(ctx3)).rejects.toThrow(
        /Property "custom_field" is not whitelisted/
      );
    });
  });
});
