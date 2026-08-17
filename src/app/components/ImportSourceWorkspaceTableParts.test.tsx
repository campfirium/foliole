import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { FolderButton } from './ImportSourceWorkspaceTableParts';

it('shows a stable full-path tooltip for folder buttons', async () => {
  const fullPath = '/Users/example/Readwise/Articles';

  render(
    <FolderButton
      label="Choose Articles content folder"
      onClick={vi.fn()}
      path="Articles"
      tooltip={fullPath}
    />
  );

  const button = screen.getByRole('button', { name: 'Choose Articles content folder' });
  expect(button).not.toHaveAttribute('title');

  fireEvent.pointerMove(button, { pointerType: 'mouse' });

  expect(await screen.findByRole('tooltip')).toHaveTextContent(fullPath);
});
