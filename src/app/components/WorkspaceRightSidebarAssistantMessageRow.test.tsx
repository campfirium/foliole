import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceRightSidebarAssistantMessageRow } from './WorkspaceRightSidebarAssistantMessageRow';

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) }
  });
});

it('keeps user prompts in a bubble and renders assistant Markdown as unframed content', () => {
  const onEditMessage = vi.fn();
  const { container, rerender } = renderWithLocalization(
    <WorkspaceRightSidebarAssistantMessageRow
      message={{ id: 'user-1', role: 'user', text: 'User prompt' }}
      onEditMessage={onEditMessage}
      pendingLabel="Thinking"
    />
  );

  const userRow = container.querySelector('[data-message-role="user"]');
  expect(userRow?.querySelector('p')).toHaveClass('rounded-lg');
  fireEvent.click(screen.getByRole('button', { name: 'Edit and resend' }));
  expect(onEditMessage).toHaveBeenCalledWith('User prompt');

  rerender(
    <WorkspaceRightSidebarAssistantMessageRow
      message={{
        id: 'assistant-1',
        role: 'assistant',
        text: '## Result\n\nFirst paragraph.\n\n- One\n- **Two**\n\n`inline`\n\n```ts\nconst value = 1;\n```'
      }}
      pendingLabel="Thinking"
    />
  );

  const assistantRow = container.querySelector('[data-message-role="assistant"]');
  expect(assistantRow).not.toHaveClass('rounded-lg');
  expect(screen.getByRole('heading', { name: 'Result' })).toBeInTheDocument();
  expect(screen.getByRole('list')).toBeInTheDocument();
  expect(screen.getByText('Two')).toHaveProperty('tagName', 'STRONG');
  expect(screen.getByText('inline')).toHaveProperty('tagName', 'CODE');
  expect(screen.getByText('const value = 1;')).toHaveProperty('tagName', 'CODE');
});

it('copies assistant messages and confirms the action', async () => {
  renderWithLocalization(
    <WorkspaceRightSidebarAssistantMessageRow
      message={{ id: 'assistant-copy', role: 'assistant', text: 'Copy this answer' }}
      pendingLabel="Thinking"
    />
  );

  fireEvent.click(screen.getByRole('button', { name: 'Copy message' }));

  await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Copy this answer'));
  expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
});

it('shows a live animated thinking state before response text arrives', () => {
  const { container } = renderWithLocalization(
    <WorkspaceRightSidebarAssistantMessageRow
      message={{
        activity: 'thinking',
        id: 'assistant-pending',
        role: 'assistant',
        state: 'pending',
        text: ''
      }}
      pendingLabel="Thinking"
    />
  );

  expect(screen.getByRole('status')).toHaveTextContent('Thinking');
  expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  expect(container.querySelectorAll('.animate-pulse')).toHaveLength(3);
});
