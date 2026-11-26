import { useState } from 'react';

import { DEFAULT_SUPER_MEMO_PRIORITY_BOUNDARIES } from '../../../lib/core/import/superMemoPriorityMapping';
import { SuperMemoPriorityPage } from '../../../src/features/import/components/SuperMemoPriorityPage';
import { ReviewSchedulerSettingsProvider } from '../../../src/features/settings/context/ReviewSchedulerSettingsProvider';
import { LocalizationProvider } from '../../../src/shared/localization/LocalizationProvider';
import { settingsDialogPane, settingsDialogPaneBody } from '../../../src/shared/ui/settingsDialogBounds';

export function PriorityMapping() {
  const [boundaries, setBoundaries] = useState<readonly number[]>(DEFAULT_SUPER_MEMO_PRIORITY_BOUNDARIES);

  return (
    <LocalizationProvider initialLanguagePreference="zh-Hans">
      <ReviewSchedulerSettingsProvider>
        <div className={settingsDialogPane} style={{ maxHeight: '100dvh', maxWidth: '980px' }}>
          <div className={settingsDialogPaneBody}>
            <SuperMemoPriorityPage boundaries={boundaries} paired busy={false} onChange={setBoundaries} />
          </div>
        </div>
      </ReviewSchedulerSettingsProvider>
    </LocalizationProvider>
  );
}
