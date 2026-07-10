import { fireEvent, screen } from '@testing-library/react';
import type { FormEvent } from 'react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceRightSidebarAssistantComposer } from './WorkspaceRightSidebarAssistantComposer';

it('sends with Enter and keeps Shift+Enter for a newline', () => {
  const onSubmit = vi.fn((event: FormEvent) => event.preventDefault());
  renderWithLocalization(
    <WorkspaceRightSidebarAssistantComposer
      contextFollowDescription="Attach current material"
      contextFollowEnabled
      contextFollowLabel="Following: Topic"
      inputLabel="Message"
      messageText="Ready"
      onMessageTextChange={vi.fn()}
      onToggleContextFollow={vi.fn()}
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
      contextFollowDescription="Attach current material"
      contextFollowEnabled
      contextFollowLabel="Following: Topic"
      inputLabel="Message"
      messageText="Ready"
      onMessageTextChange={vi.fn()}
      onToggleContextFollow={vi.fn()}
      onSubmit={vi.fn()}
      placeholder="Ask"
      sendLabel="Send"
      sending
    />
  );

  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  expect(container.querySelector('.animate-spin')).toBeInTheDocument();
});

it('exposes the current material mode as a switch', () => {
  const onToggle = vi.fn();
  renderWithLocalization(
    <WorkspaceRightSidebarAssistantComposer
      contextFollowDescription="Attach current material"
      contextFollowEnabled
      contextFollowLabel="Following: Current topic"
      inputLabel="Message"
      messageText=""
      onMessageTextChange={vi.fn()}
      onSubmit={vi.fn()}
      onToggleContextFollow={onToggle}
      placeholder="Ask"
      sendLabel="Send"
      sending={false}
    />
  );

  const toggle = screen.getByRole('switch', { name: 'Following: Current topic' });
  expect(toggle).toHaveAttribute('aria-checked', 'true');
  expect(toggle).toHaveAttribute('title', 'Attach current material');
  fireEvent.click(toggle);
  expect(onToggle).toHaveBeenCalledOnce();
});
