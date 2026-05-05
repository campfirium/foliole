import { useEffect, useState } from 'react';

import { resolveInternalLinkTargetId } from '../../features/nodes/model/internalLinks';
import type { Node } from '../../features/nodes/model/nodeTypes';
import type { EditorNodeLinkPreviewRequest } from '../../features/editor/model/nodeLinkPreview';
import { ensureWorkspaceNodeDocumentReady } from '../../store/workspaceNodePreparation';
import { isNodeDocumentLoaded } from '../../store/workspaceRendererBoundary';

export interface ResolvedNodeLinkPreview {
  content: string;
  request: EditorNodeLinkPreviewRequest;
  status: 'loading' | 'missing' | 'ready';
  targetNodeId: string | null;
  title: string;
}

function buildLoadedPreview(
  request: EditorNodeLinkPreviewRequest,
  targetNodeId: string,
  node: Node | undefined
): ResolvedNodeLinkPreview {
  return {
    content: node?.content ?? '',
    request,
    status: 'ready',
    targetNodeId,
    title: node?.title?.trim() || request.title
  };
}

export function useNodeLinkHoverPreview(args: {
  activeNodeId: string | null;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  trashedNodeIds: string[];
}) {
  const [request, setRequest] = useState<EditorNodeLinkPreviewRequest | null>(null);
  const [preview, setPreview] = useState<ResolvedNodeLinkPreview | null>(null);

  useEffect(() => {
    setRequest(null);
    setPreview(null);
  }, [args.activeNodeId]);

  useEffect(() => {
    if (!request) {
      setPreview(null);
      return;
    }

    const targetNodeId = resolveInternalLinkTargetId({
      title: request.title,
      nodeOrder: args.nodeOrder,
      nodesById: args.nodesById,
      trashedNodeIds: args.trashedNodeIds
    });
    if (!targetNodeId) {
      setPreview({
        content: '',
        request,
        status: 'missing',
        targetNodeId: null,
        title: request.title
      });
      return;
    }

    const targetNode = args.nodesById[targetNodeId];
    if (isNodeDocumentLoaded(targetNode)) {
      setPreview(buildLoadedPreview(request, targetNodeId, targetNode));
      return;
    }

    let alive = true;
    setPreview({
      content: '',
      request,
      status: 'loading',
      targetNodeId,
      title: targetNode?.title?.trim() || request.title
    });
    void ensureWorkspaceNodeDocumentReady(targetNodeId, { keepWarm: true }).then((document) => {
      if (!alive) {
        return;
      }
      setPreview({
        content: document?.content ?? '',
        request,
        status: 'ready',
        targetNodeId,
        title: targetNode?.title?.trim() || request.title
      });
    });

    return () => {
      alive = false;
    };
  }, [args.nodeOrder, args.nodesById, args.trashedNodeIds, request]);

  return {
    handlePreviewNodeLink: setRequest,
    preview
  };
}
