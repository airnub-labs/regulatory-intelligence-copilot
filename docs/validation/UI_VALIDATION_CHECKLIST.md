# UI Validation Checklist

Quick validation checklist for each page. Check off items as you verify them.

---

## Pre-Validation Setup

```bash
# Run these commands before starting validation:
docker compose -f docker/docker-compose.yml up -d memgraph memgraph-mcp
supabase start
pnpm setup:indices && pnpm seed:graph && pnpm seed:jurisdictions
pnpm dev:web
```

Open `http://localhost:3000` in browser.

---

## ✅ Page: Login (`/login`)

- [ ] Login form displays with email and password fields
- [ ] Email field accepts input
- [ ] Password field hides characters
- [ ] "Sign In" button is clickable
- [ ] Invalid credentials show error message
- [ ] Valid credentials redirect to home page
- [ ] Already logged in → auto-redirect to home

---

## ✅ Page: Main Chat (`/`)

### Header & Navigation
- [ ] Logo visible in top-left
- [ ] Theme toggle switches dark/light mode
- [ ] User email displayed
- [ ] Sign out button works
- [ ] Tenant switcher dropdown opens

### Sidebar
- [ ] Sidebar collapses/expands
- [ ] Chat link shows active state
- [ ] Graph link navigates to `/graph`
- [ ] Cost Analytics link works
- [ ] Compaction link works
- [ ] Team Settings link works

### Welcome Screen (when no conversations)
- [ ] Welcome message displays
- [ ] Quick prompt templates visible
- [ ] Clicking prompt fills input or sends

### Conversation List
- [ ] Conversations list in sidebar
- [ ] Titles shown for each conversation
- [ ] Active conversation highlighted
- [ ] Active/Archived tabs filter list
- [ ] Archive button moves conversation
- [ ] Restore button restores conversation
- [ ] Real-time: new conversations appear across tabs

### Profile Selection
- [ ] Persona dropdown opens (single-director, self-employed, etc.)
- [ ] Jurisdiction checkboxes (IE, UK, EU, NI, IM)
- [ ] Multiple jurisdictions selectable
- [ ] Selection persists on refresh

### Chat Input
- [ ] Text area accepts input
- [ ] Submit button sends message
- [ ] Enter key submits
- [ ] Shift+Enter creates new line
- [ ] Empty input doesn't submit

### Chat Messages
- [ ] User message shows in bubble
- [ ] Assistant response appears
- [ ] Text streams progressively
- [ ] Loading indicator during response
- [ ] Timestamps visible

### Metadata Display
- [ ] Agent ID shown
- [ ] Jurisdictions badges appear
- [ ] Uncertainty level displayed
- [ ] Referenced nodes listed
- [ ] Disclaimer shown
- [ ] Skeleton loader during streaming

### Message Editing & Branching
- [ ] Edit button visible on hover
- [ ] Branch dialog opens on edit
- [ ] Branch name input available
- [ ] Edit creates new branch
- [ ] Original messages preserved

### Path Navigation
- [ ] Path toolbar visible (with multiple paths)
- [ ] Path selector dropdown works
- [ ] Breadcrumbs show hierarchy
- [ ] Branch indicator icon on branched messages
- [ ] URL updates with pathId
- [ ] Direct path URL works

### Graph Context Sidebar
- [ ] Referenced nodes card visible
- [ ] Node details shown
- [ ] Click navigates to graph page

---

## ✅ Page: Graph Visualization (`/graph`)

- [ ] "Back to chat" button in header
- [ ] Graph renders with nodes and edges
- [ ] Nodes colored by type
- [ ] Pan (drag) works
- [ ] Zoom (scroll) works
- [ ] Reset view button works
- [ ] Search input filters nodes
- [ ] Type filter dropdown works
- [ ] Jurisdiction filter works
- [ ] Click node to select
- [ ] Node details panel shows info
- [ ] Pause/resume stream button works

---

## ✅ Page: Team Settings (`/settings/team`)

- [ ] Back button in header
- [ ] Workspace info card displayed
- [ ] Team members list visible
- [ ] Member email shown
- [ ] Role badge displayed (owner, admin, member, viewer)
- [ ] Status indicator (active, pending, etc.)
- [ ] Join date shown
- [ ] "No team members" message (if applicable)
- [ ] Loading spinner on page load

---

## ✅ Page: Cost Analytics (`/analytics/costs`)

- [ ] Time range selector (24h, 7d, 30d, all-time)
- [ ] Today cost metric
- [ ] Week cost metric
- [ ] Month cost metric
- [ ] All-time cost metric
- [ ] Average cost per request
- [ ] Cost breakdown by provider
- [ ] Cost breakdown by model
- [ ] Cost breakdown by touchpoint
- [ ] Cost breakdown by tenant
- [ ] Bar chart visualization
- [ ] Budget/quota progress bar
- [ ] Export CSV button works
- [ ] Loading state shown initially

---

## ✅ Page: Compaction Analytics (`/analytics/compaction`)

- [ ] Time range selector
- [ ] Total operations count
- [ ] Tokens saved metric
- [ ] Compression ratio percentage
- [ ] Average duration metric
- [ ] Strategy performance table
- [ ] Recent operations table
- [ ] Operation status indicators
- [ ] Operation timestamps
- [ ] LLM usage statistics

---

## ✅ Page: Invitation (`/invite/[token]`)

- [ ] Loading state shown
- [ ] Unauthenticated → "Sign in" prompt
- [ ] Sign in button navigates to login
- [ ] Authenticated → auto-accept
- [ ] Success message with workspace name
- [ ] Error message for invalid token
- [ ] Try again button
- [ ] Auto-redirect after success

---

## ✅ Workspace Management

### Tenant Switcher
- [ ] Current workspace name displayed
- [ ] Dropdown shows all workspaces
- [ ] Personal workspace with icon
- [ ] Team workspaces with icon
- [ ] Role badge per workspace
- [ ] Click switches workspace
- [ ] "Create workspace" option

### Create Workspace Modal
- [ ] Modal opens
- [ ] Name input present
- [ ] Type selector present
- [ ] Create button works
- [ ] Cancel closes modal
- [ ] Validation errors shown

### Invite User Modal
- [ ] Email input present
- [ ] Role selector present
- [ ] Send invite button works
- [ ] Invite URL displayed after send
- [ ] Copy link button works

---

## ✅ Real-Time Features

### Chat SSE
- [ ] SSE connection visible in DevTools
- [ ] Metadata event received first
- [ ] Message events stream progressively
- [ ] Done event received at end
- [ ] Errors handled gracefully

### Conversation List SSE
- [ ] Snapshot event on connect
- [ ] Upsert events for new/updated
- [ ] Deleted events for archived

---

## ✅ Accessibility

- [ ] Tab navigation works through UI
- [ ] Focus indicators visible
- [ ] Escape closes modals
- [ ] Enter activates focused buttons

---

## ✅ Error States

- [ ] Chat error displays message (stop LLM API)
- [ ] Graph error displays message (stop Memgraph)
- [ ] Auth error redirects to login (clear cookies)
- [ ] Network error handled (disconnect)

---

## ✅ Mobile Responsiveness

- [ ] Layout adapts to mobile width
- [ ] Hamburger menu appears
- [ ] Sidebar collapsed by default
- [ ] Touch targets are adequate size
- [ ] Chat input usable on mobile

---

## Full Scenario Tests

### Test 1: Full Chat Flow
- [ ] Login successful
- [ ] Create new conversation
- [ ] Send regulatory question
- [ ] Response streams with metadata
- [ ] Edit previous message
- [ ] Branch created
- [ ] Switch between paths
- [ ] Correct messages per path

### Test 2: Multi-Jurisdiction
- [ ] Select persona
- [ ] Enable IE + UK jurisdictions
- [ ] Ask comparative question
- [ ] Response mentions both
- [ ] Jurisdictions badge shows both

### Test 3: Graph Exploration
- [ ] Ask regulatory question
- [ ] Note referenced nodes
- [ ] Navigate to /graph
- [ ] Referenced nodes visible
- [ ] Click node shows details

### Test 4: Team Collaboration
- [ ] Login as team admin
- [ ] View Team Settings
- [ ] Create invitation
- [ ] Copy invite URL
- [ ] Accept invite (incognito)
- [ ] New member in team list

### Test 5: Analytics Review
- [ ] Navigate to Cost Analytics
- [ ] Costs displayed
- [ ] Switch time ranges
- [ ] Data updates
- [ ] Export CSV works

---

## Notes

**Validation Date:** _______________

**Tester:** _______________

**Environment:**
- Node version: _______________
- Browser: _______________
- Screen size: _______________

**Issues Found:**
1. _______________
2. _______________
3. _______________
