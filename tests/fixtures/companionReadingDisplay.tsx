import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

import '../../src/app/styles.css';
import '../../src/companion/companionMinimal.css';
import { CompanionBottomBar } from '../../src/companion/CompanionBottomBar';
import { CompanionFlowEdgeGestures } from '../../src/companion/CompanionFlowEdgeGestures';
import { ImmersiveReadableArticle } from '../../src/companion/CompanionReadableArticleSurface';
import { MouseGestureSettingsProvider } from '../../src/features/settings/context/MouseGestureSettingsProvider';
import { LocalizationProvider } from '../../src/shared/localization/LocalizationProvider';

function Reader() {
  const params = new URLSearchParams(location.search);
  const [flow, setFlow] = useState(params.has('flow'));
  const [reading, setReading] = useState(true);
  const content = Array.from({ length: params.has('answer') ? 2 : 40 }, (_, i) => `Paragraph ${i + 1}. Read this passage across the whole phone screen.`).join('\n\n');
  const article = { content, hideTitleHeading: false, nodeId: flow ? 'flow-topic' : 'topic',
    persistedNodeViewState: null, pdfAttachmentId: null, title: 'Display topic', textAnchorDecorations: [] };
  return reading ? <><ImmersiveReadableArticle key={article.nodeId} flow={flow} readableArticle={article} snapshot={null}
    isReviewItem={params.has('answer')} answer={params.has('answer') ? 'Answer text at the bottom.' : null}
    onSaveArticleContent={Object.assign(async (_id: string, saved: string) => ({ content: saved,
      currentVersionId: 'saved', submittedVersionId: 'saved' }), { readSource: async () => ({ content, versionId: 'initial' }) })} onExit={() => setReading(false)}
    header={<button type="button" onClick={() => setFlow(!flow)}>Switch reading route</button>}
    footer={flow ? <CompanionBottomBar className="companion-review-footer"><button type="button">Show answer</button></CompanionBottomBar> : null} />
    {params.has('edge') ? <CompanionFlowEdgeGestures enabled canUndo={params.get('edge') === 'available'} canRedo={false} onApply={() => {}} /> : null}</>
    : <button type="button" onClick={() => setReading(true)}>Return to reading</button>;
}
createRoot(document.getElementById('root')!).render(
  <LocalizationProvider initialLanguagePreference="en"><MouseGestureSettingsProvider><Reader /></MouseGestureSettingsProvider></LocalizationProvider>
);
