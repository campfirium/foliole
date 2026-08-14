import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';

import { setStoredAppLocale } from '../../shared/localization/appLanguage';
import { LocalizationProvider } from '../../shared/localization/LocalizationProvider';
import { preloadTranslationCatalog } from '../../shared/localization/translations';

import { ReviewSourceTopicDeleteDialog } from './ReviewSourceTopicDeleteDialog';

beforeAll(async () => {
  await preloadTranslationCatalog('en');
  setStoredAppLocale('en');
});

afterEach(() => cleanup());

function renderDialog(input: {
  deleteSourceTopicShortcuts?: ComponentProps<typeof ReviewSourceTopicDeleteDialog>['deleteSourceTopicShortcuts'];
} = {}) {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  render(
    <LocalizationProvider>
      <ReviewSourceTopicDeleteDialog
        deleteSourceTopicShortcuts={input.deleteSourceTopicShortcuts ?? { primary: { key: 't', altKey: true } }}
        isOpen
        nodeTitle="Source Topic"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    </LocalizationProvider>
  );
  return { dialog: screen.getByRole('dialog', { name: 'Delete source topic?' }), onCancel, onConfirm };
}

it('does not retain plain T when the configured command uses Alt+T', () => {
  const globalDeleteCurrentItem = vi.fn();
  window.addEventListener('keydown', globalDeleteCurrentItem);
  const { dialog, onConfirm } = renderDialog();

  fireEvent.keyDown(dialog, { key: 't' });

  expect(onConfirm).not.toHaveBeenCalled();
  expect(globalDeleteCurrentItem).toHaveBeenCalledTimes(1);
  window.removeEventListener('keydown', globalDeleteCurrentItem);
});

it('confirms with the resolved delete source topic shortcut', () => {
  const { dialog, onConfirm } = renderDialog();

  fireEvent.keyDown(dialog, { altKey: true, key: 't' });

  expect(onConfirm).toHaveBeenCalledTimes(1);
});

it('honors customized delete source topic shortcuts', () => {
  const { dialog, onConfirm } = renderDialog({
    deleteSourceTopicShortcuts: { primary: { key: 'k', altKey: true } }
  });

  fireEvent.keyDown(dialog, { altKey: true, key: 'k' });

  expect(onConfirm).toHaveBeenCalledTimes(1);
});

it('does not confirm with F or plain Enter', () => {
  const { dialog, onConfirm } = renderDialog();
  const confirmButton = screen.getByRole('button', { name: 'Delete source topic' });

  expect(document.activeElement).not.toBe(confirmButton);
  fireEvent.keyDown(dialog, { key: 'f' });
  fireEvent.keyDown(dialog, { key: 'Enter' });

  expect(onConfirm).not.toHaveBeenCalled();
});

it('keeps Escape on the cancel path', async () => {
  const { dialog, onCancel, onConfirm } = renderDialog();

  fireEvent.keyDown(dialog, { key: 'Escape' });

  await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
  expect(onConfirm).not.toHaveBeenCalled();
});

it('ignores editable targets', () => {
  const { dialog, onConfirm } = renderDialog();
  const input = document.createElement('input');
  dialog.append(input);
  input.focus();

  fireEvent.keyDown(input, { key: 't' });

  expect(onConfirm).not.toHaveBeenCalled();
});

it('ignores composing, repeated, and already prevented key events', () => {
  const { dialog, onConfirm } = renderDialog();
  fireEvent.keyDown(dialog, { key: 't', repeat: true });

  const composingEvent = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 't' });
  Object.defineProperty(composingEvent, 'isComposing', { value: true });
  fireEvent(dialog, composingEvent);

  const preventedEvent = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 't' });
  preventedEvent.preventDefault();
  fireEvent(dialog, preventedEvent);

  expect(onConfirm).not.toHaveBeenCalled();
});
