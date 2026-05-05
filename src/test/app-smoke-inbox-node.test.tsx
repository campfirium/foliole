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
    screen.getByText('Formal imports will land under Inbox. When items arrive, select a child node to read or edit it.')
  ).toBeInTheDocument();
  expect(screen.queryByLabelText('Prompt editor')).not.toBeInTheDocument();
});
