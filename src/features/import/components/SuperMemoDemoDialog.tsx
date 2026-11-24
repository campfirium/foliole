import { ChevronLeft } from 'lucide-react';
import { useId } from 'react';

import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import {
  AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, SettingsButton, settingsDialogSurfaceClassName
} from '../../../shared/ui';
import {
  settingsDialogFooterInset, settingsDialogGrid, settingsDialogPane, settingsDialogPaneHeader
} from '../../../shared/ui/settingsDialogBounds';
import { useDismissibleSurface } from '../../../shared/ui/useDismissibleSurface';
import { SUPER_MEMO_DEMO_COLLECTION_NAME } from '../model/superMemoDemoCollection';

import { SuperMemoDemoContent } from './SuperMemoDemoContent';
import { SuperMemoDraftActions } from './SuperMemoDraftActions';
import { SuperMemoMigrationSteps } from './SuperMemoMigrationSteps';
import { useSuperMemoDemoWalkthrough } from './useSuperMemoDemoWalkthrough';

function DemoCompleteActions({ onBack, onClose }: { onBack(): void; onClose(): void }) {
  const t = useTranslation();
  const backLabel = t('desktop.superMemoDrafts.previous');
  return (
    <div className={`shrink-0 px-7 pt-4 ${settingsDialogFooterInset}`}>
      <div className="flex justify-end gap-2 px-settings-panel-x">
        <SettingsButton className="w-9 px-0" aria-label={backLabel} title={backLabel} onClick={onBack}>
          <ChevronLeft aria-hidden="true" className="size-[18px]" />
        </SettingsButton>
        <SettingsButton onClick={onClose}>{t('settings.demoPreview.superMemo.close')}</SettingsButton>
      </div>
    </div>
  );
}

export function SuperMemoDemoDialog({ onClose }: { onClose(): void }) {
  const t = useTranslation();
  const titleId = useId();
  const model = useSuperMemoDemoWalkthrough();
  const { step, setStep } = model;
  useDismissibleSurface({ onDismiss: onClose });
  return (
    <AppDialog open onOpenChange={open => { if (!open) onClose(); }}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent aria-labelledby={titleId} aria-describedby={undefined}
          className={settingsDialogSurfaceClassName(settingsDialogGrid)}
          onInteractOutside={event => event.preventDefault()}>
          <SuperMemoMigrationSteps titleId={titleId} current={step} disabled={false} hasBatch={false} onChange={setStep} />
          <div className={settingsDialogPane}>
            <div className={settingsDialogPaneHeader}>
              <span className="min-w-0 flex-1 truncate px-7 text-ui-md font-semibold">
                {step === 'load' ? null : SUPER_MEMO_DEMO_COLLECTION_NAME}
              </span>
            </div>
            <div key={step} className={`min-h-0 flex-1 overflow-y-auto px-7 py-7 ${
              step === 'schedule' ? '[scrollbar-width:none]' : 'app-scrollbar [scrollbar-gutter:stable]'
            }`}>
              <SuperMemoDemoContent model={model} />
            </div>
            {step === 'complete' ? <DemoCompleteActions onBack={() => setStep('grades')} onClose={onClose} /> :
              <SuperMemoDraftActions step={step} busy={false} canProceed hasPreview navigate={setStep}
                convert={() => setStep('complete')} labels={{
                  note: t('settings.demoPreview.superMemo.footnote'),
                  convert: t('settings.demoPreview.superMemo.finish')
                }} />}
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
