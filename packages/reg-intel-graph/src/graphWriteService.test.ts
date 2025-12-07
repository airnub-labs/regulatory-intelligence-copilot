import { describe, expect, it, vi } from 'vitest';
import type { Driver, Session } from 'neo4j-driver';

import { GraphWriteService } from './graphWriteService.js';

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
