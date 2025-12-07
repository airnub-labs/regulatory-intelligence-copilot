import type {
  PathApiClient,
  ClientPath,
  PathMessage,
  MergePreview,
  MergeResult,
  BranchResult,
  CreatePathInput,
  UpdatePathInput,
  BranchInput,
  MergeInput,
  PreviewMergeInput,
} from '@reg-copilot/reg-intel-ui';

/**
 * Implementation of PathApiClient that calls the demo-web API routes
 */
export function createPathApiClient(): PathApiClient {
  return {
    async listPaths(conversationId: string): Promise<ClientPath[]> {
      const response = await fetch(`/api/conversations/${conversationId}/paths`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`Failed to list paths: ${response.status}`);
      }
      const data = await response.json();
      return data.paths ?? [];
    },

    async createPath(conversationId: string, input: CreatePathInput): Promise<ClientPath> {
      const response = await fetch(`/api/conversations/${conversationId}/paths`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        throw new Error(`Failed to create path: ${response.status}`);
      }
      const data = await response.json();
      return data.path;
    },

    async updatePath(
      conversationId: string,
      pathId: string,
      input: UpdatePathInput
    ): Promise<ClientPath> {
      const response = await fetch(`/api/conversations/${conversationId}/paths/${pathId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        throw new Error(`Failed to update path: ${response.status}`);
      }
      const data = await response.json();
      return data.path;
    },

    async deletePath(conversationId: string, pathId: string, hardDelete?: boolean): Promise<void> {
      const url = new URL(`/api/conversations/${conversationId}/paths/${pathId}`, window.location.origin);
      if (hardDelete) {
        url.searchParams.set('hardDelete', 'true');
      }
      const response = await fetch(url.toString(), {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`Failed to delete path: ${response.status}`);
      }
    },

    async getPathMessages(conversationId: string, pathId: string): Promise<PathMessage[]> {
      const response = await fetch(`/api/conversations/${conversationId}/paths/${pathId}/messages`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`Failed to get path messages: ${response.status}`);
      }
      const data = await response.json();
      return data.messages ?? [];
    },

    async getActivePath(conversationId: string): Promise<ClientPath> {
      const response = await fetch(`/api/conversations/${conversationId}/active-path`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`Failed to get active path: ${response.status}`);
      }
      const data = await response.json();
      return data.path;
    },

    async setActivePath(conversationId: string, pathId: string): Promise<ClientPath> {
      const response = await fetch(`/api/conversations/${conversationId}/active-path`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pathId }),
      });
      if (!response.ok) {
        throw new Error(`Failed to set active path: ${response.status}`);
      }
      const data = await response.json();
      return data.path;
    },

    async createBranch(conversationId: string, input: BranchInput): Promise<BranchResult> {
      const response = await fetch(`/api/conversations/${conversationId}/branch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        throw new Error(`Failed to branch: ${response.status}`);
      }
      return response.json();
    },

    async mergePath(
      conversationId: string,
      sourcePathId: string,
      input: MergeInput
    ): Promise<MergeResult> {
      const response = await fetch(`/api/conversations/${conversationId}/paths/${sourcePathId}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        throw new Error(`Failed to merge: ${response.status}`);
      }
      return response.json();
    },

    async previewMerge(
      conversationId: string,
      sourcePathId: string,
      input: PreviewMergeInput
    ): Promise<MergePreview> {
      const response = await fetch(`/api/conversations/${conversationId}/paths/${sourcePathId}/merge/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        throw new Error(`Failed to preview merge: ${response.status}`);
      }
      return response.json();
    },
  };
}

// Singleton instance
let pathApiClientInstance: PathApiClient | null = null;

export function getPathApiClient(): PathApiClient {
  if (!pathApiClientInstance) {
    pathApiClientInstance = createPathApiClient();
  }
  return pathApiClientInstance;
}
