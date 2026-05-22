import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { openExternalUrl } from '../../shared/platform/runtimeExternalNavigation';

import { EditorContextMenu } from './EditorContextMenu';

vi.mock('../../shared/platform/runtimeExternalNavigation', () => ({
  openExternalUrl: vi.fn().mockResolvedValue(undefined)
}));

function createSelectionPayload(selectionText = 'Selected text that should be a highlight') {
  return {
    anchorId: 'anchor-1',
    clozeContent: selectionText,
    entries: [{
      anchorId: 'anchor-1',
      clozeContent: selectionText,
      locator: { from: 0, originalText: selectionText, to: selectionText.length },
      range: { from: 0, to: selectionText.length },
      selectionText
    }],
    parentNodeId: 'node-1',
    selectionText
  };
}

function requiredActionProps(overrides: Record<string, unknown> = {}) {
  return {
    onClose: vi.fn(),
    onCopyImage: vi.fn(),
    onCreateCloze: vi.fn(),
    onCreateClozeFromPayload: vi.fn(),
    onCreateHighlight: vi.fn(),
    onCreateHighlightFromPayload: vi.fn(),
    onCreateNote: vi.fn(),
    onDeleteExistingHighlight: vi.fn(),
    onOpenExistingHighlight: vi.fn(),
    onCutImage: vi.fn(),
    onDeleteImage: vi.fn(),
    onExportImage: vi.fn(),
    ...overrides
  };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(openExternalUrl).mockClear();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) }
  });
});

it('renders enabled web lookup entries from the live selection payload', () => {
  const onClose = vi.fn();
  const payload = createSelectionPayload();
  render(
    <EditorContextMenu
      kind="selection"
      left={16}
      mode="context-menu"
      selectionPayload={payload}
      top={24}
      webLookupDocumentText="Full topic text"
      webLookupPayload={payload}
      webLookupTitle="My Topic"
      {...requiredActionProps({ onClose })}
    />
  );

  expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
    'Chat with ChatGPT',
    'Search with Google'
  ]);

  fireEvent.click(screen.getByRole('menuitem', { name: 'Chat with ChatGPT' }));
  expect(openExternalUrl).toHaveBeenCalledWith('https://chatgpt.com/?prompt=Selected%20text%20that%20should%20be%20a%20highlight%EF%BC%88%E3%80%8AMy%20Topic%E3%80%8B%EF%BC%89');
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('keeps hidden web lookup entries out of the selection context menu', () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.webLookupEntries, JSON.stringify([
    { id: 'chatgpt', enabled: false },
    { id: 'duckduckgo', enabled: true }
  ]));
  const payload = createSelectionPayload();

  render(
    <EditorContextMenu
      kind="selection"
      left={16}
      mode="context-menu"
      selectionPayload={payload}
      top={24}
      webLookupDocumentText="Full topic text"
      webLookupPayload={payload}
      webLookupTitle="My Topic"
      {...requiredActionProps()}
    />
  );

  expect(screen.queryByRole('menuitem', { name: 'Chat with ChatGPT' })).toBeNull();
  expect(screen.getByRole('menuitem', { name: 'Search with Google' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Search with DuckDuckGo' })).toBeInTheDocument();
});

it('opens ChatGPT with topic text without reusing a preserved command selection when the live selection is empty', () => {
  render(
    <EditorContextMenu
      kind="selection"
      left={16}
      mode="context-menu"
      selectionPayload={createSelectionPayload()}
      top={24}
      webLookupDocumentText="Full topic text"
      webLookupPayload={null}
      webLookupTitle="My Topic"
      {...requiredActionProps()}
    />
  );

  fireEvent.click(screen.getByRole('menuitem', { name: 'Chat with ChatGPT' }));

  expect(openExternalUrl).toHaveBeenCalledWith('https://chatgpt.com/?prompt=Full%20topic%20text%EF%BC%88%E3%80%8AMy%20Topic%E3%80%8B%EF%BC%89');
  expect(screen.queryByRole('menuitem', { name: 'Search with Google' })).toBeNull();
});

it('copies a selected prompt above the measured ChatGPT URL boundary before opening ChatGPT', async () => {
  const onClose = vi.fn();
  const longSelection = 'a'.repeat(5900);
  const payload = createSelectionPayload(longSelection);
  render(
    <EditorContextMenu
      kind="selection"
      left={16}
      mode="context-menu"
      selectionPayload={payload}
      top={24}
      webLookupDocumentText="Full topic text"
      webLookupPayload={payload}
      webLookupTitle="My Topic"
      {...requiredActionProps({ onClose })}
    />
  );

  fireEvent.click(screen.getByRole('menuitem', { name: 'Chat with ChatGPT' }));

  expect(await screen.findByRole('status')).toHaveTextContent('Selection is too long to send this way');
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${longSelection}（《My Topic》）`);
  expect(openExternalUrl).not.toHaveBeenCalled();
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(openExternalUrl).toHaveBeenCalledWith('https://chatgpt.com/');
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('copies topic text above the measured ChatGPT URL boundary and lets the user cancel opening ChatGPT', async () => {
  const onClose = vi.fn();
  const longDocument = 'b'.repeat(5900);
  render(
    <EditorContextMenu
      kind="selection"
      left={16}
      mode="context-menu"
      selectionPayload={createSelectionPayload()}
      top={24}
      webLookupDocumentText={longDocument}
      webLookupPayload={null}
      webLookupTitle="My Topic"
      {...requiredActionProps({ onClose })}
    />
  );

  fireEvent.click(screen.getByRole('menuitem', { name: 'Chat with ChatGPT' }));

  expect(await screen.findByRole('status')).toHaveTextContent('Full topic is too long to send this way');
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${longDocument}（《My Topic》）`);
  expect(openExternalUrl).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(openExternalUrl).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('keeps the editor click target reachable while the web lookup menu is open', () => {
  const onClose = vi.fn();
  const onPointerDown = vi.fn();
  render(
    <>
      <button onPointerDown={onPointerDown} type="button">Prompt editor</button>
      <EditorContextMenu
        kind="selection"
        left={16}
        mode="context-menu"
        selectionPayload={createSelectionPayload()}
        top={24}
        webLookupDocumentText="Full topic text"
        webLookupPayload={null}
        {...requiredActionProps({ onClose })}
      />
    </>
  );

  fireEvent.pointerDown(screen.getByRole('button', { name: 'Prompt editor' }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onPointerDown).toHaveBeenCalledTimes(1);
});

it('hides web actions when the live selection and topic text are empty', () => {
  const { container } = render(
    <EditorContextMenu
      kind="selection"
      left={16}
      mode="context-menu"
      selectionPayload={null}
      top={24}
      webLookupDocumentText="   "
      webLookupPayload={null}
      {...requiredActionProps()}
    />
  );

  expect(container).toBeEmptyDOMElement();
});
