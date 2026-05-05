import { useState } from 'react';

import { AppButton, AppStatusBadge, InspectorSection } from '../../shared/ui';
import { useFormalImport } from '../hooks/useFormalImport';

import { ImportSourceWorkspaceDetails } from './ImportSourceWorkspaceDetails';
import {
  createDraftImportSource,
  formatRunModeLabel,
  formatTemplateLabel,
  type DraftImportSource,
  type ImportSourceTemplate
} from './importSourceWorkspaceModel';

function SourceList({
  selectedId,
  sources,
  onCreateSource,
  onSelectSource
}: {
  selectedId: string | null;
  sources: DraftImportSource[];
  onCreateSource: (template: ImportSourceTemplate) => void;
  onSelectSource: (sourceId: string) => void;
}) {
  return (
    <InspectorSection
      actions={
        <div className="flex gap-2">
          <AppButton onClick={() => onCreateSource('folder')} size="sm" variant="ghost">
            New folder source
          </AppButton>
          <AppButton onClick={() => onCreateSource('watched_folder')} size="sm" variant="ghost">
            New watched source
          </AppButton>
        </div>
      }
      description="Use one entry per long-lived import source. One-off import should stay outside this page."
      title="Import sources"
    >
      <div className="flex flex-col gap-2">
        {sources.map((source) => (
          <button
            key={source.id}
            className="flex w-full items-start justify-between gap-3 rounded-md border border-border bg-bg-elevated px-3 py-3 text-left transition-colors hover:bg-foreground/[0.03] data-[active=true]:border-border-strong data-[active=true]:bg-foreground/[0.05]"
            data-active={source.id === selectedId}
            onClick={() => onSelectSource(source.id)}
            type="button"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{source.name}</p>
              <p className="mt-1 text-sm text-foreground/60">{formatTemplateLabel(source.template)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <AppStatusBadge label={formatRunModeLabel(source.runMode)} tone={source.runMode === 'watch' ? 'info' : 'neutral'} />
            </div>
          </button>
        ))}
      </div>
    </InspectorSection>
  );
}

export function ImportSourceWorkspace() {
  const formalImport = useFormalImport();
  const [sources, setSources] = useState<DraftImportSource[]>([
    createDraftImportSource('folder', 1),
    createDraftImportSource('watched_folder', 2)
  ]);
  const [selectedId, setSelectedId] = useState<string | null>('draft-import-source-1');
  const selectedSource = sources.find((source) => source.id === selectedId) ?? null;

  const handleCreateSource = (template: ImportSourceTemplate) => {
    setSources((current) => {
      const next = [...current, createDraftImportSource(template, current.length + 1)];
      setSelectedId(next[next.length - 1]?.id ?? null);
      return next;
    });
  };

  const handleChangeSource = (field: keyof DraftImportSource, value: string) => {
    if (!selectedSource) {
      return;
    }

    setSources((current) =>
      current.map((source) => {
        if (source.id !== selectedSource.id) {
          return source;
        }
        return { ...source, [field]: value };
      })
    );
  };

  return (
    <section aria-label="Import management" className="app-scrollbar flex min-h-0 flex-1 overflow-auto bg-bg-elevated">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-5 py-5">
        <InspectorSection
          description="Manage long-lived import sources here. One-off import should stay as a lightweight action from the left toolbar."
          title="Import management"
        />
        <div className="grid gap-4 xl:grid-cols-[minmax(340px,420px)_minmax(0,1fr)]">
          <SourceList
            onCreateSource={handleCreateSource}
            onSelectSource={setSelectedId}
            selectedId={selectedId}
            sources={sources}
          />
          <ImportSourceWorkspaceDetails onChange={handleChangeSource} source={selectedSource} statusLine={formalImport.status.lastRun} />
        </div>
      </div>
    </section>
  );
}
