import type { Node } from '../../features/nodes/model/nodeTypes';
import {
  VIRTUAL_REMOVED_NODE_ID,
  VIRTUAL_ROOT_NODE_ID,
  VIRTUAL_SHELVED_NODE_ID,
  isVirtualNode
} from '../../features/nodes/model/specialNodes';
import { buildVirtualNodeResultIndex, getVirtualNodePrimaryKeyword } from '../../features/nodes/model/virtualNodeDetail';
import type { Translate } from '../../shared/localization/LocalizationProvider';

import { findManualVirtualCollection } from './manualVirtualCollectionModel';
import { VirtualResultListPanel } from './VirtualResultListPanel';
import type { WorkspaceDualListContentProps } from './WorkspaceDualListContent';
import { resolveVirtualContentItemIds } from './workspaceVirtualContentModel';

function resolveVirtualHeader(args: {
  activeManualCollection: ReturnType<typeof findManualVirtualCollection>;
  activeVirtualNode: Node | undefined;
  activeVirtualNodeId: string;
  isRemovedView: boolean;
  isShelvedView: boolean;
  t: Translate;
}) {
  if (args.activeVirtualNodeId === VIRTUAL_ROOT_NODE_ID) {
    return { kind: 'root' as const };
  }
  if (args.activeManualCollection) {
    return {
      kind: 'description' as const,
      text: args.activeManualCollection.description,
      title: args.activeManualCollection.title
    };
  }
  if (isVirtualNode(args.activeVirtualNode)) {
    return {
      kind: 'user-search' as const,
      nodeId: args.activeVirtualNode.id,
      query: getVirtualNodePrimaryKeyword(args.activeVirtualNode.virtualFilter),
      title: args.activeVirtualNode.title
    };
  }
  if (args.isRemovedView) {
    return {
      kind: 'description' as const,
      text: args.t('desktop.virtualSearch.removed.description'),
      title: args.t('desktop.virtualSearch.removed.title')
    };
  }
  return {
    kind: 'description' as const,
    text: args.isShelvedView
      ? args.t('desktop.virtualSearch.shelved.description')
      : '',
    title: args.isShelvedView ? args.t('desktop.virtualSearch.shelved.title') : args.t('desktop.virtualSearch.title')
  };
}

export function renderVirtualContentColumn(
  props: WorkspaceDualListContentProps,
  virtualResultIndex: ReturnType<typeof buildVirtualNodeResultIndex>,
  t: Translate
) {
  const activeVirtualNodeId = props.activeVirtualNodeId ?? VIRTUAL_ROOT_NODE_ID;
  if (activeVirtualNodeId === VIRTUAL_ROOT_NODE_ID) {
    return <div aria-label={t('desktop.workspace.currentFolderContents')} className="flex min-h-0 min-w-0 flex-1" />;
  }
  const activeManualCollection = findManualVirtualCollection(props.manualVirtualCollections ?? [], activeVirtualNodeId);
  const isRemovedView = activeVirtualNodeId === VIRTUAL_REMOVED_NODE_ID;
  const isShelvedView = activeVirtualNodeId === VIRTUAL_SHELVED_NODE_ID;
  const itemIds = resolveVirtualContentItemIds(props, virtualResultIndex);
  const items = itemIds.map((nodeId) => props.nodesById[nodeId]).filter((node): node is Node => Boolean(node));

  return (
    <VirtualResultListPanel
      activeNodeId={props.activeNodeId}
      emptyState={{
        description: isRemovedView
          ? t('desktop.virtualSearch.removed.empty.description')
          : isShelvedView
          ? t('desktop.virtualSearch.shelved.empty.description')
          : activeVirtualNodeId === VIRTUAL_ROOT_NODE_ID
            ? t('desktop.virtualSearch.empty.description')
            : t('desktop.virtualSearch.saved.empty.description'),
        title: isRemovedView
          ? t('desktop.virtualSearch.removed.empty.title')
          : isShelvedView
          ? t('desktop.virtualSearch.shelved.empty.title')
          : t('desktop.virtualSearch.empty.title')
      }}
      header={resolveVirtualHeader({
        activeManualCollection,
        activeVirtualNode: props.nodesById[activeVirtualNodeId],
        activeVirtualNodeId,
        isRemovedView,
        isShelvedView,
        t
      })}
      nodeOrder={props.nodeOrder}
      nodes={items}
      nodesById={props.nodesById}
      onSelectNode={props.onSelectNodeInVirtualView}
      preserveItemOrder={Boolean(activeManualCollection)}
    />
  );
}
