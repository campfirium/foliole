import { AppInput, InspectorSection } from '../../shared/ui';

import {
  type DraftImportSource,
  formatRunModeLabel,
  importSourceSelectClassName
} from './importSourceWorkspaceModel';

function SourceHandlingField({
  source,
  onChange
}: {
  source: DraftImportSource;
  onChange: (field: keyof DraftImportSource, value: string) => void;
}) {
  if (source.template === 'split_highlights') {
    return (
      <label className="flex flex-col gap-2 text-sm text-foreground/70">
        <span>Highlight folder</span>
        <AppInput onChange={(event) => onChange('highlightPath', event.target.value)} placeholder="/path/to/highlights" value={source.highlightPath} />
      </label>
    );
  }

  return (
    <label className="flex flex-col gap-2 text-sm text-foreground/70">
      <span>Text handling</span>
      <select className={importSourceSelectClassName} onChange={(event) => onChange('textHandling', event.target.value)} value={source.textHandling}>
        <option value="reference_only">Keep source text</option>
        <option value="adopt">Adopt highlights</option>
      </select>
    </label>
  );
}

function SourceForm({
  source,
  onChange
}: {
  source: DraftImportSource;
  onChange: (field: keyof DraftImportSource, value: string) => void;
}) {
  return (
    <InspectorSection description="Each source owns its own folders and rules. This is not a global settings page." title="Source details">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-foreground/70">
          <span>Name</span>
          <AppInput onChange={(event) => onChange('name', event.target.value)} value={source.name} />
        </label>
        <label className="flex flex-col gap-2 text-sm text-foreground/70">
          <span>Template</span>
          <select className={importSourceSelectClassName} onChange={(event) => onChange('template', event.target.value)} value={source.template}>
            <option value="folder">Folder import</option>
            <option value="watched_folder">Watched folder</option>
            <option value="split_highlights">Split highlights</option>
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm text-foreground/70">
          <span>Primary folder</span>
          <AppInput onChange={(event) => onChange('primaryPath', event.target.value)} placeholder="/path/to/folder" value={source.primaryPath} />
        </label>
        <label className="flex flex-col gap-2 text-sm text-foreground/70">
          <span>Run mode</span>
          <select className={importSourceSelectClassName} onChange={(event) => onChange('runMode', event.target.value)} value={source.runMode}>
            <option value="one_off">One-off</option>
            <option value="watch">Watch continuously</option>
          </select>
        </label>
        <SourceHandlingField onChange={onChange} source={source} />
        <label className="flex flex-col gap-2 text-sm text-foreground/70">
          <span>Source file handling</span>
          <select className={importSourceSelectClassName} onChange={(event) => onChange('consumePolicy', event.target.value)} value={source.consumePolicy}>
            <option value="keep">Keep source files</option>
            <option value="clear">Clear after import</option>
            <option value="archive">Archive after import</option>
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm text-foreground/70 md:col-span-2">
          <span>Scan cadence</span>
          <AppInput onChange={(event) => onChange('scanInterval', event.target.value)} value={source.scanInterval} />
        </label>
      </div>
    </InspectorSection>
  );
}

function CurrentDirectionSection({ source, statusLine }: { source: DraftImportSource; statusLine: string }) {
  return (
    <InspectorSection description="One-off import should stay light. This page is where long-lived sources get created and observed." title="Current direction">
      <dl className="space-y-3 text-sm text-foreground/70">
        <div className="flex items-start justify-between gap-3 border-b border-border/70 pb-3">
          <dt className="text-foreground/45">Selected source</dt>
          <dd className="text-right">{source.name}</dd>
        </div>
        <div className="flex items-start justify-between gap-3 border-b border-border/70 pb-3">
          <dt className="text-foreground/45">Mode</dt>
          <dd className="text-right">{formatRunModeLabel(source.runMode)}</dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-foreground/45">Latest one-off import</dt>
          <dd className="text-right">{statusLine}</dd>
        </div>
      </dl>
    </InspectorSection>
  );
}

export function ImportSourceWorkspaceDetails({
  source,
  statusLine,
  onChange
}: {
  source: DraftImportSource | null;
  statusLine: string;
  onChange: (field: keyof DraftImportSource, value: string) => void;
}) {
  if (!source) {
    return (
      <InspectorSection
        description="Select a source from the list or create a new one to define folders, handling rules, and watch behavior."
        title="Source details"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SourceForm onChange={onChange} source={source} />
      <CurrentDirectionSection source={source} statusLine={statusLine} />
    </div>
  );
}
