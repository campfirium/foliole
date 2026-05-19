import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { openExternalUrl } from '../../shared/platform/runtimeExternalNavigation';

import { EditorContextMenu } from './EditorContextMenu';

vi.mock('../../shared/platform/runtimeExternalNavigation', () => ({
  openExternalUrl: vi.fn().mockResolvedValue(undefined)
}));

function createSelectionPayload() {
  return {
    anchorId: 'anchor-1',
    clozeContent: 'Selected text that should be a highlight',
    entries: [{
      anchorId: 'anchor-1',
      clozeContent: 'Selected text that should be a highlight',
      locator: { from: 0, originalText: 'Selected text that should be a highlight', to: 39 },
      range: { from: 0, to: 39 },
      selectionText: 'Selected text that should be a highlight'
    }],
    parentNodeId: 'node-1',
    selectionText: 'Selected text that should be a highlight'
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
      {...requiredActionProps({ onClose })}
    />
  );

  expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
    'Ask ChatGPT about selection',
    'Search with Google'
  ]);

  fireEvent.click(screen.getByRole('menuitem', { name: 'Ask ChatGPT about selection' }));
  expect(openExternalUrl).toHaveBeenCalledWith('https://chatgpt.com/?prompt=Summarize%20the%20following%20content:%0A%0AContent:%0ASelected%20text%20that%20should%20be%20a%20highlight');
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
      {...requiredActionProps()}
    />
  );

  expect(screen.queryByRole('menuitem', { name: 'Ask ChatGPT about selection' })).toBeNull();
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
      {...requiredActionProps()}
    />
  );

  fireEvent.click(screen.getByRole('menuitem', { name: 'Ask ChatGPT about full content' }));

  expect(openExternalUrl).toHaveBeenCalledWith('https://chatgpt.com/?prompt=Summarize%20the%20following%20content:%0A%0AContent:%0AFull%20topic%20text');
  expect(screen.queryByRole('menuitem', { name: 'Search with Google' })).toBeNull();
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
