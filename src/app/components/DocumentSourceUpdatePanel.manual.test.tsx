import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { DocumentSourceUpdatePanel } from './DocumentSourceUpdatePanel';
import {
  attachPanelAdapters,
  createScrollAdapter,
  type PanelBodyCall
} from './DocumentSourceUpdatePanel.testSupport';

const { documentPanelBodyMock, overviewRulerMock } = vi.hoisted(() => ({
  documentPanelBodyMock: vi.fn((props: unknown) => {
    void props;
    return <div data-testid="document-panel-body" />;
  }),
  overviewRulerMock: vi.fn((props: unknown) => {
    void props;
    return <div data-testid="overview-ruler" />;
  })
}));

vi.mock('./DocumentPanelBody', () => ({
  DocumentPanelBody: (props: unknown) => {
    documentPanelBodyMock(props);
    return <div data-testid="document-panel-body" />;
  }
}));

vi.mock('./SourceUpdateOverviewRuler', () => ({
  SourceUpdateOverviewRuler: (props: unknown) => {
    overviewRulerMock(props);
    return <div data-testid="overview-ruler" />;
  }
}));

function renderManualPanel(manualContent: string, options: {
  onManualContentChange?: (content: string) => void;
  onManualSaveAsTopic?: () => Promise<void>;
  onManualSetAsBody?: () => Promise<void>;
} = {}) {
  return renderWithLocalization(
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
      onManualSetAsBody={options.onManualSetAsBody ?? (async () => undefined)}
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
    expect(onManualContentChange).not.toHaveBeenCalled();
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

describe('DocumentSourceUpdatePanel live editor isolation', () => {
  beforeEach(() => {
    documentPanelBodyMock.mockClear();
    overviewRulerMock.mockClear();
  });

  it('does not rerender comparison siblings for each editor input', () => {
    vi.useFakeTimers();
    renderManualPanel('Initial draft');
    const initialRenderCount = overviewRulerMock.mock.calls.length;
    const rightPane = (documentPanelBodyMock.mock.calls[1]?.[0] ?? {}) as PanelBodyCall;

    act(() => {
      rightPane.onEditorChange?.('Initial draft a');
      rightPane.onEditorChange?.('Initial draft ab');
      rightPane.onEditorChange?.('Initial draft abc');
    });
    expect(overviewRulerMock).toHaveBeenCalledTimes(initialRenderCount);

    act(() => vi.advanceTimersByTime(300));
    expect(overviewRulerMock).toHaveBeenCalledTimes(initialRenderCount + 1);
    vi.useRealTimers();
  });
});

describe('DocumentSourceUpdatePanel live editor actions', () => {
  beforeEach(() => {
    documentPanelBodyMock.mockClear();
    overviewRulerMock.mockClear();
  });

  it('keeps settled comparison snapshots from replacing the live editor document', () => {
    const view = renderManualPanel('Initial draft');
    const firstRightPane = (documentPanelBodyMock.mock.calls[1]?.[0] ?? {}) as PanelBodyCall;
    act(() => firstRightPane.onEditorChange?.('Locally edited draft'));
    view.rerender(
      <DocumentSourceUpdatePanel
        comparisonMode="manual"
        comparisonSource="manual"
        currentContent="alpha\nbeta"
        currentHighlightCount={0}
        currentNodeId="node-1"
        documentMaxWidth={760}
        editorAppearanceKey="appearance-1"
        manualContent="Locally edited draft"
        onCurrentContentChange={() => undefined}
        onManualContentChange={() => undefined}
        onManualSaveAsTopic={async () => undefined}
        onManualSetAsBody={async () => undefined}
        onOpenChange={() => undefined}
        onSourceChange={() => undefined}
        open
        sourceAvailable={false}
        updatedContent="Locally edited draft"
        updatedHighlightCount={0}
      />
    );
    const latestRightPane = (documentPanelBodyMock.mock.calls.at(-1)?.[0] ?? {}) as PanelBodyCall;
    expect(latestRightPane.editorContent).toBe('Initial draft');
  });

  it('reads the live editor document before an explicit manual action', async () => {
    const onManualContentChange = vi.fn();
    const onManualSetAsBody = vi.fn(async () => undefined);
    renderManualPanel('Settled draft', { onManualContentChange, onManualSetAsBody });
    attachPanelAdapters(
      documentPanelBodyMock.mock.calls,
      createScrollAdapter({ content: 'Current body' }),
      createScrollAdapter({ content: 'Live final draft' })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Set as body' }));
    await act(async () => undefined);

    expect(onManualContentChange).toHaveBeenCalledWith('Live final draft');
    expect(onManualSetAsBody).toHaveBeenCalledTimes(1);
    expect(onManualContentChange.mock.invocationCallOrder[0]).toBeLessThan(
      onManualSetAsBody.mock.invocationCallOrder[0] ?? 0
    );
  });
});
