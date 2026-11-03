import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

import '../../src/app/styles.css';
import '../../src/companion/companionMinimal.css';
import { ReadableArticleDocument } from '../../src/companion/CompanionReadableArticleDocument';
import { ReadingFontSheet } from '../../src/companion/CompanionReadingSheets';
import { useCompanionReadingTypographySettings } from '../../src/companion/useCompanionReadingTypographySettings';
import { MouseGestureSettingsProvider } from '../../src/features/settings/context/MouseGestureSettingsProvider';
import { LocalizationProvider } from '../../src/shared/localization/LocalizationProvider';

const article = {
  content: '# AAAA\n\nAAAA **AAAA** *AAAA* ***AAAA***', hideTitleHeading: false,
  nodeId: 'font-family-topic', persistedNodeViewState: null, pdfAttachmentId: null,
  title: 'Font family', textAnchorDecorations: []
};

function Reader() {
  const [open, setOpen] = useState(false);
  const typography = useCompanionReadingTypographySettings();
  return <>
    <button onClick={() => setOpen(true)} type="button">Reading appearance</button>
    <ReadableArticleDocument readableArticle={article} readingTypographySettings={typography.settings}
      scrollContainer="outer" />
    <ReadingFontSheet open={open} onOpenChange={setOpen} settings={typography.settings}
      onChange={typography.updateSettings} saveError={typography.saveError} fontLoadError={typography.fontLoadError} />
  </>;
}

createRoot(document.getElementById('root')!).render(
  <LocalizationProvider initialLanguagePreference="en"><MouseGestureSettingsProvider><Reader /></MouseGestureSettingsProvider></LocalizationProvider>
);
