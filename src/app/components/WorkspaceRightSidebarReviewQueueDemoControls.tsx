import { useState } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  clearDemoLocalData,
  continueToNextDemoPreviewDay,
  useDemoRuntimeState
} from '../../shared/platform/runtime/demoRuntime';
import { AppButton, inspectorListInsetPaddingClassName, inspectorListMetaClassName, requestAppConfirmation } from '../../shared/ui';

export function WorkspaceRightSidebarReviewQueueDemoControls({ hasUpcoming }: { hasUpcoming: boolean }) {
  const t = useTranslation();
  const demoState = useDemoRuntimeState();
  const [isClearing, setIsClearing] = useState(false);
  if (!demoState.isDemo) {
    return null;
  }

  const nextDay = demoState.previewDay + 1;
  const handleClearLocalData = async () => {
    const confirmed = await requestAppConfirmation({
      cancelLabel: t('desktop.rightPanel.flow.demo.clear.cancel'),
      confirmLabel: t('desktop.rightPanel.flow.demo.clear.confirm'),
      description: t('desktop.rightPanel.flow.demo.clear.description'),
      title: t('desktop.rightPanel.flow.demo.clear.title')
    });
    if (!confirmed) return;
    setIsClearing(true);
    await clearDemoLocalData();
    setIsClearing(false);
  };

  return (
    <div className={`${inspectorListInsetPaddingClassName} border-t border-border/55 py-3`}>
      <p className={`m-0 ${inspectorListMetaClassName}`}>
        {hasUpcoming
          ? t('desktop.rightPanel.flow.demo.dayClear', { day: demoState.previewDay })
          : t('desktop.rightPanel.flow.demo.empty')}
      </p>
      <p className={`m-0 mt-1 ${inspectorListMetaClassName}`}>{t('desktop.rightPanel.flow.demo.savedLocal')}</p>
      {demoState.clearError ? <p className="m-0 mt-2 text-[12px] text-red-700">{demoState.clearError}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {hasUpcoming ? (
          <AppButton onClick={continueToNextDemoPreviewDay} size="sm" variant="default">
            {t('desktop.rightPanel.flow.demo.continueDay', { day: nextDay })}
          </AppButton>
        ) : null}
        <AppButton disabled={isClearing} onClick={handleClearLocalData} size="sm" variant="ghost">
          {isClearing ? t('desktop.rightPanel.flow.demo.clearing') : t('desktop.rightPanel.flow.demo.clear')}
        </AppButton>
      </div>
    </div>
  );
}
