import { useRef, useState } from 'react';

import type { NativeSuperMemoPreview } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { previewRuntimeSuperMemoImport, runRuntimeSuperMemoImport, selectRuntimeSuperMemoCollection } from '../../../shared/platform/import/superMemoImportRuntimeRepository';
import {
  AppButton, AppDialog, AppDialogActions, AppDialogBody, AppDialogContent, AppDialogDescription,
  AppDialogOverlay, AppDialogPortal, AppDialogTitle, SettingsControlSlot, SettingsRow
} from '../../../shared/ui';

import { SuperMemoBatchAdjustments } from './SuperMemoBatchAdjustments';
import { SuperMemoDraftTable } from './SuperMemoDraftTable';
import { SuperMemoPreviewOptionFields } from './SuperMemoPreviewOptions';

function useSuperMemoDraft() {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<NativeSuperMemoPreview>();
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
      setPreview(await previewRuntimeSuperMemoImport(file, directory));
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

  async function importSource() {
    if (!sourceFile) return;
    setBusy(true);
    setError(false);
    try {
      setResult(await runRuntimeSuperMemoImport(sourceFile, percent, directory));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return { input, preview, percent, setPercent, sourceFile, busy, error, result, loadFile, importSource };
}

function SuperMemoDraftDialog({ close }: { close: () => void }) {
  const t = useTranslation();
  const { input, preview, percent, setPercent, sourceFile, busy, error, result, loadFile, importSource } = useSuperMemoDraft();
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
  const [open, setOpen] = useState(false);
  return (
    <SettingsRow title={t('desktop.superMemoDrafts.title')}>
      <SettingsControlSlot>
        <AppButton onClick={() => setOpen(true)}>{t('desktop.superMemoDrafts.open')}</AppButton>
      </SettingsControlSlot>
      {open ? <SuperMemoDraftDialog close={() => setOpen(false)} /> : null}
    </SettingsRow>
  );
}
