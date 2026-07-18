import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceRightSidebarAssistantConversation } from './WorkspaceRightSidebarAssistantConversation';

it('returns a selected user prompt to the focused composer for resending', () => {
  const onEditMessage = vi.fn();
  renderWithLocalization(
    <WorkspaceRightSidebarAssistantConversation
      activeMessages={[{ id: 'user-1', role: 'user', text: 'Refine this prompt' }]}
      contextFollowDescription="Attach current material"
      contextFollowEnabled
      contextFollowLabel="Following: Topic"
      inputLabel="Message"
      messageText=""
      onEditMessage={onEditMessage}
      onMessageTextChange={vi.fn()}
      onSubmit={vi.fn()}
      onToggleContextFollow={vi.fn()}
      pendingLabel="Thinking"
      placeholder="Ask"
      sendLabel="Send"
      sending={false}
      statusLabel={null}
      transitionEvent={null}
      threadPreviewLabel={null}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: 'Edit and resend' }));

  expect(onEditMessage).toHaveBeenCalledWith('Refine this prompt');
  expect(screen.getByRole('textbox', { name: 'Message' })).toHaveFocus();
});
