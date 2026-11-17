import { X } from 'lucide-react';
import { createContext, type ReactNode, useContext, useId, useState } from 'react';

import type { SuperMemoGradeMap } from '../../../../lib/core/import/superMemoSchedulePreview';
import type { NativeSuperMemoDirectoryUpdate } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { loadSuperMemoGradeMap } from '../../../shared/platform/import/superMemoImportRuntimeRepository';
import {
  AppButton, AppDialog, AppDialogBody, AppDialogClose, AppDialogContent,
  AppDialogOverlay, AppDialogPortal, AppDialogTitle, SettingsControlSlot, SettingsRow
} from '../../../shared/ui';
import { settingsDialogBounds } from '../../../shared/ui/settingsDialogBounds';
import { useDismissibleSurface } from '../../../shared/ui/useDismissibleSurface';

import { SuperMemoBatchAdjustments } from './SuperMemoBatchAdjustments';
import { SuperMemoDirectoryUpdate, SuperMemoResult } from './SuperMemoDirectoryUpdate';
import { SuperMemoDraftActions } from './SuperMemoDraftActions';
import { SuperMemoEntryPreview, useSuperMemoPreviewNavigation } from './SuperMemoEntryPreview';
import { SuperMemoLoadNotice } from './SuperMemoLoadNotice';
import { SuperMemoParameters } from './SuperMemoParameters';
import { SuperMemoWithdrawals } from './SuperMemoWithdrawals';
import { useSuperMemoDraft } from './useSuperMemoDraft';

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
          <AppDialogClose asChild>
            <AppButton size="sm" variant="ghost" disabled={disabled} aria-label={t('desktop.superMemoDrafts.close')}>
              <X aria-hidden className="size-4" />
            </AppButton>
          </AppDialogClose>
        </div>
      </header>
    </AppDialogTitle>
  );
}

function useSuperMemoDraftNavigation(
  { busy, error, setError }: Pick<ReturnType<typeof useSuperMemoDraft>, 'busy' | 'error' | 'setError'>,
  open: boolean, close: () => void
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
    enabled: open,
    onDismiss: () => {
      if (error) setError(false);
      else dismissDialog();
    }
  });

  return { parameters, setParameters, selection, setSelection, backToPreview, dismissDialog };
}

function canConfirmUpdate(
  update: NativeSuperMemoDirectoryUpdate,
  selected: number[]
) {
  return (!update.pairedSourceRequired && update.sourceMatch?.linkOnConfirm === true) || selected.length > 0 ||
    update.changes.some(change => change.status === 'move' || change.status === 'anchor' || change.status === 'add') ||
    update.citationChanges.some(change => change.status === 'update') || update.textChanges.some(change => change.status === 'update') ||
    update.firstReviewChanges.some(change => change.status === 'update' || change.status === 'basis');
}

function SuperMemoDraftDialog({ open, close, initialGrades, translate }: {
  open: boolean; close(): void; initialGrades: SuperMemoGradeMap; translate: string | undefined;
}) {
  const t = useTranslation();
  const titleId = useId();
  const model = useSuperMemoDraft(initialGrades, t('desktop.superMemoDrafts.collectionPickerTitle'));
  const { draft, percent, setPercent, source, busy, error, setError, result, gradeMap, changeGrades, sourceFormat, changeSourceFormat, loadSource, importSource } = model;
  const { parameters, setParameters, selection, setSelection, backToPreview, dismissDialog } = useSuperMemoDraftNavigation(model, open, closeSession);
  const previewNavigation = useSuperMemoPreviewNavigation(source);
  const preview = draft?.preview;
  const update = preview?.directoryUpdate;
  const showSource = (!parameters || update) && !result;
  function closeSession() {
    if (result) {
      model.resetCompletedDraft();
      backToPreview();
    }
    close();
  }
  const reloadSource = () => { setSelection(undefined); void loadSource(); };
  const selected = selection && selection.signature === update?.signature ? selection.ids : [];
  return (
    <AppDialog open={open} onOpenChange={open => { if (!open) dismissDialog(); }}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent layout="task" aria-labelledby={titleId} aria-describedby={undefined} className={settingsDialogBounds}
          style={translate ? { translate } : undefined} onInteractOutside={event => event.preventDefault()}
          onEscapeKeyDown={event => { if (error || busy) event.preventDefault(); }}>
          <DraftHeader titleId={titleId} name={showSource ? source?.name : undefined} disabled={busy} onReload={reloadSource}
            onLoadNew={showSource && update ? () => { setParameters(true); setSelection(undefined); void loadSource(true); } : undefined} />
          <AppDialogBody className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
            {showSource && !source ? <DraftSourcePicker disabled={busy} onLoad={reloadSource} /> : null}
            {busy ? <p role="status">{t('desktop.superMemoDrafts.loading')}</p> : null}
            {!result && !update ? <div hidden={parameters}><SuperMemoEntryPreview navigation={previewNavigation} preview={preview} elements={draft?.elements} /></div> : null}
            {parameters && preview && !result && !update ? (
              <SuperMemoParameters preview={preview} {...{ percent, setPercent, gradeMap, changeGrades, sourceFormat, changeSourceFormat, busy }} />
            ) : null}
            {!preview && !busy ? <SuperMemoBatchAdjustments /> : null}
            {update && !parameters && !result ? <p>{t('desktop.superMemoDrafts.existingBatch')}</p> : null}
            {update && parameters && !result ? <SuperMemoDirectoryUpdate update={update} sourceFormat={sourceFormat} disabled={busy}
              onSourceFormatChange={changeSourceFormat} /> : null}
            {update && parameters && !result ? <SuperMemoWithdrawals candidates={update.withdrawals} selected={selected}
              disabled={busy} onChange={ids => setSelection({ signature: update.signature, ids })} /> : null}
            {result ? <SuperMemoResult result={result} /> : null}
          </AppDialogBody>
          <SuperMemoDraftActions
            busy={busy} canConvert={Boolean(preview && !result)} parameters={parameters}
            showPreviewFooter={!parameters && !update && !result}
            directoryUpdate={update ? { canConfirm: canConfirmUpdate(update, selected) } : undefined}
            backToPreview={backToPreview}
            openParameters={() => setParameters(true)} convert={() => void importSource(selected)}
          />
        </AppDialogContent>
      </AppDialogPortal>
      <SuperMemoLoadNotice error={open && error} busy={busy} candidates={model.candidates} onClose={() => setError(false)}
        recover={choose => void model.recoverCollection(choose)} retry={() => void model.retrySource()} />
    </AppDialog>
  );
}

const SuperMemoSession = createContext<((translate: string | undefined) => void) | null>(null);

export function SuperMemoSessionProvider({ children, settingsOpen, libraryScope }: {
  children: ReactNode; settingsOpen: boolean; libraryScope?: string | undefined;
}) {
  const [session, setSession] = useState<{
    scope: string | undefined; open: boolean; grades?: SuperMemoGradeMap; translate?: string | undefined;
  }>({ scope: libraryScope, open: false });
  if (session.scope !== libraryScope) setSession({ scope: libraryScope, open: false });

  function launch(translate: string | undefined) {
    if (session.grades) {
      setSession({ ...session, open: true, translate });
      return;
    }
    void loadSuperMemoGradeMap().then(grades => {
      setSession(current => current.scope === libraryScope ? { scope: libraryScope, grades, open: true, translate } : current);
    });
  }

  return (
    <SuperMemoSession.Provider value={launch}>
      {children}
      {session.grades ? <SuperMemoDraftDialog open={settingsOpen && session.open} initialGrades={session.grades}
        close={() => setSession(current => ({ ...current, open: false }))} translate={session.translate} /> : null}
    </SuperMemoSession.Provider>
  );
}

function SuperMemoImportRow() {
  const t = useTranslation();
  const launch = useContext(SuperMemoSession);
  return (
    <SettingsRow title={t('settings.general.dataMigration.superMemo')}>
      <SettingsControlSlot>
        <AppButton onClick={event => {
          launch?.(event.currentTarget.closest<HTMLElement>('[data-settings-root-dialog]')?.style.translate);
        }}>{t('desktop.superMemoDrafts.open')}</AppButton>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

export function SettingsSuperMemoImport() {
  const launch = useContext(SuperMemoSession);
  return launch ? <SuperMemoImportRow /> : (
    <SuperMemoSessionProvider settingsOpen><SuperMemoImportRow /></SuperMemoSessionProvider>
  );
}
