import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { EditorContextMenu } from './EditorContextMenu';

function openAnnotation(onCreateNote: (note: string) => Promise<boolean>, onClose: () => void) {
  renderWithLocalization(
    <EditorContextMenu
      kind="selection"
      left={16}
      mode="annotation-toolbar"
      top={24}
      onClose={onClose}
      onCopyImage={vi.fn()}
      onCreateCloze={vi.fn()}
      onCreateClozeFromPayload={vi.fn()}
      onCreateHighlight={vi.fn()}
      onCreateHighlightFromPayload={vi.fn()}
      onCreateNote={onCreateNote}
      onDeleteExistingHighlight={vi.fn()}
      onOpenExistingHighlight={vi.fn()}
      onCutImage={vi.fn()}
      onDeleteImage={vi.fn()}
      onExportImage={vi.fn()}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: 'Add Annotation' }));
  return screen.getByPlaceholderText<HTMLTextAreaElement>('Add an annotation...');
}

it('keeps the annotation draft and reports a failed save', async () => {
  const onCreateNote = vi.fn(async () => false);
  const onClose = vi.fn();
  const input = openAnnotation(onCreateNote, onClose);
  fireEvent.change(input, { target: { value: 'Reader thought' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save annotation. Try again.');
  expect(screen.getByPlaceholderText('Add an annotation...')).toHaveValue('Reader thought');
  expect(onCreateNote).toHaveBeenCalledTimes(1);
  expect(onClose).not.toHaveBeenCalled();
});

it('keeps the submitted annotation read-only until its save is acknowledged', async () => {
  const receipt = Promise.withResolvers<boolean>();
  const onCreateNote = vi.fn(() => receipt.promise);
  const onClose = vi.fn();
  const input = openAnnotation(onCreateNote, onClose);
  expect(input.readOnly).toBe(false);
  fireEvent.change(input, { target: { value: 'First thought' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(onCreateNote).toHaveBeenCalledExactlyOnceWith('First thought');
  expect(input.readOnly).toBe(true);
  expect(onClose).not.toHaveBeenCalled();

  receipt.resolve(true);
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
});
