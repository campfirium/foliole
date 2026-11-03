import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

import '../../src/app/styles.css';
import '../../src/companion/companionMinimal.css';
import { CompanionCaptureSheet } from '../../src/companion/CompanionCaptureSheet';
import { LocalizationProvider } from '../../src/shared/localization/LocalizationProvider';
import { prepareSelectedTextImport } from '../../src/shared/platform/import/selectedImportFile';

function FileImportFixture() {
  const [open, setOpen] = useState(false);
  const [imported, setImported] = useState('');
  return <LocalizationProvider initialLanguagePreference="en">
    <button onClick={() => setOpen(true)}>Open capture</button>
    <article aria-label="Imported topic">{imported}</article>
    <CompanionCaptureSheet draftScope="file-layout" open={open} onOpenChange={setOpen}
      onSave={async () => ({ nodeId: 'manual-topic' })}
      onImportFile={async file => {
        const prepared = await prepareSelectedTextImport(file);
        setImported(prepared.content);
        return { nodeId: 'file-topic', ...(prepared.importWarning ? { importWarning: prepared.importWarning } : {}) };
      }} />
  </LocalizationProvider>;
}

createRoot(document.getElementById('root')!).render(<FileImportFixture />);
