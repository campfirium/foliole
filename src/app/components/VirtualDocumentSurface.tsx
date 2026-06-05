import { useState } from 'react';

import type { Node } from '../../features/nodes/model/nodeTypes';
import {
  VIRTUAL_REMOVED_NODE_ID,
  VIRTUAL_ROOT_NODE_ID,
  VIRTUAL_SHELVED_NODE_ID,
  isVirtualNode,
  isVirtualRootNode
} from '../../features/nodes/model/specialNodes';
import {
  createVirtualNodeFilterFromKeyword,
  getOrderedVirtualNodeResultNodes,
  getVirtualNodePrimaryKeyword
} from '../../features/nodes/model/virtualNodeDetail';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppButton } from '../../shared/ui';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { FolderListView } from './FolderListView';
import { collectRemovedTopicIds, collectShelvedTopicIds } from './workspaceVirtualContentModel';

interface VirtualDocumentSurfaceProps {
  activeNode: Node;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
  onSelectNodePath: (nodeId: string) => void;
  pdfCache: JSX.Element;
  trashedNodeIds: string[];
}

function filterVisibleVirtualResults(nodes: Node[], trashedNodeIds: string[]) {
  return nodes.filter((node) => !trashedNodeIds.includes(node.id));
}

function VirtualRootDocumentSurface(props: Pick<VirtualDocumentSurfaceProps, 'nodeOrder' | 'nodesById' | 'onSelectNode' | 'onSelectNodePath' | 'trashedNodeIds'>) {
  const t = useTranslation();
  const [query, setQuery] = useState('');
  const createVirtualNode = useWorkspaceStore((state) => state.createVirtualNode);
  const updateNodeTitle = useWorkspaceStore((state) => state.updateNodeTitle);
  const updateVirtualNodeFilter = useWorkspaceStore((state) => state.updateVirtualNodeFilter);
  const trimmedQuery = query.trim();
  const resultNodes = trimmedQuery
    ? filterVisibleVirtualResults(
        getOrderedVirtualNodeResultNodes(
          VIRTUAL_ROOT_NODE_ID,
          props.nodeOrder,
          props.nodesById,
          createVirtualNodeFilterFromKeyword(trimmedQuery)
        ),
        props.trashedNodeIds
      )
    : [];

  return (
    <FolderListView
      emptyState={trimmedQuery ? { description: t('desktop.virtualSearch.empty.description'), title: t('desktop.virtualSearch.empty.title') } : undefined}
      filterSearchResults={false}
      folderTitle={t('desktop.virtualSearch.title')}
      nodeOrder={resultNodes.map((node) => node.id)}
      nodes={resultNodes}
      nodesById={props.nodesById}
      onChangeSearchQuery={setQuery}
      onSelectNode={props.onSelectNode}
      onSelectNodePath={props.onSelectNodePath}
      regionLabel={t('desktop.virtualSearch.region')}
      searchAction={(
        <AppButton
          aria-label={t('desktop.virtualSearch.save.aria')}
          disabled={!trimmedQuery}
          onClick={async () => {
            if (!trimmedQuery) return;
            const nodeId = await createVirtualNode();
            if (!nodeId) return;
            updateVirtualNodeFilter(nodeId, trimmedQuery);
            await updateNodeTitle(nodeId, trimmedQuery);
            setQuery('');
          }}
          size="sm"
          variant="primary"
        >
          {t('desktop.virtualSearch.save')}
        </AppButton>
      )}
      searchAriaLabel={t('desktop.virtualSearch.placeholder')}
      searchPlaceholder={t('desktop.virtualSearch.placeholder')}
      searchQuery={query}
    />
  );
}

function VirtualSavedSearchDocumentSurface(props: Pick<VirtualDocumentSurfaceProps, 'activeNode' | 'nodeOrder' | 'nodesById' | 'onSelectNode' | 'onSelectNodePath' | 'trashedNodeIds'>) {
  const t = useTranslation();
  const query = getVirtualNodePrimaryKeyword(props.activeNode.virtualFilter);
  const resultNodes = filterVisibleVirtualResults(
    getOrderedVirtualNodeResultNodes(
      props.activeNode.id,
      props.nodeOrder,
      props.nodesById,
      props.activeNode.virtualFilter
    ),
    props.trashedNodeIds
  );

  return (
    <FolderListView
      emptyState={{ description: t('desktop.virtualSearch.saved.empty.description'), title: t('desktop.virtualSearch.empty.title') }}
      filterSearchResults={false}
      folderTitle={props.activeNode.title || t('desktop.virtualSearch.title')}
      nodeOrder={resultNodes.map((node) => node.id)}
      nodes={resultNodes}
      nodesById={props.nodesById}
      onSelectNode={props.onSelectNode}
      onSelectNodePath={props.onSelectNodePath}
      regionLabel={t('desktop.virtualSearch.region')}
      searchAriaLabel={t('desktop.virtualSearch.placeholder')}
      searchPlaceholder={t('desktop.virtualSearch.placeholder')}
      searchReadOnly
      searchQuery={query}
    />
  );
}

export function VirtualBuiltInDocumentSurface(props: Pick<VirtualDocumentSurfaceProps, 'nodeOrder' | 'nodesById' | 'onSelectNode' | 'onSelectNodePath' | 'trashedNodeIds'> & {
  activeVirtualNodeId: string;
}) {
  const t = useTranslation();
  const isShelved = props.activeVirtualNodeId === VIRTUAL_SHELVED_NODE_ID;
  const nodeIds = isShelved ? collectShelvedTopicIds(props) : collectRemovedTopicIds(props);
  const nodes = nodeIds.map((nodeId) => props.nodesById[nodeId]).filter((node): node is Node => Boolean(node));

  return (
    <FolderListView
      emptyState={{
        description: isShelved ? t('desktop.virtualSearch.shelved.empty.description') : t('desktop.virtualSearch.removed.empty.description'),
        title: isShelved ? t('desktop.virtualSearch.shelved.empty.title') : t('desktop.virtualSearch.removed.empty.title')
      }}
      filterSearchResults={false}
      folderTitle={isShelved ? t('desktop.virtualSearch.shelved.title') : t('desktop.virtualSearch.removed.title')}
      nodes={nodes}
      nodesById={props.nodesById}
      onSelectNode={props.onSelectNode}
      onSelectNodePath={props.onSelectNodePath}
      regionLabel={isShelved ? t('desktop.virtualSearch.shelved.region') : t('desktop.virtualSearch.removed.region')}
      searchDescription={isShelved ? t('desktop.virtualSearch.shelved.description') : t('desktop.virtualSearch.removed.description')}
    />
  );
}

export function VirtualDocumentSurface(props: VirtualDocumentSurfaceProps) {
  if (props.activeNode.id === VIRTUAL_SHELVED_NODE_ID || props.activeNode.id === VIRTUAL_REMOVED_NODE_ID) {
    return (
      <>
        {props.pdfCache}
        <VirtualBuiltInDocumentSurface
          activeVirtualNodeId={props.activeNode.id}
          nodeOrder={props.nodeOrder}
          nodesById={props.nodesById}
          onSelectNode={props.onSelectNode}
          onSelectNodePath={props.onSelectNodePath}
          trashedNodeIds={props.trashedNodeIds}
        />
      </>
    );
  }

  if (isVirtualNode(props.activeNode)) {
    return (
      <>
        {props.pdfCache}
        <VirtualSavedSearchDocumentSurface
          activeNode={props.activeNode}
          nodeOrder={props.nodeOrder}
          nodesById={props.nodesById}
          onSelectNode={props.onSelectNode}
          onSelectNodePath={props.onSelectNodePath}
          trashedNodeIds={props.trashedNodeIds}
        />
      </>
    );
  }

  if (isVirtualRootNode(props.activeNode)) {
    return (
      <>
        {props.pdfCache}
        <VirtualRootDocumentSurface
          nodeOrder={props.nodeOrder}
          nodesById={props.nodesById}
          onSelectNode={props.onSelectNode}
          onSelectNodePath={props.onSelectNodePath}
          trashedNodeIds={props.trashedNodeIds}
        />
      </>
    );
  }

  return null;
}
