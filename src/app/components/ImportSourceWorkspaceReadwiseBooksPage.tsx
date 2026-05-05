import { useCallback, useEffect, useState } from 'react';

import {
  loadRuntimeReadwiseBooksInventory,
  resetRuntimeReadwiseBookImport,
  type RuntimeReadwiseBooksInventory
} from '../../shared/platform/readwiseBooksBridge';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { matchesImportSearch } from './importManagementSearch';
import { ImportManagementSearchBar } from './ImportManagementSearchBar';
import { ReadwiseBooksInventorySection } from './ImportOverviewSections';
import {
  applyResetReadwiseBookImportToWorkspace,
  selectReadwiseBookNode
} from './importSourceWorkspaceReadwiseBooks';

function useReadwiseBooksInventoryState(enabled: boolean) {
  const [booksInventory, setBooksInventory] = useState<RuntimeReadwiseBooksInventory | null>(null);
  const refreshBooksInventory = useCallback(async () => {
    setBooksInventory(await loadRuntimeReadwiseBooksInventory());
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    void refreshBooksInventory();
  }, [enabled, refreshBooksInventory]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const handleFocus = () => {
      void refreshBooksInventory();
    };
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [enabled, refreshBooksInventory]);

  return { booksInventory, refreshBooksInventory };
}

async function runReadwiseBookReset(input: { nodeId: string; title: string }) {
  const result = await resetRuntimeReadwiseBookImport(input.nodeId);
  if (!result || result.status !== 'reset' || !result.node_id || result.content === null || !result.updated_at) {
    throw new Error(`Could not import ${input.title}.`);
  }

  applyResetReadwiseBookImportToWorkspace({
    content: result.content,
    node_id: result.node_id,
    removed_node_ids: result.removed_node_ids,
    title: result.title ?? input.title,
    updated_at: result.updated_at
  });
  await useWorkspaceStore.persist.rehydrate();
  return result.node_id;
}

function filterBooksInventory(query: string, booksInventory: RuntimeReadwiseBooksInventory | null) {
  if (!booksInventory) {
    return null;
  }

  return {
    ...booksInventory,
    books: booksInventory.books.filter((book) =>
      matchesImportSearch(query, [
        book.title,
        book.bookKey,
        book.importStatus,
        book.nodeStatus,
        book.annotationStatus
      ])
    )
  };
}

export function ImportSourceWorkspaceReadwiseBooksPage({
  open,
  onOpenChange,
  onSelectNode
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectNode?: (nodeId: string) => void;
}) {
  const { booksInventory, refreshBooksInventory } = useReadwiseBooksInventoryState(open);
  const nodesById = useWorkspaceStore((state) => state.nodesById);
  const [resettingNodeId, setResettingNodeId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState('');
  const [query, setQuery] = useState('');
  const handleOpenBookNode = useCallback(
    (nodeId: string) => {
      selectReadwiseBookNode(nodeId, onSelectNode);
      onOpenChange(false);
    },
    [onOpenChange, onSelectNode]
  );

  const handleReimportBook = useCallback(
    async (input: { nodeId: string; title: string }) => {
      setResettingNodeId(input.nodeId);
      try {
        const nodeId = await runReadwiseBookReset(input);
        setActionMessage('');
        handleOpenBookNode(nodeId);
      } catch {
        setActionMessage(`Could not import ${input.title}.`);
      } finally {
        setResettingNodeId(null);
        await refreshBooksInventory();
      }
    },
    [handleOpenBookNode, refreshBooksInventory]
  );
  const filteredInventory = filterBooksInventory(query, booksInventory);
  const filteredCount = filteredInventory?.books.length ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <ImportManagementSearchBar
        countLabel={`${filteredCount} matches`}
        onChange={setQuery}
        placeholder="Search imported books"
        value={query}
      />
      <ReadwiseBooksInventorySection
        inventory={filteredInventory}
        nodesById={nodesById}
        onOpenBookNode={handleOpenBookNode}
        onResetBookImport={handleReimportBook}
        resettingNodeId={resettingNodeId}
      />
      <p aria-live="polite" className="px-1 text-xs text-foreground/65">
        {actionMessage}
      </p>
    </div>
  );
}
