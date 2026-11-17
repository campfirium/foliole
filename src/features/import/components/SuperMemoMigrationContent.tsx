import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { AppDialogBody } from '../../../shared/ui';

import { SuperMemoConfirmMigration } from './SuperMemoConfirmMigration';
import { SuperMemoEntryPreview, type useSuperMemoPreviewNavigation } from './SuperMemoEntryPreview';
import { SuperMemoGradesPage } from './SuperMemoGradeSettings';
import { SuperMemoLoadPage } from './SuperMemoLoadPage';
import { superMemoMigrationStepLabel, type SuperMemoMigrationStep } from './SuperMemoMigrationSteps';
import { SuperMemoSchedulePage } from './SuperMemoSchedulePage';
import { SuperMemoSourcePage } from './SuperMemoSourcePage';
import type { useSuperMemoDraft } from './useSuperMemoDraft';

export function SuperMemoMigrationContent({ model, current, selected, navigation, onLoad, onLoadNew, onSelect }: {
  model: ReturnType<typeof useSuperMemoDraft>; current: SuperMemoMigrationStep; selected: number[];
  navigation: ReturnType<typeof useSuperMemoPreviewNavigation>;
  onLoad(): void; onLoadNew(): void; onSelect(ids: number[]): void;
}) {
  const t = useTranslation();
  const { draft, busy, result, percent, setPercent, gradeMap, changeGrades, sourceFormat, changeSourceFormat } = model;
  const preview = draft?.preview;
  return (
    <AppDialogBody className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 sm:px-6">
      {!preview || current === 'load' || current === 'structure' || current === 'confirm' ? (
        <h3 className="text-base font-semibold">{t(superMemoMigrationStepLabel(current))}</h3>
      ) : null}
      {busy ? <p role="status">{t('desktop.superMemoDrafts.loading')}</p> : null}
      {current === 'load' ? <SuperMemoLoadPage {...{ model, onLoad, onLoadNew }} /> : null}
      {current !== 'load' && !preview && !busy && !result ? <p>{t('desktop.superMemoDrafts.description')}</p> : null}
      {current === 'structure' && preview ? (
        <div className="min-h-0 flex-1"><SuperMemoEntryPreview navigation={navigation} preview={preview} elements={draft?.elements} /></div>
      ) : null}
      {preview && current === 'schedule' ? (
        <SuperMemoSchedulePage {...{ preview, percent, setPercent, busy }} />
      ) : null}
      {current === 'grades' && preview ? (
        <SuperMemoGradesPage preview={preview} percent={percent} disabled={busy} value={gradeMap}
          onChange={next => void changeGrades(next)} />
      ) : null}
      {current === 'source' && draft ? (
        <SuperMemoSourcePage preview={draft.preview} elements={draft.elements} value={sourceFormat} disabled={busy}
          onChange={changeSourceFormat} />
      ) : null}
      {current === 'confirm' ? <SuperMemoConfirmMigration model={model} selected={selected} onSelect={onSelect} /> : null}
    </AppDialogBody>
  );
}
