/**
 * UI/UX Metrics - Browser-safe metric recording for client components
 *
 * This module contains ONLY the UI/UX metric recording functions and has NO dependencies
 * on server-side modules. It's safe to import in client components.
 *
 * CRITICAL: Do NOT add any imports to this file except @opentelemetry/api
 */

import { metrics, type Attributes, type Counter } from '@opentelemetry/api';

// UI/UX metric instrument instances
let uiBreadcrumbNavigateCounter: Counter | null = null;
let uiBranchCreateCounter: Counter | null = null;
let uiPathSwitchCounter: Counter | null = null;
let uiMergeExecuteCounter: Counter | null = null;
let uiMergePreviewCounter: Counter | null = null;
let uiMessageScrollCounter: Counter | null = null;
let uiMessageEditCounter: Counter | null = null;

/**
 * Initialize UI metrics instruments
 * This will be called automatically when the observability system is initialized
 */
export const initUiMetrics = (): void => {
  const meter = metrics.getMeter('reg-intel-ui-metrics', '1.0.0');

  // UI/UX interaction metrics
  uiBreadcrumbNavigateCounter = meter.createCounter('regintel.ui.breadcrumb.navigate', {
    description: 'Total breadcrumb navigation events',
    unit: '{events}',
  });

  uiBranchCreateCounter = meter.createCounter('regintel.ui.branch.create', {
    description: 'Total branch creation events',
    unit: '{events}',
  });

  uiPathSwitchCounter = meter.createCounter('regintel.ui.path.switch', {
    description: 'Total path switch events',
    unit: '{events}',
  });

  uiMergeExecuteCounter = meter.createCounter('regintel.ui.merge.execute', {
    description: 'Total merge execution events',
    unit: '{events}',
  });

  uiMergePreviewCounter = meter.createCounter('regintel.ui.merge.preview', {
    description: 'Total merge preview events',
    unit: '{events}',
  });

  uiMessageScrollCounter = meter.createCounter('regintel.ui.message.scroll', {
    description: 'Total message scroll events',
    unit: '{events}',
  });

  uiMessageEditCounter = meter.createCounter('regintel.ui.message.edit', {
    description: 'Total message edit events',
    unit: '{events}',
  });
};

/**
 * Record breadcrumb navigation event
 */
export const recordBreadcrumbNavigate = (attributes: {
  fromPathId: string;
  toPathId: string;
  pathDepth: number;
  conversationId?: string;
}): void => {
  uiBreadcrumbNavigateCounter?.add(1, attributes as Attributes);
};

/**
 * Record branch creation event
 */
export const recordBranchCreate = (attributes: {
  method: 'edit' | 'button' | 'api';
  conversationId?: string;
  sourcePathId?: string;
  fromMessageId?: string;
}): void => {
  uiBranchCreateCounter?.add(1, attributes as Attributes);
};

/**
 * Record path switch event
 */
export const recordPathSwitch = (attributes: {
  fromPathId: string;
  toPathId: string;
  switchMethod: 'breadcrumb' | 'selector' | 'url' | 'api';
  conversationId?: string;
}): void => {
  uiPathSwitchCounter?.add(1, attributes as Attributes);
};

/**
 * Record merge execution event
 */
export const recordMergeExecute = (attributes: {
  mergeMode: 'full' | 'summary' | 'selective';
  sourcePathId: string;
  targetPathId: string;
  messageCount?: number;
  conversationId?: string;
}): void => {
  uiMergeExecuteCounter?.add(1, attributes as Attributes);
};

/**
 * Record merge preview event
 */
export const recordMergePreview = (attributes: {
  sourcePathId: string;
  targetPathId: string;
  conversationId?: string;
}): void => {
  uiMergePreviewCounter?.add(1, attributes as Attributes);
};

/**
 * Record message scroll/history navigation event
 */
export const recordMessageScroll = (attributes: {
  scrollDirection: 'up' | 'down';
  messageCount?: number;
  conversationId?: string;
  pathId?: string;
}): void => {
  uiMessageScrollCounter?.add(1, attributes as Attributes);
};

/**
 * Record message edit event
 */
export const recordMessageEdit = (attributes: {
  messageId: string;
  editType: 'content' | 'regenerate';
  createsBranch: boolean;
  conversationId?: string;
  pathId?: string;
}): void => {
  uiMessageEditCounter?.add(1, attributes as Attributes);
};
