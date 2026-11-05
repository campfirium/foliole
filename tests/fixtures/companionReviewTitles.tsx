import React from 'react';
import { createRoot } from 'react-dom/client';

import '../../src/app/styles.css';
import '../../src/companion/companionMinimal.css';
import { CompanionColorModeProvider } from '../../src/companion/CompanionColorModeProvider';
import { CompanionLearningSettingControl } from '../../src/companion/CompanionLearningSettingControl';
import { COMPANION_LEARNING_SETTING_ROWS } from '../../src/companion/companionLearningSettingRows';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../src/features/settings/model/reviewSchedulerSettings';
import { LocalizationProvider } from '../../src/shared/localization/LocalizationProvider';
import { SettingsRow } from '../../src/shared/ui/SettingsRow';
import { SettingsTouchSurface } from '../../src/shared/ui/SettingsTouchSurface';

createRoot(document.getElementById('root')!).render(
  <LocalizationProvider initialLanguagePreference="en">
    <CompanionColorModeProvider>
      <SettingsTouchSurface>
        <SettingsRow title="Automatic review optimization" />
        {COMPANION_LEARNING_SETTING_ROWS.map(row => <CompanionLearningSettingControl
          key={row.key} row={row} settings={DEFAULT_REVIEW_SCHEDULER_SETTINGS} />)}
      </SettingsTouchSurface>
    </CompanionColorModeProvider>
  </LocalizationProvider>
);
