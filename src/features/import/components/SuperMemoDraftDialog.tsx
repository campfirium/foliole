import { FileText, X } from 'lucide-react';
import { useId, useState } from 'react';

import type { SuperMemoGradeMap } from '../../../../lib/core/import/superMemoSchedulePreview';
import type { NativeSuperMemoDirectoryUpdate } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import {
  AppButton, AppDialog, AppDialogClose, AppDialogContent,
  AppDialogOverlay, AppDialogPortal, AppDialogTitle
} from '../../../shared/ui';
import { settingsDialogBounds } from '../../../shared/ui/settingsDialogBounds';
import { useDismissibleSurface } from '../../../shared/ui/useDismissibleSurface';

import { SuperMemoDraftActions } from './SuperMemoDraftActions';
import { useSuperMemoPreviewNavigation } from './SuperMemoEntryPreview';
import { SuperMemoLoadNotice } from './SuperMemoLoadNotice';
import { SuperMemoMigrationContent } from './SuperMemoMigrationContent';
import { SuperMemoMigrationSteps, type SuperMemoMigrationStep } from './SuperMemoMigrationSteps';
import { useSuperMemoDraft } from './useSuperMemoDraft';

function DraftHeader({ titleId, name, disabled }: {
  titleId: string; name: string | undefined; disabled: boolean;
}) {
  const t = useTranslation();
  return (
    <AppDialogTitle asChild className="flex-wrap gap-x-3 gap-y-1">
      <header>
        <h2 id={titleId} className="shrink-0">{t('desktop.superMemoDrafts.title')}</h2>
        {name ? <span className="flex min-w-0 items-center gap-1.5 text-xs text-foreground/70" title={name}>
          <FileText aria-hidden className="size-3.5 shrink-0" /><span className="truncate">{name}</span>
        </span> : null}
        <div className="ml-auto flex shrink-0 items-center gap-2">
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

export function SuperMemoDraftDialog({ open, close, initialGrades, translate }: {
  open: boolean; close(): void; initialGrades: SuperMemoGradeMap; translate: string | undefined;
}) {
  const t = useTranslation();
  const titleId = useId();
  const model = useSuperMemoDraft(initialGrades, t('desktop.superMemoDrafts.collectionPickerTitle'), open);
  const { draft, source, busy, error, setError, result, loadSource, importSource } = model;
  const { step, setStep, selection, setSelection, resetNavigation, dismissDialog } = useSuperMemoDraftNavigation(model, open, closeSession);
  const previewNavigation = useSuperMemoPreviewNavigation(source);
  const preview = draft?.preview;
  const update = preview?.directoryUpdate;
  const requested = step?.comparing
    ? step.source === source ? 'load' : update ? 'confirm' : undefined
    : step && (step.source === source || (!step.source && step.filePath === model.selection?.filePath) ||
      (step.id === 'confirm' && update)) ? step.id : undefined;
  const current = result ? 'confirm' : requested ?? model.selection?.panel?.step ?? (preview && !update ? 'structure' : 'load');
  function navigate(id: SuperMemoMigrationStep) {
    setStep({ id, source, filePath: model.selection?.filePath });
    setError(false);
    void model.savePanel({ step: id });
    if (id === 'structure') void model.prepareRememberedSource();
  }
  function closeSession() {
    if (result) {
      model.resetCompletedDraft();
      resetNavigation();
    }
    close();
  }
  const reloadSource = () => { void loadSource(); };
  const selected = selection && selection.source === source && selection.signature === update?.signature ? selection.ids : [];
  return (
    <AppDialog open={open} onOpenChange={open => { if (!open) dismissDialog(); }}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent layout="task" aria-labelledby={titleId} aria-describedby={undefined} className={settingsDialogBounds}
          style={translate ? { translate } : undefined} onInteractOutside={event => event.preventDefault()}
          onEscapeKeyDown={event => { if (error || busy) event.preventDefault(); }}>
          <DraftHeader titleId={titleId} name={current === 'load' || result ? undefined : model.selection?.name} disabled={busy} />
          <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] sm:grid-cols-[minmax(10rem,19%)_minmax(0,1fr)] sm:grid-rows-1">
            <SuperMemoMigrationSteps current={current} disabled={busy || Boolean(result)} onChange={navigate} />
            <div className="flex min-h-0 min-w-0 flex-col">
              <SuperMemoMigrationContent model={model} current={current} selected={selected} navigation={previewNavigation}
                onLoad={reloadSource} onViewSource={() => navigate('structure')} onLoadNew={() => {
                  setStep({ id: 'load', source, comparing: true });
                  void loadSource(true);
                }}
                onSelect={ids => { if (update) setSelection({ source, signature: update.signature, ids }); }} />
              <SuperMemoDraftActions step={current} busy={busy} canConvert={Boolean(preview && !result)}
                directoryUpdate={update ? { canConfirm: canConfirmUpdate(update, selected) } : undefined}
                navigate={navigate} convert={() => void importSource(selected)} />
            </div>
          </div>
        </AppDialogContent>
      </AppDialogPortal>
      <SuperMemoLoadNotice error={open && current !== 'load' && error} busy={busy} candidates={model.candidates} onClose={() => setError(false)}
        recover={choose => void model.recoverCollection(choose)} retry={() => void model.retrySource()} />
    </AppDialog>
  );
}
