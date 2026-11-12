import { useState } from 'react';
import { createRoot } from 'react-dom/client';

import '../../src/app/styles.css';
import { CompanionCustomCssProvider } from '../../src/companion/CompanionCustomCssProvider';
import { ImmersiveReadableArticle } from '../../src/companion/CompanionReadableArticleSurface';
import { renderCompanionSettingsContent } from '../../src/companion/CompanionSettingsShellContent';
import { CompanionTextScaleProvider } from '../../src/companion/CompanionTextScale';
import '../../src/companion/companionMinimal.css';
import type { CompanionSettingsPage } from '../../src/companion/useCompanionSyncSettingsPage';
import { MouseGestureSettingsProvider } from '../../src/features/settings/context/MouseGestureSettingsProvider';
import { LocalizationProvider } from '../../src/shared/localization/LocalizationProvider';

const content = '# Heading\n\nA reading passage with `inline code`.';
const article = { content, hideTitleHeading: false, nodeId: 'topic', persistedNodeViewState: null,
  pdfAttachmentId: null, title: 'Reading passage', textAnchorDecorations: [] };

function Fixture() {
  const [settingsPage, setSettingsPage] = useState<CompanionSettingsPage>('list');
  const [reading, setReading] = useState<'topic' | 'flow' | 'review' | null>(null);

  if (reading) return <ImmersiveReadableArticle readableArticle={article} snapshot={null}
    flow={reading !== 'topic'} isReviewItem={reading === 'review'}
    answer={reading === 'review' ? 'A review answer.' : null}
    header={<button type="button" onClick={() => setReading(null)}>Close passage</button>}
    onSaveArticleContent={Object.assign(async () => ({ content, currentVersionId: 'initial', submittedVersionId: 'initial' }),
      { readSource: async () => ({ content, versionId: 'initial' }) })}
    onExit={() => setReading(null)} />;

  return <>
    {settingsPage === 'list'
      ? <>
        <button type="button" onClick={() => setReading('topic')}>Open reading passage</button>
        <button type="button" onClick={() => setReading('flow')}>Open Flow passage</button>
        <button type="button" onClick={() => setReading('review')}>Open review item</button>
      </>
      : <button type="button" onClick={() => setSettingsPage('list')}>Back to settings</button>}
    {renderCompanionSettingsContent({
      onBackToSettingsList: () => setSettingsPage('list'),
      onOpenSyncSettings: () => setSettingsPage('sync'),
      onOpenSyncSettingsPage: setSettingsPage,
      settingsPage,
      workspaceSync: { state: { sync_onboarding_status: 'pending' } } as never
    })}
  </>;
}

createRoot(document.getElementById('root')!).render(
  <LocalizationProvider initialLanguagePreference="en">
    <MouseGestureSettingsProvider>
      <CompanionCustomCssProvider runtimeKind="web-preview">
        <CompanionTextScaleProvider><Fixture /></CompanionTextScaleProvider>
      </CompanionCustomCssProvider>
    </MouseGestureSettingsProvider>
  </LocalizationProvider>
);
