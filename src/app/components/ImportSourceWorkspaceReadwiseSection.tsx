import { ChevronDown, ChevronUp } from 'lucide-react';

import { AppButton, SettingsControlSlot, SettingsRow, SettingsSection } from '../../shared/ui';

import {
  formatHighlightModeLabel,
  formatReadwiseSourceLabel,
  formatTriggerModeLabel,
  importSourceSelectClassName,
  type DraftImportSource,
  type DraftImportSourceField
} from './importSourceWorkspaceModel';
import { ColumnHeader, FolderButton, HandlingCell, resolveFolderPathLabel, TriggerCell } from './ImportSourceWorkspaceTableParts';

const readwiseRowGridClassName =
  'grid grid-cols-[86px_minmax(118px,0.72fr)_minmax(118px,0.72fr)_92px_110px_108px_96px_72px] gap-2';

function ReadwiseRootRow({ readwiseRootPath, onChooseRootFolder }: { readwiseRootPath: string; onChooseRootFolder: () => void }) {
  return (
    <SettingsRow
      description="Choose the Readwise root once, then adjust the four category rows below if needed."
      title="Readwise root folder"
    >
      <SettingsControlSlot className="max-w-none flex-1">
        <FolderButton
          label="Readwise root folder"
          onClick={onChooseRootFolder}
          path={resolveFolderPathLabel(readwiseRootPath, 'Choose folder')}
        />
      </SettingsControlSlot>
    </SettingsRow>
  );
}

function ReadwiseHeader() {
  return (
    <div className={readwiseRowGridClassName}>
      <ColumnHeader title="Type" />
      <ColumnHeader title="Original" />
      <ColumnHeader title="Highlight" />
      <ColumnHeader title="Mode" />
      <ColumnHeader help="After import" title="Handling" />
      <ColumnHeader help="When it runs" title="Trigger" />
      <ColumnHeader help="Repeat" title="Every" />
      <ColumnHeader title="Action" />
    </div>
  );
}

function ReadwiseRow({
  source,
  onChange,
  onChoosePrimaryFolder,
  onChooseHighlightFolder,
  onChangeAction,
  onRunNow
}: {
  source: DraftImportSource;
  onChange: (sourceId: string, field: DraftImportSourceField, value: string) => void;
  onChoosePrimaryFolder: (sourceId: string) => void;
  onChooseHighlightFolder: (sourceId: string) => void;
  onChangeAction: (sourceId: string, value: string) => void;
  onRunNow: (sourceId: string) => void;
}) {
  if (!source.kind) {
    return null;
  }

  return (
    <div className={`${readwiseRowGridClassName} items-start border-b border-border/60 py-2`}>
      <div className="flex h-10 items-center px-1 text-sm font-medium text-foreground/78">{formatReadwiseSourceLabel(source.kind)}</div>
      <FolderButton
        label={`Readwise original folder ${source.id}`}
        onClick={() => onChoosePrimaryFolder(source.id)}
        path={resolveFolderPathLabel(source.primaryPath, 'Choose folder')}
      />
      <FolderButton
        label={`Readwise highlight folder ${source.id}`}
        onClick={() => onChooseHighlightFolder(source.id)}
        path={resolveFolderPathLabel(source.highlightPath, 'Choose folder')}
      />
      <select
        aria-label={`Mode ${source.id}`}
        className={importSourceSelectClassName}
        onChange={(event) => onChange(source.id, 'highlightMode', event.target.value)}
        value={source.highlightMode}
      >
        <option value="merged">{formatHighlightModeLabel('merged')}</option>
        <option value="split">{formatHighlightModeLabel('split')}</option>
      </select>
      <HandlingCell onChangeAction={onChangeAction} source={source} />
      <select
        aria-label={`Trigger ${source.id}`}
        className={importSourceSelectClassName}
        onChange={(event) => onChange(source.id, 'triggerMode', event.target.value)}
        value={source.triggerMode}
      >
        <option value="manual">{formatTriggerModeLabel('manual')}</option>
        <option value="scheduled">{formatTriggerModeLabel('scheduled')}</option>
      </select>
      <TriggerCell onChange={onChange} source={source} />
      <div className="flex h-full items-center justify-end">
        <AppButton aria-label={`Import ${source.id}`} className="h-9 min-w-16 whitespace-nowrap px-3" onClick={() => onRunNow(source.id)} variant="primary">
          Import
        </AppButton>
      </div>
    </div>
  );
}

function ReadwiseRows(props: {
  sources: DraftImportSource[];
  onChange: (sourceId: string, field: DraftImportSourceField, value: string) => void;
  onChoosePrimaryFolder: (sourceId: string) => void;
  onChooseHighlightFolder: (sourceId: string) => void;
  onChangeAction: (sourceId: string, value: string) => void;
  onRunNow: (sourceId: string) => void;
}) {
  return (
    <div className="mt-2 flex flex-col">
      {props.sources.map((source) => (
        <ReadwiseRow
          key={source.id}
          onChange={props.onChange}
          onChangeAction={props.onChangeAction}
          onChooseHighlightFolder={props.onChooseHighlightFolder}
          onChoosePrimaryFolder={props.onChoosePrimaryFolder}
          onRunNow={props.onRunNow}
          source={source}
        />
      ))}
    </div>
  );
}

function ReadwiseTable(props: {
  detailsOpen: boolean;
  sources: DraftImportSource[];
  onToggleDetails: () => void;
  onChange: (sourceId: string, field: DraftImportSourceField, value: string) => void;
  onChoosePrimaryFolder: (sourceId: string) => void;
  onChooseHighlightFolder: (sourceId: string) => void;
  onChangeAction: (sourceId: string, value: string) => void;
  onRunNow: (sourceId: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-elevated px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-foreground">Readwise folders</h4>
          <p className="mt-1 text-sm text-foreground/60">
            Defaults stay visible as Books, Articles, Tweets, and Podcasts. Missing folders can remain empty.
          </p>
        </div>
        <AppButton aria-expanded={props.detailsOpen} onClick={props.onToggleDetails} variant="ghost">
          {props.detailsOpen ? 'Hide details' : 'Detailed settings'}
          {props.detailsOpen ? <ChevronUp aria-hidden="true" size={15} strokeWidth={1.9} /> : <ChevronDown aria-hidden="true" size={15} strokeWidth={1.9} />}
        </AppButton>
      </div>

      {props.detailsOpen ? (
        <div className="mt-3 min-w-[1060px]">
          <ReadwiseHeader />
          <ReadwiseRows {...props} />
        </div>
      ) : null}
    </div>
  );
}

export function ImportSourceWorkspaceReadwiseSection(props: {
  detailsOpen: boolean;
  readwiseRootPath: string;
  sources: DraftImportSource[];
  onToggleDetails: () => void;
  onChooseRootFolder: () => void;
  onChange: (sourceId: string, field: DraftImportSourceField, value: string) => void;
  onChoosePrimaryFolder: (sourceId: string) => void;
  onChooseHighlightFolder: (sourceId: string) => void;
  onChangeAction: (sourceId: string, value: string) => void;
  onRunNow: (sourceId: string) => void;
}) {
  return (
    <SettingsSection
      ariaLabel="Readwise Reader import"
      className="mb-6"
      description="Readwise is configured separately here. Other import sources stay available below."
      title="Readwise Reader for Obsidian"
    >
      <ReadwiseRootRow onChooseRootFolder={props.onChooseRootFolder} readwiseRootPath={props.readwiseRootPath} />
      <div className="overflow-auto">
        <ReadwiseTable {...props} />
      </div>
    </SettingsSection>
  );
}
