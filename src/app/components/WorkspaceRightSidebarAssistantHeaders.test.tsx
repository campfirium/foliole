import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { AssistantPanelToolbar } from './WorkspaceRightSidebarAssistantHeaders';

it('keeps global conversation actions separate from the current conversation title', () => {
  const onBack = vi.fn();
  const onNewThread = vi.fn();
  const onShowHistory = vi.fn();
  const { rerender } = renderWithLocalization(
    <AssistantPanelToolbar
      conversationTitle="Current conversation"
      historyVisible={false}
      onBack={onBack}
      onNewThread={onNewThread}
      onShowHistory={onShowHistory}
    />
  );

  expect(screen.queryByRole('heading', { name: 'Foliole Aide' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Current conversation' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'History' }));
  fireEvent.click(screen.getByRole('button', { name: 'New' }));
  fireEvent.click(screen.getByRole('button', { name: 'Back to history' }));

  expect(onShowHistory).toHaveBeenCalledOnce();
  expect(onNewThread).toHaveBeenCalledOnce();
  expect(onBack).toHaveBeenCalledOnce();

  rerender(
    <AssistantPanelToolbar
      conversationTitle={null}
      historyVisible
      onBack={onBack}
      onNewThread={onNewThread}
      onShowHistory={onShowHistory}
    />
  );
  expect(screen.getByRole('heading', { name: 'Foliole Aide' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Back to history' })).not.toBeInTheDocument();
});
