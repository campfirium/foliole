import type { Story } from '@ladle/react';
import type { ReactNode } from 'react';

import { SettingsReviewSection } from '../../../src/features/settings/components/sections/SettingsReviewSection';
import { ReviewSchedulerSettingsProvider } from '../../../src/features/settings/context/ReviewSchedulerSettingsProvider';
import { LocalizationProvider, useTranslation } from '../../../src/shared/localization/LocalizationProvider';
import { settingsDialogPane, settingsDialogPaneBody } from '../../../src/shared/ui/settingsDialogBounds';
import { AppTooltipProvider } from '../../../src/shared/ui/Tooltip';

import { ReviewOrderPreview, type ReviewOrderPreviewProps } from './ReviewOrderPreview';

function ReviewSettingsPane({ children }: { children: ReactNode }) {
  const t = useTranslation();

  return (
    <div className={settingsDialogPane} style={{ maxWidth: '980px' }}>
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

export function FullPane() {
  return (
    <LocalizationProvider initialLanguagePreference="zh-Hans">
      <AppTooltipProvider>
        <ReviewSchedulerSettingsProvider>
          <ReviewSettingsPane>
            <SettingsReviewSection />
          </ReviewSettingsPane>
        </ReviewSchedulerSettingsProvider>
      </AppTooltipProvider>
    </LocalizationProvider>
  );
}

export const ReviewOrderProposal: Story<ReviewOrderPreviewProps> = (props) => (
  <LocalizationProvider initialLanguagePreference="zh-Hans">
    <ReviewSettingsPane>
      <ReviewOrderPreview {...props} />
    </ReviewSettingsPane>
  </LocalizationProvider>
);

ReviewOrderProposal.args = {
  title: '复习顺序',
  explanation: '先复习 P0 队列中所有到期检测项，再从 P1–P9 的到期队列中按权重抽取。空队列不参与。'
};
