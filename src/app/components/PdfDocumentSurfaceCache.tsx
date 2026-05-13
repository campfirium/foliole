import { useEffect, useLayoutEffect, useState } from 'react';

import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { definedProps } from '../../shared/lib/definedProps';
import { updatePdfSurfaceCacheStats } from '../../shared/platform/performanceDiagnosticsProbe';
import type { NodeViewState } from '../../store/workspaceStore';

import { PdfDocumentSurface } from './PdfDocumentSurface';
import type { PdfPageDimensions } from './pdfPageDimensions';

type PdfDocumentSurfaceState = 'empty' | 'failed' | 'loading' | 'ready';

const MAX_CACHED_SURFACES = 3;

interface CachedPdfSurface {
  nodeId: string;
  persistedPageCount: number | null;
  persistedPageDimensions: Record<number, PdfPageDimensions>;
  sourceHint: string;
}

function upsertCachedSurface(current: CachedPdfSurface[], nextSurface: CachedPdfSurface) {
  const withoutCurrent = current.filter((entry) => entry.nodeId !== nextSurface.nodeId);
  const withNewestFirst = [nextSurface, ...withoutCurrent];
  return withNewestFirst.slice(0, MAX_CACHED_SURFACES);
}

function shouldDisplayCachedSurface(activeNodeId: string | null, nodeId: string, activePdfState: PdfDocumentSurfaceState | null) {
  if (activeNodeId !== nodeId) {
    return false;
  }
  return activePdfState !== 'failed' && activePdfState !== 'empty';
}

function resolveRenderEntries(
  cachedSurfaces: CachedPdfSurface[],
  activePdfState: PdfDocumentSurfaceState | null,
  activePersistedPageCount: number | null,
  activePersistedPageDimensions: Record<number, PdfPageDimensions>,
  activeSourceHint: string | null,
  editorNodeId: string | null
) {
  if (activePdfState !== 'ready' || !activeSourceHint || !editorNodeId) {
    return cachedSurfaces;
  }
  return upsertCachedSurface(cachedSurfaces, {
    nodeId: editorNodeId,
    persistedPageCount: activePersistedPageCount,
    persistedPageDimensions: activePersistedPageDimensions,
    sourceHint: activeSourceHint
  });
}

export function PdfDocumentSurfaceCache(props: {
  activeNodeId: string | null;
  activePersistedPageCount: number | null;
  activePersistedPageDimensions: Record<number, PdfPageDimensions>;
  activePdfState: PdfDocumentSurfaceState | null;
  activeSourceHint: string | null;
  editorNodeId: string | null;
  editorNodeViewState: NodeViewState | undefined;
  highlightLocators: Array<{ id: string; page: number; x: number | null; y: number | null }>;
  onCreatePdfHighlight: (selectionText: string, locator: NodeAnchorLink['locator']) => boolean;
  onActiveCacheVisibilityChange: (visible: boolean) => void;
  onPersistPdfViewState: (nodeId: string, viewState: NodeViewState) => void;
}) {
  const [cachedSurfaces, setCachedSurfaces] = useState<CachedPdfSurface[]>([]);

  useEffect(() => {
    if (props.activePdfState !== 'ready' || !props.editorNodeId || !props.activeSourceHint) {
      return;
    }
    const editorNodeId = props.editorNodeId;
    const activeSourceHint = props.activeSourceHint;
    setCachedSurfaces((current) =>
      upsertCachedSurface(current, {
        nodeId: editorNodeId,
        persistedPageCount: props.activePersistedPageCount,
        persistedPageDimensions: props.activePersistedPageDimensions,
        sourceHint: activeSourceHint
      })
    );
  }, [props.activePdfState, props.activePersistedPageCount, props.activePersistedPageDimensions, props.activeSourceHint, props.editorNodeId]);

  const renderEntries = resolveRenderEntries(
    cachedSurfaces,
    props.activePdfState,
    props.activePersistedPageCount,
    props.activePersistedPageDimensions,
    props.activeSourceHint,
    props.editorNodeId
  );

  useEffect(() => {
    updatePdfSurfaceCacheStats({ entries: renderEntries.length });
  }, [renderEntries.length]);

  useLayoutEffect(() => {
    const visible = renderEntries.some((entry) =>
      shouldDisplayCachedSurface(props.activeNodeId, entry.nodeId, props.activePdfState)
    );
    props.onActiveCacheVisibilityChange(visible);
  }, [props.activeNodeId, props.activePdfState, props.onActiveCacheVisibilityChange, renderEntries]);

  if (renderEntries.length === 0) {
    return null;
  }

  return (
    <>
      {renderEntries.map((entry) => renderCachedSurfaceEntry(entry, props))}
    </>
  );
}

function renderCachedSurfaceEntry(
  entry: CachedPdfSurface,
  props: Parameters<typeof PdfDocumentSurfaceCache>[0]
) {
  const isActiveNode = props.activeNodeId === entry.nodeId;
  const isVisible = shouldDisplayCachedSurface(props.activeNodeId, entry.nodeId, props.activePdfState);
  return (
    <div className={isVisible ? 'flex min-h-0 flex-1 flex-col' : 'hidden'} key={entry.nodeId}>
      <PdfDocumentSurface
        highlightLocators={isActiveNode ? props.highlightLocators : []}
        isVisible={isVisible}
        nodeId={entry.nodeId}
        {...definedProps({ nodeViewState: isActiveNode ? props.editorNodeViewState : undefined })}
        onCreateHighlightFromSelection={props.onCreatePdfHighlight}
        onPersistViewState={(viewState) => {
          if (isActiveNode) {
            props.onPersistPdfViewState(entry.nodeId, viewState);
          }
        }}
        persistedPageCount={entry.persistedPageCount}
        persistedPageDimensions={entry.persistedPageDimensions}
        pdfIndexStatus={null}
        sourceHint={entry.sourceHint}
      />
    </div>
  );
}
