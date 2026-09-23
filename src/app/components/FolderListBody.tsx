import type { ReactNode, RefObject } from 'react';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppEmptyState, VirtualListSurface } from '../../shared/ui';

import { FOLDER_LIST_ROW_HEIGHT_PX } from './FolderListItemRow';
import { useFolderListPosition } from './FolderListPosition';

const getItemKey = (node: Node) => node.id;
const estimateSize = () => FOLDER_LIST_ROW_HEIGHT_PX;

export function FolderListBody({
  filteredNodes,
  emptyState,
  onRenderItem,
  searchQuery = '',
  scrollElementRef
}: {
  emptyState?: {
    description: string;
    title: string;
  } | undefined;
  filteredNodes: Node[];
  onRenderItem: (node: Node) => ReactNode;
  searchQuery?: string;
  scrollElementRef: RefObject<HTMLDivElement | null>;
}) {
  const t = useTranslation();
  const position = useFolderListPosition(searchQuery);
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

  if (filteredNodes.length < 100 && !position) {
    return (
      <ul aria-label={t('desktop.workspace.folderContents')} className="flex flex-col">
        {filteredNodes.map((node) => onRenderItem(node))}
      </ul>
    );
  }

  return (
    <div aria-label={t('desktop.workspace.folderContents')} role="list">
      <VirtualListSurface
        accountForOffset
        estimateSize={estimateSize}
        getItemKey={getItemKey}
        items={filteredNodes}
        {...(position ? { position } : {})}
        renderItem={(node) => onRenderItem(node)}
        scrollElementRef={scrollElementRef}
        threshold={100}
      />
    </div>
  );
}
