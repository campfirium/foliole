import type { NodeSelectionFlow } from '../performanceDiagnosticsTypes';
import { logRuntimeEvent } from '../runtimeLogging';

/**
 * Always-on record of a slow note switch, so a user's diagnostic log shows where the time went without any debug flag.
 * Only phase durations in ms and fixed event names are kept: no titles, ids or content.
 */
export const SLOW_NODE_SWITCH_MS = 300;

const reportedStages = new WeakMap<NodeSelectionFlow, Set<string>>();

function since(flow: NodeSelectionFlow, at: number | null) {
  return at === null ? null : Math.max(0, at - flow.requestedAt);
}

export function reportSlowNodeSwitch(flow: NodeSelectionFlow, stage: 'body' | 'position', now = Date.now()) {
  const totalMs = now - flow.requestedAt;
  if (totalMs < SLOW_NODE_SWITCH_MS) return;
  const reported = reportedStages.get(flow) ?? new Set<string>();
  if (reported.has(stage)) return;
  reported.add(stage);
  reportedStages.set(flow, reported);
  logRuntimeEvent({
    event: 'node_switch_slow',
    level: 'info',
    payload: {
      stage,
      totalMs,
      requestToApplyMs: since(flow, flow.appliedAt),
      panelBoundMs: since(flow, flow.panelBoundAt),
      loadStartMs: since(flow, flow.documentLoadStartedAt),
      loadResolvedMs: since(flow, flow.documentLoadResolvedAt),
      bodyReadyMs: since(flow, flow.bodyReadyAt),
      bodyPaintMs: since(flow, flow.bodyPaintAt),
      positionRequestedMs: since(flow, flow.positionRequestedAt),
      positionReadyMs: since(flow, flow.positionReadyAt),
      imagesReadyMs: since(flow, flow.imageState.readyAt),
      cacheHit: flow.timeline.some((event) => event.name === 'node_cache_hit'),
      imageCount: flow.imageState.totalCount,
      timeline: flow.timeline.map((event) => `${event.name}@${Math.round(event.atMs)}`)
    },
    source: 'renderer.navigation'
  });
}
