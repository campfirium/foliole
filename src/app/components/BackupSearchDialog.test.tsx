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

const first = {
  backup_name: 'manual-2026-09-10.db.gz',
  backup_updated_at: '2026-09-10T00:00:00.000Z',
  content: '# Full original',
  deleted: true,
  node_id: 'node-1',
  path: 'Archive / Topic',
  title: 'Topic'
};

const idle: BackupSearchDialogState = {
  current: null,
  currentIndex: -1,
  error: '',
  history: [],
  query: '',
  skippedBackupCount: 0,
  status: 'idle',
  submittedQuery: ''
};

function renderDialog(state: BackupSearchDialogState = idle) {
  const handlers = {
    onCancel: vi.fn(), onClose: vi.fn(), onContinue: vi.fn(), onQueryChange: vi.fn(),
    onSelect: vi.fn(), onSubmit: vi.fn()
  };
  render(<LocalizationProvider><BackupSearchDialog {...handlers} open state={state} /></LocalizationProvider>);
  return handlers;
}

it('explains the action only in settings copy and waits for explicit search', () => {
  const handlers = renderDialog();
  fireEvent.change(screen.getByLabelText('Search term'), { target: { value: 'needle' } });
  expect(handlers.onQueryChange).toHaveBeenCalledWith('needle');
  expect(handlers.onSubmit).not.toHaveBeenCalled();
  expect(screen.getByText('Enter a search term.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();
});

it('shows accumulated results at left and only original content at right', () => {
  const handlers = renderDialog({
    ...idle,
    current: first,
    currentIndex: 0,
    history: [first],
    query: 'needle',
    status: 'match',
    submittedQuery: 'needle'
  });
  expect(screen.getByRole('article')).toHaveAttribute('data-read-only', 'true');
  expect(screen.getByRole('article')).toHaveTextContent('# Full original');
  const result = screen.getByRole('button', { name: /Topic/ });
  expect(result).not.toHaveTextContent('manual-2026-09-10.db.gz');
  expect(screen.getByTitle('manual-2026-09-10.db.gz')).toBeInTheDocument();
  expect(screen.getByLabelText('In Trash')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Topic/ }));
  expect(handlers.onSelect).toHaveBeenCalledWith(0);
  const continueButton = screen.getByRole('button', { name: 'Continue search' });
  expect(continueButton).toHaveTextContent('');
  fireEvent.click(continueButton);
  expect(handlers.onContinue).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/Backup from/)).not.toBeInTheDocument();
});

it('switches back to search after the query changes', () => {
  const handlers = renderDialog({
    ...idle,
    current: first,
    currentIndex: 0,
    history: [first],
    query: 'different',
    status: 'match',
    submittedQuery: 'needle'
  });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  expect(handlers.onSubmit).toHaveBeenCalledTimes(1);
  expect(handlers.onContinue).not.toHaveBeenCalled();
});

it('keeps results visible while reporting partial completion', () => {
  renderDialog({
    ...idle,
    current: first,
    currentIndex: 0,
    history: [first],
    query: 'needle',
    skippedBackupCount: 2,
    status: 'complete',
    submittedQuery: 'needle'
  });
  expect(screen.getByText(/2 backup files could not be read/i)).toBeInTheDocument();
  expect(screen.getByRole('article')).toHaveTextContent('# Full original');
  expect(screen.getByRole('button', { name: 'No more results' })).toBeDisabled();
});
