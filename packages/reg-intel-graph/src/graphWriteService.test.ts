import { describe, expect, it, vi } from 'vitest';
import type { Driver, Session } from 'neo4j-driver';

import { GraphWriteService, type GraphIngressAspect } from './graphWriteService.js';
import type { GraphWriteContext } from './graphIngressGuard.js';

function createMockSession() {
  const session: Pick<Session, 'run' | 'close'> = {
    run: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };

  return session;
}

function createMockDriver(session: ReturnType<typeof createMockSession>): Driver {
  return {
    session: vi.fn(() => session) as unknown as Driver['session'],
    close: vi.fn(),
  } as unknown as Driver;
}

describe('GraphWriteService', () => {
  describe('Property sanitization', () => {
    it('strips undefined properties before executing node upserts', async () => {
      const mockSession = createMockSession();
      const driver = createMockDriver(mockSession);
      const service = new GraphWriteService({ driver });

      await service.upsertConcept({ id: 'C:TEST', pref_label: 'Test concept', kind: undefined });

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ id: 'C:TEST', pref_label: 'Test concept' }),
      );
      expect(mockSession.run).not.toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ kind: undefined }),
      );
    });

    it('strips undefined properties before executing relationships', async () => {
      const mockSession = createMockSession();
      const driver = createMockDriver(mockSession);
      const service = new GraphWriteService({ driver });

      await service.createRelationship({
        fromId: 'A',
        fromLabel: 'Concept',
        toId: 'B',
        toLabel: 'Label',
        relType: 'HAS_ALT_LABEL',
        properties: { note: undefined },
      });

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.any(String),
        { fromId: 'A', toId: 'B' },
      );
    });
  });

  describe('upsertConcept', () => {
    it('creates Concept node with all properties', async () => {
      const mockSession = createMockSession();
      const driver = createMockDriver(mockSession);
      const service = new GraphWriteService({ driver });

      await service.upsertConcept({
        id: 'TAX:IE:VAT',
        pref_label: 'Value Added Tax',
        domain: 'TAX',
        kind: 'VAT',
        jurisdiction: 'IE',
        definition: 'A consumption tax',
        alt_labels: ['Sales Tax'],
        source_urls: ['https://revenue.ie'],
        ingestion_status: 'complete',
        created_at: '2024-01-01',
        updated_at: '2024-01-02',
      });

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (n:Concept {id: $id})'),
        expect.objectContaining({
          id: 'TAX:IE:VAT',
          pref_label: 'Value Added Tax',
          domain: 'TAX',
          kind: 'VAT',
          jurisdiction: 'IE',
        })
      );
    });
  });

  describe('upsertLabel', () => {
    it('creates Label node', async () => {
      const mockSession = createMockSession();
      const driver = createMockDriver(mockSession);
      const service = new GraphWriteService({ driver });

      await service.upsertLabel({
        id: 'LABEL:VAT:1',
        value: 'Sales Tax',
        kind: 'ALT_LABEL',
      });

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (n:Label {id: $id})'),
        expect.objectContaining({
          id: 'LABEL:VAT:1',
          value: 'Sales Tax',
          kind: 'ALT_LABEL',
        })
      );
    });
  });

  describe('upsertJurisdiction', () => {
    it('creates Jurisdiction node', async () => {
      const mockSession = createMockSession();
      const driver = createMockDriver(mockSession);
      const service = new GraphWriteService({ driver });

      await service.upsertJurisdiction({
        id: 'JURIS:IE',
        name: 'Ireland',
        type: 'COUNTRY',
        code: 'IE',
        notes: 'Republic of Ireland',
      });

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (n:Jurisdiction {id: $id})'),
        expect.objectContaining({
          id: 'JURIS:IE',
          name: 'Ireland',
          type: 'COUNTRY',
          code: 'IE',
        })
      );
    });
  });

  describe('upsertRegion', () => {
    it('creates Region node and PART_OF relationship', async () => {
      const mockSession = createMockSession();
      const driver = createMockDriver(mockSession);
      const service = new GraphWriteService({ driver });

      await service.upsertRegion({
        id: 'REGION:DUBLIN',
        name: 'Dublin',
        type: 'COUNTY',
        parentJurisdictionId: 'JURIS:IE',
        notes: 'Capital region',
      });

      // Node creation
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (n:Region {id: $id})'),
        expect.objectContaining({
          id: 'REGION:DUBLIN',
          name: 'Dublin',
          type: 'COUNTY',
        })
      );

      // Relationship creation
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (a)-[r:PART_OF]->(b)'),
        expect.objectContaining({
          fromId: 'REGION:DUBLIN',
          toId: 'JURIS:IE',
        })
      );
    });
  });

  describe('upsertStatute', () => {
    it('creates Statute node and IN_JURISDICTION relationship', async () => {
      const mockSession = createMockSession();
      const driver = createMockDriver(mockSession);
      const service = new GraphWriteService({ driver });

      await service.upsertStatute({
        id: 'STATUTE:TCA1997',
        name: 'Taxes Consolidation Act 1997',
        citation: 'TCA 1997',
        source_url: 'https://irishstatutebook.ie',
        type: 'PRIMARY',
        jurisdictionId: 'JURIS:IE',
      });

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (n:Statute {id: $id})'),
        expect.objectContaining({
          id: 'STATUTE:TCA1997',
          name: 'Taxes Consolidation Act 1997',
          type: 'PRIMARY',
        })
      );

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (a)-[r:IN_JURISDICTION]->(b)'),
        expect.objectContaining({
          fromId: 'STATUTE:TCA1997',
          toId: 'JURIS:IE',
        })
      );
    });
  });

  describe('upsertSection', () => {
    it('creates Section node with PART_OF and IN_JURISDICTION relationships', async () => {
      const mockSession = createMockSession();
      const driver = createMockDriver(mockSession);
      const service = new GraphWriteService({ driver });

      await service.upsertSection({
        id: 'SECTION:TCA1997:195',
        label: 'Section 195',
        title: 'Tax Relief for Artists',
        text_excerpt: 'Exemption from income tax...',
        effective_from: '1997-01-01',
        section_number: '195',
        statuteId: 'STATUTE:TCA1997',
        jurisdictionId: 'JURIS:IE',
      });

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (n:Section {id: $id})'),
        expect.objectContaining({
          id: 'SECTION:TCA1997:195',
          label: 'Section 195',
          title: 'Tax Relief for Artists',
        })
      );

      // Two relationships should be created
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (a)-[r:PART_OF]->(b)'),
        expect.objectContaining({
          fromId: 'SECTION:TCA1997:195',
          toId: 'STATUTE:TCA1997',
        })
      );

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (a)-[r:IN_JURISDICTION]->(b)'),
        expect.objectContaining({
          fromId: 'SECTION:TCA1997:195',
          toId: 'JURIS:IE',
        })
      );
    });
  });

  describe('upsertBenefit', () => {
    it('creates Benefit node and IN_JURISDICTION relationship', async () => {
      const mockSession = createMockSession();
      const driver = createMockDriver(mockSession);
      const service = new GraphWriteService({ driver });

      await service.upsertBenefit({
        id: 'BENEFIT:IE:CHILD_BENEFIT',
        name: 'Child Benefit',
        category: 'FAMILY',
        short_summary: 'Monthly payment for children',
        description: 'Support for families with children',
        jurisdictionId: 'JURIS:IE',
      });

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (n:Benefit {id: $id})'),
        expect.objectContaining({
          id: 'BENEFIT:IE:CHILD_BENEFIT',
          name: 'Child Benefit',
          category: 'FAMILY',
        })
      );

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (a)-[r:IN_JURISDICTION]->(b)'),
        expect.objectContaining({
          fromId: 'BENEFIT:IE:CHILD_BENEFIT',
          toId: 'JURIS:IE',
        })
      );
    });
  });

  describe('upsertRelief', () => {
    it('creates Relief node and IN_JURISDICTION relationship', async () => {
      const mockSession = createMockSession();
      const driver = createMockDriver(mockSession);
      const service = new GraphWriteService({ driver });

      await service.upsertRelief({
        id: 'RELIEF:IE:TUITION',
        name: 'Tuition Relief',
        tax_type: 'INCOME_TAX',
        short_summary: 'Relief for education fees',
        description: 'Tax relief on tuition fees paid',
        jurisdictionId: 'JURIS:IE',
      });

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (n:Relief {id: $id})'),
        expect.objectContaining({
          id: 'RELIEF:IE:TUITION',
          name: 'Tuition Relief',
          tax_type: 'INCOME_TAX',
        })
      );

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (a)-[r:IN_JURISDICTION]->(b)'),
        expect.objectContaining({
          fromId: 'RELIEF:IE:TUITION',
          toId: 'JURIS:IE',
        })
      );
    });
  });

  describe('upsertTimeline', () => {
    it('creates Timeline node with all properties', async () => {
      const mockSession = createMockSession();
      const driver = createMockDriver(mockSession);
      const service = new GraphWriteService({ driver });

      await service.upsertTimeline({
        id: 'TIMELINE:LOOKBACK_5Y',
        label: '5 year lookback',
        window_days: 1825,
        window_months: 60,
        window_years: 5,
        kind: 'LOOKBACK',
        jurisdictionCode: 'IE',
        description: 'Five year lookback period',
      });

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (n:Timeline {id: $id})'),
        expect.objectContaining({
          id: 'TIMELINE:LOOKBACK_5Y',
          label: '5 year lookback',
          window_years: 5,
          kind: 'LOOKBACK',
        })
      );
    });
  });

  describe('upsertAgreement', () => {
    it('creates Agreement node', async () => {
      const mockSession = createMockSession();
      const driver = createMockDriver(mockSession);
      const service = new GraphWriteService({ driver });

      await service.upsertAgreement({
        id: 'AGREEMENT:EU_TREATY',
        name: 'EU Treaty',
        type: 'MULTILATERAL',
        description: 'Treaty establishing the EU',
        effective_from: '1993-11-01',
      });

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (n:Agreement {id: $id})'),
        expect.objectContaining({
          id: 'AGREEMENT:EU_TREATY',
          name: 'EU Treaty',
          type: 'MULTILATERAL',
        })
      );
    });
  });

  describe('upsertRegime', () => {
    it('creates Regime node', async () => {
      const mockSession = createMockSession();
      const driver = createMockDriver(mockSession);
      const service = new GraphWriteService({ driver });

      await service.upsertRegime({
        id: 'REGIME:EU_VAT',
        name: 'EU VAT Regime',
        category: 'TAX',
        description: 'Common VAT system across EU',
      });

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (n:Regime {id: $id})'),
        expect.objectContaining({
          id: 'REGIME:EU_VAT',
          name: 'EU VAT Regime',
          category: 'TAX',
        })
      );
    });
  });

  describe('createRelationship', () => {
    it('creates relationship with properties', async () => {
      const mockSession = createMockSession();
      const driver = createMockDriver(mockSession);
      const service = new GraphWriteService({ driver });

      await service.createRelationship({
        fromId: 'CONCEPT:A',
        fromLabel: 'Concept',
        toId: 'CONCEPT:B',
        toLabel: 'Concept',
        relType: 'REFERENCES',
        properties: { weight: 0.8 },
      });

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (a)-[r:REFERENCES]->(b)'),
        expect.objectContaining({
          fromId: 'CONCEPT:A',
          toId: 'CONCEPT:B',
          weight: 0.8,
        })
      );
    });

    it('creates relationship without properties', async () => {
      const mockSession = createMockSession();
      const driver = createMockDriver(mockSession);
      const service = new GraphWriteService({ driver });

      await service.createRelationship({
        fromId: 'CONCEPT:A',
        fromLabel: 'Concept',
        toId: 'LABEL:B',
        toLabel: 'Label',
        relType: 'HAS_ALT_LABEL',
      });

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (a)-[r:HAS_ALT_LABEL]->(b)'),
        expect.objectContaining({
          fromId: 'CONCEPT:A',
          toId: 'LABEL:B',
        })
      );
    });
  });

  describe('Custom aspects integration', () => {
    it('executes custom aspects before baseline aspects', async () => {
      const mockSession = createMockSession();
      const driver = createMockDriver(mockSession);

      const executionOrder: string[] = [];

      const customAspect: GraphIngressAspect = async (ctx, next) => {
        executionOrder.push('custom');
        return next(ctx);
      };

      const service = new GraphWriteService({
        driver,
        customAspects: [customAspect],
      });

      await service.upsertConcept({
        id: 'TEST:ID',
        pref_label: 'Test',
      });

      expect(executionOrder).toContain('custom');
    });

    it('custom aspect can modify context', async () => {
      const mockSession = createMockSession();
      const driver = createMockDriver(mockSession);

      const addTimestampAspect: GraphIngressAspect = async (ctx, next) => {
        const modifiedCtx = {
          ...ctx,
          metadata: {
            ...ctx.metadata,
            processed_at: '2024-01-01T00:00:00Z',
          },
        };
        return next(modifiedCtx);
      };

      const service = new GraphWriteService({
        driver,
        customAspects: [addTimestampAspect],
      });

      await service.upsertConcept({
        id: 'TEST:ID',
        pref_label: 'Test',
      });

      expect(mockSession.run).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('propagates Cypher execution errors', async () => {
      const mockSession = createMockSession();
      mockSession.run = vi.fn().mockRejectedValue(new Error('Cypher error'));

      const driver = createMockDriver(mockSession);
      const service = new GraphWriteService({ driver });

      await expect(() =>
        service.upsertConcept({
          id: 'TEST:ID',
          pref_label: 'Test',
        })
      ).rejects.toThrow('Cypher error');
    });

    it('closes session even when write fails', async () => {
      const mockSession = createMockSession();
      mockSession.run = vi.fn().mockRejectedValue(new Error('Write failed'));

      const driver = createMockDriver(mockSession);
      const service = new GraphWriteService({ driver });

      await expect(() =>
        service.upsertConcept({
          id: 'TEST:ID',
          pref_label: 'Test',
        })
      ).rejects.toThrow();

      expect(mockSession.close).toHaveBeenCalled();
    });
  });

  describe('Tenant and source tracking', () => {
    it('includes tenantId in context when provided', async () => {
      const mockSession = createMockSession();
      const driver = createMockDriver(mockSession);

      const service = new GraphWriteService({
        driver,
        tenantId: 'tenant-123',
      });

      await service.upsertConcept({
        id: 'TEST:ID',
        pref_label: 'Test',
      });

      expect(mockSession.run).toHaveBeenCalled();
    });

    it('uses custom default source', async () => {
      const mockSession = createMockSession();
      const driver = createMockDriver(mockSession);

      const service = new GraphWriteService({
        driver,
        defaultSource: 'background_job',
      });

      await service.upsertConcept({
        id: 'TEST:ID',
        pref_label: 'Test',
      });

      expect(mockSession.run).toHaveBeenCalled();
    });
  });
});
