import { useEffect, useMemo, useState } from 'react';

import {
  loadRuntimeRemovedSources,
  type RuntimeRemovedSourceEntry
} from '../../shared/platform/removedSourcesRuntimeRepository';
import { AppEmptyState } from '../../shared/ui';

import { setSelectedRemovedSource } from './removedSourceSelectionStore';
import { RemovedSourceRows, RemovedSourcesToolbar } from './RemovedSourcesPanelParts';

function matchesQuery(entry: RuntimeRemovedSourceEntry, query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) {
    return true;
  }
  return `${entry.title}\n${entry.sourcePath}\n${entry.contentPreview ?? ''}`.toLocaleLowerCase().includes(normalized);
}

function useRemovedSources() {
  const [entries, setEntries] = useState<RuntimeRemovedSourceEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function loadEntries() {
    setErrorMessage('');
    setIsLoading(true);
    try {
      setEntries((await loadRuntimeRemovedSources()).entries);
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

function useSelectedRemovedEntry(entries: RuntimeRemovedSourceEntry[], query: string) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const filteredEntries = useMemo(() => entries.filter((entry) => matchesQuery(entry, query)), [entries, query]);
  const selectedEntry = filteredEntries.find((entry) => entry.id === selectedId) ?? filteredEntries[0] ?? null;

  useEffect(() => {
    if (selectedEntry && selectedId !== selectedEntry.id) {
      setSelectedId(selectedEntry.id);
    }
  }, [selectedEntry, selectedId]);

  useEffect(() => {
    setSelectedRemovedSource(selectedEntry);
  }, [selectedEntry]);

  return {
    filteredEntries,
    selectedEntry,
    setSelectedId
  };
}

export function RemovedSourcesPanel() {
  const { entries, errorMessage, isLoading, loadEntries } = useRemovedSources();
  const [query, setQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const selection = useSelectedRemovedEntry(entries, query);

  return (
    <aside aria-label="Current folder contents" className="workspace-region-main-topic flex min-h-0 min-w-0 flex-1 flex-col text-foreground">
      <RemovedSourcesToolbar
        isSearchOpen={isSearchOpen}
        loadEntries={loadEntries}
        onCloseSearch={() => {
          setQuery('');
          setIsSearchOpen(false);
        }}
        onOpenSearch={() => setIsSearchOpen(true)}
        onSearchQueryChange={setQuery}
        searchQuery={query}
      />
      {errorMessage ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-6">
          <AppEmptyState description="Refresh Removed to try loading the source list again." title={errorMessage} />
        </div>
      ) : isLoading ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-6 text-sm text-foreground/65">Loading Removed</div>
      ) : (
        <div className="app-scrollbar workspace-region-main-topic min-h-0 flex-1 overflow-y-auto px-4 py-2">
          <RemovedSourceRows entries={selection.filteredEntries} onSelect={(entry) => selection.setSelectedId(entry.id)} selectedId={selection.selectedEntry?.id ?? null} />
        </div>
      )}
    </aside>
  );
}
