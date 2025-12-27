# Path System Integration Testing

**Last Updated**: 2025-12-27
**Test Coverage**: Comprehensive path system and UI state management

---

## Overview

This document describes the comprehensive test suite for the conversation path system, covering:
- Multiple consecutive questions and answers
- Message editing and automatic path branching
- Conversation continuation on new paths
- Path switching and navigation
- Complex branching scenarios
- UI state consistency throughout operations

---

## Test Files

### 1. Two-Question Flow Test
**File**: `apps/demo-web/src/app/__tests__/two-question-flow.test.tsx`
**Purpose**: Verify basic streaming and state management
**Coverage**:
- ✅ Two consecutive questions display correctly
- ✅ `isStreamingRef` flag management
- ✅ Conversation reload after streaming

### 2. Path System Integration Test
**File**: `apps/demo-web/src/app/__tests__/path-system-integration.test.tsx`
**Purpose**: Comprehensive path system functionality
**Coverage**:
- ✅ Multi-question conversations (5+ questions)
- ✅ Message editing and branching
- ✅ Path switching
- ✅ Complex branching scenarios
- ✅ UI state consistency
- ✅ Error handling

### 3. Edit Previous Message Test
**File**: `apps/demo-web/src/app/__tests__/edit-previous-message.test.tsx`
**Purpose**: Critical edit-from-middle-of-conversation workflow
**Coverage**:
- ✅ Editing previous (non-last) messages
- ✅ Branching from middle of conversation
- ✅ Preserving original path with ALL messages
- ✅ Switching back to original path
- ✅ UI showing complete history after branch point
- ✅ Multiple edits to same conversation

---

## Test Scenarios

### Scenario 0: Edit Previous Message and Switch Back (CRITICAL)
**Test**: `should preserve full original path when editing and show all messages when switching back`

This is the **most critical test** for the path system as it validates the core branching behavior.

```
Step 1: Create conversation on Main Path
  Main Q1 → Response
  Main Q2 → Response
  Main Q3 → Response  ← Edit this one
  Main Q4 → Response  ← These must be preserved!
  Main Q5 → Response  ← These must be preserved!

Step 2: Edit Main Q3 (not the last message!)
  → Creates new branch from Q3
  → Branch inherits Q1, Q2, Q3
  → Main path keeps ALL messages (including Q4, Q5)

Step 3: Continue on Branch
  Edited Q3 → Response (different from main)
  Branch Q1 → Response
  Branch Q2 → Response

Step 4: Switch back to Main Path
  → UI shows ALL 10 messages
  → Including Q4 and Q5 after branch point!
  → Original Q3 (not edited version)
```

**Critical Assertions:**
```typescript
// Main path preserved completely
const mainMessages = conversationState.messages
  .get(conversationId)!
  .filter(m => m.pathId === 'path-main');
expect(mainMessages).toHaveLength(10);

// Messages AFTER branch point still exist
expect(mainMessages.find(m => m.content === 'Main Q4')).toBeDefined();
expect(mainMessages.find(m => m.content === 'Main Q5')).toBeDefined();

// When switching back, UI shows complete history
const loadData = await fetch(`/api/conversations/${conversationId}`);
expect(loadData.messages).toHaveLength(10);
expect(loadData.messages.find(m => m.content === 'Main Q4')).toBeDefined();
```

**Why This Is Critical:**
- ✅ Proves original conversation is never lost
- ✅ Validates branching doesn't delete subsequent messages
- ✅ Ensures users can return to see full original context
- ✅ Tests the "time travel" aspect of branching
- ✅ Verifies message filtering works correctly

**Real-World Scenario:**
```
User has long conversation about tax regulations:
  Q1: What is PRSI?
  Q2: How does it apply to directors?
  Q3: What about multiple directorships?
  Q4: Are there exemptions?
  Q5: What about cross-border cases?

User realizes Q3 was wrong, wants to rephrase:
  → Edits Q3 to: "What about sole traders instead?"
  → System creates branch from Q3
  → Original conversation preserved with Q4, Q5 about directorships
  → Branch explores new direction about sole traders

User can switch back to see original discussion about directorships!
```

---

### Scenario 1: Multi-Question Conversation Flow
**Test**: `should handle 5 consecutive questions with correct UI updates`

```typescript
Question 1 → Response 1
Question 2 → Response 2
Question 3 → Response 3
Question 4 → Response 4
Question 5 → Response 5
```

**Verifies**:
- ✅ All 5 questions appear in UI
- ✅ All 5 responses appear in UI
- ✅ Messages remain visible after subsequent questions
- ✅ No race conditions or state corruption

**Why This Matters**:
- Tests the fix for the second-question bug
- Ensures `isStreamingRef` is properly managed
- Validates conversation reload after each response

---

### Scenario 2: Message Edit and Path Branching
**Test**: `should create new path when editing message and continue conversation on new path`

```
Main Path:
  Original Q1 → Response
  Original Q2 → Response
  Original Q3 → Response

Edit Q2 → Creates Branch

Branch Path:
  Original Q1 → Response
  Edited Q2 → Response (different from main)
  Branched Q1 → Response (new on branch)
  Branched Q2 → Response (new on branch)
```

**Verifies**:
- ✅ Edit button triggers branch creation
- ✅ Branch API endpoint is called
- ✅ New path is created with correct parent
- ✅ Messages up to branch point are copied
- ✅ Conversation continues on new branch
- ✅ New questions go to branched path
- ✅ UI displays branched path messages

**Why This Matters**:
- Tests complete edit-to-branch workflow
- Validates path inheritance
- Ensures conversation context is preserved
- Verifies UI switches to new branch automatically

---

### Scenario 3: Path Navigation and Branch Switching
**Test**: `should switch between original and branched paths with correct message display`

```
Main Path:
  Main Q1 → Response
  Main Q2 → Response
  Main Q3 → Response

Create Branch → Alternative Path

Alternative Path:
  Main Q1 → Response (inherited)
  Main Q2 → Response (inherited)
  Branch Q1 → Response (new)
  Branch Q2 → Response (new)

Switch Back to Main → Shows original messages
```

**Verifies**:
- ✅ Branch creation from UI
- ✅ Messages are added to correct path
- ✅ Path switching shows correct message history
- ✅ Messages are filtered by active path
- ✅ No cross-contamination between paths

**Why This Matters**:
- Tests path isolation
- Validates message filtering by path
- Ensures switching doesn't lose data
- Verifies conversation state integrity

---

### Scenario 4: Complex Branching Scenarios
**Test**: `should handle multiple branches from same conversation with independent histories`

```
Base Question → Response

Branch A (from base)
  → Branch A Q1 → Response
  → Branch A Q2 → Response

Branch B (from base)
  → Branch B Q1 → Response
  → Branch B Q2 → Response

Each branch maintains independent history
```

**Test**: `should maintain message history when switching between deeply nested branches`

```
Main Path
  └── Branch 1
      └── Branch 1.1
          └── Branch 1.1.1

Each level maintains correct message history
Switching shows only relevant messages
```

**Verifies**:
- ✅ Multiple branches can exist simultaneously
- ✅ Each branch has independent message history
- ✅ Nested branches maintain lineage
- ✅ Path filtering works at any depth
- ✅ Data structure supports complex hierarchies

**Why This Matters**:
- Tests scalability of path system
- Validates complex user workflows
- Ensures data integrity in deep hierarchies
- Proves system handles real-world scenarios

---

### Scenario 5: UI State Consistency
**Test**: `should clear input after each submission`

```
Type "Q1" → Submit → Input cleared
Type "Q2" → Submit → Input cleared
Type "Q3" → Submit → Input cleared
```

**Test**: `should show loading state during streaming and clear after completion`

```
Submit question
  → Loading indicator appears
  → Streaming status shown
  → Response streams in
  → Loading indicator removed
  → UI ready for next question
```

**Verifies**:
- ✅ Input field is cleared after submission
- ✅ Loading states display correctly
- ✅ Streaming indicators appear and disappear
- ✅ UI is re-enabled after completion
- ✅ No lingering disabled states

**Why This Matters**:
- Ensures good UX
- Prevents user confusion
- Validates state cleanup
- Tests loading/streaming flow

---

### Scenario 6: Error Handling
**Test**: `should handle API errors gracefully and maintain UI state`

```
Submit question
  → API returns 500 error
  → Error message displayed
  → UI remains functional
  → Input still enabled
  → User can retry
```

**Verifies**:
- ✅ API errors don't crash UI
- ✅ Error messages are displayed
- ✅ UI remains interactive
- ✅ Input field not permanently disabled
- ✅ Graceful degradation

**Why This Matters**:
- Tests resilience
- Ensures good error UX
- Validates error boundaries
- Prevents UI lock-up

---

## Running the Tests

### Run All Tests
```bash
cd apps/demo-web
npm test
```

### Run Specific Test Suite
```bash
# Two-question flow tests
npm test -- two-question-flow

# Path system integration tests
npm test -- path-system-integration
```

### Run With Coverage
```bash
npm test -- --coverage
```

### Watch Mode
```bash
npm test -- --watch
```

---

## Test Architecture

### Mock Structure

The tests use a sophisticated mock structure that simulates:

1. **Conversation State**
   - `paths`: Map of path IDs to path metadata
   - `messages`: Map of conversation IDs to message arrays
   - `activePaths`: Map of conversation IDs to active path IDs

2. **API Mocking**
   - `/api/chat` - Streams responses via SSE
   - `/api/conversations/[id]` - Returns filtered messages
   - `/api/conversations/[id]/branch` - Creates new paths
   - `/api/conversations/[id]/active-path` - Switches active path
   - `/api/conversations/[id]/paths` - Lists all paths

3. **SSE Simulation**
   - Creates ReadableStream for response streaming
   - Sends metadata, message chunks, and done events
   - Properly closes streams

### State Management

The tests maintain realistic conversation state:

```typescript
conversationState = {
  paths: Map<string, Path>,          // All paths in system
  messages: Map<string, Message[]>,  // All messages by conversation
  activePaths: Map<string, string>,  // Active path per conversation
}
```

This allows tests to:
- Track message history across paths
- Verify path filtering
- Test path switching
- Validate branch inheritance

---

## Key Test Assertions

### Message Display
```typescript
// Verify question appears
expect(screen.queryByText('Question 1')).toBeInTheDocument();

// Verify response appears
expect(screen.queryByText(/Response to: Question 1/i)).toBeInTheDocument();
```

### API Calls
```typescript
// Verify branch creation
expect(fetchMock).toHaveBeenCalledWith(
  expect.stringContaining('/branch'),
  expect.objectContaining({ method: 'POST' })
);

// Verify conversation load
expect(fetchMock).toHaveBeenCalledWith(
  expect.stringContaining('/api/conversations/conv-1'),
  expect.objectContaining({ credentials: 'include' })
);
```

### UI State
```typescript
// Verify input cleared
expect(input.value).toBe('');

// Verify loading state
const streamingIndicator = screen.queryByText(/Streaming/i);
expect(streamingIndicator).toBeInTheDocument();
```

### Path Management
```typescript
// Verify path count
expect(conversationState.paths.size).toBeGreaterThanOrEqual(2);

// Verify message filtering
const mainMessages = messages.filter(m => m.pathId === 'path-main');
expect(mainMessages).toHaveLength(4);
```

---

## Coverage Metrics

### Current Coverage
- **Test Files**: 3
- **Test Cases**: 20+
- **Scenarios Covered**: 7 major workflows
- **Lines of Test Code**: ~1,800+

### Component Coverage
- ✅ Message submission and streaming
- ✅ Multi-turn conversations
- ✅ Message editing
- ✅ Branch creation
- ✅ Path switching
- ✅ UI state management
- ✅ Error handling
- ✅ Loading states

### API Coverage
- ✅ POST /api/chat (streaming)
- ✅ GET /api/conversations/[id]
- ✅ POST /api/conversations/[id]/branch
- ✅ PUT /api/conversations/[id]/active-path
- ✅ GET /api/conversations/[id]/paths
- ✅ Error responses

---

## Best Practices

### 1. Use `waitFor` for Async Assertions
```typescript
await waitFor(() => {
  expect(screen.queryByText('Expected text')).toBeInTheDocument();
}, { timeout: 5000 });
```

### 2. Clean Up Between Tests
```typescript
afterEach(() => {
  vi.clearAllMocks();
});
```

### 3. Simulate Real User Actions
```typescript
fireEvent.change(input, { target: { value: 'Question' } });
fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
```

### 4. Test Both Success and Error Cases
```typescript
// Success case
it('should handle successful response', ...);

// Error case
it('should handle API errors gracefully', ...);
```

### 5. Verify Complete Workflows
Don't just test individual actions - test complete user workflows from start to finish.

---

## Known Limitations

### Current Limitations
1. **Path Selector UI**: Tests validate data flow but not actual dropdown interaction
2. **SSE Real-Time**: Mocks simulate SSE but don't test actual WebSocket/SSE behavior
3. **Browser APIs**: Some browser-specific features (like `window.open`) are mocked

### Future Improvements
- [ ] Add E2E tests with Playwright for real browser testing
- [ ] Test actual path selector component interaction
- [ ] Add performance benchmarks
- [ ] Test concurrent user actions
- [ ] Add accessibility (a11y) tests

---

## Troubleshooting

### Test Timeouts
If tests timeout, increase the timeout value:
```typescript
await waitFor(() => {
  // assertion
}, { timeout: 10000 }); // 10 seconds
```

### Element Not Found
Use `queryBy*` instead of `getBy*` to avoid errors:
```typescript
// Good - returns null if not found
expect(screen.queryByText('Text')).toBeInTheDocument();

// Bad - throws if not found
expect(screen.getByText('Text')).toBeInTheDocument();
```

### Async State Updates
Always wrap state-dependent assertions in `waitFor`:
```typescript
// Good
await waitFor(() => {
  expect(someState).toBe(expectedValue);
});

// Bad - may check before state updates
expect(someState).toBe(expectedValue);
```

---

## Conclusion

The path system integration test suite provides comprehensive coverage of:
- ✅ Basic message flow (2+ questions)
- ✅ Extended conversations (5+ questions)
- ✅ Message editing and branching
- ✅ Path navigation and switching
- ✅ Complex branching hierarchies
- ✅ UI state consistency
- ✅ Error handling

These tests ensure the path system works correctly in all scenarios and that the UI properly updates in response to user actions and API responses.

All critical user workflows are covered, providing confidence that the system handles real-world usage patterns correctly.
