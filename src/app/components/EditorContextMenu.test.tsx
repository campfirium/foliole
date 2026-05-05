import { fireEvent, render, screen } from '@testing-library/react';
import { it, expect, vi } from 'vitest';

import { EditorContextMenu } from './EditorContextMenu';

it('keeps annotation actions out of the image context menu', () => {
  render(
    <EditorContextMenu
      kind="image"
      left={16}
      top={24}
      onClose={vi.fn()}
      onCopyImage={vi.fn()}
      onCreateCloze={vi.fn()}
      onCreateHighlight={vi.fn()}
      onCreateNote={vi.fn()}
      onDeleteExistingHighlight={vi.fn()}
      onCutImage={vi.fn()}
      onDeleteImage={vi.fn()}
      onExportImage={vi.fn()}
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
      onClose={vi.fn()}
      onCopyImage={vi.fn()}
      onCreateCloze={vi.fn()}
      onCreateHighlight={vi.fn()}
      onCreateNote={vi.fn()}
      onDeleteExistingHighlight={vi.fn()}
      onCutImage={vi.fn()}
      onDeleteImage={vi.fn()}
      onExportImage={vi.fn()}
    />
  );

  expect(screen.getByRole('toolbar')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Highlight' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add Note' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cloze' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument();
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
      onClose={onClose}
      onCopyImage={vi.fn()}
      onCreateCloze={vi.fn()}
      onCreateHighlight={vi.fn()}
      onCreateNote={onCreateNote}
      onDeleteExistingHighlight={vi.fn()}
      onCutImage={vi.fn()}
      onDeleteImage={vi.fn()}
      onExportImage={vi.fn()}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: 'Add Note' }));
  const noteInput = screen.getByPlaceholderText('Add a note...');
  expect(noteInput.closest('[data-annotation-toolbar="true"]')).toHaveStyle({ left: '48px', top: '96px' });
  fireEvent.change(noteInput, { target: { value: 'My note' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(onCreateNote).toHaveBeenCalledWith('My note');
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('renders existing highlight actions without cloze', () => {
  const onDeleteExistingHighlight = vi.fn();
  render(
    <EditorContextMenu
      kind="selection"
      left={16}
      mode="existing-highlight-toolbar"
      top={24}
      onClose={vi.fn()}
      onCopyImage={vi.fn()}
      onCreateCloze={vi.fn()}
      onCreateHighlight={vi.fn()}
      onCreateNote={vi.fn()}
      onDeleteExistingHighlight={onDeleteExistingHighlight}
      onCutImage={vi.fn()}
      onDeleteImage={vi.fn()}
      onExportImage={vi.fn()}
    />
  );

  expect(screen.getByRole('button', { name: 'Close Highlight' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add Note' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Cloze' })).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Close Highlight' }));
  expect(onDeleteExistingHighlight).toHaveBeenCalledTimes(1);
});
