import { useRef, useState } from 'react';

import type { SuperMemoGradeMap } from '../../../../lib/core/import/superMemoSchedulePreview';
import type { NativeSuperMemoPreview } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { loadSuperMemoGradeMap, previewRuntimeSuperMemoImport, runRuntimeSuperMemoImport,
  saveSuperMemoGradeMap, selectRuntimeSuperMemoCollection } from '../../../shared/platform/import/superMemoImportRuntimeRepository';
import {
  AppButton, AppDialog, AppDialogActions, AppDialogBody, AppDialogContent, AppDialogDescription,
  AppDialogOverlay, AppDialogPortal, AppDialogTitle, SettingsControlSlot, SettingsRow
} from '../../../shared/ui';

import { SuperMemoBatchAdjustments } from './SuperMemoBatchAdjustments';
import { SuperMemoDraftTable } from './SuperMemoDraftTable';
import { SuperMemoGradeSettings } from './SuperMemoGradeSettings';
import { SuperMemoPreviewOptionFields } from './SuperMemoPreviewOptions';

function useSuperMemoDraft(initialGrades: SuperMemoGradeMap) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<NativeSuperMemoPreview>();
  const [gradeMap, setGradeMap] = useState(initialGrades);
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
      setPreview(await previewRuntimeSuperMemoImport(file, directory, gradeMap));
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
      const nextPreview = sourceFile && !result ? await previewRuntimeSuperMemoImport(sourceFile, directory, next) : undefined;
      await saveSuperMemoGradeMap(next);
      setGradeMap(next);
      if (nextPreview) setPreview(nextPreview);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function importSource() {
    if (!sourceFile || !preview?.previewSignature) return;
    setBusy(true);
    setError(false);
    try {
      setResult(await runRuntimeSuperMemoImport(sourceFile, percent, directory, gradeMap, preview.previewSignature));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return { input, preview, percent, setPercent, sourceFile, busy, error, result, gradeMap, changeGrades, loadFile, importSource };
}

function SuperMemoDraftDialog({ close, initialGrades }: { close: () => void; initialGrades: SuperMemoGradeMap }) {
  const t = useTranslation();
  const { input, preview, percent, setPercent, sourceFile, busy, error, result, gradeMap, changeGrades, loadFile, importSource } = useSuperMemoDraft(initialGrades);
  return (
    <AppDialog open onOpenChange={open => { if (!open && !busy) close(); }}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent layout="task" className="max-h-[calc(100dvh-32px)] w-[min(800px,calc(100vw-32px))]">
          <AppDialogTitle>{t('desktop.superMemoDrafts.title')}</AppDialogTitle>
          <AppDialogBody className="flex min-h-0 flex-col gap-3">
            <AppDialogDescription>{t('desktop.superMemoDrafts.description')}</AppDialogDescription>
            <input accept=".xml,application/xml,text/xml" hidden ref={input} type="file" onChange={event => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) void loadFile(file);
            }} />
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <AppButton disabled={busy} onClick={() => input.current?.click()}>{t('desktop.superMemoDrafts.chooseXml')}</AppButton>
              {sourceFile ? <AppButton disabled={busy} onClick={() => void loadFile(sourceFile, true)}>
                {t('desktop.superMemoDrafts.chooseCollection')}
              </AppButton> : null}
              <span className="break-all text-sm">{sourceFile?.name}</span>
            </div>
            {error ? <p className="text-sm text-destructive" role="alert">{t('desktop.superMemoDrafts.importFailed')}</p> : null}
            {busy ? <p role="status">{t('desktop.superMemoDrafts.loading')}</p> : null}
            <SuperMemoGradeSettings disabled={busy} value={gradeMap} onChange={next => void changeGrades(next)} />
            {!preview && !busy ? <SuperMemoBatchAdjustments /> : null}
            {result ? <p role="status">{t('desktop.superMemoDrafts.importResult', result)}</p> : null}
            {!busy && preview && !result ? <>
              <SuperMemoPreviewOptionFields percent={percent} onChange={setPercent} />
              <SuperMemoDraftTable preview={preview} percent={percent} />
            </> : null}
          </AppDialogBody>
          <AppDialogActions>
            {preview && !result ? <AppButton disabled={busy} onClick={() => void importSource()}>
              {t('desktop.superMemoDrafts.import')}
            </AppButton> : null}
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
    <SettingsRow title={t('desktop.superMemoDrafts.title')}>
      <SettingsControlSlot>
        <AppButton onClick={() => void loadSuperMemoGradeMap().then(setGrades)}>{t('desktop.superMemoDrafts.open')}</AppButton>
      </SettingsControlSlot>
      {grades ? <SuperMemoDraftDialog initialGrades={grades} close={() => setGrades(undefined)} /> : null}
    </SettingsRow>
  );
}
