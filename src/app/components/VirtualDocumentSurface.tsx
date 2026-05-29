import { useState } from 'react';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { VIRTUAL_REMOVED_NODE_ID, VIRTUAL_ROOT_NODE_ID, isVirtualNode, isVirtualRootNode } from '../../features/nodes/model/specialNodes';
import {
  createVirtualNodeFilterFromKeyword,
  getOrderedVirtualNodeResultNodes,
  getVirtualNodePrimaryKeyword
} from '../../features/nodes/model/virtualNodeDetail';
import { AppButton } from '../../shared/ui';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { FolderListView } from './FolderListView';
import { RemovedSourcesPanel } from './RemovedSourcesPanel';

interface VirtualDocumentSurfaceProps {
  activeNode: Node;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
  onSelectNodePath: (nodeId: string) => void;
  pdfCache: JSX.Element;
  trashedNodeIds: string[];
}

const VIRTUAL_ROOT_SEARCH_PLACEHOLDER = 'Search topics to save as list';

function filterVisibleVirtualResults(nodes: Node[], trashedNodeIds: string[]) {
  return nodes.filter((node) => !trashedNodeIds.includes(node.id));
}

function VirtualRootDocumentSurface(props: Pick<VirtualDocumentSurfaceProps, 'nodeOrder' | 'nodesById' | 'onSelectNode' | 'onSelectNodePath' | 'trashedNodeIds'>) {
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
      emptyState={trimmedQuery ? { description: 'Try another topic search.', title: 'No matching topics' } : undefined}
      filterSearchResults={false}
      folderTitle="Virtual"
      nodeOrder={resultNodes.map((node) => node.id)}
      nodes={resultNodes}
      nodesById={props.nodesById}
      onChangeSearchQuery={setQuery}
      onSelectNode={props.onSelectNode}
      onSelectNodePath={props.onSelectNodePath}
      regionLabel="Virtual search"
      searchAction={(
        <AppButton
          aria-label="Save search"
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
          Save
        </AppButton>
      )}
      searchAriaLabel="Search topics to save as list"
      searchPlaceholder={VIRTUAL_ROOT_SEARCH_PLACEHOLDER}
      searchQuery={query}
    />
  );
}

function VirtualSavedSearchDocumentSurface(props: Pick<VirtualDocumentSurfaceProps, 'activeNode' | 'nodeOrder' | 'nodesById' | 'onSelectNode' | 'onSelectNodePath' | 'trashedNodeIds'>) {
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
      emptyState={{ description: 'No topics match this saved search yet.', title: 'No matching topics' }}
      filterSearchResults={false}
      folderTitle={props.activeNode.title || 'Virtual'}
      nodeOrder={resultNodes.map((node) => node.id)}
      nodes={resultNodes}
      nodesById={props.nodesById}
      onSelectNode={props.onSelectNode}
      onSelectNodePath={props.onSelectNodePath}
      regionLabel="Virtual search"
      searchAriaLabel="Search topics to save as list"
      searchPlaceholder={VIRTUAL_ROOT_SEARCH_PLACEHOLDER}
      searchReadOnly
      searchQuery={query}
    />
  );
}

export function VirtualDocumentSurface(props: VirtualDocumentSurfaceProps) {
  if (props.activeNode.id === VIRTUAL_REMOVED_NODE_ID) {
    return (
      <>
        {props.pdfCache}
        <RemovedSourcesPanel onSelectNode={props.onSelectNode} />
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
