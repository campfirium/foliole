import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { WorkspaceRightSidebarAssistantMessageRow } from './WorkspaceRightSidebarAssistantMessageRow';

it('keeps user prompts in a bubble and renders assistant Markdown as unframed content', () => {
  const { container, rerender } = render(
    <WorkspaceRightSidebarAssistantMessageRow
      message={{ id: 'user-1', role: 'user', text: 'User prompt' }}
      pendingLabel="Thinking"
    />
  );

  const userRow = container.querySelector('[data-message-role="user"]');
  expect(userRow?.querySelector('p')).toHaveClass('rounded-lg');

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

it('shows a live animated thinking state before response text arrives', () => {
  const { container } = render(
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
