import React from 'react';
import { createRoot } from 'react-dom/client';

import '../../src/app/styles.css';
import '../../src/companion/companionMinimal.css';
import { CompanionBottomReviewBar } from '../../src/companion/CompanionBottomReviewBar';
import { CompanionLearningSettingControl } from '../../src/companion/CompanionLearningSettingControl';
import { COMPANION_LEARNING_SETTING_ROWS } from '../../src/companion/companionLearningSettingRows';
import { hydrateCurrentReviewSchedulerSettings } from '../../src/features/settings/model/reviewSchedulerSettings';
import { LocalizationProvider } from '../../src/shared/localization/LocalizationProvider';
import { SettingsTouchSurface } from '../../src/shared/ui/SettingsTouchSurface';

const row = COMPANION_LEARNING_SETTING_ROWS.find(candidate => candidate.key === 'readingLaterDays')!;
const settings = hydrateCurrentReviewSchedulerSettings({ readingLaterDays: 36500 })!;
const ignore = () => undefined;

createRoot(document.getElementById('root')!).render(
  <LocalizationProvider initialLanguagePreference="en">
    <main className="min-h-screen bg-companion-base px-5">
      <SettingsTouchSurface>
        <CompanionLearningSettingControl row={row} settings={settings} />
      </SettingsTouchSurface>
      <CompanionBottomReviewBar hasAnswer={false} isAnswerRevealed={false} itemKind="reading" visible reviewCardKey="fixture"
        onSoonReviewTopic={ignore} onReadReviewTopic={ignore} onPostponeReviewTopic={ignore} onDismissReviewTopic={ignore}
        onGrade={ignore} onRevealAnswer={ignore} />
    </main>
  </LocalizationProvider>
);
