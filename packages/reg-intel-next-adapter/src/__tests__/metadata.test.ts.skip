import { describe, expect, it, vi } from 'vitest'
import { createStreamResponse } from '../index.js'

describe('Metadata Propagation', () => {
  describe('Context Summary Metadata', () => {
    it('passes conversationContextSummary through buildMetadataChunk', async () => {
      const mockStream = async function* () {
        yield {
          type: 'metadata',
          metadata: {
            agentUsed: 'test-agent',
            jurisdictions: ['IE'],
            uncertaintyLevel: 'medium',
            referencedNodes: [{ id: 'node-1', label: 'Test Node', type: 'Benefit' }],
            conversationContextSummary: 'Previous turns referenced: Node A (Benefit), Node B (Rule). Keep follow-up answers consistent.',
            priorTurnNodes: [
              { id: 'node-a', label: 'Node A', type: 'Benefit' },
              { id: 'node-b', label: 'Node B', type: 'Rule' },
            ],
          },
        }
        yield { type: 'text', delta: 'Test response' }
        yield { type: 'done' }
      }

      const response = createStreamResponse(mockStream(), {
        conversationId: 'conv-1',
      })

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let chunks: string[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(decoder.decode(value))
      }

      const fullText = chunks.join('')
      const lines = fullText.split('\n').filter(line => line.startsWith('data: '))

      const metadataLine = lines.find(line => line.includes('"type":"metadata"'))
      expect(metadataLine).toBeDefined()

      const metadataData = JSON.parse(metadataLine!.replace('data: ', ''))
      expect(metadataData.conversationContextSummary).toBe(
        'Previous turns referenced: Node A (Benefit), Node B (Rule). Keep follow-up answers consistent.'
      )
      expect(metadataData.priorTurnNodes).toHaveLength(2)
      expect(metadataData.priorTurnNodes[0]).toEqual({ id: 'node-a', label: 'Node A', type: 'Benefit' })
      expect(metadataData.priorTurnNodes[1]).toEqual({ id: 'node-b', label: 'Node B', type: 'Rule' })
    })

    it('handles metadata without conversationContextSummary', async () => {
      const mockStream = async function* () {
        yield {
          type: 'metadata',
          metadata: {
            agentUsed: 'test-agent',
            jurisdictions: ['IE'],
            uncertaintyLevel: 'low',
            referencedNodes: [{ id: 'node-1', label: 'Test Node', type: 'Rule' }],
          },
        }
        yield { type: 'text', delta: 'Response without context summary' }
        yield { type: 'done' }
      }

      const response = createStreamResponse(mockStream(), {
        conversationId: 'conv-2',
      })

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let chunks: string[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(decoder.decode(value))
      }

      const fullText = chunks.join('')
      const lines = fullText.split('\n').filter(line => line.startsWith('data: '))

      const metadataLine = lines.find(line => line.includes('"type":"metadata"'))
      expect(metadataLine).toBeDefined()

      const metadataData = JSON.parse(metadataLine!.replace('data: ', ''))
      expect(metadataData.conversationContextSummary).toBeUndefined()
      expect(metadataData.priorTurnNodes).toBeUndefined()
    })

    it('handles empty priorTurnNodes array', async () => {
      const mockStream = async function* () {
        yield {
          type: 'metadata',
          metadata: {
            agentUsed: 'test-agent',
            jurisdictions: ['UK'],
            uncertaintyLevel: 'high',
            referencedNodes: [],
            conversationContextSummary: undefined,
            priorTurnNodes: [],
          },
        }
        yield { type: 'text', delta: 'First message' }
        yield { type: 'done' }
      }

      const response = createStreamResponse(mockStream(), {
        conversationId: 'conv-3',
      })

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let chunks: string[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(decoder.decode(value))
      }

      const fullText = chunks.join('')
      const lines = fullText.split('\n').filter(line => line.startsWith('data: '))

      const metadataLine = lines.find(line => line.includes('"type":"metadata"'))
      expect(metadataLine).toBeDefined()

      const metadataData = JSON.parse(metadataLine!.replace('data: ', ''))
      expect(metadataData.priorTurnNodes).toEqual([])
      expect(metadataData.conversationContextSummary).toBeUndefined()
    })

    it('preserves context summary with multiple prior turn nodes', async () => {
      const mockStream = async function* () {
        yield {
          type: 'metadata',
          metadata: {
            agentUsed: 'multi-node-agent',
            jurisdictions: ['IE', 'UK'],
            uncertaintyLevel: 'medium',
            referencedNodes: [
              { id: 'current-1', label: 'Current Node', type: 'Regulation' },
            ],
            conversationContextSummary: 'Previous turns referenced: Benefit X, Rule Y, Jurisdiction Z. Maintain consistency.',
            priorTurnNodes: [
              { id: 'prior-1', label: 'Benefit X', type: 'Benefit' },
              { id: 'prior-2', label: 'Rule Y', type: 'Rule' },
              { id: 'prior-3', label: 'Jurisdiction Z', type: 'Jurisdiction' },
            ],
          },
        }
        yield { type: 'text', delta: 'Multi-node response' }
        yield { type: 'done' }
      }

      const response = createStreamResponse(mockStream(), {
        conversationId: 'conv-4',
      })

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let chunks: string[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(decoder.decode(value))
      }

      const fullText = chunks.join('')
      const lines = fullText.split('\n').filter(line => line.startsWith('data: '))

      const metadataLine = lines.find(line => line.includes('"type":"metadata"'))
      expect(metadataLine).toBeDefined()

      const metadataData = JSON.parse(metadataLine!.replace('data: ', ''))
      expect(metadataData.conversationContextSummary).toContain('Benefit X')
      expect(metadataData.conversationContextSummary).toContain('Rule Y')
      expect(metadataData.conversationContextSummary).toContain('Jurisdiction Z')
      expect(metadataData.priorTurnNodes).toHaveLength(3)
      expect(metadataData.priorTurnNodes.map((n: any) => n.label)).toEqual([
        'Benefit X',
        'Rule Y',
        'Jurisdiction Z',
      ])
    })
  })
})
