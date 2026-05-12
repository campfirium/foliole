import { useEffect, useMemo, useState } from 'react';

import {
  loadRuntimeUnsyncedSources,
  restoreRuntimeUnsyncedSource,
  type RuntimeUnsyncedSourceEntry
} from '../../shared/platform/unsyncedSourcesRuntimeRepository';
import { AppButton, AppEmptyState, AppToolbar, ToolbarActionGroup } from '../../shared/ui';

import { ImportManagementSearchBar } from './ImportManagementSearchBar';
import { UnsyncedSourceList, UnsyncedSourcePreview } from './UnsyncedSourcesPanelParts';

function matchesQuery(entry: RuntimeUnsyncedSourceEntry, query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) {
    return true;
  }
  return `${entry.title}\n${entry.sourcePath}\n${entry.contentPreview ?? ''}`.toLocaleLowerCase().includes(normalized);
}

function useUnsyncedSources() {
  const [entries, setEntries] = useState<RuntimeUnsyncedSourceEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function loadEntries() {
    setErrorMessage('');
    setIsLoading(true);
    try {
      setEntries((await loadRuntimeUnsyncedSources()).entries);
    } catch {
      setErrorMessage('Removed imports could not be loaded.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadEntries();
  }, []);

  return { entries, errorMessage, isLoading, loadEntries };
}

function useSelectedUnsyncedEntry(entries: RuntimeUnsyncedSourceEntry[], query: string) {
  const [restoreErrorMessage, setRestoreErrorMessage] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sourceUpdateConfirmId, setSourceUpdateConfirmId] = useState<string | null>(null);
  const filteredEntries = useMemo(() => entries.filter((entry) => matchesQuery(entry, query)), [entries, query]);
  const selectedEntry = filteredEntries.find((entry) => entry.id === selectedId) ?? filteredEntries[0] ?? null;

  useEffect(() => {
    if (selectedEntry && selectedId !== selectedEntry.id) {
      setSelectedId(selectedEntry.id);
    }
  }, [selectedEntry, selectedId]);

  useEffect(() => {
    setRestoreErrorMessage('');
    setSourceUpdateConfirmId(null);
  }, [selectedId]);

  return {
    filteredEntries,
    restoreErrorMessage,
    selectedEntry,
    setRestoreErrorMessage,
    setSelectedId,
    setSourceUpdateConfirmId,
    sourceUpdateConfirmId
  };
}

function useRestoreUnsyncedSource(input: {
  loadEntries: () => Promise<void>;
  onSelectNode?: (nodeId: string) => void;
  selectedEntry: RuntimeUnsyncedSourceEntry | null;
  setRestoreErrorMessage: (message: string) => void;
  setSourceUpdateConfirmId: (id: string | null) => void;
  sourceUpdateConfirmId: string | null;
}) {
  const [restoringId, setRestoringId] = useState<string | null>(null);

  async function restoreSelectedEntry() {
    const selectedEntry = input.selectedEntry;
    if (!selectedEntry) {
      return;
    }
    input.setRestoreErrorMessage('');
    if (selectedEntry.hasSourceUpdate && input.sourceUpdateConfirmId !== selectedEntry.id) {
      input.setSourceUpdateConfirmId(selectedEntry.id);
      return;
    }
    setRestoringId(selectedEntry.id);
    try {
      const result = await restoreRuntimeUnsyncedSource(selectedEntry);
      input.setSourceUpdateConfirmId(null);
      if (!result || result.status === 'failed') {
        input.setRestoreErrorMessage(result?.detail?.trim() || 'Import again failed.');
        return;
      }
      await input.loadEntries();
      if (result.node_id) {
        input.onSelectNode?.(result.node_id);
      }
    } catch (error) {
      input.setRestoreErrorMessage(error instanceof Error ? error.message : 'Import again failed.');
    } finally {
      setRestoringId(null);
    }
  }

  return { restoringId, restoreSelectedEntry };
}

export function UnsyncedSourcesPanel(props: { onSelectNode?: (nodeId: string) => void }) {
  const { entries, errorMessage, isLoading, loadEntries } = useUnsyncedSources();
  const [query, setQuery] = useState('');
  const selection = useSelectedUnsyncedEntry(entries, query);
  const restore = useRestoreUnsyncedSource({
    loadEntries,
    onSelectNode: props.onSelectNode,
    selectedEntry: selection.selectedEntry,
    setRestoreErrorMessage: selection.setRestoreErrorMessage,
    setSourceUpdateConfirmId: selection.setSourceUpdateConfirmId,
    sourceUpdateConfirmId: selection.sourceUpdateConfirmId
  });

  return (
    <aside aria-label="Unsynced imports" className="workspace-region-main-topic flex min-h-0 min-w-0 flex-1 flex-col text-foreground">
      <AppToolbar as="header" className="relative min-h-[var(--workspace-top-toolbar-height)] justify-between gap-3 px-4">
        <ImportManagementSearchBar
          ariaLabel="Unsynced imports search"
          countLabel={String(selection.filteredEntries.length)}
          fieldLabel="Unsynced imports search field"
          onChange={setQuery}
          placeholder="Search Unsynced"
          value={query}
        />
        <ToolbarActionGroup ariaLabel="Unsynced imports actions">
          <AppButton onClick={loadEntries} variant="subtle">Refresh</AppButton>
        </ToolbarActionGroup>
      </AppToolbar>
      {errorMessage ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-6">
          <AppEmptyState description="Refresh Unsynced to try loading the source list again." title={errorMessage} />
        </div>
      ) : isLoading ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-6 text-sm text-foreground/65">Loading Unsynced</div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(220px,0.42fr)_minmax(0,1fr)]">
          <div className="app-scrollbar min-h-0 overflow-y-auto border-r border-border/15 px-2 py-2">
            <UnsyncedSourceList
              entries={selection.filteredEntries}
              onSelect={(entry) => selection.setSelectedId(entry.id)}
              selectedId={selection.selectedEntry?.id ?? null}
            />
          </div>
          <UnsyncedSourcePreview
            entry={selection.selectedEntry}
            errorMessage={selection.restoreErrorMessage}
            isRestoring={Boolean(selection.selectedEntry && restore.restoringId === selection.selectedEntry.id)}
            needsSourceUpdateConfirm={Boolean(selection.selectedEntry && selection.sourceUpdateConfirmId === selection.selectedEntry.id)}
            onRestore={restore.restoreSelectedEntry}
          />
        </div>
      )}
    </aside>
  );
}
