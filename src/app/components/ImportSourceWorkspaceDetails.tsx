import { X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../shared/platform/storage';
import { AppButton, AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle, AppEmptyState } from '../../shared/ui';

import { ImportSourceWorkspacePdfPage } from './ImportSourceWorkspacePdfPage';
import { ImportSourceWorkspaceReadwiseBooksPage } from './ImportSourceWorkspaceReadwiseBooksPage';

type ImportManagementPageId = 'inbox' | 'readwise-books' | 'readwise-articles' | 'pdf';

type ImportSourceWorkspaceDetailsProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectNode?: (nodeId: string) => void;
};

const importManagementPages = [
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

function ImportSourceWorkspaceHeader({ onClose }: { onClose: () => void }) {
  return (
    <header className="flex items-center justify-end px-6 pb-3 pt-5">
      <AppDialogTitle className="sr-only">Import management</AppDialogTitle>
      <AppButton aria-label="Close import management" className="size-8 px-0" onClick={onClose} variant="ghost">
        <X aria-hidden="true" size={15} strokeWidth={1.9} />
      </AppButton>
    </header>
  );
}

function ImportSourceWorkspaceNavigation(props: {
  activePageId: ImportManagementPageId;
  onSelect: (pageId: ImportManagementPageId) => void;
}) {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border/60 px-3 py-4">
      <h2 className="px-3 pb-2 text-xs font-semibold uppercase tracking-[0.08em] text-foreground/55">Navigation</h2>
      <nav aria-label="Import management navigation" className="flex flex-col gap-1">
        {importManagementPages.map((page) => (
          <AppButton
            key={page.id}
            active={props.activePageId === page.id}
            aria-pressed={props.activePageId === page.id}
            className="min-h-9"
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
    <section aria-label={`${page.title} page`} className="flex min-h-0 flex-1 flex-col px-6 pb-5 pt-2">
      {children ? (
        <div className="app-scrollbar flex min-h-0 flex-1 overflow-auto">{children}</div>
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
  if (pageId === 'readwise-books') {
    return (
      <ImportSourceWorkspacePage pageId={pageId}>
        <ImportSourceWorkspaceReadwiseBooksPage onOpenChange={onOpenChange} onSelectNode={onSelectNode} open={open} />
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

export function ImportSourceWorkspaceDetails({ open, onOpenChange, onSelectNode }: ImportSourceWorkspaceDetailsProps) {
  const [activePageId, setActivePageId] = useState<ImportManagementPageId>(() => {
    const persisted = getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.importManagementActivePage);
    if (persisted === 'inbox' || persisted === 'readwise-books' || persisted === 'readwise-articles' || persisted === 'pdf') {
      return persisted;
    }
    return 'inbox';
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
          className="left-1/2 top-1/2 h-[min(760px,calc(100vh-120px))] w-[min(1360px,calc(100vw-180px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-border/35 bg-bg-panel p-0"
        >
          <section aria-label="Import management" className="flex h-full min-h-0 flex-col">
            <ImportSourceWorkspaceHeader onClose={() => onOpenChange(false)} />
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <ImportSourceWorkspaceNavigation activePageId={activePageId} onSelect={setActivePageId} />
              <ImportSourceWorkspacePageContent
                onOpenChange={onOpenChange}
                onSelectNode={onSelectNode}
                open={open}
                pageId={activePageId}
              />
            </div>
          </section>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
