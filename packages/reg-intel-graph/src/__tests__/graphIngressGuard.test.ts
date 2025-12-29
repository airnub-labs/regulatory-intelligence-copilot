/**
 * Comprehensive tests for Graph Ingress Guard
 * Tests schema validation, PII blocking, and property whitelisting
 */

import { describe, it, expect } from 'vitest';
import {
  schemaValidationAspect,
  piiBlockingAspect,
  propertyWhitelistAspect,
  composeIngressAspects,
  createBaselineAspects,
  type GraphWriteContext,
} from '../graphIngressGuard.js';

describe('GraphIngressGuard - Schema Validation', () => {
  describe('Allowed node labels', () => {
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
      'Obligation',
      'Threshold',
      'Rate',
      'Form',
      'PRSIClass',
      'LifeEvent',
    ];

    allowedLabels.forEach((label) => {
      it(`should allow node label: ${label}`, async () => {
        const ctx: GraphWriteContext = {
          operation: 'create',
          nodeLabel: label,
          properties: { id: 'test', label: 'Test' },
          source: 'ingestion',
        };

        const next = async (c: GraphWriteContext) => c;
        await expect(schemaValidationAspect(ctx, next)).resolves.toBeDefined();
      });
    });

    it('should reject disallowed node label', async () => {
      const ctx: GraphWriteContext = {
        operation: 'create',
        nodeLabel: 'InvalidNodeType',
        properties: { id: 'test' },
        source: 'ingestion',
      };

      const next = async (c: GraphWriteContext) => c;
      await expect(schemaValidationAspect(ctx, next)).rejects.toThrow(
        /Disallowed node label/
      );
    });

    it('should allow writes without node label (for relationships)', async () => {
      const ctx: GraphWriteContext = {
        operation: 'create',
        relType: 'HAS_OBLIGATION',
        properties: {},
        source: 'ingestion',
      };

      const next = async (c: GraphWriteContext) => c;
      await expect(schemaValidationAspect(ctx, next)).resolves.toBeDefined();
    });
  });

  describe('Allowed relationship types', () => {
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
      'HAS_OBLIGATION',
      'CREATES_OBLIGATION',
      'REQUIRES_FORM',
      'CLAIMED_VIA',
      'HAS_THRESHOLD',
      'LIMITED_BY_THRESHOLD',
      'CHANGES_THRESHOLD',
      'HAS_RATE',
      'SUBJECT_TO_RATE',
      'APPLIES_RATE',
      'BROADER',
      'NARROWER',
      'RELATED',
      'ENTITLES_TO',
      'HAS_PRSI_CLASS',
      'CONTRIBUTION_RATE',
      'TRIGGERS',
      'STARTS_TIMELINE',
      'ENDS_TIMELINE',
      'TRIGGERED_BY',
    ];

    allowedRelTypes.forEach((relType) => {
      it(`should allow relationship type: ${relType}`, async () => {
        const ctx: GraphWriteContext = {
          operation: 'create',
          relType,
          properties: {},
          source: 'ingestion',
        };

        const next = async (c: GraphWriteContext) => c;
        await expect(schemaValidationAspect(ctx, next)).resolves.toBeDefined();
      });
    });

    it('should reject disallowed relationship type', async () => {
      const ctx: GraphWriteContext = {
        operation: 'create',
        relType: 'INVALID_RELATIONSHIP',
        properties: {},
        source: 'ingestion',
      };

      const next = async (c: GraphWriteContext) => c;
      await expect(schemaValidationAspect(ctx, next)).rejects.toThrow(
        /Disallowed relationship type/
      );
    });
  });
});

describe('GraphIngressGuard - PII Blocking', () => {
  describe('Disallowed property keys', () => {
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
      'organizationId',
      'organization_id',
      'accountId',
      'account_id',
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
      'street',
      'postalCode',
      'postal_code',
      'postcode',
      'firstName',
      'first_name',
      'lastName',
      'last_name',
      'fullName',
      'full_name',
      'dateOfBirth',
      'date_of_birth',
      'dob',
      'DOB',
    ];

    piiKeys.forEach((key) => {
      it(`should block PII property key: ${key}`, async () => {
        const ctx: GraphWriteContext = {
          operation: 'create',
          nodeLabel: 'Benefit',
          properties: { [key]: 'test-value' },
          source: 'ingestion',
        };

        const next = async (c: GraphWriteContext) => c;
        await expect(piiBlockingAspect(ctx, next)).rejects.toThrow(
          /Disallowed property key/
        );
      });
    });

    it('should allow non-PII properties', async () => {
      const ctx: GraphWriteContext = {
        operation: 'create',
        nodeLabel: 'Benefit',
        properties: { id: 'test', label: 'Test Benefit', description: 'A test' },
        source: 'ingestion',
      };

      const next = async (c: GraphWriteContext) => c;
      await expect(piiBlockingAspect(ctx, next)).resolves.toBeDefined();
    });
  });

  describe('Email pattern detection', () => {
    it('should block email-like strings', async () => {
      const ctx: GraphWriteContext = {
        operation: 'create',
        nodeLabel: 'Benefit',
        properties: { description: 'Contact john.doe@example.com' },
        source: 'ingestion',
      };

      const next = async (c: GraphWriteContext) => c;
      await expect(piiBlockingAspect(ctx, next)).rejects.toThrow(
        /appears to contain an email address/
      );
    });

    it('should allow non-email strings with @ symbol', async () => {
      const ctx: GraphWriteContext = {
        operation: 'create',
        nodeLabel: 'Benefit',
        properties: { description: 'Version 1.0 @2024' },
        source: 'ingestion',
      };

      const next = async (c: GraphWriteContext) => c;
      await expect(piiBlockingAspect(ctx, next)).resolves.toBeDefined();
    });
  });

  describe('Phone pattern detection', () => {
    it('should block phone-like numbers', async () => {
      const ctx: GraphWriteContext = {
        operation: 'create',
        nodeLabel: 'Benefit',
        properties: { contact: '+353 1 234 5678' },
        source: 'ingestion',
      };

      const next = async (c: GraphWriteContext) => c;
      await expect(piiBlockingAspect(ctx, next)).rejects.toThrow(
        /appears to contain a phone number/
      );
    });

    it('should allow ISO date strings', async () => {
      const ctx: GraphWriteContext = {
        operation: 'create',
        nodeLabel: 'Benefit',
        properties: { effective_from: '2024-01-01' },
        source: 'ingestion',
      };

      const next = async (c: GraphWriteContext) => c;
      await expect(piiBlockingAspect(ctx, next)).resolves.toBeDefined();
    });

    it('should allow ISO timestamp strings', async () => {
      const ctx: GraphWriteContext = {
        operation: 'create',
        nodeLabel: 'Benefit',
        properties: { created_at: '2024-01-01T12:30:45' },
        source: 'ingestion',
      };

      const next = async (c: GraphWriteContext) => c;
      await expect(piiBlockingAspect(ctx, next)).resolves.toBeDefined();
    });
  });

  describe('Tenant context handling', () => {
    it('should allow tenantId in context but not in properties', async () => {
      const ctx: GraphWriteContext = {
        operation: 'create',
        nodeLabel: 'Benefit',
        properties: { id: 'test', label: 'Test' },
        source: 'ingestion',
        tenantId: 'tenant-123', // OK in context
      };

      const next = async (c: GraphWriteContext) => c;
      await expect(piiBlockingAspect(ctx, next)).resolves.toBeDefined();
    });

    it('should block tenantId in properties', async () => {
      const ctx: GraphWriteContext = {
        operation: 'create',
        nodeLabel: 'Benefit',
        properties: { tenantId: 'tenant-123' }, // NOT OK in properties
        source: 'ingestion',
      };

      const next = async (c: GraphWriteContext) => c;
      await expect(piiBlockingAspect(ctx, next)).rejects.toThrow(
        /Disallowed property key/
      );
    });
  });
});

describe('GraphIngressGuard - Property Whitelisting', () => {
  describe('Obligation properties', () => {
    it('should allow all whitelisted Obligation properties', async () => {
      const ctx: GraphWriteContext = {
        operation: 'create',
        nodeLabel: 'Obligation',
        properties: {
          id: 'test',
          label: 'Test Obligation',
          category: 'FILING',
          frequency: 'ANNUAL',
          penalty_applies: true,
          description: 'A test obligation',
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
        },
        source: 'ingestion',
      };

      const next = async (c: GraphWriteContext) => c;
      await expect(propertyWhitelistAspect(ctx, next)).resolves.toBeDefined();
    });

    it('should reject non-whitelisted Obligation property', async () => {
      const ctx: GraphWriteContext = {
        operation: 'create',
        nodeLabel: 'Obligation',
        properties: { id: 'test', invalid_property: 'value' },
        source: 'ingestion',
      };

      const next = async (c: GraphWriteContext) => c;
      await expect(propertyWhitelistAspect(ctx, next)).rejects.toThrow(
        /not whitelisted for node label/
      );
    });
  });

  describe('Threshold properties', () => {
    it('should allow all whitelisted Threshold properties', async () => {
      const ctx: GraphWriteContext = {
        operation: 'create',
        nodeLabel: 'Threshold',
        properties: {
          id: 'test',
          label: 'Test Threshold',
          value: 1000,
          unit: 'EUR',
          direction: 'BELOW',
          upper_bound: 2000,
          effective_from: '2024-01-01',
          effective_to: '2024-12-31',
          category: 'CGT',
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
        },
        source: 'ingestion',
      };

      const next = async (c: GraphWriteContext) => c;
      await expect(propertyWhitelistAspect(ctx, next)).resolves.toBeDefined();
    });

    it('should reject non-whitelisted Threshold property', async () => {
      const ctx: GraphWriteContext = {
        operation: 'create',
        nodeLabel: 'Threshold',
        properties: { id: 'test', value: 1000, invalid_field: 'bad' },
        source: 'ingestion',
      };

      const next = async (c: GraphWriteContext) => c;
      await expect(propertyWhitelistAspect(ctx, next)).rejects.toThrow(
        /not whitelisted for node label/
      );
    });
  });

  describe('Rate properties', () => {
    it('should allow all whitelisted Rate properties', async () => {
      const ctx: GraphWriteContext = {
        operation: 'create',
        nodeLabel: 'Rate',
        properties: {
          id: 'test',
          label: 'Test Rate',
          percentage: 20,
          flat_amount: 100,
          currency: 'EUR',
          band_lower: 0,
          band_upper: 42000,
          effective_from: '2024-01-01',
          effective_to: '2024-12-31',
          category: 'INCOME_TAX',
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
        },
        source: 'ingestion',
      };

      const next = async (c: GraphWriteContext) => c;
      await expect(propertyWhitelistAspect(ctx, next)).resolves.toBeDefined();
    });
  });

  describe('Form properties', () => {
    it('should allow all whitelisted Form properties', async () => {
      const ctx: GraphWriteContext = {
        operation: 'create',
        nodeLabel: 'Form',
        properties: {
          id: 'test',
          label: 'Test Form',
          issuing_body: 'Revenue',
          form_number: 'CT1',
          source_url: 'https://example.com',
          category: 'TAX',
          online_only: true,
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
        },
        source: 'ingestion',
      };

      const next = async (c: GraphWriteContext) => c;
      await expect(propertyWhitelistAspect(ctx, next)).resolves.toBeDefined();
    });
  });

  describe('PRSIClass properties', () => {
    it('should allow all whitelisted PRSIClass properties', async () => {
      const ctx: GraphWriteContext = {
        operation: 'create',
        nodeLabel: 'PRSIClass',
        properties: {
          id: 'test',
          label: 'Class A',
          description: 'Test description',
          eligible_benefits: ['Benefit 1', 'Benefit 2'],
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
        },
        source: 'ingestion',
      };

      const next = async (c: GraphWriteContext) => c;
      await expect(propertyWhitelistAspect(ctx, next)).resolves.toBeDefined();
    });
  });

  describe('LifeEvent properties', () => {
    it('should allow all whitelisted LifeEvent properties', async () => {
      const ctx: GraphWriteContext = {
        operation: 'create',
        nodeLabel: 'LifeEvent',
        properties: {
          id: 'test',
          label: 'Birth of Child',
          category: 'FAMILY',
          triggers_timeline: true,
          description: 'Test description',
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
        },
        source: 'ingestion',
      };

      const next = async (c: GraphWriteContext) => c;
      await expect(propertyWhitelistAspect(ctx, next)).resolves.toBeDefined();
    });
  });

  describe('Universal properties', () => {
    it('should allow algorithm-derived properties on any node', async () => {
      const ctx: GraphWriteContext = {
        operation: 'create',
        nodeLabel: 'Benefit',
        properties: {
          id: 'test',
          name: 'Test Benefit',
          category: 'WELFARE',
          community_id: 'community-1', // Universal allowed property
          centrality_score: 0.85, // Universal allowed property
        },
        source: 'background_job',
      };

      const next = async (c: GraphWriteContext) => c;
      await expect(propertyWhitelistAspect(ctx, next)).resolves.toBeDefined();
    });
  });

  describe('Concept properties', () => {
    it('should allow all whitelisted Concept properties', async () => {
      const ctx: GraphWriteContext = {
        operation: 'create',
        nodeLabel: 'Concept',
        properties: {
          id: 'test',
          pref_label: 'Test Concept',
          domain: 'TAX',
          kind: 'CATEGORY',
          jurisdiction: 'IE',
          definition: 'Test definition',
          alt_labels: ['Label 1', 'Label 2'],
          source_urls: ['https://example.com'],
          ingestion_status: 'ACTIVE',
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
          last_verified_at: '2024-01-01',
        },
        source: 'ingestion',
      };

      const next = async (c: GraphWriteContext) => c;
      await expect(propertyWhitelistAspect(ctx, next)).resolves.toBeDefined();
    });
  });

  describe('Unknown node types', () => {
    it('should handle unknown node types gracefully', async () => {
      const ctx: GraphWriteContext = {
        operation: 'create',
        nodeLabel: 'UnknownType',
        properties: { id: 'test' },
        source: 'ingestion',
      };

      const next = async (c: GraphWriteContext) => c;
      // Should fail on property whitelist since no whitelist exists for UnknownType
      await expect(propertyWhitelistAspect(ctx, next)).rejects.toThrow();
    });
  });
});

describe('GraphIngressGuard - Aspect Composition', () => {
  describe('Baseline aspects pipeline', () => {
    it('should create baseline aspects array', () => {
      const aspects = createBaselineAspects();

      expect(aspects).toHaveLength(3);
      expect(aspects[0]).toBe(schemaValidationAspect);
      expect(aspects[1]).toBe(piiBlockingAspect);
      expect(aspects[2]).toBe(propertyWhitelistAspect);
    });

    it('should compose baseline aspects into pipeline', async () => {
      const aspects = createBaselineAspects();
      const terminal = async (ctx: GraphWriteContext) => ctx;
      const pipeline = composeIngressAspects(aspects, terminal);

      const ctx: GraphWriteContext = {
        operation: 'create',
        nodeLabel: 'Obligation',
        properties: {
          id: 'test',
          label: 'Test',
          category: 'FILING',
        },
        source: 'ingestion',
      };

      const result = await pipeline(ctx);
      expect(result).toBeDefined();
      expect(result.nodeLabel).toBe('Obligation');
    });

    it('should reject on first failed aspect', async () => {
      const aspects = createBaselineAspects();
      const terminal = async (ctx: GraphWriteContext) => ctx;
      const pipeline = composeIngressAspects(aspects, terminal);

      const ctx: GraphWriteContext = {
        operation: 'create',
        nodeLabel: 'InvalidLabel', // Will fail schema validation
        properties: { id: 'test' },
        source: 'ingestion',
      };

      await expect(pipeline(ctx)).rejects.toThrow(/Disallowed node label/);
    });

    it('should reject on PII even if schema is valid', async () => {
      const aspects = createBaselineAspects();
      const terminal = async (ctx: GraphWriteContext) => ctx;
      const pipeline = composeIngressAspects(aspects, terminal);

      const ctx: GraphWriteContext = {
        operation: 'create',
        nodeLabel: 'Obligation', // Valid label
        properties: { id: 'test', email: 'test@example.com' }, // But has PII
        source: 'ingestion',
      };

      await expect(pipeline(ctx)).rejects.toThrow(/Disallowed property key/);
    });

    it('should reject on property whitelist even if PII check passes', async () => {
      const aspects = createBaselineAspects();
      const terminal = async (ctx: GraphWriteContext) => ctx;
      const pipeline = composeIngressAspects(aspects, terminal);

      const ctx: GraphWriteContext = {
        operation: 'create',
        nodeLabel: 'Obligation', // Valid label
        properties: { id: 'test', invalid_prop: 'value' }, // No PII but not whitelisted
        source: 'ingestion',
      };

      await expect(pipeline(ctx)).rejects.toThrow(/not whitelisted/);
    });
  });

  describe('Custom aspect composition', () => {
    it('should allow custom aspects before baseline', async () => {
      const customAspect: typeof schemaValidationAspect = async (ctx, next) => {
        // Add custom metadata
        return next({ ...ctx, metadata: { custom: true } });
      };

      const aspects = [customAspect, ...createBaselineAspects()];
      const terminal = async (ctx: GraphWriteContext) => ctx;
      const pipeline = composeIngressAspects(aspects, terminal);

      const ctx: GraphWriteContext = {
        operation: 'create',
        nodeLabel: 'Obligation',
        properties: { id: 'test', label: 'Test', category: 'FILING' },
        source: 'ingestion',
      };

      const result = await pipeline(ctx);
      expect(result.metadata).toHaveProperty('custom', true);
    });

    it('should execute aspects in order', async () => {
      const order: number[] = [];

      const aspect1: typeof schemaValidationAspect = async (ctx, next) => {
        order.push(1);
        return next(ctx);
      };

      const aspect2: typeof schemaValidationAspect = async (ctx, next) => {
        order.push(2);
        return next(ctx);
      };

      const aspect3: typeof schemaValidationAspect = async (ctx, next) => {
        order.push(3);
        return next(ctx);
      };

      const terminal = async (ctx: GraphWriteContext) => ctx;
      const pipeline = composeIngressAspects([aspect1, aspect2, aspect3], terminal);

      const ctx: GraphWriteContext = {
        operation: 'create',
        properties: {},
        source: 'ingestion',
      };

      await pipeline(ctx);
      expect(order).toEqual([1, 2, 3]);
    });
  });
});

describe('GraphIngressGuard - Operation Types', () => {
  describe('All operation types', () => {
    const operations: Array<GraphWriteContext['operation']> = [
      'create',
      'merge',
      'update',
      'delete',
    ];

    operations.forEach((operation) => {
      it(`should handle ${operation} operation`, async () => {
        const aspects = createBaselineAspects();
        const terminal = async (ctx: GraphWriteContext) => ctx;
        const pipeline = composeIngressAspects(aspects, terminal);

        const ctx: GraphWriteContext = {
          operation,
          nodeLabel: 'Obligation',
          properties: { id: 'test', label: 'Test', category: 'FILING' },
          source: 'ingestion',
        };

        const result = await pipeline(ctx);
        expect(result.operation).toBe(operation);
      });
    });
  });

  describe('Source tracking', () => {
    const sources: Array<GraphWriteContext['source']> = [
      'ingestion',
      'agent',
      'background_job',
      'script',
    ];

    sources.forEach((source) => {
      it(`should handle source: ${source}`, async () => {
        const aspects = createBaselineAspects();
        const terminal = async (ctx: GraphWriteContext) => ctx;
        const pipeline = composeIngressAspects(aspects, terminal);

        const ctx: GraphWriteContext = {
          operation: 'create',
          nodeLabel: 'Obligation',
          properties: { id: 'test', label: 'Test', category: 'FILING' },
          source,
        };

        const result = await pipeline(ctx);
        expect(result.source).toBe(source);
      });
    });
  });
});
