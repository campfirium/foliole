import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

import '../../src/app/styles.css';
import '../../src/companion/companionMinimal.css';
import { CompanionReminderEditor, type ReminderDraft } from '../../src/companion/CompanionReminderEditor';
import { LocalizationProvider } from '../../src/shared/localization/LocalizationProvider';
import { SettingsTouchSurface } from '../../src/shared/ui/SettingsTouchSurface';

const dives = Array.from({ length: 12 }, (_, index) => ({
  id: String(index), title: `Probability and statistics reference material for the next Flow session ${index + 1}`,
  directSourceIds: []
}));

function Fixture() {
  const [draft, setDraft] = useState<ReminderDraft>({ message: 'Review probability', trigger: { kind: 'daily', time: '20:00' } });
  return <SettingsTouchSurface>
    <CompanionReminderEditor busy={false} draft={draft} dives={dives} onChange={setDraft}
      onCancel={() => undefined} onSave={async event => event.preventDefault()} />
  </SettingsTouchSurface>;
}

createRoot(document.getElementById('root')!).render(
  <LocalizationProvider initialLanguagePreference="en"><Fixture /></LocalizationProvider>
);
