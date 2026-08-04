import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceRightSidebarAssistantModelControl } from './WorkspaceRightSidebarAssistantModelControl';

it('shows catalog-backed model, reasoning, and speed choices from a pure icon button', async () => {
  const select = vi.fn();
  renderWithLocalization(
    <WorkspaceRightSidebarAssistantModelControl controls={{
      catalog: {
        models: [{
          defaultReasoningEffort: 'high',
          defaultServiceTier: 'fast',
          description: 'Model description',
          displayName: 'GPT Test',
          isDefault: true,
          model: 'gpt-test',
          serviceTiers: [{ description: 'Faster', id: 'fast', name: 'Fast' }],
          supportedReasoningEfforts: [{ description: 'High', effort: 'high' }]
        }]
      },
      refresh: async () => undefined,
      select,
      selection: { effort: 'high', model: 'gpt-test', serviceTier: 'fast' },
      status: 'ready'
    }} />
  );

  const button = screen.getByRole('button', { name: 'Model and performance settings' });
  expect(button).toHaveTextContent('');
  fireEvent.keyDown(button, { key: 'ArrowDown' });
  expect(await screen.findByText('Model')).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'GPT Test' })).toHaveAttribute('aria-checked', 'true');
  expect(screen.getByRole('menuitem', { name: 'High' })).toHaveAttribute('aria-checked', 'true');
  expect(screen.getByRole('menuitem', { name: 'Fast' })).toHaveAttribute('aria-checked', 'true');
});

it('keeps the control disabled with an explanatory tooltip when the catalog fails', async () => {
  renderWithLocalization(
    <WorkspaceRightSidebarAssistantModelControl controls={{
      catalog: null,
      refresh: async () => undefined,
      select: vi.fn(),
      selection: null,
      status: 'unavailable'
    }} />
  );

  const button = screen.getByRole('button', { name: 'Model and performance settings' });
  expect(button).toBeDisabled();
  fireEvent.pointerMove(button.parentElement as HTMLElement);
  expect((await screen.findAllByText(/Messages will use the Codex default/)).length).toBeGreaterThan(0);
});
