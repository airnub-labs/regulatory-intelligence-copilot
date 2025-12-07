/**
 * Utility functions for the UI components
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names with Tailwind CSS classes
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a date relative to now (e.g., "2 hours ago", "yesterday")
 */
export function formatRelativeDate(date: Date | string): string {
  const now = new Date();
  const then = typeof date === 'string' ? new Date(date) : date;
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return then.toLocaleDateString();
}

/**
 * Truncate text to a maximum length with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Generate a color from a string (for consistent path colors)
 */
export function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 65%, 50%)`;
}

/**
 * Get initials from a name (for avatars)
 */
export function getInitials(name: string): string {
  const words = name.split(/\s+/);
  if (words.length === 1) {
    return name.slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/**
 * Check if a path is a child of another path
 */
export function isChildPath(
  paths: { id: string; parentPathId: string | null }[],
  childId: string,
  parentId: string
): boolean {
  const child = paths.find(p => p.id === childId);
  if (!child) return false;
  if (child.parentPathId === parentId) return true;
  if (child.parentPathId === null) return false;
  return isChildPath(paths, child.parentPathId, parentId);
}

/**
 * Build a tree structure from flat paths
 */
export interface PathTreeNode {
  path: { id: string; parentPathId: string | null; name: string | null };
  children: PathTreeNode[];
  depth: number;
}

export function buildPathTree<T extends { id: string; parentPathId: string | null; name: string | null }>(
  paths: T[]
): PathTreeNode[] {
  const nodeMap = new Map<string, PathTreeNode>();
  const roots: PathTreeNode[] = [];

  // Create nodes
  for (const path of paths) {
    nodeMap.set(path.id, { path, children: [], depth: 0 });
  }

  // Build tree
  for (const path of paths) {
    const node = nodeMap.get(path.id)!;
    if (path.parentPathId && nodeMap.has(path.parentPathId)) {
      const parent = nodeMap.get(path.parentPathId)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children by name
  const sortChildren = (nodes: PathTreeNode[]) => {
    nodes.sort((a, b) => {
      const aName = a.path.name ?? '';
      const bName = b.path.name ?? '';
      return aName.localeCompare(bName);
    });
    nodes.forEach(n => sortChildren(n.children));
  };

  sortChildren(roots);
  return roots;
}

/**
 * Flatten a path tree for rendering
 */
export function flattenPathTree(nodes: PathTreeNode[]): PathTreeNode[] {
  const result: PathTreeNode[] = [];

  const traverse = (node: PathTreeNode) => {
    result.push(node);
    node.children.forEach(traverse);
  };

  nodes.forEach(traverse);
  return result;
}
