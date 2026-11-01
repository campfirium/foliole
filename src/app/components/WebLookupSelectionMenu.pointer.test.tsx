import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import { openExternalUrl } from '../../shared/platform/runtimeExternalNavigation';
import { useSelectionAnnotationToolbar } from '../hooks/useSelectionAnnotationToolbar';

import { WebLookupSelectionMenu } from './WebLookupSelectionMenu';

vi.mock('../../shared/platform/runtimeExternalNavigation', () => ({
  openExternalUrl: vi.fn().mockResolvedValue(undefined)
}));

function MenuWithToolbarLifecycle({ text = 'Selected text' }: { text?: string }) {
  const [open, setOpen] = useState(true);
  useSelectionAnnotationToolbar({
    activeNodeId: 'topic',
    editorRef: { current: null },
    isTrashViewOpen: false,
    nodesById: {},
    setContextMenu: () => setOpen(false),
    trashedNodeIds: []
  });
  return open ? <WebLookupSelectionMenu
    left={20}
    onClose={() => setOpen(false)}
    selectionPayload={{
      anchorId: 'anchor',
      clozeContent: text,
      entries: [],
      parentNodeId: 'topic',
      selectionText: text
    }}
    titleText="Topic"
    top={20}
  /> : null;
}

function pressAndClick(element: HTMLElement) {
  fireEvent.pointerDown(element, { button: 0 });
  fireEvent.pointerUp(element, { button: 0 });
  fireEvent.click(element);
}

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(openExternalUrl).mockClear();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) }
  });
});

it.each([
  ['Search with Google', 'https://www.google.com/search?q=Selected%20text'],
  ['Chat with ChatGPT', 'https://chatgpt.com/?prompt=Selected%20text%EF%BC%88%E3%80%8ATopic%E3%80%8B%EF%BC%89']
])('runs %s after a pointer press with the toolbar lifecycle mounted', (label, url) => {
  render(<MenuWithToolbarLifecycle />);
  pressAndClick(screen.getByRole('menuitem', { name: label }));
  expect(openExternalUrl).toHaveBeenCalledExactlyOnceWith(url);
  expect(screen.queryByRole('menu')).toBeNull();
});

it('keeps the long-prompt confirmation actionable after the initial press', async () => {
  render(<MenuWithToolbarLifecycle text={'long selection '.repeat(600)} />);
  pressAndClick(screen.getByRole('menuitem', { name: 'Chat with ChatGPT' }));
  const continueButton = await screen.findByRole('button', { name: 'Continue' });
  expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
  expect(openExternalUrl).not.toHaveBeenCalled();
  pressAndClick(continueButton);
  expect(openExternalUrl).toHaveBeenCalledExactlyOnceWith('https://chatgpt.com/');
  expect(screen.queryByRole('menu')).toBeNull();
});

it('still dismisses the menu when pressing outside it', () => {
  render(<MenuWithToolbarLifecycle />);
  fireEvent.pointerDown(document.body, { button: 0 });
  expect(screen.queryByRole('menu')).toBeNull();
  expect(openExternalUrl).not.toHaveBeenCalled();
});
