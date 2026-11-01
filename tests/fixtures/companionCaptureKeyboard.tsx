import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

import '../../src/app/styles.css';
import '../../src/companion/companionMinimal.css';
import { CompanionCaptureSheet } from '../../src/companion/CompanionCaptureSheet';
import { LocalizationProvider } from '../../src/shared/localization/LocalizationProvider';

function CaptureKeyboardFixture() {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState('');
  return <LocalizationProvider initialLanguagePreference="en">
    <button onClick={() => setOpen(true)}>Open capture</button>
    <output aria-label="Saved text">{saved}</output>
    <CompanionCaptureSheet draftScope="keyboard-layout" open={open} onOpenChange={setOpen}
      onSave={async text => { setSaved(text); return { nodeId: 'captured-topic' }; }} />
  </LocalizationProvider>;
}

createRoot(document.getElementById('root')!).render(<CaptureKeyboardFixture />);
