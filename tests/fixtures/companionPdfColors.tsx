import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

import '../../src/app/styles.css';
import '../../src/companion/companionMinimal.css';
import { CompanionColorModeControl } from '../../src/companion/CompanionColorModeControl';
import { CompanionColorModeProvider } from '../../src/companion/CompanionColorModeProvider';
import { SimplePdfDocument } from '../../src/features/pdf/components/SimplePdfDocument';
import { LocalizationProvider } from '../../src/shared/localization/LocalizationProvider';

// Supply only the attachment URL boundary; PDF parsing, layers, zoom and rendering stay real.
Object.assign(window, { electronAPI: { invoke: async (command: string) => command === 'resolve_attachment_resource'
  ? { status: 'ready', resource_url: '/__color-sample.pdf' } : undefined } });

function Fixture() {
  const [document, setDocument] = useState(0);
  const [open, setOpen] = useState(true);
  return <LocalizationProvider initialLanguagePreference="en"><CompanionColorModeProvider>
    <main className="mx-auto max-w-md bg-canvas px-4 text-foreground">
      <CompanionColorModeControl />
      <button onClick={() => { setDocument(value => value + 1); setOpen(true); }}>Another PDF</button>
      <button onClick={() => setOpen(true)}>Reopen PDF</button>
      {open ? <SimplePdfDocument key={document} attachmentId={String(document + 1).repeat(64)}
        initialPage={2} onBackToText={() => setOpen(false)} title="Color sample" /> : null}
    </main>
  </CompanionColorModeProvider></LocalizationProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
