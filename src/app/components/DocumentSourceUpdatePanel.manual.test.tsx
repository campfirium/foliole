import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { DocumentSourceUpdatePanel } from './DocumentSourceUpdatePanel';
import {
  attachPanelAdapters,
  createScrollAdapter,
  type PanelBodyCall
} from './DocumentSourceUpdatePanel.testSupport';

const { documentPanelBodyMock, documentPanelBodyMountCounter, overviewRulerMock } = vi.hoisted(() => ({
  documentPanelBodyMock: vi.fn((props: unknown) => {
    void props;
    return <div data-testid="document-panel-body" />;
  }),
  documentPanelBodyMountCounter: { value: 0 },
  overviewRulerMock: vi.fn((props: unknown) => {
    void props;
    return <div data-testid="overview-ruler" />;
  })
}));

vi.mock('./DocumentPanelBody', async () => {
  const React = await import('react');
  return { DocumentPanelBody: (props: unknown) => {
    const mountIdRef = React.useRef(0);
    if (mountIdRef.current === 0) mountIdRef.current = ++documentPanelBodyMountCounter.value;
    documentPanelBodyMock(props);
    return <div
      data-content={(props as PanelBodyCall).editorContent}
      data-mount-id={mountIdRef.current}
      data-testid="document-panel-body"
    />;
  } };
});

vi.mock('./SourceUpdateOverviewRuler', () => ({
  SourceUpdateOverviewRuler: (props: unknown) => {
    overviewRulerMock(props);
    return <div data-testid="overview-ruler" />;
  }
}));

function createManualPanel(manualContent: string, options: {
  onManualContentChange?: (content: string) => void;
  onManualSaveAsTopic?: () => Promise<void>;
  onManualSetAsBody?: () => Promise<void>;
} = {}) {
  return (
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

function renderManualPanel(manualContent: string, options: Parameters<typeof createManualPanel>[1] = {}) {
  return renderWithLocalization(createManualPanel(manualContent, options));
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
    view.rerender(createManualPanel('Locally edited draft'));
    const latestRightPane = (documentPanelBodyMock.mock.calls.at(-1)?.[0] ?? {}) as PanelBodyCall;
    expect(latestRightPane.editorContent).toBe('Initial draft');
  });

  it('applies externally restored draft content without remounting the right editor', async () => {
    const view = renderManualPanel('Initial draft');
    const initialRightPane = screen.getAllByTestId('document-panel-body')[1];
    const initialMountId = initialRightPane?.getAttribute('data-mount-id');

    view.rerender(createManualPanel('Restored draft'));
    await act(async () => undefined);

    const restoredRightPane = screen.getAllByTestId('document-panel-body')[1];
    expect(restoredRightPane).toHaveAttribute('data-content', 'Restored draft');
    expect(restoredRightPane).toHaveAttribute('data-mount-id', initialMountId);
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
