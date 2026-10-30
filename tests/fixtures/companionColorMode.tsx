import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

import '../../src/app/styles.css';
import '../../src/companion/companionMinimal.css';
import { CompanionColorModeControl } from '../../src/companion/CompanionColorModeControl';
import { CompanionColorModeProvider } from '../../src/companion/CompanionColorModeProvider';
import { ReadingFontSheet } from '../../src/companion/CompanionReadingSheets';
import { DEFAULT_READING_TYPOGRAPHY_SETTINGS } from '../../src/companion/companionReadingTypographySettings';
import { RecentArticleList } from '../../src/companion/CompanionRecentArticleList';
import { LocalizationProvider } from '../../src/shared/localization/LocalizationProvider';

function ColorModeSurface() {
  const [open, setOpen] = useState(false);
  return <LocalizationProvider initialLanguagePreference="en"><CompanionColorModeProvider>
    <main className="min-h-screen bg-companion-base px-5 text-foreground">
      <CompanionColorModeControl />
      <RecentArticleList currentArticleId={null} onSelectArticle={() => undefined} recentArticles={[{
        nodeId: 'topic', title: 'Readable topic', preview: 'A readable preview of the article.',
        folderLabel: 'Inbox', updatedAt: '2026-10-30T00:00:00Z'
      }]} />
      <button onClick={() => setOpen(true)} type="button">Reading appearance</button>
      <ReadingFontSheet open={open} onOpenChange={setOpen} onChange={() => undefined}
        settings={DEFAULT_READING_TYPOGRAPHY_SETTINGS} />
    </main>
  </CompanionColorModeProvider></LocalizationProvider>;
}

createRoot(document.getElementById('root')!).render(<ColorModeSurface />);
