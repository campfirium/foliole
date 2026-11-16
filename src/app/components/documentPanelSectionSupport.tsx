import { useRef, useState } from 'react';

import { isNodeTitleTruncated } from '../../../lib/core/nodes/nodeTitleBudget';
import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { EditorSearchDecorations, EditorSelection, EditorViewportMode } from '../../features/editor/adapters/EditorAdapter';
import type { BacklinkItem } from '../../features/nodes/model/internalLinks';
import { readInternalLinkNodeId, resolveInternalLinkTargetId } from '../../features/nodes/model/internalLinks';
import type { Node } from '../../features/nodes/model/nodeTypes';
import type { Translate } from '../../shared/localization/LocalizationProvider';
import type { ExternalLinkOpenRequest } from '../../shared/platform/externalLinkOpenRequest';
import { showNodeTextLimitNotice } from '../../shared/ui/nodeTextSaveBudget';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { DocumentPanelDocumentStatusContent } from './DocumentPanelDocumentStatusContent';
import { DocumentPanelLoadingContent } from './DocumentPanelLoadingContent';
import type { DocumentPanelSectionProps } from './DocumentPanelSection';

export function buildResolvedDocumentPanelProps(props: DocumentPanelSectionProps) {
  return {
    ...props,
    isPriorityQuickSetActive: props.isPriorityQuickSetActive ?? false,
    onNodePriorityChange: props.onNodePriorityChange ?? (() => undefined),
    onNodeShortTermChange: props.onNodeShortTermChange ?? (() => undefined),
    priorityQuickSetShortcutLabel: props.priorityQuickSetShortcutLabel ?? ''
  };
}

function useOpenNodeLink(onSelectNode: DocumentPanelSectionProps['onSelectNode']) {
  const pendingTitle = useRef<string | null>(null);

  return async (rawTitle: string) => {
    const title = rawTitle.trim();
    const titleKey = title.toLocaleLowerCase();
    if (!title || pendingTitle.current === titleKey) return;
    const state = useWorkspaceStore.getState();
    const targetNodeId = resolveInternalLinkTargetId({ ...state, title });
    if (targetNodeId) {
      onSelectNode(targetNodeId);
      return;
    }
    if (readInternalLinkNodeId(title) || pendingTitle.current) return;
    if (isNodeTitleTruncated(title)) {
      showNodeTextLimitNotice();
      return;
    }

    pendingTitle.current = titleKey;
    try {
      const createdNodeId = await state.createRootNode('', 'topic', { activate: false, title });
      if (createdNodeId && useWorkspaceStore.getState().activeNodeId === state.activeNodeId) {
        onSelectNode(createdNodeId);
      }
    } finally {
      pendingTitle.current = null;
    }
  };
}

export function useDocumentPanelInteractions(props: DocumentPanelSectionProps) {
  const editorAdapterRef = useRef<EditorAdapter | null>(null);
  const [editorAdapter, setEditorAdapter] = useState<EditorAdapter | null>(null);
  const handleOpenNodeLink = useOpenNodeLink(props.onSelectNode);

  const handleEditorReady = (adapter: EditorAdapter | null) => {
    editorAdapterRef.current = adapter;
    setEditorAdapter(adapter);
    props.onEditorReady(adapter);
  };

  return {
    editorAdapter,
    handleEditorReady,
    handleOpenExternalLink: (request: ExternalLinkOpenRequest) => {
      props.onOpenExternalLink?.(request);
    },
    handleOpenNodeLink,
    handlePreviewDocumentSelection: (selection: EditorSelection, targetViewportMode?: EditorViewportMode) => {
      if (targetViewportMode === 'center' && editorAdapterRef.current?.revealSelectionCentered) {
        editorAdapterRef.current.revealSelectionCentered(selection, { preserveFocus: true });
        return;
      }
      editorAdapterRef.current?.restoreSelection(selection);
    },
    handlePreviewTopicSearchDecorations: (searchDecorations: EditorSearchDecorations | null) => {
      editorAdapterRef.current?.setSearchDecorations(searchDecorations);
    }
  };
}

function stripTargetTitleFromContext(context: string, targetTitle: string) {
  const escapedTitle = targetTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').trim();
  if (!escapedTitle) {
    return context;
  }
  return context.replace(new RegExp(`\\[\\[\\s*${escapedTitle}\\s*\\]\\]`, 'gi'), '').replace(/\s+/g, ' ').trim();
}

export function buildTopicBacklinks(args: {
  activeNodeId: string | null;
  backlinks: BacklinkItem[];
  nodesById: Record<string, Node>;
}) {
  const activeNode = args.activeNodeId ? args.nodesById[args.activeNodeId] : null;
  if (activeNode?.kind !== 'topic' || args.backlinks.length === 0) {
    return [];
  }

  return args.backlinks.map((backlink) => ({
    ...backlink,
    context: stripTargetTitleFromContext(backlink.context, activeNode.title)
  }));
}

export function renderDocumentPanelEmptyContent(args: {
  documentStatus: string | undefined;
  isRetryingDocument: boolean;
  loadingLabel: string | undefined;
  retryDocumentLoad: () => void;
  t: Translate;
}) {
  if (args.documentStatus === 'failed' || args.documentStatus === 'missing') {
    return (
      <DocumentPanelDocumentStatusContent
        loadingLabel={args.t('desktop.document.progress')}
        onRetry={args.retryDocumentLoad}
        retrying={args.isRetryingDocument}
        status={args.documentStatus}
        t={args.t}
      />
    );
  }
  return args.loadingLabel ? <DocumentPanelLoadingContent loadingLabel={args.loadingLabel} /> : undefined;
}
