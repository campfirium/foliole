import { fireEvent, screen } from '@testing-library/react';
import type { FormEvent } from 'react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceRightSidebarAssistantComposer } from './WorkspaceRightSidebarAssistantComposer';

it('sends with Enter and keeps Shift+Enter for a newline', () => {
  const onSubmit = vi.fn((event: FormEvent) => event.preventDefault());
  renderWithLocalization(
    <WorkspaceRightSidebarAssistantComposer
      inputLabel="Message"
      messageText="Ready"
      onMessageTextChange={vi.fn()}
      onSubmit={onSubmit}
      placeholder="Ask"
      sendLabel="Send"
      sending={false}
    />
  );
  const input = screen.getByRole('textbox', { name: 'Message' });

  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onSubmit).toHaveBeenCalledTimes(1);

  fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
  expect(onSubmit).toHaveBeenCalledTimes(1);
});

it('shows progress in the send control while a turn is active', () => {
  const { container } = renderWithLocalization(
    <WorkspaceRightSidebarAssistantComposer
      inputLabel="Message"
      messageText="Ready"
      onMessageTextChange={vi.fn()}
      onSubmit={vi.fn()}
      placeholder="Ask"
      sendLabel="Send"
      sending
    />
  );

  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  expect(container.querySelector('.animate-spin')).toBeInTheDocument();
});
