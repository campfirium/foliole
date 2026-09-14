import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';

import { setStoredAppLocale } from '../../shared/localization/appLanguage';
import { LocalizationProvider } from '../../shared/localization/LocalizationProvider';
import { preloadTranslationCatalog } from '../../shared/localization/translations';

import { BackupSearchDialog, type BackupSearchDialogState } from './BackupSearchDialog';

vi.mock('../../features/settings/context/AppearanceSettingsProvider', () => ({
  useAppearanceSettings: () => ({ editorAppearanceKey: 'test' })
}));
vi.mock('../../features/editor/components/MarkdownEditor', () => ({
  MarkdownEditor: ({ readOnly, value }: { readOnly: boolean; value: string }) => (
    <article data-read-only={String(readOnly)}>{value}</article>
  )
}));

beforeAll(async () => {
  await preloadTranslationCatalog('en');
  setStoredAppLocale('en');
});

afterEach(() => cleanup());

const idle: BackupSearchDialogState = {
  current: null,
  currentIndex: -1,
  error: '',
  hasNextInHistory: false,
  historyLength: 0,
  query: '',
  skippedBackupCount: 0,
  status: 'idle'
};

function renderDialog(state: BackupSearchDialogState = idle) {
  const handlers = {
    onCancel: vi.fn(), onClose: vi.fn(), onNext: vi.fn(), onPrevious: vi.fn(),
    onQueryChange: vi.fn(), onSubmit: vi.fn()
  };
  render(<LocalizationProvider><BackupSearchDialog {...handlers} open state={state} /></LocalizationProvider>);
  return handlers;
}

it('does not search on typing and submits only through the explicit action', () => {
  const handlers = renderDialog();
  fireEvent.change(screen.getByLabelText('Search term'), { target: { value: 'needle' } });
  expect(handlers.onQueryChange).toHaveBeenCalledWith('needle');
  expect(handlers.onSubmit).not.toHaveBeenCalled();
  expect(screen.getByText(/will not be restored or changed/i)).toBeInTheDocument();
});

it('shows one full read-only document with backup metadata and navigation', () => {
  const handlers = renderDialog({
    ...idle,
    current: {
      backup_updated_at: '2026-09-10T00:00:00.000Z', content: '# Full original', deleted: true,
      node_id: 'node-1', path: 'Archive / Topic', title: 'Topic'
    },
    currentIndex: 0,
    historyLength: 1,
    query: 'needle',
    status: 'match'
  });
  expect(screen.getByRole('article')).toHaveAttribute('data-read-only', 'true');
  expect(screen.getByRole('article')).toHaveTextContent('# Full original');
  expect(screen.getByText('Archive / Topic')).toBeInTheDocument();
  expect(screen.getByText('In Trash at this time')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(handlers.onNext).toHaveBeenCalledTimes(1);
});

it('keeps viewed content available while reporting a partial completion', () => {
  renderDialog({
    ...idle,
    current: {
      backup_updated_at: '2026-09-10T00:00:00.000Z', content: 'Body', deleted: false,
      node_id: 'node-1', path: 'Topic', title: 'Topic'
    },
    currentIndex: 0,
    historyLength: 1,
    query: 'needle',
    skippedBackupCount: 2,
    status: 'complete'
  });
  expect(screen.getByText(/2 backup files could not be read/i)).toBeInTheDocument();
  expect(screen.getByRole('article')).toHaveTextContent('Body');
});
