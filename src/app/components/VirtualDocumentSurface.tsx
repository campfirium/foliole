import type { JSX } from 'react';
import { useMemo, useState } from 'react';

import { collectRemovedTopicIds, collectShelvedTopicIds } from '../../features/nodes/model/builtinVirtualTopicIds';
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
import { useLocalization, useTranslation } from '../../shared/localization/LocalizationProvider';
import { resolveSystemEntryDisplayName } from '../../shared/localization/systemEntryNames';
import { AppButton } from '../../shared/ui';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { FolderListView } from './FolderListView';

interface VirtualDocumentSurfaceProps {
  activeNode: Node;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
  onSelectNodePath: (nodeId: string) => void;
  pdfCache: JSX.Element;
  trashedNodeIds: string[];
}

const NO_RESULT_NODES: Node[] = [];

function filterVisibleVirtualResults(nodes: Node[], trashedNodeIds: string[]) {
  return nodes.filter((node) => !trashedNodeIds.includes(node.id));
}

function VirtualRootDocumentSurface(props: Pick<VirtualDocumentSurfaceProps, 'nodeOrder' | 'nodesById' | 'onSelectNode' | 'onSelectNodePath' | 'trashedNodeIds'>) {
  const { locale, t } = useLocalization();
  const [query, setQuery] = useState('');
  const createVirtualNode = useWorkspaceStore((state) => state.createVirtualNode);
  const updateNodeTitle = useWorkspaceStore((state) => state.updateNodeTitle);
  const updateVirtualNodeFilter = useWorkspaceStore((state) => state.updateVirtualNodeFilter);
  const trimmedQuery = query.trim();
  // Virtual results filter the whole library; FolderListView re-sorts on every new array.
  const resultNodes = useMemo(
    () =>
      trimmedQuery
        ? filterVisibleVirtualResults(
            getOrderedVirtualNodeResultNodes(
              VIRTUAL_ROOT_NODE_ID,
              props.nodeOrder,
              props.nodesById,
              createVirtualNodeFilterFromKeyword(trimmedQuery)
            ),
            props.trashedNodeIds
          )
        : NO_RESULT_NODES,
    [props.nodeOrder, props.nodesById, props.trashedNodeIds, trimmedQuery]
  );
  const resultNodeIds = useMemo(() => resultNodes.map((node) => node.id), [resultNodes]);

  return (
    <FolderListView
      emptyState={trimmedQuery ? { description: t('desktop.virtualSearch.empty.description'), title: t('desktop.virtualSearch.empty.title') } : undefined}
      filterSearchResults={false}
      folderTitle={resolveSystemEntryDisplayName(locale, 'virtual-root')}
      nodeOrder={resultNodeIds}
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
          variant="default"
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
  const resultNodes = useMemo(
    () =>
      filterVisibleVirtualResults(
        getOrderedVirtualNodeResultNodes(
          props.activeNode.id,
          props.nodeOrder,
          props.nodesById,
          props.activeNode.virtualFilter
        ),
        props.trashedNodeIds
      ),
    [props.activeNode.id, props.activeNode.virtualFilter, props.nodeOrder, props.nodesById, props.trashedNodeIds]
  );
  const resultNodeIds = useMemo(() => resultNodes.map((node) => node.id), [resultNodes]);

  return (
    <FolderListView
      emptyState={{ description: t('desktop.virtualSearch.saved.empty.description'), title: t('desktop.virtualSearch.empty.title') }}
      filterSearchResults={false}
      folderNodeId={props.activeNode.id}
      folderTitle={props.activeNode.title || t('desktop.virtualSearch.title')}
      nodeOrder={resultNodeIds}
      nodes={resultNodes}
      nodesById={props.nodesById}
      onSelectNode={props.onSelectNode}
      onSelectNodePath={props.onSelectNodePath}
      regionLabel={t('desktop.virtualSearch.region')}
      searchAriaLabel={t('desktop.virtualSearch.placeholder')}
      searchPlaceholder={t('desktop.virtualSearch.placeholder')}
      searchReadOnly
      searchQuery={query}
      sortMemoryId={props.activeNode.id}
    />
  );
}


export function VirtualBuiltInDocumentSurface(props: Pick<VirtualDocumentSurfaceProps, 'nodeOrder' | 'nodesById' | 'onSelectNode' | 'onSelectNodePath' | 'trashedNodeIds'> & {
  activeVirtualNodeId: string;
}) {
  const { locale, t } = useLocalization();
  const isShelved = props.activeVirtualNodeId === VIRTUAL_SHELVED_NODE_ID;
  const { nodeOrder, nodesById, trashedNodeIds } = props;
  const nodes = useMemo(() => {
    const snapshot = { nodeOrder, nodesById, trashedNodeIds };
    const nodeIds = isShelved ? collectShelvedTopicIds(snapshot) : collectRemovedTopicIds(snapshot);
    return nodeIds.map((nodeId) => nodesById[nodeId]).filter((node): node is Node => Boolean(node));
  }, [isShelved, nodeOrder, nodesById, trashedNodeIds]);

  return (
    <FolderListView
      emptyState={{
        description: isShelved ? t('desktop.virtualSearch.shelved.empty.description') : t('desktop.virtualSearch.removed.empty.description'),
        title: isShelved ? t('desktop.virtualSearch.shelved.empty.title') : t('desktop.virtualSearch.removed.empty.title')
      }}
      filterSearchResults={false}
      folderTitle={resolveSystemEntryDisplayName(locale, isShelved ? 'shelved' : 'removed')}
      nodes={nodes}
      nodesById={props.nodesById}
      onSelectNode={props.onSelectNode}
      onSelectNodePath={props.onSelectNodePath}
      regionLabel={isShelved ? t('desktop.virtualSearch.shelved.region') : t('desktop.virtualSearch.removed.region')}
      searchDescription={isShelved ? t('desktop.virtualSearch.shelved.description') : t('desktop.virtualSearch.removed.description')}
      sortMemoryId={props.activeVirtualNodeId}
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
