/**
 * Tests for /api/graph GET endpoint
 *
 * Tests:
 * - Authentication (SEC.2): Requires authenticated user
 * - Node lookup mode (?ids=...): Validates and looks up specific nodes
 * - Node ID validation (SEC.4): Format and length validation
 * - Empty graph handling: Returns empty when no sandbox active
 * - Snapshot mode: Returns bounded graph snapshot
 * - Boundary enforcement: Limits nodes and edges
 * - Multi-jurisdiction merging: Merges cross-border contexts
 * - Error handling: Graceful error responses
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const mockGetServerSession = vi.fn();
const mockHasActiveSandbox = vi.fn();
const mockGetMcpGatewayUrl = vi.fn();
const mockNormalizeProfileType = vi.fn();
const mockCreateGraphClient = vi.fn();
const mockRequestContext = {
  run: vi.fn((context, fn) => fn()),
};
const mockWithSpan = vi.fn((name, attributes, fn) => fn());
const mockCreateLogger = vi.fn(() => ({
  child: vi.fn(() => ({
    info: vi.fn(),
  })),
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock('next-auth/next', () => ({
  getServerSession: mockGetServerSession,
}));

vi.mock('@reg-copilot/reg-intel-core', () => ({
  createGraphClient: mockCreateGraphClient,
  hasActiveSandbox: mockHasActiveSandbox,
  getMcpGatewayUrl: mockGetMcpGatewayUrl,
  normalizeProfileType: mockNormalizeProfileType,
}));

vi.mock('@reg-copilot/reg-intel-observability', () => ({
  createLogger: mockCreateLogger,
  requestContext: mockRequestContext,
  withSpan: mockWithSpan,
}));

vi.mock('@/lib/auth/options', () => ({
  authOptions: {},
}));

describe('GET /api/graph', () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetServerSession.mockReset();
    mockHasActiveSandbox.mockReset();
    mockGetMcpGatewayUrl.mockReset();
    mockNormalizeProfileType.mockReset();
    mockCreateGraphClient.mockReset();
    mockRequestContext.run.mockImplementation((context, fn) => fn());
    mockWithSpan.mockImplementation((name, attributes, fn) => fn());

    // Default mocks
    mockNormalizeProfileType.mockReturnValue('SocialSafetyNet_IE_HousingAssistance');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication (SEC.2)', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockGetServerSession.mockResolvedValue(null);

      const { GET } = await import('./route');

      const request = new Request('http://localhost:3000/api/graph');
      const response = await GET(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: 'Unauthorized' });
    });

    it('returns 401 when session exists but userId is missing', async () => {
      mockGetServerSession.mockResolvedValue({
        user: { tenantId: 'tenant-123' },
      });

      const { GET } = await import('./route');

      const request = new Request('http://localhost:3000/api/graph');
      const response = await GET(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: 'Unauthorized' });
    });

    it('allows authenticated user with valid session', async () => {
      mockGetServerSession.mockResolvedValue({
        user: { id: 'user-123', tenantId: 'tenant-123' },
      });
      mockHasActiveSandbox.mockReturnValue(false); // Will return empty graph

      const { GET } = await import('./route');

      const request = new Request('http://localhost:3000/api/graph');
      const response = await GET(request);

      expect(response.status).toBe(200);
    });
  });

  describe('Empty Graph Handling', () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValue({
        user: { id: 'user-123', tenantId: 'tenant-123' },
      });
    });

    it('returns empty graph when no active sandbox', async () => {
      mockHasActiveSandbox.mockReturnValue(false);

      const { GET } = await import('./route');

      const request = new Request('http://localhost:3000/api/graph');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.type).toBe('graph_snapshot');
      expect(data.nodes).toEqual([]);
      expect(data.edges).toEqual([]);
      expect(data.metadata.nodeCount).toBe(0);
      expect(data.metadata.edgeCount).toBe(0);
      expect(data.metadata.message).toContain('Graph is empty');
    });

    it('returns empty graph when MCP gateway URL not available', async () => {
      mockHasActiveSandbox.mockReturnValue(true);
      mockGetMcpGatewayUrl.mockReturnValue(null);

      const { GET } = await import('./route');

      const request = new Request('http://localhost:3000/api/graph');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.type).toBe('graph_snapshot');
      expect(data.nodes).toEqual([]);
      expect(data.edges).toEqual([]);
    });
  });

  describe('Node Lookup Mode (?ids=...)', () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValue({
        user: { id: 'user-123', tenantId: 'tenant-123' },
      });
      mockHasActiveSandbox.mockReturnValue(true);
      mockGetMcpGatewayUrl.mockReturnValue('http://localhost:8080');
    });

    it('returns empty node list when no sandbox active', async () => {
      mockHasActiveSandbox.mockReturnValue(false);

      const { GET } = await import('./route');

      const request = new Request('http://localhost:3000/api/graph?ids=node1,node2');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.type).toBe('node_lookup');
      expect(data.nodes).toEqual([]);
      expect(data.metadata.message).toContain('Graph is empty');
    });

    it('looks up nodes by IDs', async () => {
      const mockExecuteCypher = vi.fn().mockResolvedValue([
        {
          n: {
            id: 1,
            labels: ['RegulatoryRule'],
            properties: {
              id: 'node1',
              label: 'Rule 1',
              name: 'Housing Rule',
            },
          },
        },
        {
          n: {
            id: 2,
            labels: ['Policy'],
            properties: {
              id: 'node2',
              label: 'Policy 2',
            },
          },
        },
      ]);

      mockCreateGraphClient.mockReturnValue({
        executeCypher: mockExecuteCypher,
      });

      const { GET } = await import('./route');

      const request = new Request('http://localhost:3000/api/graph?ids=node1,node2');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.type).toBe('node_lookup');
      expect(data.nodes).toHaveLength(2);
      expect(data.nodes[0].id).toBe('node1');
      expect(data.nodes[1].id).toBe('node2');
      expect(data.metadata.requested).toBe(2);
    });

    it('deduplicates IDs', async () => {
      const mockExecuteCypher = vi.fn().mockResolvedValue([
        {
          n: {
            id: 1,
            labels: ['RegulatoryRule'],
            properties: {
              id: 'node1',
              label: 'Rule 1',
            },
          },
        },
      ]);

      mockCreateGraphClient.mockReturnValue({
        executeCypher: mockExecuteCypher,
      });

      const { GET } = await import('./route');

      const request = new Request('http://localhost:3000/api/graph?ids=node1,node1,node1');
      const response = await GET(request);

      const data = await response.json();
      expect(data.metadata.requested).toBe(1); // Deduplicated
    });

    it('limits to MAX_LOOKUP_IDS (25)', async () => {
      const ids = Array.from({ length: 50 }, (_, i) => `node${i}`).join(',');

      const mockExecuteCypher = vi.fn().mockResolvedValue([]);
      mockCreateGraphClient.mockReturnValue({
        executeCypher: mockExecuteCypher,
      });

      const { GET } = await import('./route');

      const request = new Request(`http://localhost:3000/api/graph?ids=${ids}`);
      const response = await GET(request);

      const data = await response.json();
      expect(data.metadata.requested).toBeLessThanOrEqual(25);
    });

    it('returns empty array for empty IDs parameter', async () => {
      const { GET } = await import('./route');

      const request = new Request('http://localhost:3000/api/graph?ids=');
      const response = await GET(request);

      const data = await response.json();
      expect(data.type).toBe('node_lookup');
      expect(data.nodes).toEqual([]);
    });

    it('filters out empty IDs after splitting', async () => {
      const mockExecuteCypher = vi.fn().mockResolvedValue([
        {
          n: {
            id: 1,
            labels: ['Rule'],
            properties: { id: 'node1', label: 'Rule' },
          },
        },
      ]);

      mockCreateGraphClient.mockReturnValue({
        executeCypher: mockExecuteCypher,
      });

      const { GET } = await import('./route');

      const request = new Request('http://localhost:3000/api/graph?ids=node1,,,  , ,node1');
      const response = await GET(request);

      const data = await response.json();
      expect(data.metadata.requested).toBe(1); // Only node1
    });
  });

  describe('Node ID Validation (SEC.4)', () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValue({
        user: { id: 'user-123', tenantId: 'tenant-123' },
      });
      mockHasActiveSandbox.mockReturnValue(true);
      mockGetMcpGatewayUrl.mockReturnValue('http://localhost:8080');
    });

    it('accepts valid node IDs (alphanumeric, underscore, hyphen)', async () => {
      const mockExecuteCypher = vi.fn().mockResolvedValue([]);
      mockCreateGraphClient.mockReturnValue({
        executeCypher: mockExecuteCypher,
      });

      const { GET } = await import('./route');

      const validIds = ['node123', 'Node_ABC', 'rule-456', 'ABC_123-xyz'];
      const request = new Request(`http://localhost:3000/api/graph?ids=${validIds.join(',')}`);
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.type).toBe('node_lookup');
    });

    it('rejects node IDs with invalid characters', async () => {
      const { GET } = await import('./route');

      const invalidIds = [
        'node@123',  // @ not allowed
        'rule;DROP', // ; not allowed
        "node'OR'1",  // ' not allowed
        'node<script>', // < and > not allowed
        'node%20test', // % not allowed
      ];

      for (const invalidId of invalidIds) {
        const request = new Request(`http://localhost:3000/api/graph?ids=${invalidId}`);
        const response = await GET(request);

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.type).toBe('error');
        expect(data.error).toContain('Invalid node ID format');
      }
    });

    it('rejects node IDs that are too long (>= 256 chars)', async () => {
      const { GET } = await import('./route');

      const tooLongId = 'a'.repeat(256);
      const request = new Request(`http://localhost:3000/api/graph?ids=${tooLongId}`);
      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.type).toBe('error');
      expect(data.error).toContain('Invalid node ID format');
    });

    it('accepts node IDs at max length (255 chars)', async () => {
      const mockExecuteCypher = vi.fn().mockResolvedValue([]);
      mockCreateGraphClient.mockReturnValue({
        executeCypher: mockExecuteCypher,
      });

      const { GET } = await import('./route');

      const maxLengthId = 'a'.repeat(255);
      const request = new Request(`http://localhost:3000/api/graph?ids=${maxLengthId}`);
      const response = await GET(request);

      expect(response.status).toBe(200);
    });
  });

  describe('Snapshot Mode', () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValue({
        user: { id: 'user-123', tenantId: 'tenant-123' },
      });
      mockHasActiveSandbox.mockReturnValue(true);
      mockGetMcpGatewayUrl.mockReturnValue('http://localhost:8080');
    });

    it('returns graph snapshot with default parameters', async () => {
      const mockGetRulesForProfileAndJurisdiction = vi.fn().mockResolvedValue({
        nodes: [
          { id: 'node1', label: 'Rule 1', type: 'RegulatoryRule', properties: {} },
          { id: 'node2', label: 'Rule 2', type: 'RegulatoryRule', properties: {} },
        ],
        edges: [
          { source: 'node1', target: 'node2', type: 'REFERENCES' },
        ],
      });

      mockCreateGraphClient.mockReturnValue({
        getRulesForProfileAndJurisdiction: mockGetRulesForProfileAndJurisdiction,
        getCrossBorderSlice: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
      });

      const { GET } = await import('./route');

      const request = new Request('http://localhost:3000/api/graph');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.type).toBe('graph_snapshot');
      expect(data.nodes).toHaveLength(2);
      expect(data.edges).toHaveLength(1);
      expect(data.jurisdictions).toEqual(['IE']); // Default
      expect(data.metadata.nodeCount).toBe(2);
      expect(data.metadata.edgeCount).toBe(1);
      expect(data.metadata.truncated).toBe(false);
    });

    it('uses query parameters for jurisdictions and profileType', async () => {
      const mockGetRulesForProfileAndJurisdiction = vi.fn().mockResolvedValue({
        nodes: [],
        edges: [],
      });

      mockCreateGraphClient.mockReturnValue({
        getRulesForProfileAndJurisdiction: mockGetRulesForProfileAndJurisdiction,
        getCrossBorderSlice: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
      });

      const { GET } = await import('./route');

      const request = new Request(
        'http://localhost:3000/api/graph?jurisdictions=UK,FR&profileType=TaxCompliance'
      );
      const response = await GET(request);

      expect(mockGetRulesForProfileAndJurisdiction).toHaveBeenCalledWith(
        'SocialSafetyNet_IE_HousingAssistance', // normalized
        'UK', // primary jurisdiction
        undefined
      );

      const data = await response.json();
      expect(data.jurisdictions).toEqual(['UK', 'FR']);
    });

    it('supports keyword parameter', async () => {
      const mockGetRulesForProfileAndJurisdiction = vi.fn().mockResolvedValue({
        nodes: [],
        edges: [],
      });

      mockCreateGraphClient.mockReturnValue({
        getRulesForProfileAndJurisdiction: mockGetRulesForProfileAndJurisdiction,
        getCrossBorderSlice: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
      });

      const { GET } = await import('./route');

      const request = new Request('http://localhost:3000/api/graph?keyword=housing');
      await GET(request);

      expect(mockGetRulesForProfileAndJurisdiction).toHaveBeenCalledWith(
        expect.any(String),
        'IE',
        'housing'
      );
    });
  });

  describe('Boundary Enforcement', () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValue({
        user: { id: 'user-123', tenantId: 'tenant-123' },
      });
      mockHasActiveSandbox.mockReturnValue(true);
      mockGetMcpGatewayUrl.mockReturnValue('http://localhost:8080');
    });

    it('limits nodes to MAX_INITIAL_NODES (250)', async () => {
      const nodes = Array.from({ length: 300 }, (_, i) => ({
        id: `node${i}`,
        label: `Node ${i}`,
        type: 'RegulatoryRule' as const,
        properties: {},
      }));

      const edges = Array.from({ length: 300 }, (_, i) => ({
        source: `node${i}`,
        target: `node${(i + 1) % 300}`,
        type: 'REFERENCES',
      }));

      mockCreateGraphClient.mockReturnValue({
        getRulesForProfileAndJurisdiction: vi.fn().mockResolvedValue({ nodes, edges }),
        getCrossBorderSlice: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
      });

      const { GET } = await import('./route');

      const request = new Request('http://localhost:3000/api/graph');
      const response = await GET(request);

      const data = await response.json();

      expect(data.nodes.length).toBeLessThanOrEqual(250);
      expect(data.metadata.truncated).toBe(true);
      expect(data.metadata.limits.nodes).toBe(250);
    });

    it('filters edges to only include bounded nodes', async () => {
      const nodes = Array.from({ length: 300 }, (_, i) => ({
        id: `node${i}`,
        label: `Node ${i}`,
        type: 'RegulatoryRule' as const,
        properties: {},
      }));

      // Create edges that span across the 250-node boundary
      const edges = [
        { source: 'node0', target: 'node1', type: 'REFERENCES' }, // Both in first 250
        { source: 'node249', target: 'node250', type: 'REFERENCES' }, // One outside boundary
        { source: 'node250', target: 'node251', type: 'REFERENCES' }, // Both outside boundary
      ];

      mockCreateGraphClient.mockReturnValue({
        getRulesForProfileAndJurisdiction: vi.fn().mockResolvedValue({ nodes, edges }),
        getCrossBorderSlice: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
      });

      const { GET } = await import('./route');

      const request = new Request('http://localhost:3000/api/graph');
      const response = await GET(request);

      const data = await response.json();

      // Only edges where both source and target are in bounded nodes
      for (const edge of data.edges) {
        const sourceInNodes = data.nodes.some((n: { id: string }) => n.id === edge.source);
        const targetInNodes = data.nodes.some((n: { id: string }) => n.id === edge.target);
        expect(sourceInNodes).toBe(true);
        expect(targetInNodes).toBe(true);
      }
    });

    it('limits edges to MAX_INITIAL_EDGES (500)', async () => {
      const nodes = Array.from({ length: 200 }, (_, i) => ({
        id: `node${i}`,
        label: `Node ${i}`,
        type: 'RegulatoryRule' as const,
        properties: {},
      }));

      // Create 600 edges (more than limit)
      const edges = Array.from({ length: 600 }, (_, i) => ({
        source: `node${i % 200}`,
        target: `node${(i + 1) % 200}`,
        type: 'REFERENCES',
      }));

      mockCreateGraphClient.mockReturnValue({
        getRulesForProfileAndJurisdiction: vi.fn().mockResolvedValue({ nodes, edges }),
        getCrossBorderSlice: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
      });

      const { GET } = await import('./route');

      const request = new Request('http://localhost:3000/api/graph');
      const response = await GET(request);

      const data = await response.json();

      expect(data.edges.length).toBeLessThanOrEqual(500);
      expect(data.metadata.truncated).toBe(true);
      expect(data.metadata.limits.edges).toBe(500);
    });

    it('marks truncated as false when within limits', async () => {
      const nodes = Array.from({ length: 100 }, (_, i) => ({
        id: `node${i}`,
        label: `Node ${i}`,
        type: 'RegulatoryRule' as const,
        properties: {},
      }));

      const edges = Array.from({ length: 100 }, (_, i) => ({
        source: `node${i}`,
        target: `node${(i + 1) % 100}`,
        type: 'REFERENCES',
      }));

      mockCreateGraphClient.mockReturnValue({
        getRulesForProfileAndJurisdiction: vi.fn().mockResolvedValue({ nodes, edges }),
        getCrossBorderSlice: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
      });

      const { GET } = await import('./route');

      const request = new Request('http://localhost:3000/api/graph');
      const response = await GET(request);

      const data = await response.json();

      expect(data.metadata.truncated).toBe(false);
    });
  });

  describe('Multi-Jurisdiction Merging', () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValue({
        user: { id: 'user-123', tenantId: 'tenant-123' },
      });
      mockHasActiveSandbox.mockReturnValue(true);
      mockGetMcpGatewayUrl.mockReturnValue('http://localhost:8080');
    });

    it('merges cross-border context for multiple jurisdictions', async () => {
      const primaryContext = {
        nodes: [
          { id: 'node1', label: 'UK Rule', type: 'RegulatoryRule' as const, properties: {} },
        ],
        edges: [
          { source: 'node1', target: 'node2', type: 'REFERENCES' },
        ],
      };

      const crossBorderContext = {
        nodes: [
          { id: 'node2', label: 'EU Rule', type: 'RegulatoryRule' as const, properties: {} },
          { id: 'node3', label: 'FR Rule', type: 'RegulatoryRule' as const, properties: {} },
        ],
        edges: [
          { source: 'node2', target: 'node3', type: 'HARMONIZES_WITH' },
        ],
      };

      const mockGetCrossBorderSlice = vi.fn().mockResolvedValue(crossBorderContext);

      mockCreateGraphClient.mockReturnValue({
        getRulesForProfileAndJurisdiction: vi.fn().mockResolvedValue(primaryContext),
        getCrossBorderSlice: mockGetCrossBorderSlice,
      });

      const { GET } = await import('./route');

      const request = new Request('http://localhost:3000/api/graph?jurisdictions=UK,FR');
      const response = await GET(request);

      expect(mockGetCrossBorderSlice).toHaveBeenCalledWith(['UK', 'FR']);

      const data = await response.json();

      // Should have merged nodes
      expect(data.nodes).toHaveLength(3); // node1, node2, node3
      expect(data.edges).toHaveLength(2); // Both edges
    });

    it('deduplicates nodes when merging', async () => {
      const primaryContext = {
        nodes: [
          { id: 'shared', label: 'Shared Rule', type: 'RegulatoryRule' as const, properties: {} },
          { id: 'node1', label: 'UK Rule', type: 'RegulatoryRule' as const, properties: {} },
        ],
        edges: [],
      };

      const crossBorderContext = {
        nodes: [
          { id: 'shared', label: 'Shared Rule', type: 'RegulatoryRule' as const, properties: {} },
          { id: 'node2', label: 'FR Rule', type: 'RegulatoryRule' as const, properties: {} },
        ],
        edges: [],
      };

      mockCreateGraphClient.mockReturnValue({
        getRulesForProfileAndJurisdiction: vi.fn().mockResolvedValue(primaryContext),
        getCrossBorderSlice: vi.fn().mockResolvedValue(crossBorderContext),
      });

      const { GET } = await import('./route');

      const request = new Request('http://localhost:3000/api/graph?jurisdictions=UK,FR');
      const response = await GET(request);

      const data = await response.json();

      // Should deduplicate 'shared' node
      expect(data.nodes).toHaveLength(3); // shared, node1, node2
      const sharedNodes = data.nodes.filter((n: { id: string }) => n.id === 'shared');
      expect(sharedNodes).toHaveLength(1);
    });

    it('deduplicates edges when merging', async () => {
      const primaryContext = {
        nodes: [
          { id: 'node1', label: 'Rule 1', type: 'RegulatoryRule' as const, properties: {} },
          { id: 'node2', label: 'Rule 2', type: 'RegulatoryRule' as const, properties: {} },
        ],
        edges: [
          { source: 'node1', target: 'node2', type: 'REFERENCES' },
        ],
      };

      const crossBorderContext = {
        nodes: [],
        edges: [
          { source: 'node1', target: 'node2', type: 'REFERENCES' }, // Duplicate edge
        ],
      };

      mockCreateGraphClient.mockReturnValue({
        getRulesForProfileAndJurisdiction: vi.fn().mockResolvedValue(primaryContext),
        getCrossBorderSlice: vi.fn().mockResolvedValue(crossBorderContext),
      });

      const { GET } = await import('./route');

      const request = new Request('http://localhost:3000/api/graph?jurisdictions=UK,FR');
      const response = await GET(request);

      const data = await response.json();

      // Should deduplicate edge
      expect(data.edges).toHaveLength(1);
    });

    it('does not call getCrossBorderSlice for single jurisdiction', async () => {
      const mockGetCrossBorderSlice = vi.fn();

      mockCreateGraphClient.mockReturnValue({
        getRulesForProfileAndJurisdiction: vi.fn().mockResolvedValue({
          nodes: [],
          edges: [],
        }),
        getCrossBorderSlice: mockGetCrossBorderSlice,
      });

      const { GET } = await import('./route');

      const request = new Request('http://localhost:3000/api/graph?jurisdictions=IE');
      await GET(request);

      expect(mockGetCrossBorderSlice).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValue({
        user: { id: 'user-123', tenantId: 'tenant-123' },
      });
      mockHasActiveSandbox.mockReturnValue(true);
      mockGetMcpGatewayUrl.mockReturnValue('http://localhost:8080');
    });

    it('returns 500 on graph client error', async () => {
      mockCreateGraphClient.mockReturnValue({
        getRulesForProfileAndJurisdiction: vi.fn().mockRejectedValue(
          new Error('Graph query failed')
        ),
      });

      const { GET } = await import('./route');

      const request = new Request('http://localhost:3000/api/graph');
      const response = await GET(request);

      expect(response.status).toBe(500);
      const data = await response.json();

      expect(data.type).toBe('error');
      expect(data.error).toContain('Graph query failed');
    });

    it('provides helpful message for sandbox-related errors', async () => {
      mockCreateGraphClient.mockReturnValue({
        getRulesForProfileAndJurisdiction: vi.fn().mockRejectedValue(
          new Error('Sandbox connection timeout')
        ),
      });

      const { GET } = await import('./route');

      const request = new Request('http://localhost:3000/api/graph');
      const response = await GET(request);

      const data = await response.json();

      expect(data.error).toContain('unavailable or expired');
      expect(data.error).toContain('rehydrate Memgraph');
    });

    it('handles unknown error types gracefully', async () => {
      mockCreateGraphClient.mockReturnValue({
        getRulesForProfileAndJurisdiction: vi.fn().mockRejectedValue('String error'),
      });

      const { GET } = await import('./route');

      const request = new Request('http://localhost:3000/api/graph');
      const response = await GET(request);

      const data = await response.json();

      expect(data.type).toBe('error');
      expect(data.error).toBe('Unknown error');
    });

    it('handles node lookup errors', async () => {
      mockCreateGraphClient.mockReturnValue({
        executeCypher: vi.fn().mockRejectedValue(new Error('Cypher query failed')),
      });

      const { GET } = await import('./route');

      const request = new Request('http://localhost:3000/api/graph?ids=node1');
      const response = await GET(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.type).toBe('error');
    });
  });

  describe('Request Context and Tracing', () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValue({
        user: { id: 'user-456', tenantId: 'tenant-789' },
      });
      mockHasActiveSandbox.mockReturnValue(false);
    });

    it('sets request context with tenantId and userId', async () => {
      const { GET } = await import('./route');

      const request = new Request('http://localhost:3000/api/graph');
      await GET(request);

      expect(mockRequestContext.run).toHaveBeenCalledWith(
        { tenantId: 'tenant-789', userId: 'user-456' },
        expect.any(Function)
      );
    });

    it('creates span for tracing', async () => {
      const { GET } = await import('./route');

      const request = new Request('http://localhost:3000/api/graph');
      await GET(request);

      expect(mockWithSpan).toHaveBeenCalledWith(
        'api.graph.snapshot',
        {
          'app.route': '/api/graph',
          'app.tenant.id': 'tenant-789',
          'app.user.id': 'user-456',
        },
        expect.any(Function)
      );
    });
  });
});
