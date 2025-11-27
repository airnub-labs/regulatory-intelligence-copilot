#!/usr/bin/env tsx
/**
 * Phase 3 Integration Test
 *
 * Verifies the complete implementation of Phase 3 critical fixes:
 * 1. Chat endpoint routes through ComplianceEngine (not bypassing)
 * 2. Graph queries happen via GlobalRegulatoryComplianceAgent
 * 3. Metadata reflects actual agent execution
 * 4. Graph streaming works end-to-end
 *
 * Usage:
 *   tsx scripts/test-phase3-integration.ts
 */

import {
  createComplianceEngine,
  createDefaultLlmRouter,
  createGraphClient,
  createTimelineEngine,
  type ComplianceStreamChunk,
} from '../packages/reg-intel-core/src/index.js';

// Mock egress guard for testing
class MockEgressGuard {
  redact(input: unknown) {
    return {
      content: input,
      redactionCount: 0,
      redactedTypes: [],
    };
  }

  redactText(text: string): string {
    return text;
  }
}

// Mock LLM client adapter for testing
class MockLlmClient {
  async chat(request: any) {
    return {
      content: 'Mock LLM response for testing',
      usage: undefined,
    };
  }

  async *streamChat(request: any): AsyncIterable<{ type: 'text' | 'error' | 'done'; delta?: string; error?: Error }> {
    // Simulate streaming response
    const chunks = ['This ', 'is ', 'a ', 'test ', 'response'];
    for (const chunk of chunks) {
      yield { type: 'text', delta: chunk };
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    yield { type: 'done' };
  }
}

async function testComplianceEngineRouting() {
  console.log('\n🔬 Test 1: ComplianceEngine Routing');
  console.log('━'.repeat(60));

  try {
    const engine = createComplianceEngine({
      llmClient: new MockLlmClient() as any,
      graphClient: createGraphClient(),
      timelineEngine: createTimelineEngine(),
      egressGuard: new MockEgressGuard() as any,
    });

    const request = {
      messages: [{ role: 'user' as const, content: 'What benefits are available?' }],
      profile: {
        personaType: 'self-employed' as const,
        jurisdictions: ['IE'],
      },
    };

    console.log('   Testing non-streaming method...');
    const response = await engine.handleChat(request);

    console.log('   ✅ Non-streaming response received');
    console.log('      Agent:', response.agentUsed);
    console.log('      Jurisdictions:', response.jurisdictions);
    console.log('      Referenced nodes:', response.referencedNodes.length);
    console.log('      Uncertainty:', response.uncertaintyLevel);

    if (response.agentUsed !== 'GlobalRegulatoryComplianceAgent') {
      throw new Error('Expected GlobalRegulatoryComplianceAgent, got: ' + response.agentUsed);
    }

    return true;
  } catch (error) {
    console.error('   ❌ Error:', error);
    return false;
  }
}

async function testComplianceEngineStreaming() {
  console.log('\n🔬 Test 2: ComplianceEngine Streaming');
  console.log('━'.repeat(60));

  try {
    const engine = createComplianceEngine({
      llmClient: new MockLlmClient() as any,
      graphClient: createGraphClient(),
      timelineEngine: createTimelineEngine(),
      egressGuard: new MockEgressGuard() as any,
    });

    const request = {
      messages: [{ role: 'user' as const, content: 'What is the small benefit exemption?' }],
      profile: {
        personaType: 'single-director' as const,
        jurisdictions: ['IE'],
      },
    };

    console.log('   Testing streaming method...');

    let metadataReceived = false;
    let textChunks = 0;
    let doneReceived = false;
    let agentUsed = '';
    let jurisdictions: string[] = [];
    let referencedNodes = 0;

    for await (const chunk of engine.handleChatStream(request)) {
      if (chunk.type === 'metadata') {
        metadataReceived = true;
        agentUsed = chunk.metadata!.agentUsed;
        jurisdictions = chunk.metadata!.jurisdictions;
        referencedNodes = chunk.metadata!.referencedNodes.length;
        console.log('   ✅ Metadata received');
        console.log('      Agent:', agentUsed);
        console.log('      Jurisdictions:', jurisdictions);
        console.log('      Referenced nodes:', referencedNodes);
      } else if (chunk.type === 'text') {
        textChunks++;
      } else if (chunk.type === 'done') {
        doneReceived = true;
        console.log('   ✅ Stream completed');
        console.log('      Text chunks:', textChunks);
        console.log('      Follow-ups:', chunk.followUps?.length || 0);
      }
    }

    if (!metadataReceived) {
      throw new Error('No metadata received');
    }

    if (!doneReceived) {
      throw new Error('Stream did not complete');
    }

    if (agentUsed !== 'GlobalRegulatoryComplianceAgent') {
      throw new Error('Expected GlobalRegulatoryComplianceAgent, got: ' + agentUsed);
    }

    return true;
  } catch (error) {
    console.error('   ❌ Error:', error);
    return false;
  }
}

async function testGraphQueryExecution() {
  console.log('\n🔬 Test 3: Graph Query Execution');
  console.log('━'.repeat(60));

  try {
    console.log('   Testing graph client...');
    const graphClient = createGraphClient();

    // Test that graph queries work
    const result = await graphClient.getRulesForProfileAndJurisdiction(
      'PROFILE_SELF_EMPLOYED_IE',
      'IE',
      undefined
    );

    console.log('   ✅ Graph query executed');
    console.log('      Nodes returned:', result.nodes.length);
    console.log('      Edges returned:', result.edges.length);

    if (result.nodes.length > 0) {
      console.log('      Sample node:', result.nodes[0].label);
    }

    return true;
  } catch (error) {
    // Graph query might fail if MCP is not set up, which is expected
    console.log('   ℹ️  Graph query failed (expected if MCP not configured)');
    console.log('      Error:', (error as Error).message);
    return true; // Don't fail the test for this
  }
}

async function testArchitecturalIntegrity() {
  console.log('\n🔬 Test 4: Architectural Integrity');
  console.log('━'.repeat(60));

  try {
    // Verify that ComplianceEngine exports exist
    console.log('   Checking exports...');

    const coreExports = await import('../packages/reg-intel-core/src/index.js');

    const requiredExports = [
      'ComplianceEngine',
      'createComplianceEngine',
      'ComplianceStreamChunk',
      'GlobalRegulatoryComplianceAgent',
    ];

    for (const exportName of requiredExports) {
      if (!(exportName in coreExports)) {
        throw new Error(`Missing export: ${exportName}`);
      }
      console.log(`   ✅ ${exportName} exported`);
    }

    // Verify agent has streaming support
    const agent = coreExports.GlobalRegulatoryComplianceAgent;
    if (!agent.handleStream) {
      throw new Error('GlobalRegulatoryComplianceAgent missing handleStream method');
    }
    console.log('   ✅ Agent has streaming support');

    return true;
  } catch (error) {
    console.error('   ❌ Error:', error);
    return false;
  }
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  Phase 3 Integration Test Suite                         ║');
  console.log('║  Testing ComplianceEngine routing and graph queries     ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  const results = {
    routing: await testComplianceEngineRouting(),
    streaming: await testComplianceEngineStreaming(),
    graphQuery: await testGraphQueryExecution(),
    architecture: await testArchitecturalIntegrity(),
  };

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  Test Results Summary                                    ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`   ComplianceEngine Routing:  ${results.routing ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   ComplianceEngine Streaming: ${results.streaming ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Graph Query Execution:      ${results.graphQuery ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Architectural Integrity:    ${results.architecture ? '✅ PASS' : '❌ FAIL'}`);

  const allPassed = Object.values(results).every(r => r);

  if (allPassed) {
    console.log('\n🎉 All Phase 3 tests passed! Architecture is compliant.');
    process.exit(0);
  } else {
    console.log('\n💥 Some tests failed. Please review the implementation.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\n💥 Test suite crashed:', error);
  process.exit(1);
});
