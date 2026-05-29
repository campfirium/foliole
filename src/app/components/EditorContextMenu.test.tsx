import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, it, expect, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';

import { EditorContextMenu } from './EditorContextMenu';

function createLongClozePayload() {
  return {
    anchorId: 'anchor-1',
    clozeContent: 'A'.repeat(501),
    entries: [{
      anchorId: 'anchor-1',
      clozeContent: 'A'.repeat(501),
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
});

it('keeps annotation actions out of the image context menu', () => {
  render(
    <EditorContextMenu
      kind="image"
      left={16}
      top={24}
      {...requiredActionProps()}
    />
  );

  expect(screen.queryByRole('menuitem', { name: 'Highlight' })).toBeNull();
  expect(screen.queryByRole('menuitem', { name: 'Cloze' })).toBeNull();
  expect(screen.getByRole('menuitem', { name: 'Copy image' })).toBeInTheDocument();
});

it('renders selection annotation actions as a floating toolbar', () => {
  render(
    <EditorContextMenu
      kind="selection"
      left={16}
      mode="annotation-toolbar"
      notePanelLeft={48}
      notePanelTop={96}
      top={24}
      {...requiredActionProps()}
    />
  );

  expect(screen.getByRole('toolbar')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Highlight' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add Comment' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cloze' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument();
});

it('shows an app panel before creating a long cloze front', () => {
  const onCreateCloze = vi.fn();
  const onCreateHighlight = vi.fn();
  const onCreateClozeFromPayload = vi.fn();
  const onCreateHighlightFromPayload = vi.fn();

  render(
    <EditorContextMenu
      kind="selection"
      left={16}
      mode="annotation-toolbar"
      notePanelLeft={48}
      notePanelTop={96}
      selectionPayload={createLongClozePayload()}
      top={24}
      {...requiredActionProps({
        onCreateCloze,
        onCreateClozeFromPayload,
        onCreateHighlight,
        onCreateHighlightFromPayload
      })}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: 'Cloze' }));

  expect(screen.getByText('Confirm action')).toBeInTheDocument();
  expect(screen.queryByText(/foliole/i)).toBeNull();

  const highlightButtons = screen.getAllByRole('button', { name: 'Highlight' });
  fireEvent.click(highlightButtons[highlightButtons.length - 1]!);
  expect(onCreateHighlightFromPayload).toHaveBeenCalledWith(createLongClozePayload());

  const clozeButtons = screen.getAllByRole('button', { name: 'Cloze' });
  fireEvent.click(clozeButtons[clozeButtons.length - 1]!);
  expect(onCreateClozeFromPayload).toHaveBeenCalledWith(createLongClozePayload(), { skipGuard: true });
  expect(onCreateCloze).not.toHaveBeenCalled();
  expect(onCreateHighlight).not.toHaveBeenCalled();
});

it('converts a long cloze front from the floating toolbar when conversion mode is enabled', () => {
  const onCreateClozeFromPayload = vi.fn();
  const onCreateHighlightFromPayload = vi.fn();
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.longClozeFrontGuardMode, 'convert');

  render(
    <EditorContextMenu
      kind="selection"
      left={16}
      mode="annotation-toolbar"
      selectionPayload={createLongClozePayload()}
      top={24}
      {...requiredActionProps({
        onCreateClozeFromPayload,
        onCreateHighlightFromPayload
      })}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: 'Cloze' }));

  expect(onCreateHighlightFromPayload).toHaveBeenCalledWith(createLongClozePayload());
  expect(onCreateClozeFromPayload).not.toHaveBeenCalled();
  expect(screen.queryByText('Long cloze')).toBeNull();
});

it('saves add note text from the floating note panel', () => {
  const onCreateNote = vi.fn();
  const onClose = vi.fn();
  render(
    <EditorContextMenu
      kind="selection"
      left={16}
      mode="annotation-toolbar"
      notePanelLeft={48}
      notePanelTop={96}
      top={24}
      {...requiredActionProps({ onClose, onCreateNote })}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: 'Add Comment' }));
  const noteInput = screen.getByPlaceholderText('Add a comment...');
  expect(noteInput.closest('[data-annotation-toolbar="true"]')).toHaveStyle({ left: '48px', top: '96px' });
  fireEvent.change(noteInput, { target: { value: 'My note' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(onCreateNote).toHaveBeenCalledWith('My note');
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('renders existing highlight actions without cloze', () => {
  const onDeleteExistingHighlight = vi.fn();
  const onOpenExistingHighlight = vi.fn();
  render(
    <EditorContextMenu
      kind="selection"
      left={16}
      mode="existing-highlight-toolbar"
      top={24}
      {...requiredActionProps({ onDeleteExistingHighlight, onOpenExistingHighlight })}
    />
  );

  expect(screen.getByRole('button', { name: 'Close Highlight' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add Comment' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Cloze' })).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Close Highlight' }));
  expect(onDeleteExistingHighlight).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  expect(onOpenExistingHighlight).toHaveBeenCalledTimes(1);
});
