import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

import '../../src/app/styles.css';
import { companionReviewSurfaceClassName } from '../../src/companion/companionCssCompatibility';
import { CompanionFlowEdgeGestures } from '../../src/companion/CompanionFlowEdgeGestures';
import { LocalizationProvider } from '../../src/shared/localization/LocalizationProvider';

function Reader() {
  const [position, setPosition] = useState('second');
  return <LocalizationProvider initialLanguagePreference="en">
    <section className={companionReviewSurfaceClassName} aria-label="Flow document">
      <output>{position}</output>
      <p>Readable document content</p>
    </section>
    <CompanionFlowEdgeGestures enabled canUndo={position === 'second'} canRedo={position === 'first'}
      onApply={mode => setPosition(mode === 'undo' ? 'first' : 'second')} />
  </LocalizationProvider>;
}

createRoot(document.getElementById('root')!).render(<Reader />);
