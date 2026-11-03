import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

import '../../src/app/styles.css';
import '../../src/companion/companionMinimal.css';
import { ReadableArticleDocument } from '../../src/companion/CompanionReadableArticleDocument';
import { ReadingFontSheet } from '../../src/companion/CompanionReadingSheets';
import { useCompanionReadingTypographySettings } from '../../src/companion/useCompanionReadingTypographySettings';
import type { EditorAdapter } from '../../src/features/editor/adapters/EditorAdapter';
import { MouseGestureSettingsProvider } from '../../src/features/settings/context/MouseGestureSettingsProvider';
import { LocalizationProvider } from '../../src/shared/localization/LocalizationProvider';

const content = Array.from({ length: 60 }, (_, index) =>
  `Paragraph ${index + 1}. Reading continues with a highlighted passage and enough words to wrap on a phone.`
).join('\n\n');
const highlightFrom = content.indexOf('highlighted passage');
const article = {
  content, hideTitleHeading: false, nodeId: 'paragraph-spacing-topic',
  persistedNodeViewState: null, pdfAttachmentId: null, title: 'Reading topic',
  textAnchorDecorations: [{ from: highlightFrom, to: highlightFrom + 'highlighted passage'.length,
    kind: 'highlight' as const, nodeId: 'existing-highlight' }]
};

declare global {
  interface Window { paragraphSpacingEditor: EditorAdapter | null }
}

function Reader() {
  const [open, setOpen] = useState(false);
  const [reading, setReading] = useState(true);
  const typography = useCompanionReadingTypographySettings();
  return <>
    <nav>
      <button onClick={() => setOpen(true)} type="button">Reading appearance</button>
      <button onClick={() => setReading(!reading)} type="button">{reading ? 'Leave topic' : 'Return to topic'}</button>
    </nav>
    {reading ? <main style={{ height: '80vh', overflow: 'auto' }}>
      <ReadableArticleDocument readableArticle={article} readingTypographySettings={typography.settings}
        scrollContainer="outer" onEditorReady={adapter => { window.paragraphSpacingEditor = adapter; }} />
    </main> : null}
    <ReadingFontSheet open={open} onOpenChange={setOpen} settings={typography.settings}
      onChange={typography.updateSettings} saveError={typography.saveError} />
  </>;
}

createRoot(document.getElementById('root')!).render(
  <LocalizationProvider initialLanguagePreference="en"><MouseGestureSettingsProvider><Reader /></MouseGestureSettingsProvider></LocalizationProvider>
);
