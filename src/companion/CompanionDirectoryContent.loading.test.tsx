import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { CompanionDirectoryContent } from './CompanionDirectoryContent';

vi.mock('../shared/localization/LocalizationProvider', async (importOriginal) => ({
  ...await importOriginal<typeof import('../shared/localization/LocalizationProvider')>(),
  useTranslation: () => (key: string) => key
}));

vi.mock('./useCompanionExternalDirectory', () => ({
  useCompanionExternalDirectory: () => ({ entries: [], folders: [] }),
  useCompanionExternalDocument: () => null
}));

it('waits quietly for an opened document and keeps the return action available', () => {
  const onExitArticle = vi.fn();
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
