import { useRef } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
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
  const t = useTranslation();
  return (
    <div className={settingsActionTableHeaderClassName(TABLE_COLUMNS)}>
      <span>{t('desktop.importSource.table.original')}</span>
      <span>{t('desktop.importSource.table.highlight')}</span>
      <span>{t('desktop.importSource.table.mode')}</span>
      <span>{t('desktop.importSource.table.handling')}</span>
      <span>{t('desktop.importSource.table.preview')}</span>
      <span className="text-right">{t('desktop.importSource.table.action')}</span>
    </div>
  );
}

function SourceGroupHeader({ source }: { source: DraftImportSource }) {
  const t = useTranslation();
  const label = source.ownership?.ownerDeviceName ??
    (source.ownership?.ownerInstallationId === null
      ? t('desktop.importSource.unassignedGroup')
      : t('desktop.importSource.thisDevice'));
  return <div className="border-t border-settings-border px-3 py-1.5 text-xs font-medium text-settings-muted" role="row">
    {label}
  </div>;
}

function sourceGroupKey(source: DraftImportSource) {
  return source.ownership?.ownerInstallationId ??
    (source.ownership ? 'unassigned' : 'local-draft');
}

function renderSourceRows(sources: DraftImportSource[], actions: ImportSourceTableRowActions) {
  let previousGroup = '';
  return sources.flatMap((source) => {
    const group = sourceGroupKey(source);
    const header = group === previousGroup ? [] : [<SourceGroupHeader key={`group-${group}`} source={source} />];
    previousGroup = group;
    return [...header, <SourceRow key={source.id} source={source} {...actions} />];
  });
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
        estimateSize={(index) => IMPORT_SOURCE_ROW_VIRTUAL_SIZE +
          (index === 0 || sourceGroupKey(sources[index]!) !== sourceGroupKey(sources[index - 1]!) ? 28 : 0)}
        getItemKey={(source) => source.id}
        items={sources}
        renderItem={(source, meta) => <>
          {meta.index === 0 || sourceGroupKey(source) !== sourceGroupKey(sources[meta.index - 1]!)
            ? <SourceGroupHeader source={source} />
            : null}
          <SourceRow source={source} {...actions} />
        </>}
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
  onClaimSource,
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
  onClaimSource: (sourceId: string) => void;
  onChoosePrimaryFolder: (sourceId: string) => void;
  onChooseHighlightFolder: (sourceId: string) => void;
  onChangeAction: (sourceId: string, value: string) => void;
  onDisableKeepImport: (sourceId: string) => void;
  onDeleteSource: (sourceId: string) => void;
  onPreviewKeepImport: (sourceId: string) => void;
}) {
  const t = useTranslation();
  const actions = {
    onChange,
    onClaimSource,
    onChangeAction,
    onChooseHighlightFolder,
    onChoosePrimaryFolder,
    onDeleteSource,
    onDisableKeepImport,
    onPreviewKeepImport
  };

  return (
    <div className={settingsActionTableClassName()} role="table" aria-label={t('desktop.importSource.table.aria')}>
      <TableHeader />
      <ImportSourceRows actions={actions} sources={sources} />
      <AddSourceRow onAddSource={onAddSource} />
    </div>
  );
}
