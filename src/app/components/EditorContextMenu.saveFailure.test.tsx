import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { EditorContextMenu } from './EditorContextMenu';

it('keeps the annotation draft and reports a failed save', async () => {
  const onCreateNote = vi.fn(async () => false);
  const onClose = vi.fn();
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
  fireEvent.change(screen.getByPlaceholderText('Add an annotation...'), {
    target: { value: 'Reader thought' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save annotation. Try again.');
  expect(screen.getByPlaceholderText('Add an annotation...')).toHaveValue('Reader thought');
  expect(onCreateNote).toHaveBeenCalledTimes(1);
  expect(onClose).not.toHaveBeenCalled();
});
