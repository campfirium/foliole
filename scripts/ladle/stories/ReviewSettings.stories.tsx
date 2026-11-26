import type { ReactNode } from 'react';

import { SettingsReviewSection } from '../../../src/features/settings/components/sections/SettingsReviewSection';
import { ReviewSchedulerSettingsProvider } from '../../../src/features/settings/context/ReviewSchedulerSettingsProvider';
import { LocalizationProvider, useTranslation } from '../../../src/shared/localization/LocalizationProvider';
import { settingsDialogPane, settingsDialogPaneBody } from '../../../src/shared/ui/settingsDialogBounds';
import { AppTooltipProvider } from '../../../src/shared/ui/Tooltip';

import { ReviewOrderPreview } from './ReviewOrderPreview';

function ReviewSettingsPane({ children }: { children: ReactNode }) {
  const t = useTranslation();

  return (
    <div className={settingsDialogPane} style={{ maxHeight: '100dvh', maxWidth: '980px' }}>
      <div className={settingsDialogPaneBody}>
        <header className="mb-7 px-5 pb-6">
          <h2 className="text-ui-md font-normal text-foreground">{t('settings.category.review.label')}</h2>
          <p className="mt-1 max-w-[760px] text-sm leading-6 text-muted-foreground">
            {t('settings.category.review.description')}
          </p>
        </header>
        {children}
      </div>
    </div>
  );
}

function ReviewSettingsPreview({ prioritySettings }: { prioritySettings?: ReactNode }) {
  return (
    <LocalizationProvider initialLanguagePreference="zh-Hans">
      <AppTooltipProvider>
        <ReviewSchedulerSettingsProvider>
          <ReviewSettingsPane>
            <SettingsReviewSection prioritySettings={prioritySettings} />
          </ReviewSettingsPane>
        </ReviewSchedulerSettingsProvider>
      </AppTooltipProvider>
    </LocalizationProvider>
  );
}

export function FullPane() {
  return <ReviewSettingsPreview />;
}

export function ReviewOrderProposal() {
  return <ReviewSettingsPreview prioritySettings={<ReviewOrderPreview />} />;
}
