import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Driver, Session, Result, QueryResult } from 'neo4j-driver';
import { CanonicalConceptHandler, type CapturedConceptPayload } from './canonicalConceptHandler.js';
import type { GraphWriteService } from './graphWriteService.js';

function createMockRecord(data: Record<string, unknown>) {
  return {
    get: vi.fn((key: string) => data[key]),
    keys: Object.keys(data),
    length: Object.keys(data).length,
    has: vi.fn((key: string) => key in data),
    toObject: () => data,
  };
}

function createMockResult(records: ReturnType<typeof createMockRecord>[] = []): QueryResult {
  return {
    records,
    summary: {} as never,
  } as QueryResult;
}

function createMockSession(): Session {
  const session = {
    run: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  };

  return session as unknown as Session;
}

function createMockDriver(session: Session): Driver {
  return {
    session: vi.fn(() => session),
    close: vi.fn(),
  } as unknown as Driver;
}

function createMockGraphWriteService(): GraphWriteService {
  return {
    upsertConcept: vi.fn().mockResolvedValue(undefined),
    upsertLabel: vi.fn().mockResolvedValue(undefined),
    createRelationship: vi.fn().mockResolvedValue(undefined),
  } as unknown as GraphWriteService;
}

describe('CanonicalConceptHandler', () => {
  describe('ID generation and slugification', () => {
    it('generates canonical ID from domain, jurisdiction, and kind', async () => {
      const session = createMockSession();
      session.run = vi.fn()
        .mockResolvedValueOnce(createMockResult([])) // No direct ID match
        .mockResolvedValueOnce(createMockResult([])); // No fallback match

      const driver = createMockDriver(session);
      const handler = new CanonicalConceptHandler({ driver });
      const graphWriteService = createMockGraphWriteService();

      const concepts: CapturedConceptPayload[] = [
        {
          label: 'VAT',
          domain: 'TAX',
          jurisdiction: 'IE',
          kind: 'VAT',
        },
      ];

      await handler.resolveAndUpsert(concepts, graphWriteService);

      expect(graphWriteService.upsertConcept).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'TAX:IE:VAT',
        })
      );
    });

    it('slugifies complex strings correctly', async () => {
      const session = createMockSession();
      session.run = vi.fn()
        .mockResolvedValueOnce(createMockResult([]))
        .mockResolvedValueOnce(createMockResult([]));

      const driver = createMockDriver(session);
      const handler = new CanonicalConceptHandler({ driver });
      const graphWriteService = createMockGraphWriteService();

      const concepts: CapturedConceptPayload[] = [
        {
          label: 'Child Benefit Payment',
          domain: 'Social Welfare',
          jurisdiction: 'IE - Republic',
          kind: 'Child & Family',
        },
      ];

      await handler.resolveAndUpsert(concepts, graphWriteService);

      expect(graphWriteService.upsertConcept).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'SOCIAL_WELFARE:IE_-_REPUBLIC:CHILD_FAMILY',
        })
      );
    });

    it('uses canonicalId if provided', async () => {
      const session = createMockSession();
      session.run = vi.fn()
        .mockResolvedValueOnce(createMockResult([])) // No direct ID match
        .mockResolvedValueOnce(createMockResult([])); // No fallback match

      const driver = createMockDriver(session);
      const handler = new CanonicalConceptHandler({ driver });
      const graphWriteService = createMockGraphWriteService();

      const concepts: CapturedConceptPayload[] = [
        {
          label: 'VAT',
          canonicalId: 'CUSTOM:ID:123',
        },
      ];

      await handler.resolveAndUpsert(concepts, graphWriteService);

      expect(graphWriteService.upsertConcept).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'CUSTOM:ID:123',
        })
      );
    });

    it('uses nodeId if provided and no canonicalId', async () => {
      const session = createMockSession();
      session.run = vi.fn()
        .mockResolvedValueOnce(createMockResult([]))
        .mockResolvedValueOnce(createMockResult([]));

      const driver = createMockDriver(session);
      const handler = new CanonicalConceptHandler({ driver });
      const graphWriteService = createMockGraphWriteService();

      const concepts: CapturedConceptPayload[] = [
        {
          label: 'VAT',
          nodeId: 'NODE:ID:456',
        },
      ];

      await handler.resolveAndUpsert(concepts, graphWriteService);

      expect(graphWriteService.upsertConcept).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'NODE:ID:456',
        })
      );
    });

    it('defaults to GENERIC domain and GLOBAL jurisdiction', async () => {
      const session = createMockSession();
      session.run = vi.fn()
        .mockResolvedValueOnce(createMockResult([]))
        .mockResolvedValueOnce(createMockResult([]));

      const driver = createMockDriver(session);
      const handler = new CanonicalConceptHandler({ driver });
      const graphWriteService = createMockGraphWriteService();

      const concepts: CapturedConceptPayload[] = [
        {
          label: 'Generic Concept',
          kind: 'TEST',
        },
      ];

      await handler.resolveAndUpsert(concepts, graphWriteService);

      expect(graphWriteService.upsertConcept).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'GENERIC:GLOBAL:TEST',
        })
      );
    });

    it('uses label as kind fallback', async () => {
      const session = createMockSession();
      session.run = vi.fn()
        .mockResolvedValueOnce(createMockResult([]))
        .mockResolvedValueOnce(createMockResult([]));

      const driver = createMockDriver(session);
      const handler = new CanonicalConceptHandler({ driver });
      const graphWriteService = createMockGraphWriteService();

      const concepts: CapturedConceptPayload[] = [
        {
          label: 'VAT Rate',
          domain: 'TAX',
          jurisdiction: 'IE',
        },
      ];

      await handler.resolveAndUpsert(concepts, graphWriteService);

      expect(graphWriteService.upsertConcept).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'TAX:IE:VAT_RATE',
        })
      );
    });
  });

  describe('duplicate detection and resolution', () => {
    it('finds existing concept by direct ID match', async () => {
      const session = createMockSession();
      const existingId = 'TAX:IE:VAT';

      session.run = vi.fn()
        .mockResolvedValueOnce(
          createMockResult([createMockRecord({ id: existingId })])
        );

      const driver = createMockDriver(session);
      const handler = new CanonicalConceptHandler({ driver });
      const graphWriteService = createMockGraphWriteService();

      const concepts: CapturedConceptPayload[] = [
        {
          label: 'VAT',
          domain: 'TAX',
          jurisdiction: 'IE',
          kind: 'VAT',
        },
      ];

      await handler.resolveAndUpsert(concepts, graphWriteService);

      // Should use existing ID
      expect(graphWriteService.upsertConcept).toHaveBeenCalledWith(
        expect.objectContaining({
          id: existingId,
        })
      );

      // First query should be direct ID lookup
      expect(session.run).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (c:Concept {id: $id})'),
        expect.objectContaining({ id: existingId })
      );
    });

    it('finds existing concept by domain/kind/jurisdiction fallback', async () => {
      const session = createMockSession();
      const existingId = 'EXISTING:VAT:123';

      session.run = vi.fn()
        .mockResolvedValueOnce(createMockResult([])) // No direct ID match
        .mockResolvedValueOnce(
          createMockResult([createMockRecord({ id: existingId })])
        ); // Fallback match

      const driver = createMockDriver(session);
      const handler = new CanonicalConceptHandler({ driver });
      const graphWriteService = createMockGraphWriteService();

      const concepts: CapturedConceptPayload[] = [
        {
          label: 'VAT',
          domain: 'TAX',
          jurisdiction: 'IE',
          kind: 'VAT',
        },
      ];

      await handler.resolveAndUpsert(concepts, graphWriteService);

      // Should use existing ID from fallback
      expect(graphWriteService.upsertConcept).toHaveBeenCalledWith(
        expect.objectContaining({
          id: existingId,
        })
      );

      // Second query should be fallback lookup
      expect(session.run).toHaveBeenCalledWith(
        expect.stringContaining('domain: $domain'),
        expect.objectContaining({
          domain: 'TAX',
          kind: 'VAT',
          jurisdiction: 'IE',
        })
      );
    });

    it('creates new concept when no match found', async () => {
      const session = createMockSession();
      session.run = vi.fn()
        .mockResolvedValueOnce(createMockResult([])) // No direct ID match
        .mockResolvedValueOnce(createMockResult([])); // No fallback match

      const driver = createMockDriver(session);
      const handler = new CanonicalConceptHandler({ driver });
      const graphWriteService = createMockGraphWriteService();

      const concepts: CapturedConceptPayload[] = [
        {
          label: 'New Concept',
          domain: 'NEW',
          jurisdiction: 'IE',
          kind: 'TEST',
        },
      ];

      await handler.resolveAndUpsert(concepts, graphWriteService);

      // Should create with generated ID
      expect(graphWriteService.upsertConcept).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'NEW:IE:TEST',
        })
      );
    });
  });

  describe('concept upsert and label creation', () => {
    it('upserts concept with all properties', async () => {
      const session = createMockSession();
      session.run = vi.fn()
        .mockResolvedValueOnce(createMockResult([]))
        .mockResolvedValueOnce(createMockResult([]));

      const driver = createMockDriver(session);
      const handler = new CanonicalConceptHandler({ driver });
      const graphWriteService = createMockGraphWriteService();

      const concepts: CapturedConceptPayload[] = [
        {
          label: 'VAT',
          prefLabel: 'Value Added Tax',
          domain: 'TAX',
          jurisdiction: 'IE',
          kind: 'VAT',
          definition: 'A consumption tax on goods and services',
          altLabels: ['Sales Tax', 'GST'],
          sourceUrls: ['https://revenue.ie/vat'],
        },
      ];

      await handler.resolveAndUpsert(concepts, graphWriteService);

      expect(graphWriteService.upsertConcept).toHaveBeenCalledWith({
        id: 'TAX:IE:VAT',
        pref_label: 'Value Added Tax',
        domain: 'TAX',
        kind: 'VAT',
        jurisdiction: 'IE',
        definition: 'A consumption tax on goods and services',
        alt_labels: ['VAT', 'Value Added Tax', 'Sales Tax', 'GST'],
        source_urls: ['https://revenue.ie/vat'],
        updated_at: expect.any(String),
        created_at: expect.any(String),
      });
    });

    it('creates label nodes for all alt_labels', async () => {
      const session = createMockSession();
      session.run = vi.fn()
        .mockResolvedValueOnce(createMockResult([]))
        .mockResolvedValueOnce(createMockResult([]));

      const driver = createMockDriver(session);
      const handler = new CanonicalConceptHandler({ driver });
      const graphWriteService = createMockGraphWriteService();

      const concepts: CapturedConceptPayload[] = [
        {
          label: 'VAT',
          prefLabel: 'Value Added Tax',
          domain: 'TAX',
          jurisdiction: 'IE',
          kind: 'VAT',
          altLabels: ['Sales Tax', 'GST'],
        },
      ];

      await handler.resolveAndUpsert(concepts, graphWriteService);

      // Should create label nodes for: VAT, Value Added Tax, Sales Tax, GST
      expect(graphWriteService.upsertLabel).toHaveBeenCalledTimes(4);

      expect(graphWriteService.upsertLabel).toHaveBeenCalledWith({
        id: expect.stringContaining('TAX:IE:VAT:LABEL:'),
        value: 'VAT',
        kind: 'ALT_LABEL',
      });

      expect(graphWriteService.upsertLabel).toHaveBeenCalledWith({
        id: expect.stringContaining('TAX:IE:VAT:LABEL:'),
        value: 'Value Added Tax',
        kind: 'ALT_LABEL',
      });
    });

    it('creates HAS_ALT_LABEL relationships', async () => {
      const session = createMockSession();
      session.run = vi.fn()
        .mockResolvedValueOnce(createMockResult([]))
        .mockResolvedValueOnce(createMockResult([]));

      const driver = createMockDriver(session);
      const handler = new CanonicalConceptHandler({ driver });
      const graphWriteService = createMockGraphWriteService();

      const concepts: CapturedConceptPayload[] = [
        {
          label: 'VAT',
          domain: 'TAX',
          jurisdiction: 'IE',
          kind: 'VAT',
          altLabels: ['Sales Tax'],
        },
      ];

      await handler.resolveAndUpsert(concepts, graphWriteService);

      // Should create relationship for each label
      expect(graphWriteService.createRelationship).toHaveBeenCalledTimes(2);

      expect(graphWriteService.createRelationship).toHaveBeenCalledWith({
        fromId: 'TAX:IE:VAT',
        fromLabel: 'Concept',
        toId: expect.stringContaining('TAX:IE:VAT:LABEL:'),
        toLabel: 'Label',
        relType: 'HAS_ALT_LABEL',
      });
    });

    it('deduplicates alt_labels', async () => {
      const session = createMockSession();
      session.run = vi.fn()
        .mockResolvedValueOnce(createMockResult([]))
        .mockResolvedValueOnce(createMockResult([]));

      const driver = createMockDriver(session);
      const handler = new CanonicalConceptHandler({ driver });
      const graphWriteService = createMockGraphWriteService();

      const concepts: CapturedConceptPayload[] = [
        {
          label: 'VAT',
          prefLabel: 'VAT', // Duplicate of label
          domain: 'TAX',
          jurisdiction: 'IE',
          kind: 'VAT',
          altLabels: ['VAT', 'Sales Tax', 'VAT'], // Duplicates
        },
      ];

      await handler.resolveAndUpsert(concepts, graphWriteService);

      expect(graphWriteService.upsertConcept).toHaveBeenCalledWith(
        expect.objectContaining({
          alt_labels: ['VAT', 'Sales Tax'], // Deduplicated
        })
      );
    });

    it('skips concepts without prefLabel or label', async () => {
      const session = createMockSession();
      // Don't need to mock session.run since it won't be called
      const driver = createMockDriver(session);
      const handler = new CanonicalConceptHandler({ driver });
      const graphWriteService = createMockGraphWriteService();

      const concepts: CapturedConceptPayload[] = [
        {
          // No label, prefLabel, kind, or domain - should be skipped
          jurisdiction: 'IE',
        },
      ];

      const result = await handler.resolveAndUpsert(concepts, graphWriteService);

      expect(result).toEqual([]);
      expect(graphWriteService.upsertConcept).not.toHaveBeenCalled();
      expect(session.run).not.toHaveBeenCalled();
    });
  });

  describe('batch processing', () => {
    it('processes multiple concepts in sequence', async () => {
      const session = createMockSession();
      session.run = vi.fn()
        .mockResolvedValue(createMockResult([]));

      const driver = createMockDriver(session);
      const handler = new CanonicalConceptHandler({ driver });
      const graphWriteService = createMockGraphWriteService();

      const concepts: CapturedConceptPayload[] = [
        {
          label: 'VAT',
          domain: 'TAX',
          jurisdiction: 'IE',
          kind: 'VAT',
        },
        {
          label: 'VRT',
          domain: 'TAX',
          jurisdiction: 'IE',
          kind: 'VRT',
        },
        {
          label: 'Child Benefit',
          domain: 'SOCIAL_WELFARE',
          jurisdiction: 'IE',
          kind: 'BENEFIT',
        },
      ];

      const result = await handler.resolveAndUpsert(concepts, graphWriteService);

      expect(result).toHaveLength(3);
      expect(result).toContain('TAX:IE:VAT');
      expect(result).toContain('TAX:IE:VRT');
      expect(result).toContain('SOCIAL_WELFARE:IE:BENEFIT');

      expect(graphWriteService.upsertConcept).toHaveBeenCalledTimes(3);
    });

    it('returns resolved IDs in order', async () => {
      const session = createMockSession();
      session.run = vi.fn()
        .mockResolvedValueOnce(createMockResult([createMockRecord({ id: 'EXISTING:1' })]))
        .mockResolvedValueOnce(createMockResult([]))
        .mockResolvedValueOnce(createMockResult([]));

      const driver = createMockDriver(session);
      const handler = new CanonicalConceptHandler({ driver });
      const graphWriteService = createMockGraphWriteService();

      const concepts: CapturedConceptPayload[] = [
        {
          label: 'First',
          domain: 'TAX',
          jurisdiction: 'IE',
          kind: 'FIRST',
        },
        {
          label: 'Second',
          domain: 'TAX',
          jurisdiction: 'IE',
          kind: 'SECOND',
        },
      ];

      const result = await handler.resolveAndUpsert(concepts, graphWriteService);

      expect(result).toEqual(['EXISTING:1', 'TAX:IE:SECOND']);
    });
  });

  describe('session management', () => {
    it('closes session after successful operations', async () => {
      const session = createMockSession();
      session.run = vi.fn()
        .mockResolvedValueOnce(createMockResult([]))
        .mockResolvedValueOnce(createMockResult([]));

      const driver = createMockDriver(session);
      const handler = new CanonicalConceptHandler({ driver });
      const graphWriteService = createMockGraphWriteService();

      const concepts: CapturedConceptPayload[] = [
        {
          label: 'VAT',
          domain: 'TAX',
          jurisdiction: 'IE',
          kind: 'VAT',
        },
      ];

      await handler.resolveAndUpsert(concepts, graphWriteService);

      // Session should be closed once per concept (for lookup)
      expect(session.close).toHaveBeenCalled();
    });

    it('closes session even if query fails', async () => {
      const session = createMockSession();
      session.run = vi.fn().mockRejectedValue(new Error('Query failed'));

      const driver = createMockDriver(session);
      const handler = new CanonicalConceptHandler({ driver });
      const graphWriteService = createMockGraphWriteService();

      const concepts: CapturedConceptPayload[] = [
        {
          label: 'VAT',
          domain: 'TAX',
          jurisdiction: 'IE',
          kind: 'VAT',
        },
      ];

      await expect(() => handler.resolveAndUpsert(concepts, graphWriteService)).rejects.toThrow(
        'Query failed'
      );

      expect(session.close).toHaveBeenCalled();
    });
  });
});
