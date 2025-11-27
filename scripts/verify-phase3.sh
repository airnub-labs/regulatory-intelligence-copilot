#!/bin/bash
# Phase 3 Verification Script
#
# Verifies that Phase 3 critical fixes are properly implemented:
# 1. ComplianceEngine has streaming support
# 2. Agent has streaming support
# 3. Next.js adapter uses ComplianceEngine (not direct LlmRouter)
# 4. ESLint rules prevent bypassing

set -e

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Phase 3 Implementation Verification                    ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Test 1: Verify ComplianceEngine exports
echo "🔬 Test 1: ComplianceEngine Exports"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if grep -q "handleChatStream" packages/reg-intel-core/src/orchestrator/complianceEngine.ts; then
    echo "   ✅ ComplianceEngine.handleChatStream method exists"
else
    echo "   ❌ ComplianceEngine.handleChatStream method missing"
    exit 1
fi

if grep -q "ComplianceStreamChunk" packages/reg-intel-core/src/index.ts; then
    echo "   ✅ ComplianceStreamChunk exported from core"
else
    echo "   ❌ ComplianceStreamChunk not exported"
    exit 1
fi

# Test 2: Verify Agent has streaming support
echo ""
echo "🔬 Test 2: Agent Streaming Support"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if grep -q "handleStream" packages/reg-intel-core/src/agents/GlobalRegulatoryComplianceAgent.ts; then
    echo "   ✅ GlobalRegulatoryComplianceAgent.handleStream method exists"
else
    echo "   ❌ Agent.handleStream method missing"
    exit 1
fi

if grep -q "AgentStreamResult" packages/reg-intel-core/src/types.ts; then
    echo "   ✅ AgentStreamResult type defined"
else
    echo "   ❌ AgentStreamResult type missing"
    exit 1
fi

# Test 3: Verify Next.js adapter uses ComplianceEngine
echo ""
echo "🔬 Test 3: Next.js Adapter Architecture"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if grep -q "complianceEngine.handleChatStream" packages/reg-intel-next-adapter/src/index.ts; then
    echo "   ✅ Adapter uses complianceEngine.handleChatStream"
else
    echo "   ❌ Adapter not using ComplianceEngine streaming"
    exit 1
fi

if ! grep -q "llmRouter.streamChat" packages/reg-intel-next-adapter/src/index.ts | grep -v "//"; then
    # The only llmRouter.streamChat should be in the adapter class, not in the route handler
    echo "   ⚠️  Checking for llmRouter.streamChat usage in route handler..."
    # Check if it's outside the LlmRouterClientAdapter class
    if grep -A 200 "return async function POST" packages/reg-intel-next-adapter/src/index.ts | grep -q "llmRouter.streamChat"; then
        echo "   ❌ Route handler directly uses llmRouter.streamChat (bypassing ComplianceEngine)"
        exit 1
    else
        echo "   ✅ Route handler does not bypass ComplianceEngine"
    fi
else
    echo "   ✅ No direct llmRouter usage in route handler"
fi

# Test 4: Verify ESLint rules exist
echo ""
echo "🔬 Test 4: ESLint Architectural Enforcement"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if grep -q "ComplianceEngine Bypass Prevention" eslint.config.mjs; then
    echo "   ✅ ESLint bypass prevention rules exist"
else
    echo "   ❌ ESLint bypass prevention rules missing"
    exit 1
fi

if grep -q "llmRouter.*streamChat" eslint.config.mjs; then
    echo "   ✅ ESLint detects llmRouter.streamChat usage"
else
    echo "   ❌ ESLint rule for streamChat missing"
    exit 1
fi

if grep -q "no-restricted-imports" eslint.config.mjs; then
    echo "   ✅ ESLint import restrictions configured"
else
    echo "   ❌ ESLint import restrictions missing"
    exit 1
fi

# Test 5: Build verification
echo ""
echo "🔬 Test 5: TypeScript Compilation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "   Building packages..."
if pnpm run build > /dev/null 2>&1; then
    echo "   ✅ All packages build successfully"
else
    echo "   ❌ Build failed"
    exit 1
fi

# Summary
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Verification Summary                                    ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "   ✅ ComplianceEngine streaming - IMPLEMENTED"
echo "   ✅ Agent streaming support - IMPLEMENTED"
echo "   ✅ Next.js adapter routing - CORRECT"
echo "   ✅ ESLint enforcement - CONFIGURED"
echo "   ✅ TypeScript compilation - PASSING"
echo ""
echo "🎉 Phase 3 implementation verified successfully!"
echo ""
