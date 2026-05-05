import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';

function getNodeListPanel() {
  return screen.getByRole('complementary', { name: 'Node list panel' });
}

it('shows Inbox in the node tree and opens its empty state landing', () => {
  render(<App />);

  const inboxItem = within(getNodeListPanel()).getByRole('treeitem', { name: 'Inbox' });
  expect(inboxItem).toBeInTheDocument();

  fireEvent.click(inboxItem);

  expect(screen.getByText('Inbox is ready')).toBeInTheDocument();
  expect(
    screen.getByText(
      'Formal imports will land under Inbox. When items arrive, select a child node to read or edit it.'
    )
  ).toBeInTheDocument();
  expect(screen.queryByLabelText('Prompt editor')).not.toBeInTheDocument();
});

it('opens import management from the left toolbar instead of replacing Inbox', () => {
  render(<App />);

  const inboxItem = within(getNodeListPanel()).getByRole('treeitem', { name: 'Inbox' });
  fireEvent.click(inboxItem);

  fireEvent.click(screen.getByRole('button', { name: 'Import management' }));

  expect(screen.getByRole('heading', { name: 'Import management' })).toBeInTheDocument();
  expect(screen.getByLabelText('Trigger draft-import-source-1')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Close import management' }));

  expect(screen.getByText('Inbox is ready')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Import management' })).not.toBeInTheDocument();
});
