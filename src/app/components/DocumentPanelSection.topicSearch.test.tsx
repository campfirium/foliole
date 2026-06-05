import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { documentPanelBodyMock, renderSectionWithProps } from './DocumentPanelSection.testSupport';

async function expectTopicSearchMatch(args: {
  revealSelectionCentered: ReturnType<typeof vi.fn>;
  input: HTMLElement;
  selection: { from: number; to: number };
  status: string;
}) {
  await waitFor(() => {
    expect(args.revealSelectionCentered).toHaveBeenLastCalledWith(args.selection, {
      preserveFocus: true
    });
    expect(screen.getByTestId('topic-search-status')).toHaveTextContent(args.status);
    expect(args.input).toHaveFocus();
  });
}

async function openTopicSearchInput() {
  fireEvent.keyDown(window, { ctrlKey: true, key: 'f' });
  const input = await screen.findByLabelText('Topic search');
  expect(input).toHaveFocus();
  return input;
}

async function createTopicSearchSession() {
  const revealSelection = vi.fn();
  const revealSelectionCentered = vi.fn(() => {
    const editorSink = document.createElement('button');
    editorSink.type = 'button';
    document.body.append(editorSink);
    editorSink.focus();
  });
  const restoreSelection = vi.fn();
  const setSearchDecorations = vi.fn();

  renderSectionWithProps({
    editorContent: 'Alpha beta alpha',
    onRevealDocumentSelection: revealSelection
  });
  const bodyProps = documentPanelBodyMock.mock.calls.at(-1)?.[0];
  bodyProps?.onEditorReady?.({
    onScroll: vi.fn(() => () => undefined),
    revealSelectionCentered,
    restoreSelection,
    setSearchDecorations
  } as never);

  return {
    input: await openTopicSearchInput(),
    revealSelection,
    revealSelectionCentered,
    restoreSelection,
    setSearchDecorations
  };
}

function expectSearchDecorations(
  setSearchDecorations: ReturnType<typeof vi.fn>,
  activeIndex: number
) {
  expect(setSearchDecorations).toHaveBeenLastCalledWith({
    activeIndex,
    matches: [
      { from: 0, to: 5 },
      { from: 11, to: 16 }
    ]
  });
}

function clickNextMatchButton() {
  fireEvent.mouseDown(screen.getByRole('button', { name: 'Next match' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next match' }));
}

describe('DocumentPanelSection topic search', () => {
  it('opens topic search with Ctrl+F and navigates topic matches', async () => {
    const { input, restoreSelection, revealSelection, revealSelectionCentered, setSearchDecorations } = await createTopicSearchSession();
    fireEvent.change(input, { target: { value: 'alpha' } });

    await expectTopicSearchMatch({
      revealSelectionCentered,
      input,
      selection: { from: 0, to: 5 },
      status: '1 / 2'
    });
    expect(revealSelection).not.toHaveBeenCalled();
    expect(restoreSelection).not.toHaveBeenCalled();
    expectSearchDecorations(setSearchDecorations, 0);

    fireEvent.keyDown(input, { key: 'Enter' });

    await expectTopicSearchMatch({
      revealSelectionCentered,
      input,
      selection: { from: 11, to: 16 },
      status: '2 / 2'
    });
    expectSearchDecorations(setSearchDecorations, 1);

    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });

    await expectTopicSearchMatch({
      revealSelectionCentered,
      input,
      selection: { from: 0, to: 5 },
      status: '1 / 2'
    });

    clickNextMatchButton();

    await expectTopicSearchMatch({
      revealSelectionCentered,
      input,
      selection: { from: 11, to: 16 },
      status: '2 / 2'
    });
  });

  it('stays unavailable outside normal topic content', () => {
    renderSectionWithProps({
      nodesById: {
        'node-1': {
          id: 'node-1',
          kind: 'item',
          title: 'Card 1',
          parentNodeId: null,
          content: 'Prompt',
          anchorLink: null,
          reveal: 'Answer',
          review: null,
          createdAt: '',
          updatedAt: ''
        }
      },
      showAnswerSection: true
    });

    fireEvent.keyDown(window, { ctrlKey: true, key: 'f' });

    expect(screen.queryByLabelText('Topic search')).not.toBeInTheDocument();
  });
});
