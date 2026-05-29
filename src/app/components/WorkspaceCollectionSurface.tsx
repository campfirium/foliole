import type { CSSProperties, ReactNode } from 'react';

import { DUAL_LIST_WIDTH_DEFAULT, useDualListResizer } from '../hooks/useDualListResizer';

import { WorkspaceDualListSplitter } from './WorkspaceDualListSplitter';
import { useWorkspaceFolderWidthCssVar } from './workspaceFolderWidthCssVar';

export function WorkspaceCollectionSurface({
  contentColumn,
  folderColumn
}: {
  contentColumn: ReactNode;
  folderColumn: ReactNode;
}) {
  const folderListResize = useDualListResizer(DUAL_LIST_WIDTH_DEFAULT);
  useWorkspaceFolderWidthCssVar(folderListResize.width);

  return (
    <div
      className="flex min-h-0 flex-1 overflow-hidden"
      style={{ '--workspace-folder-column-width': `${folderListResize.width}px` } as CSSProperties}
    >
      <div
        className="workspace-region-main-folder flex min-h-0 min-w-0 overflow-hidden"
        style={{ flex: `0 0 ${folderListResize.width}px` }}
      >
        {folderColumn}
      </div>
      <WorkspaceDualListSplitter
        isResizing={folderListResize.isResizing}
        onKeyDown={folderListResize.handleKeyDown}
        onPointerDown={folderListResize.handlePointerDown}
        width={folderListResize.width}
      />
      <div className="workspace-region-main-topic flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {contentColumn}
      </div>
    </div>
  );
}
