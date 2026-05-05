import { Search } from 'lucide-react';

import type { FolderListSortDirection, FolderListSortKey } from '../../features/nodes/model/folderListOrdering';
import { AppInput } from '../../shared/ui';

import { FolderListSortControls } from './FolderListSortControls';

export function FolderListToolbarControls(props: {
  onChangeSearchQuery: (value: string) => void;
  onChangeSortDirection: (sortDirection: FolderListSortDirection) => void;
  onChangeSortKey: (sortKey: FolderListSortKey) => void;
  searchQuery: string;
  sortDirection: FolderListSortDirection;
  sortKey: FolderListSortKey;
}) {
  return (
    <div className="flex min-w-0 items-center justify-end gap-3 max-[900px]:w-full max-[900px]:flex-wrap">
      <div className="min-w-[220px] flex-1 max-w-[32rem] max-[900px]:max-w-none">
        <div className="flex h-9 w-full items-center gap-2 rounded-lg bg-bg-subtle px-3">
          <Search aria-hidden="true" className="shrink-0 text-foreground/38" size={14} strokeWidth={1.8} />
          <AppInput
            aria-label="Search folder contents"
            className="h-8 w-full border-0 bg-transparent px-0 text-sm shadow-none placeholder:text-foreground/38 focus-visible:ring-0"
            onChange={(event) => props.onChangeSearchQuery(event.target.value)}
            placeholder="Search in this folder"
            type="search"
            value={props.searchQuery}
          />
        </div>
      </div>
      <div className="shrink-0">
        <FolderListSortControls
          onChangeSortDirection={props.onChangeSortDirection}
          onChangeSortKey={props.onChangeSortKey}
          sortDirection={props.sortDirection}
          sortKey={props.sortKey}
        />
      </div>
    </div>
  );
}
