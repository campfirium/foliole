import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { DocumentSourceUpdatePanel } from './DocumentSourceUpdatePanel';
import type { PanelBodyCall } from './DocumentSourceUpdatePanel.testSupport';

const { documentPanelBodyMock } = vi.hoisted(() => ({
  documentPanelBodyMock: vi.fn((props: unknown) => {
    void props;
    return <div data-testid="document-panel-body" />;
  })
}));

vi.mock('./DocumentPanelBody', () => ({
  DocumentPanelBody: (props: unknown) => {
    documentPanelBodyMock(props);
    return <div data-testid="document-panel-body" />;
  }
}));

function renderManualPanel(manualContent: string, options: {
  onManualContentChange?: (content: string) => void;
  onManualSaveAsTopic?: () => Promise<void>;
} = {}) {
  renderWithLocalization(
    <DocumentSourceUpdatePanel
      comparisonMode="manual"
      comparisonSource="manual"
      currentContent="alpha\nbeta"
      currentHighlightCount={0}
      currentNodeId="node-1"
      documentMaxWidth={760}
      editorAppearanceKey="appearance-1"
      manualContent={manualContent}
      onCurrentContentChange={() => undefined}
      onManualContentChange={options.onManualContentChange ?? (() => undefined)}
      onManualSaveAsTopic={options.onManualSaveAsTopic ?? (async () => undefined)}
      onManualSetAsBody={async () => undefined}
      onOpenChange={() => undefined}
      onSourceChange={() => undefined}
      open
      sourceAvailable={false}
      updatedContent={manualContent}
      updatedHighlightCount={0}
    />
  );
}

describe('DocumentSourceUpdatePanel manual draft', () => {
  beforeEach(() => documentPanelBodyMock.mockClear());

  it('keeps an empty manual pane editable without presenting the Topic as deleted', () => {
    const onManualContentChange = vi.fn();
    renderManualPanel('', { onManualContentChange });
    const rightPane = (documentPanelBodyMock.mock.calls[1]?.[0] ?? {}) as PanelBodyCall;
    expect(rightPane).not.toMatchObject({ readOnly: true });
    expect(rightPane.editorDiffDecorations).toEqual({ lineDecorations: [], spacerDecorations: [] });
    act(() => rightPane.onEditorChange?.('Pasted text'));
    expect(onManualContentChange).toHaveBeenCalledWith('Pasted text');
    expect(screen.getByRole('button', { name: 'Set as body' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save as new Topic' })).toBeDisabled();
  });

  it('prevents duplicate manual saves while creation is pending', async () => {
    let resolveSave: () => void = () => undefined;
    const onManualSaveAsTopic = vi.fn(() => new Promise<void>((resolve) => {
      resolveSave = resolve;
    }));
    renderManualPanel('Pasted text', { onManualSaveAsTopic });
    const save = screen.getByRole('button', { name: 'Save as new Topic' });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(onManualSaveAsTopic).toHaveBeenCalledTimes(1);
    await act(async () => resolveSave());
  });
});
