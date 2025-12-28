/**
 * Context Summary UI Component Tests
 *
 * Tests for the context summary display feature in the Message component.
 * Verifies that conversationContextSummary and priorTurnNodes are correctly
 * rendered in the UI.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Message } from '../message'

describe('Message Component - Context Summary Display', () => {
  it('displays context summary panel when metadata includes conversationContextSummary', () => {
    const metadata = {
      agentId: 'test-agent',
      jurisdictions: ['IE'],
      uncertaintyLevel: 'medium' as const,
      referencedNodes: ['node-1'],
      conversationContextSummary: 'Previous turns referenced: Benefit A (Benefit), Rule B (Rule). Keep answers consistent.',
      priorTurnNodes: [
        { id: 'node-a', label: 'Benefit A', type: 'Benefit' },
        { id: 'node-b', label: 'Rule B', type: 'Rule' },
      ],
    }

    render(
      <Message
        role="assistant"
        content="Test response"
        metadata={metadata}
      />
    )

    expect(screen.getByText('Context from previous turns')).toBeInTheDocument()
  })

  it('shows prior turn node count badge', () => {
    const metadata = {
      agentId: 'test-agent',
      jurisdictions: ['IE'],
      uncertaintyLevel: 'low' as const,
      referencedNodes: ['node-1'],
      conversationContextSummary: 'Previous context',
      priorTurnNodes: [
        { id: 'node-1', label: 'Node 1', type: 'Benefit' },
        { id: 'node-2', label: 'Node 2', type: 'Rule' },
        { id: 'node-3', label: 'Node 3', type: 'Jurisdiction' },
      ],
    }

    render(
      <Message
        role="assistant"
        content="Test response"
        metadata={metadata}
      />
    )

    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('expands context summary on click', () => {
    const metadata = {
      agentId: 'test-agent',
      jurisdictions: ['IE'],
      uncertaintyLevel: 'high' as const,
      referencedNodes: ['node-1'],
      conversationContextSummary: 'Previous turns referenced: Test Node (Benefit).',
      priorTurnNodes: [
        { id: 'node-test', label: 'Test Node', type: 'Benefit' },
      ],
    }

    render(
      <Message
        role="assistant"
        content="Test response"
        metadata={metadata}
      />
    )

    const button = screen.getByText('Context from previous turns').closest('button')
    expect(button).toBeInTheDocument()

    // Initially collapsed - summary should not be visible
    expect(screen.queryByText('Previous turns referenced: Test Node (Benefit).')).not.toBeInTheDocument()

    // Click to expand
    fireEvent.click(button!)

    // Now summary should be visible
    expect(screen.getByText('Previous turns referenced: Test Node (Benefit).')).toBeInTheDocument()
  })

  it('displays prior turn nodes as badges when expanded', () => {
    const metadata = {
      agentId: 'test-agent',
      jurisdictions: ['IE'],
      uncertaintyLevel: 'medium' as const,
      referencedNodes: ['node-1'],
      conversationContextSummary: 'Context summary text',
      priorTurnNodes: [
        { id: 'benefit-1', label: 'Benefit Alpha', type: 'Benefit' },
        { id: 'rule-1', label: 'Rule Beta', type: 'Rule' },
      ],
    }

    render(
      <Message
        role="assistant"
        content="Test response"
        metadata={metadata}
      />
    )

    const button = screen.getByText('Context from previous turns').closest('button')
    fireEvent.click(button!)

    expect(screen.getByText('Benefit Alpha')).toBeInTheDocument()
    expect(screen.getByText(/\(Benefit\)/)).toBeInTheDocument()
    expect(screen.getByText('Rule Beta')).toBeInTheDocument()
    expect(screen.getByText(/\(Rule\)/)).toBeInTheDocument()
  })

  it('does not display context summary panel when conversationContextSummary is missing', () => {
    const metadata = {
      agentId: 'test-agent',
      jurisdictions: ['IE'],
      uncertaintyLevel: 'low' as const,
      referencedNodes: ['node-1'],
    }

    render(
      <Message
        role="assistant"
        content="Test response"
        metadata={metadata}
      />
    )

    expect(screen.queryByText('Context from previous turns')).not.toBeInTheDocument()
  })

  it('does not display context summary for user messages', () => {
    const metadata = {
      agentId: 'test-agent',
      jurisdictions: ['IE'],
      uncertaintyLevel: 'medium' as const,
      referencedNodes: ['node-1'],
      conversationContextSummary: 'This should not appear for user messages',
      priorTurnNodes: [
        { id: 'node-1', label: 'Test Node', type: 'Benefit' },
      ],
    }

    render(
      <Message
        role="user"
        content="User question"
        metadata={metadata}
      />
    )

    expect(screen.queryByText('Context from previous turns')).not.toBeInTheDocument()
  })

  it('handles empty priorTurnNodes array', () => {
    const metadata = {
      agentId: 'test-agent',
      jurisdictions: ['IE'],
      uncertaintyLevel: 'medium' as const,
      referencedNodes: ['node-1'],
      conversationContextSummary: 'Summary without nodes',
      priorTurnNodes: [],
    }

    render(
      <Message
        role="assistant"
        content="Test response"
        metadata={metadata}
      />
    )

    const button = screen.getByText('Context from previous turns').closest('button')
    fireEvent.click(button!)

    // Summary text should still be visible
    expect(screen.getByText('Summary without nodes')).toBeInTheDocument()

    // But no node count badge should appear
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('collapses context summary on second click', () => {
    const metadata = {
      agentId: 'test-agent',
      jurisdictions: ['IE'],
      uncertaintyLevel: 'medium' as const,
      referencedNodes: ['node-1'],
      conversationContextSummary: 'Collapsible summary text',
      priorTurnNodes: [
        { id: 'node-1', label: 'Test Node', type: 'Benefit' },
      ],
    }

    render(
      <Message
        role="assistant"
        content="Test response"
        metadata={metadata}
      />
    )

    const button = screen.getByText('Context from previous turns').closest('button')

    // Expand
    fireEvent.click(button!)
    expect(screen.getByText('Collapsible summary text')).toBeInTheDocument()

    // Collapse
    fireEvent.click(button!)
    expect(screen.queryByText('Collapsible summary text')).not.toBeInTheDocument()
  })

  it('displays node types correctly in badges', () => {
    const metadata = {
      agentId: 'test-agent',
      jurisdictions: ['IE'],
      uncertaintyLevel: 'medium' as const,
      referencedNodes: ['node-1'],
      conversationContextSummary: 'Multi-type context',
      priorTurnNodes: [
        { id: 'node-1', label: 'Benefit Node', type: 'Benefit' },
        { id: 'node-2', label: 'Rule Node', type: 'Rule' },
        { id: 'node-3', label: 'Jurisdiction Node', type: 'Jurisdiction' },
        { id: 'node-4', label: 'Regulation Node', type: 'Regulation' },
      ],
    }

    render(
      <Message
        role="assistant"
        content="Test response"
        metadata={metadata}
      />
    )

    const button = screen.getByText('Context from previous turns').closest('button')
    fireEvent.click(button!)

    expect(screen.getByText('Benefit Node')).toBeInTheDocument()
    expect(screen.getByText('Rule Node')).toBeInTheDocument()
    expect(screen.getByText('Jurisdiction Node')).toBeInTheDocument()
    expect(screen.getByText('Regulation Node')).toBeInTheDocument()
  })
})
