import type { ReactNode, RefObject } from 'react';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { AppEmptyState, VirtualListSurface } from '../../shared/ui';

const FOLDER_LIST_ROW_ESTIMATE_PX = 188;

export function FolderListBody({
  filteredNodes,
  emptyState,
  onRenderItem,
  scrollElementRef
}: {
  emptyState?: {
    description: string;
    title: string;
  } | undefined;
  filteredNodes: Node[];
  onRenderItem: (node: Node) => ReactNode;
  scrollElementRef: RefObject<HTMLDivElement | null>;
}) {
  if (filteredNodes.length === 0) {
    if (emptyState) {
      return (
        <div className="flex min-h-[240px] flex-1 items-center justify-center">
          <AppEmptyState description={emptyState.description} title={emptyState.title} />
        </div>
      );
    }
    return <div aria-hidden="true" className="min-h-[240px] flex-1" />;
  }

  if (filteredNodes.length < 100) {
    return (
      <ul aria-label="Folder contents" className="flex flex-col">
        {filteredNodes.map((node) => onRenderItem(node))}
      </ul>
    );
  }

  return (
    <div aria-label="Folder contents" role="list">
      <VirtualListSurface
        estimateSize={() => FOLDER_LIST_ROW_ESTIMATE_PX}
        getItemKey={(node) => node.id}
        items={filteredNodes}
        renderItem={(node) => onRenderItem(node)}
        scrollElementRef={scrollElementRef}
        threshold={100}
      />
    </div>
  );
}
