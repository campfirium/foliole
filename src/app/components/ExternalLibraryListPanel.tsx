import { useMemo, useState } from 'react';

import { getNodeListRowSpacing } from '../../features/nodes/components/nodeListRowSpacingSettings';
import { NodeListSearchOverlay, renderSearchLauncher } from '../../features/nodes/components/NodeListSearchOverlay';
import { NodeTreeRow } from '../../features/nodes/components/NodeTreeRow';
import type {
  RuntimeExternalSearchBrowseEntry,
  RuntimeExternalSearchFolder
} from '../../shared/platform/externalSearchBridge';
import { AppEmptyState, AppToolbar } from '../../shared/ui';

import {
  buildExternalLibraryFolderBrowseState,
  type ExternalLibrarySelection
} from './externalLibraryBrowseModel';

interface ExternalLibraryListPanelProps {
  entriesByFolderId: Record<string, RuntimeExternalSearchBrowseEntry[] | undefined>;
  folders: RuntimeExternalSearchFolder[];
  onOpenExternalSelection: (selection: ExternalLibrarySelection) => void;
  selection: ExternalLibrarySelection;
}

function containsQuery(value: string, query: string) {
  return value.toLocaleLowerCase().includes(query.toLocaleLowerCase());
}

export function ExternalLibraryListPanel(props: ExternalLibraryListPanelProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const documents = useExternalDocumentListState(props, searchQuery);

  return (
    <aside aria-label="Current folder contents" className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg-panel text-foreground">
      <AppToolbar
        as="header"
        className="relative min-h-[var(--workspace-top-toolbar-height)] justify-between gap-3 px-4"
      >
        {renderSearchLauncher(() => setIsSearchOpen(true))}
        <span aria-hidden="true" className="size-8" />
        <span aria-hidden="true" className="size-8" />
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
      <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-bg-panel px-2 pb-2 pt-2">
        <ExternalDocumentListBody
          documents={documents}
          onOpenExternalSelection={props.onOpenExternalSelection}
          selection={props.selection}
        />
      </div>
    </aside>
  );
}

function useExternalDocumentListState(props: ExternalLibraryListPanelProps, searchQuery: string) {
  const activeFolderId = props.selection.kind === 'root' ? null : props.selection.folderId;
  const selectedFolder = activeFolderId ? props.folders.find((folder) => folder.id === activeFolderId) ?? null : null;
  const folderEntries = selectedFolder ? props.entriesByFolderId[selectedFolder.id] ?? [] : [];
  const browseState = useMemo(
    () => (!selectedFolder || props.selection.kind === 'root' ? null : buildExternalLibraryFolderBrowseState(selectedFolder, folderEntries, props.selection)),
    [folderEntries, props.selection, selectedFolder]
  );

  return (browseState?.documentItems ?? []).filter(
    (document) =>
      !searchQuery.trim() ||
      containsQuery(document.relativePath, searchQuery) ||
      containsQuery(document.fileName, searchQuery) ||
      containsQuery(document.title, searchQuery) ||
      containsQuery(document.openingText ?? '', searchQuery)
  );
}

function ExternalDocumentListBody(props: {
  documents: ReturnType<typeof buildExternalLibraryFolderBrowseState>['documentItems'];
  onOpenExternalSelection: (selection: ExternalLibrarySelection) => void;
  selection: ExternalLibrarySelection;
}) {
  const rowSpacing = getNodeListRowSpacing();

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
