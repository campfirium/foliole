import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import {
  AssistantConversationHeader,
  AssistantPanelToolbar
} from './WorkspaceRightSidebarAssistantHeaders';

it('keeps global conversation actions separate from the current conversation title', () => {
  const onBack = vi.fn();
  const onNewThread = vi.fn();
  const onShowHistory = vi.fn();
  renderWithLocalization(
    <>
      <AssistantPanelToolbar
        historyVisible={false}
        onNewThread={onNewThread}
        onShowHistory={onShowHistory}
      />
      <AssistantConversationHeader onBack={onBack} title="Current conversation" />
    </>
  );

  expect(screen.getByRole('heading', { name: 'Foliole Aide' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Current conversation' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'History' }));
  fireEvent.click(screen.getByRole('button', { name: 'New' }));
  fireEvent.click(screen.getByRole('button', { name: 'Back to history' }));

  expect(onShowHistory).toHaveBeenCalledOnce();
  expect(onNewThread).toHaveBeenCalledOnce();
  expect(onBack).toHaveBeenCalledOnce();
});
