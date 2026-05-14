import { useRef } from 'react';

import {
  SETTINGS_ACTION_TABLE_IMPORT_SOURCE_COLUMNS_CLASS_NAME,
  settingsActionTableClassName,
  settingsActionTableHeaderClassName,
  VirtualListSurface
} from '../../shared/ui';

import { type DraftImportSource, type DraftImportSourceField } from './importSourceWorkspaceModel';
import { AddSourceRow, type ImportSourceTableRowActions, SourceRow } from './ImportSourceWorkspaceTableRows';

const TABLE_COLUMNS = SETTINGS_ACTION_TABLE_IMPORT_SOURCE_COLUMNS_CLASS_NAME;
const IMPORT_SOURCE_ROW_VIRTUAL_SIZE = 56;

function TableHeader() {
  return (
    <div className={settingsActionTableHeaderClassName(TABLE_COLUMNS)}>
      <span>Original</span>
      <span>Highlight</span>
      <span>Mode</span>
      <span>Handling</span>
      <span>Preview</span>
      <span className="text-right">Action</span>
    </div>
  );
}

function renderSourceRows(sources: DraftImportSource[], actions: ImportSourceTableRowActions) {
  return sources.map((source) => <SourceRow key={source.id} source={source} {...actions} />);
}

function ImportSourceVirtualRows({
  actions,
  sources
}: {
  actions: ImportSourceTableRowActions;
  sources: DraftImportSource[];
}) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  return (
    <div className="app-scrollbar max-h-96 overflow-y-auto" ref={scrollContainerRef}>
      <VirtualListSurface
        estimateSize={() => IMPORT_SOURCE_ROW_VIRTUAL_SIZE}
        getItemKey={(source) => source.id}
        items={sources}
        renderItem={(source) => <SourceRow source={source} {...actions} />}
        scrollElementRef={scrollContainerRef}
      />
    </div>
  );
}

function ImportSourceRows({
  actions,
  sources
}: {
  actions: ImportSourceTableRowActions;
  sources: DraftImportSource[];
}) {
  if (sources.length < 100) {
    return renderSourceRows(sources, actions);
  }

  return <ImportSourceVirtualRows actions={actions} sources={sources} />;
}

export function ImportSourceTable({
  sources,
  onAddSource,
  onChange,
  onChoosePrimaryFolder,
  onChooseHighlightFolder,
  onChangeAction,
  onDisableKeepImport,
  onDeleteSource,
  onPreviewKeepImport
}: {
  sources: DraftImportSource[];
  onAddSource: () => void;
  onChange: (sourceId: string, field: DraftImportSourceField, value: string) => void;
  onChoosePrimaryFolder: (sourceId: string) => void;
  onChooseHighlightFolder: (sourceId: string) => void;
  onChangeAction: (sourceId: string, value: string) => void;
  onDisableKeepImport: (sourceId: string) => void;
  onDeleteSource: (sourceId: string) => void;
  onPreviewKeepImport: (sourceId: string) => void;
}) {
  const actions = {
    onChange,
    onChangeAction,
    onChooseHighlightFolder,
    onChoosePrimaryFolder,
    onDeleteSource,
    onDisableKeepImport,
    onPreviewKeepImport
  };

  return (
    <div className={settingsActionTableClassName()} role="table" aria-label="Watch folders">
      <TableHeader />
      <ImportSourceRows actions={actions} sources={sources} />
      <AddSourceRow onAddSource={onAddSource} />
    </div>
  );
}
