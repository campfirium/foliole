import { ChevronDown, ChevronUp, Settings2 } from 'lucide-react';
import { useState } from 'react';

import { isReadwiseReaderConfigReady, type ReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import { AppButton, AppIconButton, AppStatusBadge, SettingsControlSlot, SettingsRow, SettingsSection } from '../../shared/ui';

import {
  formatHighlightModeLabel,
  importSourceSelectClassName,
  type DraftImportSource,
  type DraftImportSourceField
} from './importSourceWorkspaceModel';
import {
  ColumnHeader,
  FolderButton,
  KeepActionCell,
  resolveFolderPathHint,
  resolveFolderPathLabel,
  rowGridClassName
} from './ImportSourceWorkspaceTableParts';

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
          tooltip={resolveFolderPathHint(readwiseRootPath)}
        />
      </SettingsControlSlot>
    </SettingsRow>
  );
}

function ReadwiseHeader() {
  return (
    <div className={rowGridClassName}>
      <ColumnHeader title="Original" />
      <ColumnHeader title="Highlight" />
      <ColumnHeader title="Mode" />
      <ColumnHeader title="" />
    </div>
  );
}

function ReadwiseSectionActions(props: {
  configured: boolean;
  onOpenConfig: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <AppStatusBadge label={props.configured ? 'Configured' : 'Needs setup'} tone={props.configured ? 'success' : 'warning'} />
      <AppIconButton icon={<Settings2 aria-hidden="true" size={15} strokeWidth={1.9} />} label="Open Readwise Reader settings" onClick={props.onOpenConfig} />
    </div>
  );
}

function ReadwiseRow(props: {
  source: DraftImportSource;
  onChange: (sourceId: string, field: DraftImportSourceField, value: string) => void;
  onChoosePrimaryFolder: (sourceId: string) => void;
  onChooseHighlightFolder: (sourceId: string) => void;
  onDisableKeepImport: (sourceId: string) => void;
  onPreviewKeepImport: (sourceId: string) => void;
}) {
  const { source } = props;
  if (!source.kind) {
    return null;
  }

  return (
    <div className={`${rowGridClassName} items-start border-b border-border/60 py-2`}>
      <FolderButton
        label={`Readwise original folder ${source.id}`}
        onClick={() => props.onChoosePrimaryFolder(source.id)}
        path={resolveFolderPathLabel(source.primaryPath, 'Choose folder')}
        tooltip={resolveFolderPathHint(source.primaryPath)}
      />
      <FolderButton
        label={`Readwise highlight folder ${source.id}`}
        onClick={() => props.onChooseHighlightFolder(source.id)}
        path={resolveFolderPathLabel(source.highlightPath, 'Choose folder')}
        tooltip={resolveFolderPathHint(source.highlightPath)}
      />
      <select
        aria-label={`Mode ${source.id}`}
        className={importSourceSelectClassName}
        onChange={(event) => props.onChange(source.id, 'highlightMode', event.target.value)}
        value={source.highlightMode}
      >
        <option value="merged">{formatHighlightModeLabel('merged')}</option>
        <option value="split">{formatHighlightModeLabel('split')}</option>
      </select>
      <KeepActionCell onDisable={props.onDisableKeepImport} onPreview={props.onPreviewKeepImport} source={source} />
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
  onDisableKeepImport: (sourceId: string) => void;
  onPreviewKeepImport: (sourceId: string) => void;
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
          <div className="mt-2 flex flex-col">
            {props.sources.map((source) => (
              <ReadwiseRow
                key={source.id}
                onChange={props.onChange}
                onDisableKeepImport={props.onDisableKeepImport}
                onChooseHighlightFolder={props.onChooseHighlightFolder}
                onChoosePrimaryFolder={props.onChoosePrimaryFolder}
                onPreviewKeepImport={props.onPreviewKeepImport}
                source={source}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ImportSourceWorkspaceReadwiseSection(props: {
  detailsOpen: boolean;
  readwiseReaderConfig: ReadwiseReaderConfig;
  readwiseRootPath: string;
  sources: DraftImportSource[];
  onOpenReadwiseConfig: () => void;
  onToggleDetails: () => void;
  onChooseRootFolder: () => void;
  onChange: (sourceId: string, field: DraftImportSourceField, value: string) => void;
  onChoosePrimaryFolder: (sourceId: string) => void;
  onChooseHighlightFolder: (sourceId: string) => void;
  onDisableKeepImport: (sourceId: string) => void;
  onPreviewKeepImport: (sourceId: string) => void;
}) {
  const [gateMessage, setGateMessage] = useState('');
  const configured = props.readwiseRootPath.trim().length > 0 && isReadwiseReaderConfigReady(props.readwiseReaderConfig);

  return (
    <SettingsSection
      actions={
        <ReadwiseSectionActions
          configured={configured}
          onOpenConfig={() => {
            if (!props.readwiseRootPath.trim()) {
              setGateMessage('Choose the Readwise root folder first, then open the Readwise settings.');
              return;
            }
            setGateMessage('');
            props.onOpenReadwiseConfig();
          }}
        />
      }
      ariaLabel="Readwise Reader import"
      className="mb-6"
      description="Keep sources now run automatically after preview and confirmation. Readwise stays here as the first real sample."
      title="Readwise Reader for Obsidian"
    >
      <ReadwiseRootRow onChooseRootFolder={props.onChooseRootFolder} readwiseRootPath={props.readwiseRootPath} />
      {gateMessage ? <p className="text-sm text-amber-700">{gateMessage}</p> : null}
      <div className="overflow-auto">
        <ReadwiseTable
          detailsOpen={props.detailsOpen}
          onChange={props.onChange}
          onDisableKeepImport={props.onDisableKeepImport}
          onChooseHighlightFolder={props.onChooseHighlightFolder}
          onChoosePrimaryFolder={props.onChoosePrimaryFolder}
          onPreviewKeepImport={props.onPreviewKeepImport}
          onToggleDetails={props.onToggleDetails}
          sources={props.sources}
        />
      </div>
    </SettingsSection>
  );
}
