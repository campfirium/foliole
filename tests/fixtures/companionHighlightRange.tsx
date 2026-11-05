import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

import '../../src/app/styles.css';
import '../../src/companion/companionMinimal.css';
import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { CompanionDraftProvider } from '../../src/companion/CompanionDraftProvider';
import { ImmersiveReadableArticle } from '../../src/companion/CompanionReadableArticleSurface';
import { MouseGestureSettingsProvider } from '../../src/features/settings/context/MouseGestureSettingsProvider';
import { LocalizationProvider } from '../../src/shared/localization/LocalizationProvider';
import { createExplicitArticleSnapshot, createNodeRecord } from '../../src/shared/platform/companion/reading/companionReadableArticle.testSupport';
import { resolveReadableCompanionArticleByNodeId } from '../../src/shared/platform/companionReadableArticle';
import { createSelectionAnnotationAnchorLink, type SelectionAnnotationPayload } from '../../src/shared/selectionAnnotationActions';
import { buildUpdatedTextAnchorNode } from '../../src/shared/textAnchorRangeUpdate';

const content = 'Alpha Beta Gamma\n\n' + Array.from({ length: 30 }, (_, i) => `Reading paragraph ${i}.`).join('\n\n');
const initial: WorkspaceSnapshot = createExplicitArticleSnapshot();
initial.nodesById['node-1'] = createNodeRecord({ id: 'node-1', content });

// Renderer-only host fixture. Native SQLite persistence is covered by companionHighlightRange.integration.test.tsx.
function Reader() {
  const [snapshot, setSnapshot] = useState(initial);
  function create(payload: SelectionAnnotationPayload) {
    const node = createNodeRecord({ id: 'highlight', parentNodeId: 'node-1', content: payload.selectionText,
      title: payload.selectionText, anchorLink: createSelectionAnnotationAnchorLink(payload, 'highlight')! });
    setSnapshot(current => ({ ...current, nodeOrder: [...current.nodeOrder, node.id], nodesById: { ...current.nodesById, [node.id]: node } }));
    return node.id;
  }
  return <>
    <output aria-label="Saved highlight range" hidden>{JSON.stringify(snapshot.nodesById.highlight?.anchorLink?.locator ?? null)}</output>
    <ImmersiveReadableArticle onExit={() => {}} snapshot={snapshot}
      readableArticle={resolveReadableCompanionArticleByNodeId(snapshot, 'node-1')!}
      onCreateSelectionAnnotation={async (_kind, payload) => create(payload)}
      onAdjustExistingHighlightRange={async (nodeId, range) => {
        if (new URLSearchParams(location.search).has('hold-range')) {
          const response = await fetch('/__range-commit');
          if (!response.ok) throw new Error('range_save_failed');
        }
        const node = buildUpdatedTextAnchorNode({ node: snapshot.nodesById[nodeId]!, parentContent: content,
          range, timestamp: new Date().toISOString() });
        if (!node) return null;
        setSnapshot(current => ({ ...current, nodesById: { ...current.nodesById, [nodeId]: node } }));
        return nodeId;
      }} />
  </>;
}

createRoot(document.getElementById('root')!).render(
  <LocalizationProvider initialLanguagePreference="en"><MouseGestureSettingsProvider>
    <CompanionDraftProvider><Reader /></CompanionDraftProvider>
  </MouseGestureSettingsProvider></LocalizationProvider>
);
