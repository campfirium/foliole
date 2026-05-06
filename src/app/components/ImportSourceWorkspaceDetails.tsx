import { X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../shared/platform/storage';
import { AppButton, AppDialog, AppDialogClose, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle, AppEmptyState } from '../../shared/ui';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { ImportCatalogLayout } from './ImportCatalogLayout';
import { IMPORT_CATALOG_SORT_OPTIONS, type ImportCatalogSortKey } from './importCatalogOrdering';
import { ImportOverviewPage } from './ImportOverviewPage';
import { ImportSourceWorkspacePdfPage } from './ImportSourceWorkspacePdfPage';
import { ImportSourceWorkspaceReadwiseBooksPage } from './ImportSourceWorkspaceReadwiseBooksPage';
import { InboxImportLanding } from './InboxImportLanding';

import { cn } from '@/shared/lib/utils';

type ImportManagementPageId = 'imports' | 'inbox' | 'readwise-books' | 'readwise-articles' | 'pdf';

type ImportSourceWorkspaceDetailsProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectNode?: (nodeId: string) => void;
};

const importManagementPages = [
  {
    emptyDescription: 'Combined import content will appear here once the sources are available.',
    id: 'imports',
    title: 'Imports'
  },
  {
    emptyDescription: 'Imported inbox content will appear here once the content view is wired in.',
    id: 'inbox',
    title: 'Inbox'
  },
  {
    emptyDescription: 'Readwise book content will appear here once the list view is ready.',
    id: 'readwise-books',
    title: 'Readwise Books'
  },
  {
    emptyDescription: 'Readwise article content will appear here once the list view is ready.',
    id: 'readwise-articles',
    title: 'Readwise Articles'
  },
  {
    emptyDescription: 'PDF import content will appear here once the list view is ready.',
    id: 'pdf',
    title: 'PDF'
  }
] as const satisfies ReadonlyArray<{
  emptyDescription: string;
  id: ImportManagementPageId;
  title: string;
}>;

function ImportSourceWorkspaceNavigation(props: {
  activePageId: ImportManagementPageId;
  onSelect: (pageId: ImportManagementPageId) => void;
}) {
  return (
    <aside className="flex min-h-0 flex-col border-r border-settings-divider bg-settings-sidebar px-4 pb-5 pt-6">
      <nav aria-label="Import management navigation" className="flex flex-col gap-1">
        {importManagementPages.map((page) => (
          <AppButton
            key={page.id}
            aria-current={props.activePageId === page.id ? 'page' : undefined}
            aria-pressed={props.activePageId === page.id}
            className={cn(
              'min-h-0 cursor-pointer rounded-md border-transparent px-5 py-[10px] text-[0.98rem] transition-colors',
              props.activePageId === page.id
                ? 'bg-settings-selected font-medium text-foreground'
                : 'bg-transparent text-foreground/72 hover:bg-settings-selected hover:text-foreground active:bg-settings-control-active'
            )}
            onClick={() => props.onSelect(page.id)}
            variant="list"
          >
            {page.title}
          </AppButton>
        ))}
      </nav>
    </aside>
  );
}

function ImportSourceWorkspacePage({
  children,
  pageId
}: {
  children?: ReactNode;
  pageId: ImportManagementPageId;
}) {
  const page = importManagementPages.find((entry) => entry.id === pageId) ?? importManagementPages[0];

  return (
    <section aria-label={`${page.title} page`} className="flex min-h-0 min-w-0 flex-1 flex-col bg-settings-shell">
      {children ? (
        <div className="flex min-h-0 flex-1">{children}</div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center py-2">
          <AppEmptyState description={page.emptyDescription} title={`${page.title} page`} />
        </div>
      )}
    </section>
  );
}

function ImportSourceWorkspacePageContent({
  open,
  onOpenChange,
  onSelectNode,
  pageId
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectNode?: (nodeId: string) => void;
  pageId: ImportManagementPageId;
}) {
  const nodesById = useWorkspaceStore((state) => state.nodesById);

  if (pageId === 'imports') {
    return (
      <ImportSourceWorkspacePage pageId={pageId}>
        <ImportOverviewPage onOpenChange={onOpenChange} onSelectNode={onSelectNode} open={open} />
      </ImportSourceWorkspacePage>
    );
  }

  if (pageId === 'inbox') {
    return (
      <ImportSourceWorkspacePage pageId={pageId}>
        <InboxImportLanding nodesById={nodesById} onSelectNode={onSelectNode ?? (() => undefined)} />
      </ImportSourceWorkspacePage>
    );
  }

  if (pageId === 'readwise-books') {
    return (
      <ImportSourceWorkspacePage pageId={pageId}>
        <ImportSourceWorkspaceReadwiseBooksPage onOpenChange={onOpenChange} onSelectNode={onSelectNode} open={open} />
      </ImportSourceWorkspacePage>
    );
  }

  if (pageId === 'readwise-articles') {
    return (
      <ImportSourceWorkspacePage pageId={pageId}>
        <ReadwiseArticlesCatalogPage />
      </ImportSourceWorkspacePage>
    );
  }

  if (pageId === 'pdf') {
    return (
      <ImportSourceWorkspacePage pageId={pageId}>
        <ImportSourceWorkspacePdfPage open={open} />
      </ImportSourceWorkspacePage>
    );
  }

  return <ImportSourceWorkspacePage pageId={pageId} />;
}

function ReadwiseArticlesCatalogPage() {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<ImportCatalogSortKey>('dateSaved');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  return (
    <div className="app-scrollbar flex min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-4 max-[1080px]:px-2">
      <ImportCatalogLayout
        countLabel="0"
        emptyState={{ description: 'No Readwise articles discovered yet.', title: 'Readwise Articles is empty' }}
        hasItems={false}
        onChangeQuery={setQuery}
        onChangeSortDirection={setSortDirection}
        onChangeSortKey={(value) => setSortKey(value as ImportCatalogSortKey)}
        query={query}
        searchLabel="Search imported articles"
        searchPlaceholder="Search in this folder"
        sortDirection={sortDirection}
        sortKey={sortKey}
        sortOptions={[...IMPORT_CATALOG_SORT_OPTIONS]}
        title="Readwise Articles"
      >
        {null}
      </ImportCatalogLayout>
    </div>
  );
}

export function ImportSourceWorkspaceDetails({ open, onOpenChange, onSelectNode }: ImportSourceWorkspaceDetailsProps) {
  const [activePageId, setActivePageId] = useState<ImportManagementPageId>(() => {
    const persisted = getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.importManagementActivePage);
    if (persisted === 'imports' || persisted === 'inbox' || persisted === 'readwise-books' || persisted === 'readwise-articles' || persisted === 'pdf') {
      return persisted;
    }
    return 'imports';
  });

  useEffect(() => {
    setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.importManagementActivePage, activePageId);
  }, [activePageId]);

  return (
    <AppDialog onOpenChange={onOpenChange} open={open}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent
          aria-describedby={undefined}
          className="h-[min(800px,calc(100dvh-36px))] w-[min(1240px,calc(100vw-36px))] max-w-none overflow-hidden rounded-lg border-settings-outline bg-settings-shell p-0 shadow-settings"
        >
          <section aria-label="Import management" className="grid h-full min-h-0 grid-cols-[300px_minmax(0,1fr)]">
            <AppDialogTitle className="sr-only">Import management</AppDialogTitle>
            <AppDialogClose
              aria-label="Close import management"
              className="absolute right-4 top-4 z-10 inline-flex size-8 items-center justify-center rounded-md text-foreground/58 transition-colors hover:bg-settings-selected hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <X aria-hidden="true" size={16} strokeWidth={1.8} />
            </AppDialogClose>
            <ImportSourceWorkspaceNavigation activePageId={activePageId} onSelect={setActivePageId} />
            <ImportSourceWorkspacePageContent
              onOpenChange={onOpenChange}
              onSelectNode={onSelectNode}
              open={open}
              pageId={activePageId}
            />
          </section>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
