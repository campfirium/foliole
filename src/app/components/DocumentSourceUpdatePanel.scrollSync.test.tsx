import { act } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { EditorScrollEvent } from '../../features/editor/adapters/EditorAdapter';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { DocumentSourceUpdatePanel } from './DocumentSourceUpdatePanel';
import { createScrollAdapter, type PanelBodyCall } from './DocumentSourceUpdatePanel.testSupport';

const { documentPanelBodyMock } = vi.hoisted(() => ({ documentPanelBodyMock: vi.fn() }));

vi.mock('./DocumentPanelBody', () => ({
  DocumentPanelBody: (props: unknown) => {
    documentPanelBodyMock(props);
    return <div />;
  }
}));

function renderPanel() {
  renderWithLocalization(
    <DocumentSourceUpdatePanel
      comparisonMode="source_preview"
      comparisonSource="source"
      currentContent="current"
      currentHighlightCount={0}
      currentNodeId="node-1"
      documentMaxWidth={760}
      editorAppearanceKey="appearance-1"
      manualContent=""
      onCurrentContentChange={() => undefined}
      onManualContentChange={() => undefined}
      onManualSaveAsTopic={async () => undefined}
      onManualSetAsBody={async () => undefined}
      onOpenChange={() => undefined}
      onSourceChange={() => undefined}
      open
      sourceAvailable
      updatedContent="updated"
      updatedHighlightCount={0}
    />
  );
}

it('syncs only user-initiated vertical scrolling between editors', () => {
  const currentScrollListeners: Array<(event: EditorScrollEvent) => void> = [];
  let currentScrollTop = 120;
  renderPanel();

  const currentReady = (documentPanelBodyMock.mock.calls[0]?.[0] as PanelBodyCall).onEditorReady;
  const updatedReady = (documentPanelBodyMock.mock.calls[1]?.[0] as PanelBodyCall).onEditorReady;
  const currentAdapter = createScrollAdapter({
    getScrollTop: () => currentScrollTop,
    onScroll: (listener) => {
      currentScrollListeners.push(listener);
      return () => undefined;
    }
  });
  const updatedAdapter = createScrollAdapter();

  act(() => {
    currentReady?.(currentAdapter as never);
    updatedReady?.(updatedAdapter as never);
  });
  expect(updatedAdapter.setScrollTop).toHaveBeenCalledWith(120);

  currentScrollTop = 260;
  act(() => currentScrollListeners.forEach((listener) => listener({ userInitiated: false })));
  expect(updatedAdapter.setScrollTop).toHaveBeenCalledTimes(1);

  act(() => currentScrollListeners.forEach((listener) => listener({ userInitiated: true })));
  expect(updatedAdapter.setScrollTop).toHaveBeenLastCalledWith(260);
});
