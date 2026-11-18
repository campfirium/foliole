import { useMemo } from 'react';

import { applySuperMemoStructure } from '../../../../lib/core/import/superMemoImportStructure';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { SettingsButton } from '../../../shared/ui';

import { SuperMemoBatchAdjustments } from './SuperMemoBatchAdjustments';
import { SuperMemoConfirmMigration } from './SuperMemoConfirmMigration';
import type { useSuperMemoPreviewNavigation } from './SuperMemoEntryPreview';
import { SuperMemoGradesPage } from './SuperMemoGradeSettings';
import { SuperMemoLoadPage } from './SuperMemoLoadPage';
import { superMemoMigrationStepLabel, type SuperMemoMigrationStep } from './SuperMemoMigrationSteps';
import { SuperMemoPreviewOptionFields } from './SuperMemoPreviewOptions';
import { SuperMemoSchedulePage } from './SuperMemoSchedulePage';
import { SuperMemoSourcePage } from './SuperMemoSourcePage';
import { SuperMemoStructurePage } from './SuperMemoStructurePage';
import type { useSuperMemoDraft } from './useSuperMemoDraft';

export function SuperMemoMigrationContent({ model, current, selected, navigation, onLoad, onLoadNew, openingPreview, onSelect }: {
  model: ReturnType<typeof useSuperMemoDraft>; current: SuperMemoMigrationStep; selected: number[];
  navigation: ReturnType<typeof useSuperMemoPreviewNavigation>;
  onLoad(): void; onLoadNew(): void; openingPreview: boolean; onSelect(ids: number[]): void;
}) {
  const t = useTranslation();
  const { draft, busy, result, percent, setPercent, gradeMap, changeGrades, sourceFormat, changeSourceFormat } = model;
  const preview = draft?.preview;
  const selection = model.selection;
  const previewStep = current === 'structure' || current === 'confirm';
  const needsReload = previewStep && !preview && !result && selection?.hasDraft === false;
  const hasMovedEntries = useMemo(() => current === 'confirm' && draft && !result && !draft.preview.directoryUpdate &&
    applySuperMemoStructure(draft.preview.rows, draft.elements, draft.folderChoices).some(row =>
      row.structure && row.outcome !== 'skipped' && row.structure.parentId !== row.parentId), [current, draft, result]);
  return (
    <div className="flex min-w-0 flex-col gap-4 px-settings-panel-x">
      <h3 className="shrink-0 text-ui-lg font-semibold">{t(
        current === 'schedule' ? 'desktop.superMemoDrafts.scheduleTitle' :
          current === 'grades' ? 'desktop.superMemoDrafts.gradeMapping' : superMemoMigrationStepLabel(current)
      )}</h3>
      {current === 'load' ? <SuperMemoLoadPage {...{ model, onLoad, onLoadNew }} /> : null}
      {busy && (!openingPreview || previewStep) ? <p role="status">{t('desktop.superMemoDrafts.loading')}</p> : null}
      {needsReload && !busy ? (
        <div className="space-y-3 text-sm">
          <p>{t('desktop.superMemoDrafts.createSavedDraft')}</p>
          <SettingsButton onClick={onLoad}>{t('desktop.superMemoDrafts.reloadSource')}</SettingsButton>
        </div>
      ) : null}
      {current !== 'load' && !preview && !busy && !result && !selection ? <p>{t('desktop.superMemoDrafts.description')}</p> : null}
      {current === 'structure' && draft ? (
        <SuperMemoStructurePage preview={draft.preview} elements={draft.elements}
          navigation={navigation} busy={busy} onChange={model.changeFolder} />
      ) : null}
      {current === 'grades' && selection ? (
        <SuperMemoGradesPage preview={preview} percent={percent} disabled={busy} value={gradeMap}
          onChange={next => void changeGrades(next)} />
      ) : null}
      {preview && current === 'schedule' ? (
        <SuperMemoSchedulePage {...{ preview, percent, setPercent, busy }} />
      ) : null}
      {!preview && selection && current === 'schedule' ? (
        selection.panel?.batchId
          ? <SuperMemoBatchAdjustments preferredBatchId={selection.panel.batchId} />
          : <SuperMemoPreviewOptionFields compact percent={percent} onChange={setPercent} disabled={busy} />
      ) : null}
      {current === 'source' && selection ? (
        <SuperMemoSourcePage preview={preview} elements={draft?.elements} value={sourceFormat} disabled={busy}
          onChange={changeSourceFormat} />
      ) : null}
      {hasMovedEntries ? (
        <p role="note" className="text-sm">{t('desktop.superMemoDrafts.structureConfirmNotice')}</p>
      ) : null}
      {current === 'confirm' ? <SuperMemoConfirmMigration model={model} selected={selected} onSelect={onSelect} /> : null}
    </div>
  );
}
