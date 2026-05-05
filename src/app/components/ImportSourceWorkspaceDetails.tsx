import { X } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import {
  loadRuntimeReadwiseBooksInventory,
  resetRuntimeReadwiseBookImport,
  type RuntimeReadwiseBooksInventory
} from '../../shared/platform/readwiseBooksBridge';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../shared/platform/storage';
import { AppButton, AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle, AppEmptyState } from '../../shared/ui';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { ReadwiseBooksInventorySection } from './ImportOverviewSections';

type ImportManagementPageId = 'inbox' | 'readwise-books' | 'readwise-articles';

type ImportSourceWorkspaceDetailsProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

function applyResetBookImportToWorkspace(result: {
  content: string;
  node_id: string;
  removed_node_ids: string[];
  updated_at: string;
}) {
  useWorkspaceStore.getState().openNode(result.node_id);
  useWorkspaceStore.setState((state) => {
    const currentNode = state.nodesById[result.node_id];
    if (!currentNode) {
      return state;
    }
    const removedNodeIds = new Set(result.removed_node_ids);
    const nextNodesById = { ...state.nodesById };
    const nextNodeViewById = { ...state.nodeViewById };
    removedNodeIds.forEach((nodeId) => {
      delete nextNodesById[nodeId];
      delete nextNodeViewById[nodeId];
    });
    nextNodesById[result.node_id] = {
      ...currentNode,
      content: result.content,
      hasContent: true,
      hasReveal: false,
      reveal: null,
      updatedAt: result.updated_at
    };
    nextNodeViewById[result.node_id] = { scrollTop: 0, selection: { from: 0, to: 0 } };
    return {
      activeNodeId: result.node_id,
      nodeOrder: state.nodeOrder.filter((nodeId) => !removedNodeIds.has(nodeId)),
      nodeViewById: nextNodeViewById,
      nodesById: nextNodesById
    };
  });
}

function ReadwiseBooksPage({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const [booksInventory, setBooksInventory] = useState<RuntimeReadwiseBooksInventory | null>(null);
  const [resettingNodeId, setResettingNodeId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState('');

  const refreshBooksInventory = useCallback(async () => {
    setBooksInventory(await loadRuntimeReadwiseBooksInventory());
  }, []);

  const handleReimportBook = useCallback(
    async (input: { nodeId: string; title: string }) => {
      setResettingNodeId(input.nodeId);
      const result = await resetRuntimeReadwiseBookImport(input.nodeId);
      if (!result || result.status === 'book_not_found' || !result.node_id || !result.content || !result.updated_at) {
        setActionMessage(`Could not find ${input.title}.`);
      } else {
        applyResetBookImportToWorkspace({
          content: result.content,
          node_id: result.node_id,
          removed_node_ids: result.removed_node_ids,
          updated_at: result.updated_at
        });
        setActionMessage('');
        onOpenChange(false);
      }
      setResettingNodeId(null);
      await refreshBooksInventory();
    },
    [onOpenChange, refreshBooksInventory]
  );

  useEffect(() => {
    void refreshBooksInventory();
  }, [refreshBooksInventory]);

  useEffect(() => {
    const handleFocus = () => {
      void refreshBooksInventory();
    };
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [refreshBooksInventory]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <ReadwiseBooksInventorySection
        inventory={booksInventory}
        onResetBookImport={handleReimportBook}
        resettingNodeId={resettingNodeId}
      />
      <p aria-live="polite" className="px-1 text-xs text-foreground/65">
        {actionMessage}
      </p>
    </div>
  );
}

function ImportSourceWorkspacePageContent({
  onOpenChange,
  pageId
}: {
  onOpenChange: (open: boolean) => void;
  pageId: ImportManagementPageId;
}) {
  if (pageId === 'readwise-books') {
    return (
      <ImportSourceWorkspacePage pageId={pageId}>
        <ReadwiseBooksPage onOpenChange={onOpenChange} />
      </ImportSourceWorkspacePage>
    );
  }

  return <ImportSourceWorkspacePage pageId={pageId} />;
}

export function ImportSourceWorkspaceDetails({ open, onOpenChange }: ImportSourceWorkspaceDetailsProps) {
  const [activePageId, setActivePageId] = useState<ImportManagementPageId>(() => {
    const persisted = getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.importManagementActivePage);
    if (persisted === 'inbox' || persisted === 'readwise-books' || persisted === 'readwise-articles') {
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
              <ImportSourceWorkspacePageContent onOpenChange={onOpenChange} pageId={activePageId} />
            </div>
          </section>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
