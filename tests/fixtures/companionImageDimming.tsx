import React from 'react';
import { createRoot } from 'react-dom/client';

import '../../src/app/styles.css';
import { CompanionArticleDocument } from '../../src/companion/CompanionArticleDocument';
import { CompanionColorModeProvider } from '../../src/companion/CompanionColorModeProvider';
import { CompanionItemAnswer } from '../../src/companion/CompanionItemAnswer';
import { renderCompanionSettingsContent } from '../../src/companion/CompanionSettingsShellContent';
import '../../src/companion/companionMinimal.css';
import { MouseGestureSettingsProvider } from '../../src/features/settings/context/MouseGestureSettingsProvider';
import { LocalizationProvider } from '../../src/shared/localization/LocalizationProvider';

const source = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect width="240" height="120" fill="#fff"/><circle cx="120" cy="60" r="40" fill="#457777"/></svg>');
const content = `![Reading sample](${source})`;
const noop = () => {};

createRoot(document.getElementById('root')!).render(
  <LocalizationProvider initialLanguagePreference="en">
    <MouseGestureSettingsProvider><CompanionColorModeProvider>
      <main className="mx-auto max-w-md bg-canvas p-4 text-foreground">
        {renderCompanionSettingsContent({ settingsPage: 'appearance', onBackToSettingsList: noop,
          onOpenSyncSettings: noop, onOpenSyncSettingsPage: noop, workspaceSync: {} as never })}
        <h2>Topic</h2>
        <CompanionArticleDocument content={content} nodeId="dimming-topic" scrollContainer="outer" />
        <h2>Item question</h2>
        <CompanionArticleDocument content={content} nodeId="dimming-item" layout="review" scrollContainer="outer" />
        <h2>Item answer</h2>
        <CompanionItemAnswer answer={content} editing={false} nodeId="dimming-item" style={{}}
          onChange={noop} onEditorReady={noop} onDocumentInput={noop} onBlur={noop} onMissingResource={async () => {}} />
      </main>
    </CompanionColorModeProvider></MouseGestureSettingsProvider>
  </LocalizationProvider>
);
