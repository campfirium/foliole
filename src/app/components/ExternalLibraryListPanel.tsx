import { useMemo, useState } from 'react';

import { getNodeListRowSpacing } from '../../features/nodes/components/nodeListRowSpacingSettings';
import { NodeListSearchOverlay, renderSearchLauncher } from '../../features/nodes/components/NodeListSearchOverlay';
import { NodeTreeRow } from '../../features/nodes/components/NodeTreeRow';
import type {
  ExternalLibraryBrowseEntry,
  ExternalLibraryFolder
} from '../../shared/platform/externalLibraryBrowseRepository';
import { AppEmptyState, AppToolbar, ToolbarActionGroup } from '../../shared/ui';
import { useWorkspaceContentSort } from '../hooks/useWorkspaceContentSort';

import {
  buildExternalLibraryFolderBrowseState,
  type ExternalLibrarySelection
} from './externalLibraryBrowseModel';
import { normalizeWorkspaceContentSort, sortExternalDocuments } from './workspaceContentSort';
import { WorkspaceContentSortControls } from './WorkspaceContentSortControls';

interface ExternalLibraryListPanelProps {
  entriesByFolderId: Record<string, ExternalLibraryBrowseEntry[] | undefined>;
  folders: ExternalLibraryFolder[];
  onOpenExternalSelection: (selection: ExternalLibrarySelection) => void;
  selection: ExternalLibrarySelection;
}

function containsQuery(value: string, query: string) {
  return value.toLocaleLowerCase().includes(query.toLocaleLowerCase());
}

export function ExternalLibraryListPanel(props: ExternalLibraryListPanelProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const contentSort = useWorkspaceContentSort();
  const normalizedSort = normalizeWorkspaceContentSort(contentSort.sort, ['modifiedAt', 'name']);
  const documents = useExternalDocumentListState(props, searchQuery, normalizedSort);

  return (
    <aside aria-label="Current folder contents" className="workspace-region-main-topic flex min-h-0 min-w-0 flex-1 flex-col text-foreground">
      <AppToolbar
        as="header"
        className="relative min-h-[var(--workspace-top-toolbar-height)] justify-between gap-3 px-4"
      >
        {renderSearchLauncher(() => setIsSearchOpen(true))}
        <ToolbarActionGroup ariaLabel="External folder content actions">
          <WorkspaceContentSortControls
            onChangeSortDirection={contentSort.setSortDirection}
            onChangeSortKey={contentSort.setSortKey}
            options={[
              { key: 'modifiedAt', label: 'Modified time' },
              { key: 'name', label: 'Name' }
            ]}
            sortDirection={normalizedSort.direction}
            sortKey={normalizedSort.key}
          />
        </ToolbarActionGroup>
        {isSearchOpen ? (
          <NodeListSearchOverlay
            onChangeSearchQuery={setSearchQuery}
            onClose={() => {
              setSearchQuery('');
              setIsSearchOpen(false);
            }}
            searchQuery={searchQuery}
          />
        ) : null}
      </AppToolbar>
      <div className="app-scrollbar workspace-region-main-topic min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2 pt-2">
        <ExternalDocumentListBody
          documents={documents.documents}
          isLoading={documents.isLoading}
          onOpenExternalSelection={props.onOpenExternalSelection}
          selection={props.selection}
        />
      </div>
    </aside>
  );
}

function useExternalDocumentListState(
  props: ExternalLibraryListPanelProps,
  searchQuery: string,
  sort: ReturnType<typeof useWorkspaceContentSort>['sort']
) {
  const activeFolderId = props.selection.kind === 'root' ? null : props.selection.folderId;
  const selectedFolder = activeFolderId ? props.folders.find((folder) => folder.id === activeFolderId) ?? null : null;
  const folderEntries = selectedFolder ? props.entriesByFolderId[selectedFolder.id] : [];
  const isLoading = selectedFolder ? folderEntries === undefined : false;
  const browseState = useMemo(
    () => (!selectedFolder || props.selection.kind === 'root' ? null : buildExternalLibraryFolderBrowseState(selectedFolder, folderEntries ?? [], props.selection)),
    [folderEntries, props.selection, selectedFolder]
  );

  const filteredDocuments = (browseState?.documentItems ?? []).filter(
    (document) =>
      !searchQuery.trim() ||
      containsQuery(document.relativePath, searchQuery) ||
      containsQuery(document.fileName, searchQuery) ||
      containsQuery(document.title, searchQuery) ||
      containsQuery(document.openingText ?? '', searchQuery)
  );
  return {
    documents: sortExternalDocuments(filteredDocuments, sort),
    isLoading
  };
}

function ExternalDocumentListBody(props: {
  documents: ReturnType<typeof buildExternalLibraryFolderBrowseState>['documentItems'];
  isLoading: boolean;
  onOpenExternalSelection: (selection: ExternalLibrarySelection) => void;
  selection: ExternalLibrarySelection;
}) {
  const rowSpacing = getNodeListRowSpacing();

  if (props.isLoading) {
    return <ExternalDocumentListLoadingState />;
  }

  if (props.documents.length === 0) {
    return (
      <div className="flex min-h-full items-center justify-center px-3 py-6">
        <AppEmptyState description="No documents are available in the selected folder." title="No documents" />
      </div>
    );
  }

  return (
    <section aria-label="External folder contents" className="flex flex-col" role="tree">
      {props.documents.map((document) => {
        const isActive = props.selection.kind === 'document' && props.selection.absolutePath === document.absolutePath;
        return (
          <NodeTreeRow
            depth={0}
            hasChildren={false}
            isActive={isActive}
            isCollapsed={false}
            isSelected={isActive}
            key={document.absolutePath}
            label={document.title}
            nodeId={document.absolutePath}
            rowSpacing={rowSpacing}
            showIcon={false}
            onSelect={() =>
              props.onOpenExternalSelection({
                absolutePath: document.absolutePath,
                folderId: document.folderId,
                kind: 'document'
              })
            }
            onToggleCollapse={() => undefined}
          />
        );
      })}
    </section>
  );
}

function ExternalDocumentListLoadingState() {
  return (
    <div aria-busy="true" className="flex min-h-full items-center justify-center px-3 py-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div
          aria-label="Loading external folder documents indicator"
          className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-foreground/55"
        />
        <p className="m-0 text-sm text-foreground/65">Loading documents</p>
      </div>
    </div>
  );
}
