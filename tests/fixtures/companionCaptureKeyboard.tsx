import React, { useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

import '../../src/app/styles.css';
import '../../src/companion/companionMinimal.css';
import '../../src/companion/companionReadingDisplay.css';
import { CompanionCaptureSheet } from '../../src/companion/CompanionCaptureSheet';
import { CompanionFlowCaptureContext } from '../../src/companion/CompanionFlowCaptureButton';
import { CompanionFlowHistoryContext } from '../../src/companion/CompanionFlowHistoryContext';
import { ReadingChrome } from '../../src/companion/CompanionReadingChrome';
import { LocalizationProvider } from '../../src/shared/localization/LocalizationProvider';

function CaptureKeyboardFixture() {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState('');
  return <LocalizationProvider initialLanguagePreference="en">
    <button className="mt-16" onClick={() => setOpen(true)}>Open capture</button>
    <CompanionFlowCaptureContext.Provider value={() => flushSync(() => setOpen(true))}>
      <CompanionFlowHistoryContext.Provider value={{
        busy: false, refreshPending: false, canUndo: true, canRedo: true, apply: () => {}
      }}>
        <ReadingChrome actionsAtTop canEditContent isReviewItem onExit={() => {}} onOpenActions={() => {}}
          onOpenAlternative={() => {}} onOpenOutline={() => {}} title="Flow" />
      </CompanionFlowHistoryContext.Provider>
    </CompanionFlowCaptureContext.Provider>
    <output aria-label="Saved text">{saved}</output>
    <CompanionCaptureSheet draftScope="keyboard-layout" open={open} onOpenChange={setOpen}
      onSave={async text => { setSaved(text); return { nodeId: 'captured-topic' }; }} />
  </LocalizationProvider>;
}

createRoot(document.getElementById('root')!).render(<CaptureKeyboardFixture />);
