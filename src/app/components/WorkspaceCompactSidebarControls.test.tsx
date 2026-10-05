import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceCompactRightPanelActions, WorkspaceCompactSidebarBackdrop } from './WorkspaceCompactSidebarControls';
import { loadWorkspaceRightPanelOrderPreference, saveWorkspaceRightPanelOrderPreference } from './workspaceRightPanelPreference';
import { subscribeWorkspaceRightPanelRequests } from './workspaceRightPanelRequests';

it('dismisses the temporary sidebar through its outside surface', () => {
  const dismiss = vi.fn();
  renderWithLocalization(<WorkspaceCompactSidebarBackdrop sidebars={{
    leftFloating: true, rightFloating: true, openSide: 'left', dismiss
  }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Close sidebar' }));
  expect(dismiss).toHaveBeenCalledOnce();
});

it('selects existing right panels without rewriting their saved order', () => {
  saveWorkspaceRightPanelOrderPreference(['outline', 'review-queue', 'highlights', 'backlinks', 'assistant', 'dev']);
  const savedOrder = loadWorkspaceRightPanelOrderPreference();
  const select = vi.fn();
  const unsubscribe = subscribeWorkspaceRightPanelRequests(select);
  try {
    renderWithLocalization(<WorkspaceCompactRightPanelActions activePanelId="review-queue" />);
    expect(screen.getByRole('button', { name: 'Flow panel' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Outline panel' }));
    expect(select).toHaveBeenCalledWith('outline');
    expect(loadWorkspaceRightPanelOrderPreference()).toBe(savedOrder);
  } finally {
    unsubscribe();
  }
});
