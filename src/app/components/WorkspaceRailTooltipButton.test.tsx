import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Import } from 'lucide-react';
import { expect, it, vi } from 'vitest';

import { WorkspaceRailTooltipButton } from './WorkspaceRailTooltipButton';

it('closes the rail tooltip when the command runs', async () => {
  const onClick = vi.fn();

  render(
    <WorkspaceRailTooltipButton
      icon={<Import aria-hidden="true" size={16} />}
      label="Import"
      onClick={onClick}
    />
  );

  const button = screen.getByRole('button', { name: 'Import' });
  fireEvent.pointerMove(button, { pointerType: 'mouse' });
  fireEvent.pointerEnter(button, { pointerType: 'mouse' });

  expect(await screen.findByRole('tooltip')).toHaveTextContent('Import');

  fireEvent.pointerDown(button, { pointerType: 'mouse' });
  fireEvent.click(button);

  expect(onClick).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
});

it('keeps forced status feedback visible without hover', async () => {
  render(
    <WorkspaceRailTooltipButton
      disabled
      forceTooltipOpen
      icon={<Import aria-hidden="true" size={16} />}
      label="Restarting… This may take a moment."
    />
  );

  expect(await screen.findByRole('tooltip')).toHaveTextContent('Restarting… This may take a moment.');
});
