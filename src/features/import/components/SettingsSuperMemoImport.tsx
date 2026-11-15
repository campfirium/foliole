import { useRef, useState } from 'react';

import type { SuperMemoGradeMap } from '../../../../lib/core/import/superMemoSchedulePreview';
import { DEFAULT_SUPER_MEMO_SOURCE_FORMAT, type SuperMemoSourceFormat } from '../../../../lib/core/import/superMemoSourceFormatting';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { loadSuperMemoGradeMap, previewRuntimeSuperMemoImport, runRuntimeSuperMemoImport,
  saveSuperMemoGradeMap, selectRuntimeSuperMemoCollection } from '../../../shared/platform/import/superMemoImportRuntimeRepository';
import {
  AppButton, AppDialog, AppDialogActions, AppDialogBody, AppDialogContent, AppDialogDescription,
  AppDialogOverlay, AppDialogPortal, AppDialogTitle, SettingsControlSlot, SettingsRow
} from '../../../shared/ui';

import { SuperMemoBatchAdjustments } from './SuperMemoBatchAdjustments';
import { SuperMemoDraftTable } from './SuperMemoDraftTable';
import { SuperMemoEntryPreview } from './SuperMemoEntryPreview';
import { SuperMemoGradeSettings } from './SuperMemoGradeSettings';
import { SuperMemoPreviewOptionFields } from './SuperMemoPreviewOptions';
import { SuperMemoSourceSettings } from './SuperMemoSourceSettings';

async function refreshSourceFormat(apply: () => Promise<void>, setBusy: (value: boolean) => void,
  setError: (value: boolean) => void) {
  setBusy(true);
  setError(false);
  try {
    await apply();
  } catch {
    setError(true);
  } finally {
    setBusy(false);
  }
}

function useSuperMemoDraft(initialGrades: SuperMemoGradeMap) {
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Awaited<ReturnType<typeof previewRuntimeSuperMemoImport>>>();
  const [gradeMap, setGradeMap] = useState(initialGrades);
  const [sourceFormat, setSourceFormat] = useState(DEFAULT_SUPER_MEMO_SOURCE_FORMAT);
  const [percent, setPercent] = useState(0);
  const [sourceFile, setSourceFile] = useState<File>();
  const [directory, setDirectory] = useState<string>();
  const [result, setResult] = useState<{ imported: number; skipped: number; unresolvedImages: number }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function loadFile(file: File, pairCollection = false) {
    setBusy(true);
    setError(false);
    try {
      const directory = pairCollection ? await selectRuntimeSuperMemoCollection() : undefined;
      if (directory === null) return;
      setDraft(await previewRuntimeSuperMemoImport(file, directory, gradeMap, sourceFormat));
      setSourceFile(file);
      setDirectory(directory);
      setResult(undefined);
      setPercent(0);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function changeGrades(next: SuperMemoGradeMap) {
    setBusy(true);
    setError(false);
    try {
      const nextPreview = sourceFile && !result ? await previewRuntimeSuperMemoImport(sourceFile, directory, next, sourceFormat) : undefined;
      await saveSuperMemoGradeMap(next);
      setGradeMap(next);
      if (nextPreview) setDraft(nextPreview);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const changeSourceFormat = (next: SuperMemoSourceFormat) => refreshSourceFormat(async () => {
    if (sourceFile && !result) setDraft(await previewRuntimeSuperMemoImport(sourceFile, directory, gradeMap, next));
    setSourceFormat(next);
  }, setBusy, setError);

  async function importSource() {
    if (!sourceFile || !draft?.preview.previewSignature) return;
    setBusy(true);
    setError(false);
    try {
      setResult(await runRuntimeSuperMemoImport(sourceFile, percent, directory, gradeMap, draft.preview.previewSignature, sourceFormat));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return { input, draft, percent, setPercent, sourceFile, busy, error, result, gradeMap, changeGrades, sourceFormat, changeSourceFormat, loadFile, importSource };
}

function SuperMemoDraftDialog({ close, initialGrades }: { close: () => void; initialGrades: SuperMemoGradeMap }) {
  const t = useTranslation();
  const { input, draft, percent, setPercent, sourceFile, busy, error, result, gradeMap, changeGrades, sourceFormat, changeSourceFormat, loadFile, importSource } = useSuperMemoDraft(initialGrades);
  const [parameters, setParameters] = useState(false);
  const preview = draft?.preview;
  const showParameters = Boolean(preview && !result && parameters);
  return (
    <AppDialog open onOpenChange={open => { if (!open && !busy) close(); }}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent layout="task" className="max-h-[calc(100dvh-32px)] w-[min(1120px,calc(100vw-32px))]">
          <AppDialogTitle>{t('desktop.superMemoDrafts.title')}</AppDialogTitle>
          <AppDialogBody className="flex min-h-0 flex-col gap-3 overflow-y-auto">
            <AppDialogDescription className={preview ? 'sr-only' : undefined}>{t('desktop.superMemoDrafts.description')}</AppDialogDescription>
            <input accept=".xml,application/xml,text/xml" hidden ref={input} type="file" onChange={event => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) void loadFile(file);
            }} />
            <div className={parameters ? 'hidden' : 'flex shrink-0 flex-wrap items-center gap-2'}>
              <AppButton disabled={busy} onClick={() => input.current?.click()}>{t('desktop.superMemoDrafts.chooseXml')}</AppButton>
              {sourceFile ? <AppButton disabled={busy} onClick={() => void loadFile(sourceFile, true)}>
                {t('desktop.superMemoDrafts.chooseCollection')}
              </AppButton> : null}
              <span className="break-all text-sm">{sourceFile?.name}</span>
            </div>
            {error ? <p className="text-sm text-destructive" role="alert">{t('desktop.superMemoDrafts.importFailed')}</p> : null}
            {busy ? <p role="status">{t('desktop.superMemoDrafts.loading')}</p> : null}
            {preview && !result ? <p className="text-sm text-foreground/70">
              {t(preview.pairedCollection ? 'desktop.superMemoDrafts.pairedLimitations' : 'desktop.superMemoDrafts.xmlLimitations')}
            </p> : null}
            {draft && !result ? <div hidden={parameters}><SuperMemoEntryPreview key={sourceFile?.name} {...draft} /></div> : null}
            {parameters && preview && !result ? <>
              <SuperMemoSourceSettings value={sourceFormat} onChange={next => void changeSourceFormat(next)}
                disabled={busy} example={preview?.rows.find(row => row.sourceExample)?.sourceExample} />
              <SuperMemoGradeSettings disabled={busy} value={gradeMap} onChange={next => void changeGrades(next)} />
              <SuperMemoPreviewOptionFields percent={percent} onChange={setPercent} />
              <SuperMemoDraftTable preview={preview} percent={percent} />
            </> : null}
            {!preview && !busy ? <SuperMemoBatchAdjustments /> : null}
            {result ? <p role="status">{t('desktop.superMemoDrafts.importResult', result)}</p> : null}
          </AppDialogBody>
          <AppDialogActions>
            {showParameters ? <>
              <AppButton disabled={busy} variant="ghost" onClick={() => setParameters(false)}>
                {t('desktop.superMemoDrafts.backToPreview')}
              </AppButton>
              <AppButton disabled={busy} onClick={() => void importSource()}>
                {t('desktop.superMemoDrafts.import')}
              </AppButton>
            </> : preview && !result ? (
              <AppButton disabled={busy} onClick={() => setParameters(true)}>{t('desktop.superMemoDrafts.parameters')}</AppButton>
            ) : null}
            <AppButton disabled={busy} onClick={close} variant="ghost">{t('desktop.superMemoDrafts.close')}</AppButton>
          </AppDialogActions>
        </AppDialogContent>
      </AppDialogPortal>
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
