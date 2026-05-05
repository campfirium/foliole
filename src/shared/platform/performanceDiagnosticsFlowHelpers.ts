import type { NodeSelectionFlow } from './performanceDiagnosticsTypes';

export function resolveContentLength(detail?: string) {
  if (!detail) {
    return null;
  }
  const match = /^content:(\d+)/.exec(detail);
  if (!match) {
    return null;
  }
  const length = Number.parseInt(match[1] ?? '', 10);
  return Number.isFinite(length) ? length : null;
}

export function resolveEmptyContentReady(flow: NodeSelectionFlow) {
  if ((flow.lastContentSyncLength ?? -1) !== 0 || flow.lastContentSyncCompletedAt === null) {
    return;
  }
  if (flow.documentLoadResolvedAt !== null) {
    flow.resolvedContentReadyAt = flow.resolvedContentReadyAt ?? flow.documentLoadResolvedAt;
    return;
  }
  if (flow.documentLoadStartedAt === null) {
    flow.resolvedContentReadyAt = flow.resolvedContentReadyAt ?? flow.lastContentSyncCompletedAt;
  }
}

export function resolveReady(flow: NodeSelectionFlow) {
  if (flow.bodyReadyAt === null || flow.resolvedContentReadyAt === null) {
    return;
  }
  flow.resolvedReadyAt = Math.max(flow.bodyReadyAt, flow.resolvedContentReadyAt);
}
