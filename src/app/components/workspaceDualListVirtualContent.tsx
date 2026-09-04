import { isManualVirtualNodeFilter } from '../../../lib/core/nodes/virtualNodeFilter';
import type { Node } from '../../features/nodes/model/nodeTypes';
import {
  VIRTUAL_REMOVED_NODE_ID,
  VIRTUAL_PUBLISHED_NODE_ID,
  VIRTUAL_ROOT_NODE_ID,
  VIRTUAL_SHELVED_NODE_ID,
  isVirtualNode
} from '../../features/nodes/model/specialNodes';
import { buildVirtualNodeResultIndex, getVirtualNodePrimaryKeyword } from '../../features/nodes/model/virtualNodeDetail';
import type { AppLocale } from '../../shared/localization/appLanguage';
import type { Translate } from '../../shared/localization/LocalizationProvider';
import { resolveSystemEntryDisplayName } from '../../shared/localization/systemEntryNames';

import { PublishedVirtualResultListPanel } from './PublishedVirtualResultListPanel';
import { VirtualResultListPanel } from './VirtualResultListPanel';
import type { WorkspaceDualListContentProps } from './WorkspaceDualListContent';
import { resolveVirtualContentItemIds } from './workspaceVirtualContentModel';

function resolveVirtualHeader(args: {
  activeVirtualNode: Node | undefined;
  activeVirtualNodeId: string;
  isRemovedView: boolean;
  isShelvedView: boolean;
  locale: AppLocale;
  t: Translate;
}) {
  if (args.activeVirtualNodeId === VIRTUAL_ROOT_NODE_ID) {
    return { kind: 'root' as const };
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
      title: resolveSystemEntryDisplayName(args.locale, 'removed')
    };
  }
  return {
    kind: 'description' as const,
    text: args.isShelvedView
      ? args.t('desktop.virtualSearch.shelved.description')
      : '',
    title: resolveSystemEntryDisplayName(args.locale, args.isShelvedView ? 'shelved' : 'virtual-root')
  };
}

function renderPublishedContentColumn(props: WorkspaceDualListContentProps) {
  return (
    <PublishedVirtualResultListPanel
      activeNodeId={props.activeNodeId}
      nodeOrder={props.nodeOrder}
      nodesById={props.nodesById}
      onSelectNode={props.onSelectNodeInVirtualView}
      trashedNodeIds={props.trashedNodeIds}
    />
  );
}

export function renderVirtualContentColumn(
  props: WorkspaceDualListContentProps,
  virtualResultIndex: ReturnType<typeof buildVirtualNodeResultIndex>,
  t: Translate,
  locale: AppLocale
) {
  const activeVirtualNodeId = props.activeVirtualNodeId ?? VIRTUAL_ROOT_NODE_ID;
  if (activeVirtualNodeId === VIRTUAL_ROOT_NODE_ID) {
    return <div aria-label={t('desktop.workspace.currentFolderContents')} className="flex min-h-0 min-w-0 flex-1" />;
  }
  if (activeVirtualNodeId === VIRTUAL_PUBLISHED_NODE_ID) {
    return renderPublishedContentColumn(props);
  }
  const activeVirtualNode = props.nodesById[activeVirtualNodeId];
  const preservesCollectionOrder = Boolean(
    isManualVirtualNodeFilter(activeVirtualNode?.virtualFilter) ||
    activeVirtualNode?.virtualFilter?.conditions.some(
      (condition) => condition.field === 'collection' && condition.operator === 'equals'
    )
  );
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
        activeVirtualNode,
        activeVirtualNodeId,
        isRemovedView,
        isShelvedView,
        locale,
        t
      })}
      nodeOrder={props.nodeOrder}
      nodes={items}
      nodesById={props.nodesById}
      onSelectNode={props.onSelectNodeInVirtualView}
      preserveItemOrder={preservesCollectionOrder}
      topicFocusAvailable={!isShelvedView}
    />
  );
}
