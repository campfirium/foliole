import { useRef, useState } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { EditorSearchDecorations, EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import type { BacklinkItem } from '../../features/nodes/model/internalLinks';
import { resolveInternalLinkTargetId } from '../../features/nodes/model/internalLinks';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../features/settings/model/reviewSchedulerSettings';
import type { ExternalLinkOpenRequest } from '../../shared/platform/externalLinkOpenRequest';

import type { DocumentPanelSectionProps } from './DocumentPanelSection';

export function buildResolvedDocumentPanelProps(props: DocumentPanelSectionProps) {
  return {
    ...props,
    isPriorityQuickSetActive: props.isPriorityQuickSetActive ?? false,
    onNodePriorityChange: props.onNodePriorityChange ?? (() => undefined),
    priorityQuickSetShortcutLabel: props.priorityQuickSetShortcutLabel ?? '',
    reviewSchedulerSettings: props.reviewSchedulerSettings ?? DEFAULT_REVIEW_SCHEDULER_SETTINGS
  };
}

export function useDocumentPanelInteractions(props: DocumentPanelSectionProps) {
  const editorAdapterRef = useRef<EditorAdapter | null>(null);
  const [editorAdapter, setEditorAdapter] = useState<EditorAdapter | null>(null);

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
    handleOpenNodeLink: (title: string) => {
      const targetNodeId = resolveInternalLinkTargetId({
        title,
        nodeOrder: props.nodeOrder,
        nodesById: props.nodesById,
        trashedNodeIds: props.trashedNodeIds
      });
      if (targetNodeId) {
        props.onSelectNode(targetNodeId);
      }
    },
    handlePreviewDocumentSelection: (selection: EditorSelection, targetViewportMode?: 'center' | 'nearest') => {
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
