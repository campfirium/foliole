import { useEffect, useId, useState } from 'react';

import { isValidSuperMemoReferenceMap } from '../../../../lib/core/import/superMemoReferenceFields';
import type { SuperMemoGradeMap } from '../../../../lib/core/import/superMemoSchedulePreview';
import type { SuperMemoXmlBody } from '../../../../lib/core/import/superMemoXmlDraft';
import type { NativeSuperMemoDirectoryUpdate } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { checkRuntimeSuperMemoSource, parseRuntimeSuperMemoBodies } from '../../../shared/platform/import/superMemoImportRuntimeRepository';
import {
  AppDialog, AppDialogContent,
  AppDialogOverlay, AppDialogPortal, settingsDialogSurfaceClassName
} from '../../../shared/ui';
import { settingsDialogGrid, settingsDialogPane, settingsDialogPaneHeader } from '../../../shared/ui/settingsDialogBounds';
import { useDismissibleSurface } from '../../../shared/ui/useDismissibleSurface';

import { SuperMemoDraftActions } from './SuperMemoDraftActions';
import { useSuperMemoPreviewNavigation } from './SuperMemoEntryPreview';
import { SuperMemoLoadNotice } from './SuperMemoLoadNotice';
import { SuperMemoMigrationContent } from './SuperMemoMigrationContent';
import { SuperMemoMigrationSteps, type SuperMemoMigrationStep } from './SuperMemoMigrationSteps';
import { SuperMemoUpdateComplete } from './SuperMemoUpdateComplete';
import { SuperMemoUpdateReview } from './SuperMemoUpdateReview';
import { useSuperMemoDraft } from './useSuperMemoDraft';

function DraftHeader({ name }: { name: string | undefined }) {
  return (
    <div className={settingsDialogPaneHeader}>
      <div className="app-scrollbar flex min-w-0 flex-1 items-center gap-3 overflow-hidden px-settings-panel-x [scrollbar-gutter:stable]">
        <span className="min-w-0 flex-1 truncate text-ui-md font-semibold">
          {name ? name.replace(/\.xml$/iu, '') || name : null}
        </span>
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
  function resetNavigation() {
    setStep(undefined);
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

  return { step, setStep, resetNavigation, dismissDialog };
}

function requestedStep(
  step: ReturnType<typeof useSuperMemoDraftNavigation>['step'],
  source: ReturnType<typeof useSuperMemoDraft>['source'],
  filePath: string | undefined,
  hasUpdate: boolean
): SuperMemoMigrationStep | undefined {
  if (!step) return undefined;
  if (step.comparing) return step.source === source ? 'load' : hasUpdate ? 'grades' : undefined;
  return step.source === source || (!step.source && step.filePath === filePath)
    ? step.id : undefined;
}

function restoreMigrationStep(step: SuperMemoMigrationStep | 'source' | 'confirm' | undefined, hasPreview: boolean) {
  const restored = step === 'source' ? 'structure' : step === 'confirm' ? 'grades' : step;
  return !hasPreview && stepNeedsDraft(restored) ? 'load' : restored;
}

function stepNeedsDraft(step: SuperMemoMigrationStep | undefined) {
  return step === 'structure';
}

function useSourceContent({ source, setError }: ReturnType<typeof useSuperMemoDraft>, open: boolean) {
  const [cache, setCache] = useState<{ source: typeof source; elements: SuperMemoXmlBody[] | null }>();
  useEffect(() => {
    if (!open || !source) return;
    let active = true;
    void checkRuntimeSuperMemoSource().then(selected => {
      if (!active || source.draft) return;
      const elements = selected?.filePath === source.filePath ? parseRuntimeSuperMemoBodies(selected.xml) : null;
      setCache({ source, elements });
    }).catch(error => {
      if (!active) return;
      setCache({ source, elements: null });
      if (/supermemo_(xml|collection)_updated/.test(String(error))) setError('xmlUpdated');
    });
    return () => { active = false; };
  }, [open, source, setError]);
  return source?.draft?.elements ?? (cache?.source === source ? cache?.elements : undefined);
}

function useDraftReview(model: ReturnType<typeof useSuperMemoDraft>) {
  const [review, setReview] = useState<NativeSuperMemoDirectoryUpdate>();
  const closeReview = () => setReview(undefined);

  function startImport() {
    if (model.draft?.preview.directoryUpdate) void model.reviewUpdate().then(setReview);
    else void model.importSource([]);
  }

  function applyUpdate(ids: number[]) {
    closeReview();
    void model.importSource(ids);
  }

  return { review, closeReview, startImport, applyUpdate };
}

type SuperMemoDraftDialogProps = {
  open: boolean; close(): void; initialGrades: SuperMemoGradeMap; translate: string | undefined;
};

export function SuperMemoDraftDialog({ open, close, initialGrades, translate }: SuperMemoDraftDialogProps) {
  const t = useTranslation();
  const titleId = useId();
  const model = useSuperMemoDraft(initialGrades, t('desktop.superMemoDrafts.collectionPickerTitle'));
  const { draft, source, busy, error, setError, result, loadSource } = model;
  const { review, closeReview, startImport, applyUpdate } = useDraftReview(model);
  const sourceContent = useSourceContent(model, open);
  const { step, setStep, resetNavigation, dismissDialog } = useSuperMemoDraftNavigation({ busy, error, setError }, open && !result?.directoryUpdate && !review, closeSession);
  const previewNavigation = useSuperMemoPreviewNavigation(source);
  const preview = draft?.preview;
  const update = preview?.directoryUpdate;
  const current = model.importing ? 'grades' : result && !result.directoryUpdate ? 'complete'
    : requestedStep(step, source, model.selection?.filePath, Boolean(update)) ??
      restoreMigrationStep(model.selection?.panel?.step, Boolean(preview)) ?? (preview ? 'structure' : 'load');
  function navigate(id: SuperMemoMigrationStep) {
    if (result) model.resetCompletedDraft();
    setStep({ id, source, filePath: model.selection?.filePath });
    setError(false);
    void model.savePanel({ step: id });
  }
  function closeSession() {
    if (result) model.resetCompletedDraft();
    if (result || (!draft && stepNeedsDraft(current))) resetNavigation();
    close();
  }
  if (result?.directoryUpdate) return <SuperMemoUpdateComplete open={open} result={result} onClose={closeSession} />;
  return (
    <AppDialog open={open} onOpenChange={open => { if (!open) dismissDialog(); }}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent aria-labelledby={titleId} aria-describedby={undefined}
          className={settingsDialogSurfaceClassName(settingsDialogGrid)}
          style={translate ? { translate } : undefined} onInteractOutside={event => event.preventDefault()}
          onEscapeKeyDown={event => { if (error || busy) event.preventDefault(); }}>
          <SuperMemoMigrationSteps titleId={titleId} current={current} disabled={busy}
            hasBatch={Boolean(result?.batchId ?? model.selection?.panel?.batchId ?? update?.batchId)} onChange={navigate} />
          <div className={settingsDialogPane}>
            <DraftHeader name={current === 'load' ? undefined : model.selection?.name} />
            <div key={current} className={`min-h-0 flex-1 overflow-y-auto px-7 ${
              current === 'grades' ? 'py-4 [@media(min-height:880px)]:py-5' : 'py-7'
            } ${(current === 'schedule' && preview) || current === 'grades' ? '[scrollbar-width:none]' : 'app-scrollbar [scrollbar-gutter:stable]'}`}>
              <SuperMemoMigrationContent model={model} current={current} navigation={previewNavigation} sourceContent={sourceContent}
                onLoad={() => void loadSource()} onLoadNew={() => {
                  setStep({ id: 'load', source, comparing: true });
                  void loadSource(true);
                }} />
            </div>
            <SuperMemoDraftActions step={current} busy={busy} importing={model.importing} updating={Boolean(update)} hasPreview={Boolean(preview)}
              canProceed={Boolean(preview || (current !== 'load' && model.selection))}
              referenceMapValid={isValidSuperMemoReferenceMap(model.referenceMap)}
              navigate={navigate} convert={startImport} />
          </div>
        </AppDialogContent>
      </AppDialogPortal>
      {open && review ? <SuperMemoUpdateReview update={review} busy={busy} onClose={closeReview} onApply={applyUpdate} /> : null}
      <SuperMemoLoadNotice reload={error === 'xmlUpdated' || model.retryAsUpdate} error={open && (current !== 'load' || error === 'xmlUpdated') && error} busy={busy} candidates={model.candidates} onClose={() => setError(false)}
        recover={choose => void model.recoverCollection(choose)} retry={() => void (error === 'xmlUpdated' ? loadSource(true) : model.retrySource())} />
    </AppDialog>
  );
}
