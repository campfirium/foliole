import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { CompanionDirectoryContent } from './CompanionDirectoryContent';

vi.mock('../shared/localization/LocalizationProvider', async (importOriginal) => ({
  ...await importOriginal<typeof import('../shared/localization/LocalizationProvider')>(),
  useTranslation: () => (key: string) => key
}));

const external = vi.hoisted(() => ({ document: vi.fn() }));

vi.mock('./useCompanionExternalDirectory', () => ({
  useCompanionExternalDirectory: () => ({ entries: [], folders: [] }),
  useCompanionExternalDocument: external.document
}));

it('waits quietly for an opened document and keeps the return action available', () => {
  const onExitArticle = vi.fn();
  external.document.mockReturnValue(undefined);
  render(<CompanionDirectoryContent
    articleOnly
    onChangeSelection={vi.fn()}
    onExitArticle={onExitArticle}
    onSelectNode={vi.fn()}
    selection={{ documentId: 'external-1:doc.md', kind: 'externalDocument' }}
    snapshot={null}
    sortDirection="asc"
    sortKey="name"
  />);

  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.queryByText('companion.topicBody.loading.title')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'companion.back' }));
  expect(onExitArticle).toHaveBeenCalledWith({ kind: 'root' });
});

it('shows an unavailable result and offers a return after the read settles without a document', () => {
  const onExitArticle = vi.fn();
  external.document.mockReturnValue(null);
  render(<CompanionDirectoryContent
    articleOnly
    onChangeSelection={vi.fn()}
    onExitArticle={onExitArticle}
    onSelectNode={vi.fn()}
    selection={{ documentId: 'external-1:missing.md', kind: 'externalDocument' }}
    snapshot={null}
    sortDirection="asc"
    sortKey="name"
  />);
  expect(screen.getByRole('status')).toHaveTextContent('companion.search.unavailable');
  expect(screen.queryByRole('status')?.closest('[aria-busy="true"]')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'companion.back' }));
  expect(onExitArticle).toHaveBeenCalledWith({ kind: 'root' });
});
