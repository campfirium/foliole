import { useMemo, useState } from 'react';

import { NodeListSearchOverlay, renderSearchLauncher } from '../../features/nodes/components/NodeListSearchOverlay';
import type {
  RuntimeExternalSearchBrowseEntry,
  RuntimeExternalSearchFolder
} from '../../shared/platform/externalSearchBridge';
import { AppEmptyState } from '../../shared/ui';

import {
  buildExternalLibraryFolderBrowseState,
  resolveExternalFolderLabel,
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
  const panelState = useExternalDocumentListState(props, searchQuery);

  return (
    <aside aria-label="Current folder contents" className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg-panel text-foreground">
      <div className="relative flex min-h-[var(--workspace-top-toolbar-height)] items-center justify-between px-4">
        {renderSearchLauncher(() => setIsSearchOpen(true))}
        <div className="min-w-0 truncate text-sm font-medium text-foreground">{panelState.title}</div>
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
      </div>
      <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto bg-bg-panel px-4 py-2">
        <ExternalDocumentListBody
          documents={panelState.documents}
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

  return {
    documents: (browseState?.documentItems ?? []).filter(
      (document) => !searchQuery.trim() || containsQuery(document.relativePath, searchQuery) || containsQuery(document.fileName, searchQuery)
    ),
    title: resolvePanelTitle(selectedFolder, browseState?.selectedDirectoryPath ?? null)
  };
}

function resolvePanelTitle(folder: RuntimeExternalSearchFolder | null, selectedDirectoryPath: string | null) {
  if (!folder) {
    return 'External';
  }
  if (!selectedDirectoryPath) {
    return resolveExternalFolderLabel(folder.folderPath);
  }
  return selectedDirectoryPath.split('/').filter(Boolean).at(-1) ?? resolveExternalFolderLabel(folder.folderPath);
}

function ExternalDocumentListBody(props: {
  documents: ReturnType<typeof buildExternalLibraryFolderBrowseState>['documentItems'];
  onOpenExternalSelection: (selection: ExternalLibrarySelection) => void;
  selection: ExternalLibrarySelection;
}) {
  if (props.documents.length === 0) {
    return (
      <div className="flex min-h-full items-center justify-center py-6">
        <AppEmptyState description="No documents are available in the selected folder." title="No documents" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {props.documents.map((document) => {
        const isActive = props.selection.kind === 'document' && props.selection.absolutePath === document.absolutePath;
        return (
          <button
            className={`rounded-md px-3 py-2 text-left ${
              isActive ? 'bg-bg-subtle text-foreground' : 'text-foreground/80 hover:bg-bg-subtle hover:text-foreground'
            }`}
            key={document.absolutePath}
            onClick={() =>
              props.onOpenExternalSelection({
                absolutePath: document.absolutePath,
                folderId: document.folderId,
                kind: 'document'
              })
            }
            type="button"
          >
            <div className="text-sm font-medium text-foreground">{document.fileName}</div>
          </button>
        );
      })}
    </div>
  );
}
