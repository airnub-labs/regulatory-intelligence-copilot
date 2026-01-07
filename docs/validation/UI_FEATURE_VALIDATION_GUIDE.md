# UI Feature Validation Guide

This document provides page-by-page validation tables for all expected UI features in the Regulatory Intelligence Copilot. Use this guide to verify each feature is visible and functioning correctly.

---

## Prerequisites & Setup

Before running validation, ensure the following services are running:

```bash
# 1. Start required Docker services
docker compose -f docker/docker-compose.yml up -d memgraph memgraph-mcp

# 2. Start optional observability services (for analytics pages)
docker compose -f docker/docker-compose.yml up -d redis otel-collector

# 3. Start local Supabase
supabase start

# 4. Create Memgraph indices and seed data
pnpm setup:indices
pnpm seed:graph
pnpm seed:jurisdictions

# 5. Configure environment (apps/demo-web/.env.local)
# - NEXTAUTH_SECRET (required)
# - At least one LLM API key (GROQ_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY)
# - MEMGRAPH_URI=bolt://localhost:7687
# - Supabase configuration

# 6. Start the application
pnpm dev:web
```

**Demo User Access:**
- After `supabase start` and `supabase db reset`, check Supabase Studio at `http://localhost:54323`
- Demo credentials are seeded automatically
- See `docs/development/local/LOCAL_DEVELOPMENT.md` for details

---

## Page 1: Login Page (`/login`)

| Feature | Description | Validation Steps | Expected Result |
|---------|-------------|------------------|-----------------|
| **Login Form** | Email/password authentication | 1. Navigate to `/login` | Form with email and password fields visible |
| **Email Input** | Text input for email | 1. Click email field | Field is focusable and accepts text |
| **Password Input** | Password input with hidden text | 1. Click password field<br>2. Type text | Characters appear as dots/asterisks |
| **Sign In Button** | Submit authentication | 1. Enter credentials<br>2. Click "Sign In" | Button triggers authentication |
| **Error Display** | Show authentication errors | 1. Enter invalid credentials<br>2. Submit | Error message appears below form |
| **Redirect on Success** | Navigate to home after login | 1. Enter valid credentials<br>2. Submit | Redirects to `/` (home page) |
| **Already Authenticated** | Auto-redirect if logged in | 1. Be logged in<br>2. Navigate to `/login` | Redirects to home page |

**Prerequisites:** Supabase running with seeded demo user

---

## Page 2: Main Chat Page (`/`)

### 2.1 Header & Navigation

| Feature | Description | Validation Steps | Expected Result |
|---------|-------------|------------------|-----------------|
| **App Logo** | Brand logo with gradient | 1. View header | Logo visible in top-left |
| **Theme Toggle** | Dark/light mode switch | 1. Click theme toggle button | Theme switches between dark/light |
| **User Email Display** | Show logged-in user | 1. View header | User email visible |
| **Sign Out Button** | Logout functionality | 1. Click sign out | User is logged out, redirected to login |
| **Tenant Switcher** | Workspace selector dropdown | 1. Click tenant dropdown | List of workspaces appears |

### 2.2 Sidebar Navigation

| Feature | Description | Validation Steps | Expected Result |
|---------|-------------|------------------|-----------------|
| **Collapsible Sidebar** | Toggle sidebar visibility | 1. Click collapse button | Sidebar collapses to icons only |
| **Chat Link** | Navigate to chat | 1. Click "Chat" link | Active state shown, stays on `/` |
| **Graph Link** | Navigate to graph view | 1. Click "Graph" link | Navigates to `/graph` |
| **Cost Analytics Link** | Navigate to cost dashboard | 1. Click "Cost Analytics" | Navigates to `/analytics/costs` |
| **Compaction Link** | Navigate to compaction analytics | 1. Click "Compaction" | Navigates to `/analytics/compaction` |
| **Team Settings Link** | Navigate to team settings | 1. Click "Team Settings" | Navigates to `/settings/team` |
| **Active Route Highlight** | Current route highlighted | 1. Navigate to any page | Current page nav item highlighted |

### 2.3 Welcome Screen (No Conversations)

| Feature | Description | Validation Steps | Expected Result |
|---------|-------------|------------------|-----------------|
| **Welcome Message** | Greeting text | 1. Clear all conversations<br>2. Refresh page | "Welcome" or intro message shown |
| **Quick Prompts** | Suggested questions | 1. View welcome screen | Clickable prompt templates visible |
| **Prompt Templates** | Pre-filled questions | 1. Click a quick prompt | Question fills input or submits |

**Prerequisites:** No existing conversations for user

### 2.4 Conversation List Sidebar

| Feature | Description | Validation Steps | Expected Result |
|---------|-------------|------------------|-----------------|
| **Conversation List** | List of past chats | 1. Have existing conversations<br>2. View sidebar | List of conversations visible |
| **Conversation Titles** | Each chat has title | 1. View conversation list | Titles shown for each item |
| **Active Conversation** | Current chat highlighted | 1. Click a conversation | That item shows selected state |
| **Tab Filter (Active/Archived)** | Filter conversation list | 1. Click "Archived" tab | Shows archived conversations |
| **Archive Conversation** | Move chat to archive | 1. Click archive button on conversation | Conversation moves to archived tab |
| **Restore Conversation** | Restore from archive | 1. Go to Archived tab<br>2. Click restore | Conversation returns to Active |
| **Real-time Updates** | New conversations appear | 1. Have two browser tabs<br>2. Create conversation in tab 1 | Tab 2 shows new conversation |

**Prerequisites:** At least one existing conversation

### 2.5 Profile & Jurisdiction Selection

| Feature | Description | Validation Steps | Expected Result |
|---------|-------------|------------------|-----------------|
| **Persona Selector** | Choose user profile type | 1. Click persona dropdown | Options: single-director, self-employed, PAYE employee, advisor |
| **Jurisdiction Toggles** | Select jurisdictions | 1. View jurisdiction options | Checkboxes for IE, UK, EU, NI, IM |
| **Multi-Jurisdiction** | Select multiple | 1. Check multiple jurisdictions | All selected jurisdictions applied |
| **Profile Persistence** | Selection saved | 1. Select persona<br>2. Refresh page | Selection persists |

### 2.6 Chat Input & Submission

| Feature | Description | Validation Steps | Expected Result |
|---------|-------------|------------------|-----------------|
| **Message Input** | Text area for questions | 1. Click input area | Cursor appears, accepts text |
| **Submit Button** | Send message | 1. Type message<br>2. Click submit | Message sends, loading appears |
| **Enter to Submit** | Keyboard shortcut | 1. Type message<br>2. Press Enter | Message submits |
| **Shift+Enter Newline** | Multi-line input | 1. Press Shift+Enter | Creates new line (doesn't submit) |
| **Empty Submit Prevention** | Can't send empty | 1. Click submit with empty input | Nothing happens or error shown |

### 2.7 Chat Messages & Streaming

| Feature | Description | Validation Steps | Expected Result |
|---------|-------------|------------------|-----------------|
| **User Message Bubble** | Show user's question | 1. Send a message | Message appears in chat as user bubble |
| **Assistant Message Bubble** | Show AI response | 1. Wait for response | Response appears as assistant bubble |
| **Streaming Text** | Progressive response | 1. Send message<br>2. Watch response | Text appears word-by-word/chunk-by-chunk |
| **Loading Indicator** | Show processing | 1. Send message | Loading animation during response |
| **Message Timestamp** | Show time sent | 1. View message | Timestamp visible |

**Prerequisites:** Memgraph running, LLM API key configured

### 2.8 Chat Metadata Display

| Feature | Description | Validation Steps | Expected Result |
|---------|-------------|------------------|-----------------|
| **Agent ID** | Which agent responded | 1. Receive response<br>2. View metadata | Agent name/ID shown |
| **Jurisdictions Badge** | Jurisdictions in response | 1. Ask jurisdiction-specific question | Relevant jurisdictions shown |
| **Uncertainty Level** | Confidence indicator | 1. View response metadata | "low", "medium", or "high" shown |
| **Referenced Nodes** | Graph nodes used | 1. Ask regulatory question<br>2. View metadata | Node IDs or titles shown |
| **Disclaimer** | Legal disclaimer | 1. View response | Disclaimer key or text shown |
| **Metadata Skeleton** | Loading placeholder | 1. During streaming | Skeleton loader for metadata fields |

### 2.9 Message Editing & Branching

| Feature | Description | Validation Steps | Expected Result |
|---------|-------------|------------------|-----------------|
| **Edit Button** | Edit previous message | 1. Hover over user message<br>2. Find edit button | Edit icon/button visible |
| **Edit Creates Branch** | Editing branches conversation | 1. Click edit on old message<br>2. Modify and submit | New branch created, original preserved |
| **Branch Dialog** | Modal for branch creation | 1. Click edit on message | Dialog appears with preview |
| **Branch Name Input** | Name the branch | 1. Open branch dialog | Name input field visible |
| **Original Path Preserved** | Old messages remain | 1. Create branch<br>2. Switch to original path | All original messages still there |

### 2.10 Path Navigation

| Feature | Description | Validation Steps | Expected Result |
|---------|-------------|------------------|-----------------|
| **Path Toolbar** | Branch switching controls | 1. Have multiple paths<br>2. View toolbar | Path selector visible |
| **Path Selector Dropdown** | Choose path | 1. Click path selector | List of paths appears |
| **Path Breadcrumbs** | Show path hierarchy | 1. View breadcrumb nav | Path hierarchy shown |
| **Branch Indicator** | Icon on branched messages | 1. Create branch<br>2. View branch point | Branch icon on branched message |
| **URL Path Tracking** | URL contains path ID | 1. Switch paths<br>2. Check URL | `pathId=xxx` in URL |
| **Direct Link to Path** | Share path URL | 1. Copy URL with pathId<br>2. Open in new tab | Same path loads |

**Prerequisites:** Multiple conversation paths created

### 2.11 Graph Context Sidebar

| Feature | Description | Validation Steps | Expected Result |
|---------|-------------|------------------|-----------------|
| **Referenced Nodes Card** | Show graph nodes | 1. Ask regulatory question<br>2. View sidebar | Card with node list visible |
| **Node Details** | Node information | 1. View referenced nodes | Title, type visible per node |
| **Mini Graph** | Visual node representation | 1. Have referenced nodes | Mini visualization shown |
| **Click to Graph Page** | Navigate to full graph | 1. Click on node/graph | Navigates to `/graph` |

**Prerequisites:** Response with `referencedNodes` in metadata

### 2.12 Conversation Settings

| Feature | Description | Validation Steps | Expected Result |
|---------|-------------|------------------|-----------------|
| **Edit Title** | Change conversation title | 1. Click title or edit button<br>2. Enter new title<br>3. Save | Title updates |
| **Share Settings** | Configure sharing | 1. Open sharing settings | Options for shareAudience visible |
| **Tenant Access** | Team sharing | 1. View share settings | Tenant access options |

---

## Page 3: Graph Visualization (`/graph`)

| Feature | Description | Validation Steps | Expected Result |
|---------|-------------|------------------|-----------------|
| **Back to Chat Button** | Return navigation | 1. View header | "Back to chat" button visible |
| **Force-Directed Graph** | Interactive visualization | 1. View page | Graph with nodes and edges rendered |
| **Node Types Colored** | Different node colors | 1. View graph | Nodes colored by type (Jurisdiction, Benefit, etc.) |
| **Pan Graph** | Drag to move | 1. Click and drag graph | View pans |
| **Zoom Graph** | Scroll to zoom | 1. Scroll wheel on graph | Graph zooms in/out |
| **Reset View** | Reset button | 1. Click reset view | Graph returns to default position |
| **Node Search** | Search by keyword | 1. Enter text in search | Matching nodes highlighted |
| **Type Filter** | Filter by node type | 1. Click type filter dropdown<br>2. Select type | Only that type shown |
| **Jurisdiction Filter** | Filter by jurisdiction | 1. Select jurisdiction | Nodes filtered to jurisdiction |
| **Node Selection** | Click to select | 1. Click a node | Node highlighted, details shown |
| **Node Details Panel** | Show node info | 1. Select node | Panel shows node properties |
| **Real-time Updates** | Live graph patches | 1. Have ingestion running<br>2. Watch graph | New nodes appear automatically |
| **Pause/Resume Stream** | Control updates | 1. Click pause/resume button | Updates pause/resume |

**Prerequisites:** Memgraph running with seeded data

---

## Page 4: Team Settings (`/settings/team`)

| Feature | Description | Validation Steps | Expected Result |
|---------|-------------|------------------|-----------------|
| **Back Button** | Return to previous page | 1. View header | Back navigation button |
| **Workspace Info Card** | Current workspace details | 1. View page | Card with workspace name, type |
| **Team Members List** | All members shown | 1. View team card | List of team members |
| **Member Email** | Each member's email | 1. View member list | Email visible per member |
| **Member Role Badge** | Role indicator | 1. View member | Badge showing owner/admin/member/viewer |
| **Member Status** | Active/pending/suspended | 1. View member | Status indicator visible |
| **Join Date** | When member joined | 1. View member | Join date shown |
| **No Members Message** | Empty state | 1. Have no team members | "No team members" message |
| **Loading State** | Spinner during load | 1. Refresh page | Loading spinner shown initially |

**Prerequisites:** Authenticated, part of a team workspace

---

## Page 5: Cost Analytics (`/analytics/costs`)

| Feature | Description | Validation Steps | Expected Result |
|---------|-------------|------------------|-----------------|
| **Time Range Selector** | 24h, 7d, 30d, All-time | 1. View page | Time range buttons visible |
| **Today Cost** | Cost for today | 1. View summary cards | Today's spend shown |
| **Week Cost** | Cost for 7 days | 1. View summary cards | Weekly spend shown |
| **Month Cost** | Cost for 30 days | 1. View summary cards | Monthly spend shown |
| **All-time Cost** | Total spend | 1. View summary cards | All-time total shown |
| **Average Cost** | Per-request average | 1. View summary cards | Average cost per request |
| **Cost by Provider** | Provider breakdown | 1. View breakdown table | OpenAI, Groq, Anthropic costs |
| **Cost by Model** | Model breakdown | 1. View breakdown | Costs per model shown |
| **Cost by Touchpoint** | Task type breakdown | 1. View breakdown | Costs by operation type |
| **Cost by Tenant** | Workspace breakdown | 1. View breakdown | Per-workspace costs |
| **Bar Chart** | Visual cost display | 1. View chart area | Bar chart visualization |
| **Budget Status** | Quota usage | 1. View budget section | Budget/quota progress bar |
| **Warning Threshold** | Budget warning | 1. Exceed warning threshold | Warning indicator shown |
| **Export CSV** | Download data | 1. Click export button | CSV file downloads |
| **Loading State** | Data loading | 1. Refresh page | Loading indicator shown |
| **Error State** | Handle errors | 1. Disconnect services | Error message displayed |

**Prerequisites:** Cost tracking enabled, some LLM usage recorded

---

## Page 6: Compaction Analytics (`/analytics/compaction`)

| Feature | Description | Validation Steps | Expected Result |
|---------|-------------|------------------|-----------------|
| **Time Range Selector** | Filter by time period | 1. View page | Time range buttons visible |
| **Total Operations** | Compaction count | 1. View metrics | Total operations count |
| **Tokens Saved** | Token reduction | 1. View metrics | Total tokens saved |
| **Compression Ratio** | Avg compression % | 1. View metrics | Percentage shown |
| **Avg Duration** | Time per operation | 1. View metrics | Average duration shown |
| **Strategy Performance** | By-strategy breakdown | 1. View strategy table | Rows per strategy type |
| **Recent Operations** | History table | 1. View operations table | Recent compactions listed |
| **Operation Status** | Success/failure | 1. View operation row | Status indicator shown |
| **Operation Timestamp** | When run | 1. View operation row | Timestamp visible |
| **LLM Usage Stats** | Related LLM costs | 1. View LLM section | Compaction LLM usage shown |
| **Loading State** | Data loading | 1. Refresh page | Loading indicator |

**Prerequisites:** Some conversations have been compacted

---

## Page 7: Workspace Invitation (`/invite/[token]`)

| Feature | Description | Validation Steps | Expected Result |
|---------|-------------|------------------|-----------------|
| **Loading State** | Checking session | 1. Navigate to invite URL | Loading spinner shown |
| **Login Prompt** | Unauthenticated user | 1. Be logged out<br>2. Open invite link | "Sign in to continue" shown |
| **Sign In Button** | Navigate to login | 1. View login prompt<br>2. Click sign in | Navigates to `/login` |
| **Auto-Accept** | Authenticated acceptance | 1. Be logged in<br>2. Open valid invite link | Invitation auto-accepted |
| **Success Message** | Acceptance confirmed | 1. Accept invitation | Success message with workspace name |
| **Error Message** | Invalid/expired token | 1. Open invalid invite link | Error message shown |
| **Try Again Button** | Retry option | 1. View error state | Try again button visible |
| **Auto-Redirect** | Go to workspace | 1. Successfully accept | Redirects to workspace after delay |

**Prerequisites:** Valid invitation token URL

---

## Workspace Management Features (Various Locations)

### Tenant Switcher (Header)

| Feature | Description | Validation Steps | Expected Result |
|---------|-------------|------------------|-----------------|
| **Current Workspace Display** | Show active workspace | 1. View header | Current workspace name shown |
| **Workspace List** | All available workspaces | 1. Open switcher dropdown | List of workspaces |
| **Personal Workspace** | Auto-created workspace | 1. View list | Personal workspace with 👤 icon |
| **Team Workspaces** | Shared workspaces | 1. View list | Team workspaces with 👥 icon |
| **Role Indicator** | Show user's role | 1. View workspace in list | Role badge (owner, admin, member) |
| **Switch Workspace** | Change active workspace | 1. Click different workspace | Context switches, page reloads |
| **Create Workspace** | New workspace button | 1. Click "Create workspace" | Modal opens |

### Create Workspace Modal

| Feature | Description | Validation Steps | Expected Result |
|---------|-------------|------------------|-----------------|
| **Modal Display** | Modal opens | 1. Click create workspace | Modal visible |
| **Name Input** | Workspace name field | 1. View modal | Name input present |
| **Type Selector** | Team/Enterprise type | 1. View modal | Type selection options |
| **Create Button** | Submit creation | 1. Fill form<br>2. Click create | Workspace created |
| **Cancel Button** | Close without saving | 1. Click cancel | Modal closes |
| **Validation Errors** | Invalid input handling | 1. Submit empty name | Error message shown |

### Invite User Modal

| Feature | Description | Validation Steps | Expected Result |
|---------|-------------|------------------|-----------------|
| **Email Input** | Invitee email | 1. Open invite modal | Email field visible |
| **Role Selector** | Choose role | 1. View modal | Role dropdown (admin, member, viewer) |
| **Send Invite** | Submit invitation | 1. Fill form<br>2. Click send | Invitation sent, URL generated |
| **Invite URL Display** | Show shareable link | 1. Successfully invite | Invitation URL displayed |
| **Copy Link Button** | Copy to clipboard | 1. Click copy | Link copied |

### Pending Invitations

| Feature | Description | Validation Steps | Expected Result |
|---------|-------------|------------------|-----------------|
| **Invitation List** | Show pending invites | 1. Have pending invitations | List visible |
| **Workspace Name** | Inviting workspace | 1. View invitation | Workspace name shown |
| **Accept Button** | Accept invitation | 1. Click accept | Invitation accepted |
| **Decline Button** | Reject invitation | 1. Click decline | Invitation rejected |

---

## Real-Time Features Validation

### SSE Streaming (Chat)

| Feature | Description | Validation Steps | Expected Result |
|---------|-------------|------------------|-----------------|
| **Connection Established** | SSE connects | 1. Open DevTools Network<br>2. Send message | EventSource connection visible |
| **Metadata Event** | Receive metadata first | 1. Watch events | `metadata` event received first |
| **Message Events** | Incremental text | 1. Watch events | Multiple `message` events |
| **Done Event** | Completion signal | 1. Watch events | `done` event at end |
| **Error Handling** | Handle SSE errors | 1. Disconnect network mid-stream | Error displayed gracefully |

### SSE Streaming (Conversations List)

| Feature | Description | Validation Steps | Expected Result |
|---------|-------------|------------------|-----------------|
| **Snapshot Event** | Initial data | 1. Open Network tab<br>2. View `/api/conversations/stream` | `snapshot` event received |
| **Upsert Events** | New/updated conversations | 1. Create conversation in another tab | `upsert` event received |
| **Deleted Events** | Removed conversations | 1. Archive conversation in another tab | `deleted` event received |

### SSE Streaming (Graph)

| Feature | Description | Validation Steps | Expected Result |
|---------|-------------|------------------|-----------------|
| **Graph Patches** | Incremental updates | 1. View `/graph` page<br>2. Have ingestion running | `graph_patch` events received |
| **Node Added** | New nodes appear | 1. Watch graph during ingestion | New nodes animate in |
| **Node Updated** | Node changes | 1. Update node data | Node updates on screen |

---

## Accessibility Features

| Feature | Description | Validation Steps | Expected Result |
|---------|-------------|------------------|-----------------|
| **Keyboard Navigation** | Tab through UI | 1. Press Tab repeatedly | Focus moves through interactive elements |
| **Focus Indicators** | Visible focus | 1. Tab to elements | Focus ring visible |
| **ARIA Labels** | Screen reader labels | 1. Inspect elements | aria-label attributes present |
| **Escape to Close** | Keyboard dismiss | 1. Open modal<br>2. Press Escape | Modal closes |
| **Enter to Activate** | Keyboard activation | 1. Focus button<br>2. Press Enter | Button activates |

---

## Error States

| Feature | Description | Validation Steps | Expected Result |
|---------|-------------|------------------|-----------------|
| **Chat Error** | LLM failure | 1. Remove API key<br>2. Send message | Error message displayed |
| **Graph Error** | Memgraph failure | 1. Stop Memgraph<br>2. Load `/graph` | Error message displayed |
| **Auth Error** | Session expired | 1. Clear cookies<br>2. Try action | Redirect to login |
| **Network Error** | Offline state | 1. Disconnect network | Error handling shown |
| **404 Page** | Invalid route | 1. Navigate to `/nonexistent` | 404 page or redirect |

---

## Mobile Responsiveness

| Feature | Description | Validation Steps | Expected Result |
|---------|-------------|------------------|-----------------|
| **Responsive Layout** | Mobile-friendly | 1. Resize to mobile width | Layout adapts |
| **Hamburger Menu** | Mobile nav | 1. View at mobile size | Hamburger menu appears |
| **Collapsible Sidebar** | Hide on mobile | 1. View at mobile size | Sidebar collapsed by default |
| **Touch-Friendly** | Tappable targets | 1. Use touch device | Buttons large enough |
| **Chat Input Mobile** | Input accessible | 1. View chat on mobile | Input visible and usable |

---

## Special Validation Scenarios

### Scenario 1: Full Chat Flow
1. Log in as demo user
2. Create new conversation
3. Ask: "What tax reliefs are available for SME directors in Ireland?"
4. Verify: streaming response, metadata (agent, jurisdictions, referenced nodes)
5. Edit a previous message
6. Verify: new branch created, original path preserved
7. Switch between paths
8. Verify: correct messages shown per path

### Scenario 2: Multi-Jurisdiction Query
1. Select persona: "single-director"
2. Enable jurisdictions: IE, UK
3. Ask: "Compare director salary taxation in Ireland and UK"
4. Verify: response mentions both IE and UK, jurisdictions badge shows both

### Scenario 3: Graph Exploration
1. Ask regulatory question
2. Note `referencedNodes` in response
3. Navigate to `/graph`
4. Verify: referenced nodes visible/highlighted
5. Click a node
6. Verify: details panel shows node properties

### Scenario 4: Team Collaboration
1. Log in as team admin
2. Navigate to Team Settings
3. Verify: team members visible
4. Create invitation
5. Copy invite URL
6. In incognito, accept invite
7. Verify: new member appears in team list

### Scenario 5: Analytics Review
1. Have some chat history
2. Navigate to Cost Analytics
3. Verify: costs shown by provider/model
4. Switch time ranges
5. Verify: data updates
6. Export CSV
7. Verify: file downloads with correct data

---

## Version & Feature Status

| Feature | Status | Notes |
|---------|--------|-------|
| Chat Interface | ✅ Implemented | Core feature |
| Message Streaming | ✅ Implemented | SSE-based |
| Path Branching | ✅ Implemented | Edit creates branch |
| Path Switching | ✅ Implemented | URL-tracked |
| Graph Visualization | ✅ Implemented | Force-directed D3 |
| Cost Analytics | ✅ Implemented | Multi-dimensional |
| Compaction Analytics | ✅ Implemented | With strategies |
| Team Management | ✅ Implemented | Invite/roles |
| Workspace Switching | ✅ Implemented | Multi-tenant |
| Eligibility Explorer | 🔄 Planned | Phase 7 |
| Scenario Engine UI | 🔄 Planned | Phase 7 |
| Code Execution UI | 🔄 Planned | v0.7 |
| Enhanced Progress Indicators | 🔄 Proposed | Stage-by-stage feedback |
| Merge Dialog | ✅ In UI Package | Integration TBD |

---

## Quick Reference: Required Services by Page

| Page | Memgraph | Supabase | Redis | LLM API |
|------|----------|----------|-------|---------|
| `/login` | ❌ | ✅ | ❌ | ❌ |
| `/` (chat) | ✅ | ✅ | Optional | ✅ |
| `/graph` | ✅ | ✅ | ❌ | ❌ |
| `/settings/team` | ❌ | ✅ | ❌ | ❌ |
| `/analytics/costs` | ❌ | ✅ | Optional | ❌ |
| `/analytics/compaction` | ❌ | ✅ | ❌ | ❌ |
| `/invite/[token]` | ❌ | ✅ | ❌ | ❌ |

---

*Document generated: 2026-01-07*
*Based on architecture v0.6/v0.7 specifications*
