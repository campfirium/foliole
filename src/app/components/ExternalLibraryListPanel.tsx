import { useCallback, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { getNodeListRowSpacing } from '../../features/nodes/components/nodeListRowSpacingSettings';
import { createNodeListRowKeydownHandler } from '../../features/nodes/components/NodeListTreeKeyboard';
import { NodeTreeRow } from '../../features/nodes/components/NodeTreeRow';
import { useOptionalAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import type {
  ExternalLibraryBrowseEntry,
  ExternalLibraryFolder
} from '../../shared/platform/externalLibraryBrowseRepository';
import { AppEmptyState, AppSpinner } from '../../shared/ui';
import { useWorkspaceContentSort } from '../hooks/useWorkspaceContentSort';

import {
  markExternalDocumentOpened,
  useExternalDocumentLastOpenedAt
} from './externalDocumentLastOpenedAt';
import {
  type ExternalLibraryDocumentItem,
  type ExternalLibrarySelection
} from './externalLibraryBrowseModel';
import { resolveExternalDocuments } from './externalLibraryListModel';
import { ExternalLibraryListToolbar } from './ExternalLibraryListToolbar';
import { normalizeWorkspaceContentSort, sortExternalDocuments } from './workspaceContentSort';
import { useStableWorkspaceContentItems } from './workspaceStableContentSort';

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
  const t = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const contentSort = useWorkspaceContentSort();
  const lastOpenedAtByPath = useExternalDocumentLastOpenedAt();
  const normalizedSort = normalizeWorkspaceContentSort(contentSort.sort, ['modifiedAt', 'lastOpenedAt', 'name']);
  const documents = useExternalDocumentListState(
    props,
    searchQuery,
    normalizedSort,
    lastOpenedAtByPath,
    contentSort.sortRefreshVersion
  );

  return (
    <aside aria-label={t('desktop.externalLibrary.currentFolderContents')} className="workspace-region-main-topic flex min-h-0 min-w-0 flex-1 flex-col text-foreground">
      <ExternalLibraryListToolbar
        contentSort={contentSort}
        normalizedSort={normalizedSort}
        onChangeSearchQuery={setSearchQuery}
        searchQuery={searchQuery}
        selection={props.selection}
      />
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

function getExternalDocumentId(document: { absolutePath: string }) {
  return document.absolutePath;
}

function useExternalDocumentListState(
  props: ExternalLibraryListPanelProps,
  searchQuery: string,
  sort: ReturnType<typeof useWorkspaceContentSort>['sort'],
  lastOpenedAtByPath: Record<string, string | undefined>,
  sortRefreshVersion: number
) {
  const { entriesByFolderId, folders, selection } = props;
  const { items, isLoading, scopeKey } = useMemo(
    () => resolveExternalDocuments(folders, entriesByFolderId, selection),
    [entriesByFolderId, folders, selection]
  );

  // A new filtered array or sorter per render re-sorted the whole folder on every render.
  const filteredDocuments = useMemo(
    () =>
      items.filter(
        (document) =>
          !searchQuery.trim() ||
          containsQuery(document.relativePath, searchQuery) ||
          containsQuery(document.fileName, searchQuery) ||
          containsQuery(document.title, searchQuery) ||
          containsQuery(document.openingText ?? '', searchQuery)
      ),
    [items, searchQuery]
  );
  const sortItems = useCallback(
    (items: typeof filteredDocuments) => sortExternalDocuments(items, sort, lastOpenedAtByPath),
    [lastOpenedAtByPath, sort]
  );
  const documents = useStableWorkspaceContentItems({
    getItemId: getExternalDocumentId,
    items: filteredDocuments,
    refreshKey: sortRefreshVersion,
    scopeKey,
    sort,
    sortItems
  });
  return {
    documents,
    isLoading
  };
}

function ExternalDocumentListBody(props: {
  documents: ExternalLibraryDocumentItem[];
  isLoading: boolean;
  onOpenExternalSelection: (selection: ExternalLibrarySelection) => void;
  selection: ExternalLibrarySelection;
}) {
  const t = useTranslation();
  const appearanceSettings = useOptionalAppearanceSettings();
  const rowSpacing = appearanceSettings?.nodeListRowSpacing ?? getNodeListRowSpacing();
  const onRowKeyDown = useExternalDocumentKeyboard(props.documents, props.onOpenExternalSelection);

  if (props.isLoading) {
    return <ExternalDocumentListLoadingState />;
  }

  if (props.documents.length === 0) {
    return (
      <div className="flex min-h-full items-center justify-center px-3 py-6">
        <AppEmptyState description={t('desktop.externalLibrary.empty.description')} title={t('desktop.externalLibrary.empty.title')} />
      </div>
    );
  }

  return (
    <section aria-label={t('desktop.externalLibrary.folderContents')} className="flex flex-col" role="tree">
      {props.documents.map((document) =>
        renderExternalDocumentRow({
          archivedLabel: t('desktop.externalLibrary.archived'),
          document,
          onOpenExternalSelection: props.onOpenExternalSelection,
          onRowKeyDown,
          rowSpacing,
          selection: props.selection
        })
      )}
    </section>
  );
}

function useExternalDocumentKeyboard(
  documents: ExternalLibraryDocumentItem[],
  onOpenExternalSelection: (selection: ExternalLibrarySelection) => void
) {
  return useMemo(
    () =>
      createNodeListRowKeydownHandler({
        collapsedNodeIds: new Set(),
        onSelect: (absolutePath) => openExternalDocumentSelection(absolutePath, documents, onOpenExternalSelection),
        onToggleCollapse: () => undefined,
        rows: documents.map((document) => ({
          depth: 0,
          hasChildren: false,
          id: document.absolutePath
        }))
      }),
    [documents, onOpenExternalSelection]
  );
}

function openExternalDocumentSelection(
  absolutePath: string,
  documents: ExternalLibraryDocumentItem[],
  onOpenExternalSelection: (selection: ExternalLibrarySelection) => void
) {
  const document = documents.find((candidate) => candidate.absolutePath === absolutePath);
  if (!document) return;
  markExternalDocumentOpened(document.absolutePath);
  onOpenExternalSelection({
    absolutePath: document.absolutePath,
    folderId: document.folderId,
    kind: 'document',
    ...(document.sourceKind ? { sourceKind: document.sourceKind } : {})
  });
}

function renderExternalDocumentRow(args: {
  archivedLabel: string;
  document: ExternalLibraryDocumentItem;
  onOpenExternalSelection: (selection: ExternalLibrarySelection) => void;
  onRowKeyDown: (nodeId: string, event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  rowSpacing: number;
  selection: ExternalLibrarySelection;
}) {
  const isActive = args.selection.kind === 'document' && args.selection.absolutePath === args.document.absolutePath;
  return (
    <NodeTreeRow
      depth={0}
      hasChildren={false}
      isActive={isActive}
      isCollapsed={false}
      isSelected={isActive}
      key={args.document.absolutePath}
      label={args.document.title}
      nodeId={args.document.absolutePath}
      rowSpacing={args.rowSpacing}
      secondaryLabel={args.document.isPresent === false ? args.archivedLabel : undefined}
      showIcon={false}
      showLeafChevronPlaceholder={false}
      onKeyDown={args.onRowKeyDown}
      onSelect={() => openExternalDocumentSelection(args.document.absolutePath, [args.document], args.onOpenExternalSelection)}
      onToggleCollapse={() => undefined}
    />
  );
}

function ExternalDocumentListLoadingState() {
  return (
    <div aria-busy="true" className="flex min-h-full items-center justify-center px-3 py-6" role="status">
      <AppSpinner decorative />
    </div>
  );
}
