import { X } from 'lucide-react';
import { useId, useState } from 'react';

import type { SuperMemoGradeMap } from '../../../../lib/core/import/superMemoSchedulePreview';
import type { SuperMemoSourceFormat } from '../../../../lib/core/import/superMemoSourceFormatting';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { loadSuperMemoGradeMap } from '../../../shared/platform/import/superMemoImportRuntimeRepository';
import {
  AppButton, AppDialog, AppDialogBody, AppDialogClose, AppDialogContent, AppDialogDescription,
  AppDialogOverlay, AppDialogPortal, AppDialogTitle, SettingsControlSlot, SettingsRow
} from '../../../shared/ui';
import { useDismissibleSurface } from '../../../shared/ui/useDismissibleSurface';

import { SuperMemoBatchAdjustments } from './SuperMemoBatchAdjustments';
import { SuperMemoDirectoryUpdate, SuperMemoResult } from './SuperMemoDirectoryUpdate';
import { SuperMemoDraftActions } from './SuperMemoDraftActions';
import { SuperMemoDraftTable } from './SuperMemoDraftTable';
import { SuperMemoEntryPreview } from './SuperMemoEntryPreview';
import { SuperMemoGradeSettings } from './SuperMemoGradeSettings';
import { SuperMemoLoadNotice } from './SuperMemoLoadNotice';
import { SuperMemoPreviewOptionFields } from './SuperMemoPreviewOptions';
import { SuperMemoSourceSettings } from './SuperMemoSourceSettings';
import { SuperMemoWithdrawals } from './SuperMemoWithdrawals';
import { useSuperMemoDraft } from './useSuperMemoDraft';

function SuperMemoParameters({ preview, percent, setPercent, gradeMap, changeGrades, sourceFormat, changeSourceFormat, busy }: {
  preview: NonNullable<ReturnType<typeof useSuperMemoDraft>['draft']>['preview'];
  percent: number; setPercent(value: number): void; gradeMap: SuperMemoGradeMap;
  changeGrades(value: SuperMemoGradeMap): Promise<void>; sourceFormat: SuperMemoSourceFormat;
  changeSourceFormat(value: SuperMemoSourceFormat): Promise<void>; busy: boolean;
}) {
  const t = useTranslation();
  return (<div className="grid gap-4">
    <p className="rounded-md bg-foreground/5 px-3 py-2 text-sm text-foreground/70">
      {t('desktop.superMemoDrafts.reapplyNote')}
    </p>
    <div className="grid items-start gap-4 min-[850px]:grid-cols-[3fr_2fr]">
      <section className="grid gap-3 rounded-lg border border-foreground/15 p-4">
        <h3 className="text-sm font-medium">{t('desktop.superMemoDrafts.scheduleTitle')}</h3>
        <SuperMemoPreviewOptionFields percent={percent} onChange={setPercent} />
        <SuperMemoDraftTable preview={preview} percent={percent} />
        <p className="text-xs text-foreground/65">
          {t(preview.pairedCollection ? 'desktop.superMemoDrafts.pairedLimitations' : 'desktop.superMemoDrafts.xmlLimitations')}
        </p>
      </section>
      <SuperMemoGradeSettings disabled={busy} value={gradeMap} onChange={next => void changeGrades(next)}
        hasPairedCollection={preview.pairedCollection === true} />
    </div>
    <SuperMemoSourceSettings value={sourceFormat} onChange={next => void changeSourceFormat(next)} disabled={busy} />
  </div>);
}

function DraftSourcePicker({ disabled, onLoad }: { disabled: boolean; onLoad(): void }) {
  const t = useTranslation();
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-foreground/15 px-4 py-3">
    <div className="min-w-0">
      <h2 className="text-sm font-semibold">{t('desktop.superMemoDrafts.sourceTitle')}</h2>
      <p className="mt-1 max-w-prose text-sm text-foreground/70">{t('desktop.superMemoDrafts.prepareSource')}</p>
    </div>
    <AppButton disabled={disabled} onClick={onLoad}>{t('desktop.superMemoDrafts.loadSource')}</AppButton>
  </div>;
}

function DraftHeader({ titleId, name, disabled, onReload, onLoadNew }: {
  titleId: string; name: string | undefined; disabled: boolean; onReload(): void; onLoadNew?: (() => void) | undefined;
}) {
  const t = useTranslation();
  return (
    <AppDialogTitle asChild className="flex-wrap gap-x-3 gap-y-1">
      <header>
        <h2 id={titleId} className="shrink-0">{t('desktop.superMemoDrafts.title')}</h2>
        {name ? <span title={name} className="min-w-0 flex-1 truncate text-sm text-foreground/70">{name}</span> : null}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {name ? <AppButton size="sm" disabled={disabled} onClick={onReload}>{t('desktop.superMemoDrafts.reloadSource')}</AppButton> : null}
          {onLoadNew ? <AppButton size="sm" disabled={disabled} onClick={onLoadNew}>{t('desktop.superMemoDrafts.loadNewExport')}</AppButton> : null}
          {!name ? <AppDialogClose asChild>
            <AppButton size="sm" variant="ghost" disabled={disabled} aria-label={t('desktop.superMemoDrafts.close')}>
              <X aria-hidden className="size-4" />
            </AppButton>
          </AppDialogClose> : null}
        </div>
      </header>
    </AppDialogTitle>
  );
}

function useSuperMemoDraftNavigation(
  { busy, error, setError, result }: Pick<ReturnType<typeof useSuperMemoDraft>, 'busy' | 'error' | 'setError' | 'result'>,
  close: () => void
) {
  const [parameters, setParameters] = useState(false);
  const [selection, setSelection] = useState<{ signature: string; ids: number[] }>();

  function backToPreview() {
    setParameters(false);
    setSelection(undefined);
  }

  function dismissDialog() {
    if (busy) return;
    close();
  }

  useDismissibleSurface({
    onDismiss: () => {
      if (error) setError(false);
      else if (!busy && parameters && !result) backToPreview();
      else dismissDialog();
    }
  });

  return { parameters, setParameters, selection, setSelection, backToPreview, dismissDialog };
}

function SuperMemoDraftDialog({ close, initialGrades }: { close: () => void; initialGrades: SuperMemoGradeMap }) {
  const t = useTranslation();
  const titleId = useId();
  const model = useSuperMemoDraft(initialGrades, t('desktop.superMemoDrafts.collectionPickerTitle'));
  const { draft, percent, setPercent, source, busy, error, setError, result, gradeMap, changeGrades, sourceFormat, changeSourceFormat, loadSource, importSource } = model;
  const { parameters, setParameters, selection, setSelection, backToPreview, dismissDialog } = useSuperMemoDraftNavigation(model, close);
  const preview = draft?.preview;
  const update = preview?.directoryUpdate;
  const showSource = (!parameters || update) && !result;
  const reloadSource = () => { setSelection(undefined); void loadSource(); };
  const selected = selection && selection.signature === update?.signature ? selection.ids : [];
  return (
    <AppDialog open onOpenChange={open => { if (!open) dismissDialog(); }}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent layout="task" aria-labelledby={titleId} className="max-h-[calc(100dvh-32px)] w-[min(1120px,calc(100vw-32px))]">
          <DraftHeader titleId={titleId} name={showSource ? source?.name : undefined} disabled={busy} onReload={reloadSource}
            onLoadNew={showSource && update ? () => { setParameters(true); setSelection(undefined); void loadSource(true); } : undefined} />
          <AppDialogDescription className="sr-only">
            {t('desktop.superMemoDrafts.description')}
          </AppDialogDescription>
          <AppDialogBody className="flex min-h-0 flex-col gap-3 overflow-y-auto">
            {showSource && !source ? <DraftSourcePicker disabled={busy} onLoad={reloadSource} /> : null}
            {busy ? <p role="status">{t('desktop.superMemoDrafts.loading')}</p> : null}
            {!result && !update ? <div hidden={parameters}><SuperMemoEntryPreview key={source?.filePath} preview={preview} elements={draft?.elements} /></div> : null}
            {parameters && preview && !result && !update ? (
              <SuperMemoParameters preview={preview} {...{ percent, setPercent, gradeMap, changeGrades, sourceFormat, changeSourceFormat, busy }} />
            ) : null}
            {!preview && !busy ? <SuperMemoBatchAdjustments /> : null}
            {update && !parameters && !result ? <p>{t('desktop.superMemoDrafts.existingBatch')}</p> : null}
            {update && parameters && !result ? <SuperMemoDirectoryUpdate update={update} sourceFormat={sourceFormat} disabled={busy}
              onSourceFormatChange={next => void changeSourceFormat(next)} /> : null}
            {update && parameters && !result ? <SuperMemoWithdrawals candidates={update.withdrawals} selected={selected}
              disabled={busy} onChange={ids => setSelection({ signature: update.signature, ids })} /> : null}
            {result ? <SuperMemoResult result={result} /> : null}
          </AppDialogBody>
          <SuperMemoDraftActions
            busy={busy} canConvert={Boolean(preview && !result)} parameters={parameters}
            showPreviewFooter={!parameters && !update && !result}
            directoryUpdate={update ? { canConfirm: (!update.pairedSourceRequired && update.sourceMatch?.linkOnConfirm === true) || selected.length > 0 || update.changes.some(change => change.status === 'move' || change.status === 'anchor' || change.status === 'add') ||
              update.citationChanges.some(change => change.status === 'update') || update.textChanges.some(change => change.status === 'update') ||
              update.firstReviewChanges.some(change => change.status === 'update' || change.status === 'basis') } : undefined}
            backToPreview={backToPreview}
            openParameters={() => setParameters(true)} convert={() => void importSource(selected)}
          />
        </AppDialogContent>
      </AppDialogPortal>
      <SuperMemoLoadNotice error={error} busy={busy} candidates={model.candidates} onClose={() => setError(false)}
        recover={choose => void model.recoverCollection(choose)} retry={() => void model.retrySource()} />
    </AppDialog>
  );
}

export function SettingsSuperMemoImport() {
  const t = useTranslation();
  const [grades, setGrades] = useState<SuperMemoGradeMap>();
  return (
    <SettingsRow title={t('settings.general.dataMigration.superMemo')}>
      <SettingsControlSlot>
        <AppButton onClick={() => void loadSuperMemoGradeMap().then(setGrades)}>{t('desktop.superMemoDrafts.open')}</AppButton>
      </SettingsControlSlot>
      {grades ? <SuperMemoDraftDialog initialGrades={grades} close={() => setGrades(undefined)} /> : null}
    </SettingsRow>
  );
}
