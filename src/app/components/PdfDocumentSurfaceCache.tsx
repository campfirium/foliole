import { useEffect, useState } from 'react';

import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import type { NodeViewState } from '../../store/workspaceStore';

import { PdfDocumentSurface } from './PdfDocumentSurface';

type PdfDocumentSurfaceState = 'empty' | 'failed' | 'loading' | 'ready';

const MAX_CACHED_SURFACES = 3;

interface CachedPdfSurface {
  nodeId: string;
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
  activeSourceHint: string | null,
  editorNodeId: string | null
) {
  if (activePdfState !== 'ready' || !activeSourceHint || !editorNodeId) {
    return cachedSurfaces;
  }
  return upsertCachedSurface(cachedSurfaces, { nodeId: editorNodeId, sourceHint: activeSourceHint });
}

export function PdfDocumentSurfaceCache(props: {
  activeNodeId: string | null;
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
        sourceHint: activeSourceHint
      })
    );
  }, [props.activePdfState, props.activeSourceHint, props.editorNodeId]);

  const renderEntries = resolveRenderEntries(cachedSurfaces, props.activePdfState, props.activeSourceHint, props.editorNodeId);

  useEffect(() => {
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
        nodeViewState={isActiveNode ? props.editorNodeViewState : undefined}
        onCreateHighlightFromSelection={props.onCreatePdfHighlight}
        onPersistViewState={(viewState) => {
          if (isActiveNode) {
            props.onPersistPdfViewState(entry.nodeId, viewState);
          }
        }}
        pdfIndexStatus={null}
        sourceHint={entry.sourceHint}
      />
    </div>
  );
}
