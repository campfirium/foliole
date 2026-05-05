import { useRef } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { EditorSearchDecorations, EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import type { BacklinkItem } from '../../features/nodes/model/internalLinks';
import { resolveInternalLinkTargetId } from '../../features/nodes/model/internalLinks';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../features/settings/model/reviewSchedulerSettings';

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

  const handleEditorReady = (adapter: EditorAdapter | null) => {
    editorAdapterRef.current = adapter;
    props.onEditorReady(adapter);
  };

  return {
    handleEditorReady,
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
    handlePreviewDocumentSelection: (selection: EditorSelection) => {
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
