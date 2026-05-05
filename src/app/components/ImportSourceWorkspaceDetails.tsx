import { X } from 'lucide-react';
import { useState } from 'react';

import { AppButton, AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle, AppEmptyState } from '../../shared/ui';

type ImportManagementPageId = 'inbox' | 'readwise-books' | 'readwise-articles';

type ImportSourceWorkspaceDetailsProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const importManagementPages = [
  {
    description: 'Review everything that lands in the import inbox from one place.',
    emptyDescription: 'Imported inbox content will appear here once the content view is wired in.',
    id: 'inbox',
    title: 'Inbox'
  },
  {
    description: 'Manage imported Readwise book content here without mixing it into settings.',
    emptyDescription: 'Readwise book content will appear here once the list view is ready.',
    id: 'readwise-books',
    title: 'Readwise Books'
  },
  {
    description: 'Manage imported Readwise article content here without mixing it into settings.',
    emptyDescription: 'Readwise article content will appear here once the list view is ready.',
    id: 'readwise-articles',
    title: 'Readwise Articles'
  }
] as const satisfies ReadonlyArray<{
  description: string;
  emptyDescription: string;
  id: ImportManagementPageId;
  title: string;
}>;

function ImportSourceWorkspaceHeader({ onClose }: { onClose: () => void }) {
  return (
    <header className="flex items-center justify-between border-b border-border/60 px-6 pb-4 pt-5">
      <div className="min-w-0 pr-4">
        <AppDialogTitle className="text-[1.02rem] font-semibold">Import management</AppDialogTitle>
        <p className="mt-1 text-sm text-foreground/68">Use this space to manage imported content. Source settings now live in Settings.</p>
      </div>
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

function ImportSourceWorkspacePage({ pageId }: { pageId: ImportManagementPageId }) {
  const page = importManagementPages.find((entry) => entry.id === pageId) ?? importManagementPages[0];

  return (
    <section aria-label={`${page.title} page`} className="flex min-h-0 flex-1 flex-col px-6 py-5">
      <div className="border-b border-border/60 pb-4">
        <h2 className="text-lg font-semibold text-foreground">{page.title}</h2>
        <p className="mt-1 text-sm text-foreground/68">{page.description}</p>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center py-6">
        <AppEmptyState description={page.emptyDescription} title={`${page.title} page`} />
      </div>
    </section>
  );
}

export function ImportSourceWorkspaceDetails({ open, onOpenChange }: ImportSourceWorkspaceDetailsProps) {
  const [activePageId, setActivePageId] = useState<ImportManagementPageId>('inbox');

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
              <ImportSourceWorkspacePage pageId={activePageId} />
            </div>
          </section>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
