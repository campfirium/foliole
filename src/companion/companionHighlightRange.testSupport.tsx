import { useMemo, useRef, useState } from 'react';
import { vi } from 'vitest';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';
import { isTextAnchorLocator } from '../features/nodes/model/nodeTypes';

import { CompanionDraftProvider } from './CompanionDraftProvider';
import { SelectionAnnotationToolbarLayer } from './CompanionReadableArticleSelectionToolbarLayer';
import * as controllers from './companionSelectionAnnotationController';
import { createWorkspaceSnapshotActions } from './companionWorkspaceSyncActions';
import { createPendingAnnotationActions, useCompanionPendingReadableArticle } from './useCompanionPendingReadableArticle';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

const body = 'Alpha Beta Gamma';

// Geometry is supplied by the native editor; selection, mutation, refresh and SQLite remain real.
function editor(): EditorAdapter {
  return { getContent: () => body, onScroll: () => () => {},
    getPositionClientRect: (position: number) => new DOMRect(position * 8, 80, 8, 20),
    getDocumentPositionAtClientPoint: (x: number) => Math.round(x / 8),
    setHighlightRangePreview: vi.fn()
  } as unknown as EditorAdapter;
}

export function HighlightRangeSurface({ initial, nodeId, cloze = false, refreshFailures = 0, holdRefresh }: {
  initial: NativeCompanionWorkspaceSyncState; nodeId: string; cloze?: boolean; refreshFailures?: number; holdRefresh?: Promise<void>;
}) {
  const [state, setState] = useState(initial);
  const [open, setOpen] = useState(true);
  const [adapter] = useState(editor);
  const remainingFailures = useRef(refreshFailures);
  const actions = createWorkspaceSnapshotActions({ state, setState, setError: () => {}, setStatus: () => {},
    setSyncConflictCount: () => {}, setSyncProgress: () => {} });
  const sync = { ...actions, state, bootstrapState: { device_id: 'range-device' },
    refreshAfterMutation: async (...args: Parameters<typeof actions.refreshAfterMutation>) => {
      if (remainingFailures.current-- > 0) return Promise.reject(new Error('refresh failed'));
      await holdRefresh;
      return actions.refreshAfterMutation(...args);
    }
  } as ReturnType<typeof useCompanionWorkspaceSync>;
  const article = useMemo(() => {
    const node = state.workspace_snapshot?.nodesById[nodeId];
    const locator = node?.deletedAt ? null : node?.anchorLink?.locator;
    return { nodeId: 'source', textAnchorDecorations: isTextAnchorLocator(locator)
      ? [{ ...locator, nodeId, kind: cloze ? 'cloze' as const : 'highlight' as const }] : [] };
  }, [state.workspace_snapshot, nodeId, cloze]);
  const pending = useCompanionPendingReadableArticle(article);
  const mutations = createPendingAnnotationActions({
    onAdjustExistingHighlightRange: controllers.createCompanionExistingHighlightRangeHandler(sync),
    onDeleteExistingHighlight: controllers.createCompanionExistingHighlightDeleteHandler(sync)
  }, pending);
  return <CompanionDraftProvider>
    <output data-testid="displayed-range">{JSON.stringify(pending.readableArticle.textAnchorDecorations)}</output>
    <button onClick={() => setOpen(false)}>Dismiss</button><button onClick={() => setOpen(true)}>Reopen</button>
    <SelectionAnnotationToolbarLayer editor={adapter} parentNodeId="source"
      onAdjustExistingHighlightRange={mutations.adjustExistingHighlightRange}
      onDeleteExistingHighlight={mutations.deleteExistingHighlight}
      onAddExistingHighlightNote={controllers.createCompanionExistingHighlightNoteHandler(sync)}
      onClose={() => setOpen(false)} snapshot={state.workspace_snapshot} resolveSelectionPayload={() => null}
      state={open ? { left: 20, top: 140, noteLeft: 20, noteTop: 190, payload: null,
        existingHighlight: { nodeId, originalText: 'Beta', kind: cloze ? 'cloze' : 'highlight' } } : null} />
  </CompanionDraftProvider>;
}
