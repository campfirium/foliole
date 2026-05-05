import { useRef } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { EditorSearchDecorations, EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import { createInlineAnchorKey } from '../../features/editor/adapters/liveMarkdownAnchors';
import { resolveInternalLinkTargetId } from '../../features/nodes/model/internalLinks';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../features/settings/model/reviewSchedulerSettings';

import type { DocumentPanelSectionProps } from './DocumentPanelSection';

export function collectHiddenTextAnchorKeys(args: {
  activeNodeId: string | null;
  nodesById: Record<string, Node>;
  trashedNodeIds: string[];
}) {
  if (!args.activeNodeId) {
    return [];
  }
  const hiddenKeys = new Set<string>();
  for (const trashedNodeId of args.trashedNodeIds) {
    const node = args.nodesById[trashedNodeId];
    if (!node || node.parentNodeId !== args.activeNodeId || !node.anchorLink || node.anchorLink.locator) {
      continue;
    }
    hiddenKeys.add(createInlineAnchorKey(node.anchorLink));
  }
  return [...hiddenKeys];
}

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
