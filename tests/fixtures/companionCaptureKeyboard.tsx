import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

import '../../src/app/styles.css';
import '../../src/companion/companionMinimal.css';
import { CompanionCaptureSheet } from '../../src/companion/CompanionCaptureSheet';
import { CompanionFlowCaptureContext } from '../../src/companion/CompanionFlowCaptureEntry';
import { CompanionFlowModeMenu } from '../../src/companion/CompanionFlowModeControl';
import { LocalizationProvider } from '../../src/shared/localization/LocalizationProvider';

function CaptureKeyboardFixture() {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState('');
  return <LocalizationProvider initialLanguagePreference="en">
    <button onClick={() => setOpen(true)}>Open capture</button>
    <CompanionFlowCaptureContext.Provider value={() => setOpen(true)}>
      <CompanionFlowModeMenu controls={{ mode: 'recommended', onChange: () => {}, disabled: false }} />
    </CompanionFlowCaptureContext.Provider>
    <output aria-label="Saved text">{saved}</output>
    <CompanionCaptureSheet draftScope="keyboard-layout" open={open} onOpenChange={setOpen}
      onSave={async text => { setSaved(text); return { nodeId: 'captured-topic' }; }} />
  </LocalizationProvider>;
}

createRoot(document.getElementById('root')!).render(<CaptureKeyboardFixture />);
