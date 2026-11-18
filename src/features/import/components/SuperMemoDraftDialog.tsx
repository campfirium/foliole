import { X } from 'lucide-react';
import { useEffect, useEffectEvent, useId, useRef, useState } from 'react';

import type { SuperMemoGradeMap } from '../../../../lib/core/import/superMemoSchedulePreview';
import type { NativeSuperMemoDirectoryUpdate } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { checkRuntimeSuperMemoSource } from '../../../shared/platform/import/superMemoImportRuntimeRepository';
import {
  AppButton, AppDialog, AppDialogClose, AppDialogContent,
  AppDialogOverlay, AppDialogPortal, settingsDialogSurfaceClassName
} from '../../../shared/ui';
import { settingsDialogGrid, settingsDialogPane, settingsDialogPaneHeader } from '../../../shared/ui/settingsDialogBounds';
import { useDismissibleSurface } from '../../../shared/ui/useDismissibleSurface';

import { SuperMemoDraftActions } from './SuperMemoDraftActions';
import { useSuperMemoPreviewNavigation } from './SuperMemoEntryPreview';
import { SuperMemoLoadNotice } from './SuperMemoLoadNotice';
import { SuperMemoMigrationContent } from './SuperMemoMigrationContent';
import { SuperMemoMigrationSteps, type SuperMemoMigrationStep } from './SuperMemoMigrationSteps';
import { useSuperMemoDraft } from './useSuperMemoDraft';

function DraftHeader({ name, disabled }: { name: string | undefined; disabled: boolean }) {
  const t = useTranslation();
  return (
    <div className={settingsDialogPaneHeader}>
      <div className="app-scrollbar flex min-w-0 flex-1 items-center gap-3 overflow-hidden px-settings-panel-x [scrollbar-gutter:stable]">
        <span className="min-w-0 flex-1 truncate text-ui-md font-semibold">
          {name ? name.replace(/\.xml$/iu, '') || name : null}
        </span>
        <AppDialogClose asChild>
          <AppButton className="shrink-0" size="sm" variant="ghost" disabled={disabled} aria-label={t('desktop.superMemoDrafts.close')}>
            <X aria-hidden className="size-4" />
          </AppButton>
        </AppDialogClose>
      </div>
    </div>
  );
}

function useSuperMemoDraftNavigation(
  { busy, error, setError }: Pick<ReturnType<typeof useSuperMemoDraft>, 'busy' | 'error' | 'setError'>,
  open: boolean, close: () => void
) {
  const [step, setStep] = useState<{
    id: SuperMemoMigrationStep; source: ReturnType<typeof useSuperMemoDraft>['source'];
    filePath?: string | undefined; comparing?: boolean;
  }>();
  const [selection, setSelection] = useState<{
    source: ReturnType<typeof useSuperMemoDraft>['source']; signature: string; ids: number[];
  }>();

  function resetNavigation() {
    setStep(undefined);
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

  return { step, setStep, selection, setSelection, resetNavigation, dismissDialog };
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

function requestedStep(
  step: ReturnType<typeof useSuperMemoDraftNavigation>['step'],
  source: ReturnType<typeof useSuperMemoDraft>['source'],
  filePath: string | undefined,
  hasUpdate: boolean
): SuperMemoMigrationStep | undefined {
  if (!step) return undefined;
  if (step.comparing) return step.source === source ? 'load' : hasUpdate ? 'confirm' : undefined;
  return step.source === source || (!step.source && step.filePath === filePath) || (step.id === 'confirm' && hasUpdate)
    ? step.id : undefined;
}

function stepNeedsDraft(step: SuperMemoMigrationStep | undefined) {
  return step === 'structure' || step === 'confirm';
}

function useRequestedPreview(model: ReturnType<typeof useSuperMemoDraft>, open: boolean) {
  const [openingPreview, setOpeningPreview] = useState(false);
  const reportError = useRef(false);

  const { setError } = model;
  const selectedPath = model.selection?.filePath;
  useEffect(() => {
    if (!open || !selectedPath) return;
    let active = true;
    void checkRuntimeSuperMemoSource().catch(error => {
      if (active && /supermemo_(xml|collection)_updated/.test(String(error))) setError('xmlUpdated');
    });
    return () => { active = false; };
  }, [open, selectedPath, setError]);

  function preparePreview() {
    if (model.busy || model.draft || !model.selection || model.selection.hasDraft === false) return;
    setOpeningPreview(true);
    void model.prepareRememberedSource(() => reportError.current).finally(() => setOpeningPreview(false));
  }

  const prepareOnOpen = useEffectEvent(preparePreview);
  const sourcePath = model.selection?.hasDraft === false ? undefined : model.selection?.filePath;
  useEffect(() => {
    if (open && sourcePath) prepareOnOpen();
    return () => { reportError.current = false; };
  }, [open, sourcePath]);

  function openPreviewFor(step: SuperMemoMigrationStep) {
    reportError.current = stepNeedsDraft(step) || step === 'source';
    if (reportError.current) preparePreview();
  }

  return { openingPreview, openPreviewFor, dismissPreview: () => { reportError.current = false; } };
}

type SuperMemoDraftDialogProps = {
  open: boolean; close(): void; initialGrades: SuperMemoGradeMap; translate: string | undefined;
};

export function SuperMemoDraftDialog({ open, close, initialGrades, translate }: SuperMemoDraftDialogProps) {
  const t = useTranslation();
  const titleId = useId();
  const model = useSuperMemoDraft(initialGrades, t('desktop.superMemoDrafts.collectionPickerTitle'));
  const { draft, source, busy, error, setError, result, loadSource, importSource } = model;
  const { openingPreview, openPreviewFor, dismissPreview } = useRequestedPreview(model, open);
  const blocking = busy && !openingPreview;
  const { step, setStep, selection, setSelection, resetNavigation, dismissDialog } = useSuperMemoDraftNavigation({ busy: blocking, error, setError }, open, closeSession);
  const previewNavigation = useSuperMemoPreviewNavigation(source);
  const preview = draft?.preview;
  const update = preview?.directoryUpdate;
  const requested = requestedStep(step, source, model.selection?.filePath, Boolean(update));
  const saved = model.selection?.panel?.step;
  const current = result ? 'confirm' : requested ?? (!preview && stepNeedsDraft(saved) ? 'load' : saved) ?? (preview && !update ? 'structure' : 'load');
  function navigate(id: SuperMemoMigrationStep) {
    setStep({ id, source, filePath: model.selection?.filePath });
    setError(false);
    void model.savePanel({ step: id });
    openPreviewFor(id);
  }
  function closeSession() {
    dismissPreview();
    if (result) model.resetCompletedDraft();
    if (result || (!draft && stepNeedsDraft(current))) resetNavigation();
    close();
  }
  const selected = selection && selection.source === source && selection.signature === update?.signature ? selection.ids : [];
  return (
    <AppDialog open={open} onOpenChange={open => { if (!open) dismissDialog(); }}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent aria-labelledby={titleId} aria-describedby={undefined}
          className={settingsDialogSurfaceClassName(settingsDialogGrid)}
          style={translate ? { translate } : undefined} onInteractOutside={event => event.preventDefault()}
          onEscapeKeyDown={event => { if (error || blocking) event.preventDefault(); }}>
          <SuperMemoMigrationSteps titleId={titleId} current={current} disabled={blocking || Boolean(result)} onChange={navigate} />
          <div className={settingsDialogPane}>
            <DraftHeader name={current === 'load' || result ? undefined : model.selection?.name} disabled={blocking} />
            <div key={current} className="app-scrollbar min-h-0 flex-1 overflow-y-auto px-7 py-7 [scrollbar-gutter:stable]">
              <SuperMemoMigrationContent model={model} current={current} selected={selected} navigation={previewNavigation}
                onLoad={() => void loadSource()} openingPreview={openingPreview} onLoadNew={() => {
                  setStep({ id: 'load', source, comparing: true });
                  void loadSource(true);
                }}
                onSelect={ids => { if (update) setSelection({ source, signature: update.signature, ids }); }} />
            </div>
            <SuperMemoDraftActions step={current} busy={current === 'confirm' ? busy : blocking} hasPreview={Boolean(preview && !result)}
              canProceed={Boolean(preview || (current !== 'load' && model.selection))}
              directoryUpdate={update ? { canConfirm: canConfirmUpdate(update, selected) } : undefined}
              navigate={navigate} convert={() => void importSource(selected)} />
          </div>
        </AppDialogContent>
      </AppDialogPortal>
      <SuperMemoLoadNotice error={open && (current !== 'load' || error === 'xmlUpdated') && error} busy={busy} candidates={model.candidates} onClose={() => setError(false)}
        recover={choose => void model.recoverCollection(choose)} retry={() => void model.retrySource()} />
    </AppDialog>
  );
}
