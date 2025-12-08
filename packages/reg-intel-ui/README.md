# @reg-copilot/reg-intel-ui

Reusable React UI components for conversation paths, branching, and merging in the Regulatory Intelligence Copilot.

## Installation

```bash
pnpm add @reg-copilot/reg-intel-ui
```

## Usage

### 1. Implement the API Client

First, implement the `PathApiClient` interface to connect components to your backend:

```typescript
import type { PathApiClient } from '@reg-copilot/reg-intel-ui';

const apiClient: PathApiClient = {
  async listPaths(conversationId) {
    const res = await fetch(`/api/conversations/${conversationId}/paths`);
    const { paths } = await res.json();
    return paths;
  },
  async createPath(conversationId, input) {
    const res = await fetch(`/api/conversations/${conversationId}/paths`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    const { path } = await res.json();
    return path;
  },
  // ... implement other methods
};
```

### 2. Wrap Your App with the Provider

```tsx
import {
  ConversationPathProvider,
  PathSelector,
} from '@reg-copilot/reg-intel-ui';

function ConversationView({ conversationId }) {
  return (
    <ConversationPathProvider
      conversationId={conversationId}
      apiClient={apiClient}
      onPathChange={(path) => console.log('Switched to:', path)}
    >
      <header>
        <PathSelector showBranchCount />
      </header>
      <MessageList />
    </ConversationPathProvider>
  );
}
```

### 3. Use Hooks in Child Components

```tsx
import { useConversationPaths } from '@reg-copilot/reg-intel-ui';

function MessageList() {
  const { messages, isLoadingMessages, activePath } = useConversationPaths();

  if (isLoadingMessages) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <p>Viewing: {activePath?.name ?? 'Main'}</p>
      {messages.map(msg => (
        <Message key={msg.id} message={msg} />
      ))}
    </div>
  );
}
```

## Components

### `<ConversationPathProvider>`

Context provider that manages path state. Must wrap all other components.

| Prop | Type | Description |
|------|------|-------------|
| `conversationId` | `string` | The conversation to manage |
| `apiClient` | `PathApiClient` | API client implementation |
| `initialPathId` | `string?` | Optional initial active path |
| `onPathChange` | `(path) => void` | Callback when path changes |
| `onError` | `(error) => void` | Callback on errors |

### `<PathSelector>`

Dropdown for selecting the active conversation path.

| Prop | Type | Description |
|------|------|-------------|
| `variant` | `'default' \| 'minimal' \| 'compact'` | Visual style |
| `showBranchCount` | `boolean` | Show count badge |
| `showMessageCount` | `boolean` | Show message count |
| `onRename` | `(path) => void` | Rename callback |
| `onMerge` | `(path) => void` | Merge callback |
| `onDelete` | `(path) => void` | Delete callback |

### `<BranchButton>`

Button to trigger branch creation from a message.

| Prop | Type | Description |
|------|------|-------------|
| `onClick` | `() => void` | Click handler |
| `variant` | `ButtonVariant` | Button style |
| `size` | `ButtonSize` | Button size |
| `tooltip` | `string?` | Tooltip text |
| `showLabel` | `boolean` | Show text label |

### `<BranchDialog>`

Modal for creating a new conversation branch.

| Prop | Type | Description |
|------|------|-------------|
| `open` | `boolean` | Dialog open state |
| `onOpenChange` | `(open) => void` | Open state callback |
| `messageId` | `string` | Message to branch from |
| `messagePreview` | `string?` | Content preview |
| `onBranchCreated` | `(path) => void` | Success callback |

### `<MergeDialog>`

Modal for merging a branch back to another path.

| Prop | Type | Description |
|------|------|-------------|
| `open` | `boolean` | Dialog open state |
| `onOpenChange` | `(open) => void` | Open state callback |
| `sourcePath` | `ClientPath` | Path to merge |
| `onMergeComplete` | `(result) => void` | Success callback |

### `<VersionNavigator>`

Navigate between message versions (edits).

| Prop | Type | Description |
|------|------|-------------|
| `currentIndex` | `number` | Current version (0-based) |
| `totalVersions` | `number` | Total versions |
| `currentTimestamp` | `Date?` | Version timestamp |
| `onPrevious` | `() => void` | Previous callback |
| `onNext` | `() => void` | Next callback |

## Hooks

### `useConversationPaths()`

Main hook for accessing path state and actions.

```typescript
const {
  // State
  paths,           // All paths
  activePath,      // Current path
  messages,        // Messages for active path
  isLoading,
  isLoadingMessages,
  isBranching,
  isMerging,
  error,

  // Actions
  refreshPaths,
  switchPath,
  createBranch,
  mergePath,
  previewMerge,
  updatePath,
  deletePath,
} = useConversationPaths();
```

## Styling

Components use Tailwind CSS class names. Ensure your app includes Tailwind CSS or compatible styling.

CSS variables used:
- `--primary`, `--primary-foreground`
- `--muted`, `--muted-foreground`
- `--accent`, `--accent-foreground`
- `--destructive`, `--destructive-foreground`
- `--border`, `--input`, `--ring`
- `--background`, `--foreground`
- `--popover`, `--popover-foreground`

## License

Private - Regulatory Intelligence Copilot
