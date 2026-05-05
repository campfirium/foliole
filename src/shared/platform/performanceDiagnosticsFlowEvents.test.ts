import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';

import {
  beginNodeSelectionFlow,
  markDocumentPanelBound,
  markEditorContentSyncCompleted,
  markNodeBodyReady,
  markNodeDocumentMerged,
  markNodeDocumentLoadResolved,
  markNodeDocumentLoadStarted,
  markNodeSelectionApplied,
  markNodeSelectionRequested,
  readPerformanceDiagnosticsProbe,
  resetPerformanceDiagnosticsProbe
} from './performanceDiagnosticsProbe';

function createNode(partial: Partial<Node> = {}): Node {
  return {
    id: partial.id ?? 'node-1',
    parentNodeId: partial.parentNodeId ?? null,
    kind: partial.kind ?? 'topic',
    title: partial.title ?? 'Node 1',
    hasContent: partial.hasContent ?? true,
    hasReveal: partial.hasReveal ?? false,
    content: partial.content ?? '',
    reveal: partial.reveal ?? null,
    review: partial.review ?? null,
    createdAt: partial.createdAt ?? '2026-04-09T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-04-09T00:00:00.000Z'
  };
}

function advance(ms: number) {
  vi.advanceTimersByTime(ms);
}

function startMissedFlow(nodesById: Record<string, Node>) {
  markNodeSelectionRequested('node-1', nodesById);
  advance(30);
  markNodeSelectionApplied('node-1', nodesById);
  advance(10);
  markDocumentPanelBound('node-1', 'content:0');
  markEditorContentSyncCompleted('node-1', 'content:0');
  advance(5);
  beginNodeSelectionFlow('node-1', nodesById);
  advance(5);
  markNodeDocumentLoadStarted('node-1');
  advance(20);
  markNodeBodyReady('node-1');
}

describe('performanceDiagnosticsFlowEvents', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-09T00:00:00.000Z'));
    resetPerformanceDiagnosticsProbe();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetPerformanceDiagnosticsProbe();
  });

  it('does not treat the empty shell as real readiness before delayed content arrives', () => {
    const nodesById = { 'node-1': createNode() };
    startMissedFlow(nodesById);

    expect(readPerformanceDiagnosticsProbe().flow.realContentReadyDurationMs).toBeNull();
    expect(readPerformanceDiagnosticsProbe().flow.realReadyDurationMs).toBeNull();

    advance(80);
    markNodeDocumentLoadResolved('node-1');
    advance(20);
    markEditorContentSyncCompleted('node-1', 'content:42');

    expect(readPerformanceDiagnosticsProbe().flow.requestToApplyDurationMs).toBe(30);
    expect(readPerformanceDiagnosticsProbe().flow.panelBoundDurationMs).toBe(40);
    expect(readPerformanceDiagnosticsProbe().flow.bodyReadyDurationMs).toBe(70);
    expect(readPerformanceDiagnosticsProbe().flow.realContentReadyDurationMs).toBe(170);
    expect(readPerformanceDiagnosticsProbe().flow.realReadyDurationMs).toBe(170);
    expect(readPerformanceDiagnosticsProbe().flow.overallReadyDurationMs).toBe(170);
  });

  it('waits for document resolution before counting a truly empty node as ready', () => {
    const nodesById = { 'node-1': createNode() };
    startMissedFlow(nodesById);

    expect(readPerformanceDiagnosticsProbe().flow.realContentReadyDurationMs).toBeNull();

    advance(80);
    markNodeDocumentLoadResolved('node-1');
    markNodeDocumentMerged('node-1', 'content:0');

    expect(readPerformanceDiagnosticsProbe().flow.bodyReadyDurationMs).toBe(70);
    expect(readPerformanceDiagnosticsProbe().flow.realContentReadyDurationMs).toBe(150);
    expect(readPerformanceDiagnosticsProbe().flow.realReadyDurationMs).toBe(150);
    expect(readPerformanceDiagnosticsProbe().flow.overallReadyDurationMs).toBe(150);
  });
});
