import type http from 'node:http';

import type { WorkspaceRefreshScope } from '../../lib/core/database/workspaceSnapshotRefresh.js';
import { isAgentControlWritePath } from '../../scripts/agent-control/foliole-agent-routes.mjs';

export type AgentControlWriteNotifier = (scope: WorkspaceRefreshScope) => void;

/** Keeps the JSON a write route answered with, so the notice can name what it changed. */
export function captureAgentControlResponseJson(response: http.ServerResponse) {
  let body: string | null = null;
  const end = response.end.bind(response) as (...args: unknown[]) => http.ServerResponse;
  response.end = ((...args: unknown[]) => {
    const [chunk] = args;
    if (typeof chunk === 'string') body = chunk;
    else if (Buffer.isBuffer(chunk)) body = chunk.toString('utf8');
    return end(...args);
  }) as typeof response.end;
  return () => {
    if (body === null) return null;
    try { return JSON.parse(body) as unknown; } catch { return null; }
  };
}

export function notifyAfterSuccessfulWrite(response: http.ServerResponse, notify: AgentControlWriteNotifier | undefined,
  pathname: string, payload: unknown) {
  if (response.statusCode >= 200 && response.statusCode < 300) {
    notify?.(agentControlWriteScope(pathname, payload));
  }
}

export function isMaterialWritePath(pathname: string) {
  return isAgentControlWritePath(pathname, 'material');
}

export function isVirtualFolderWritePath(pathname: string) {
  return isAgentControlWritePath(pathname, 'virtual_folder');
}

const FULL: WorkspaceRefreshScope = { kind: 'full' };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function ids(...values: unknown[]) {
  return values.flatMap(value => Array.isArray(value) ? value : [value])
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
}

function structure(nodeIds: string[], extra: Partial<Extract<WorkspaceRefreshScope, { kind: 'nodes' }>> = {}): WorkspaceRefreshScope {
  return nodeIds.length ? { kind: 'nodes', nodeIds: [...new Set(nodeIds)], structure: true, ...extra } : FULL;
}

/**
 * Writes whose answer names every node they touched refresh just those nodes and their lists. A move can shift
 * Sequential Reading among siblings and a reorder rewrites the whole stored order, so those stay full.
 */
export function agentControlWriteScope(pathname: string, payload: unknown): WorkspaceRefreshScope {
  const body = record(payload);
  if (!body) return FULL;
  const material = record(body.material);
  const route = pathname.slice(pathname.lastIndexOf('/v1/') + 4);
  switch (route) {
    case 'materials/create':
    case 'materials/create-text-excerpt': {
      const created = ids(material?.id);
      // A created topic or item may carry imported reading or review schedules.
      return structure(ids(material?.id, material?.parent_id), { readingNodeIds: created, reviewNodeIds: created });
    }
    case 'materials/update':
      return structure(ids(material?.id));
    case 'materials/delete-soft':
      return structure(ids(body.material_id));
    case 'materials/restore':
      return structure(ids(body.restored_ids, material?.id, material?.parent_id));
    case 'virtual-folders/create':
    case 'virtual-folders/update':
    case 'virtual-folders/delete-soft':
    case 'virtual-folders/restore':
    case 'virtual-folders/reorder':
      return structure(ids(body.folder_id));
    case 'virtual-folders/add-items':
    case 'virtual-folders/remove-items':
      return structure(ids(body.folder_id, body.added, body.removed));
    default:
      return FULL;
  }
}
