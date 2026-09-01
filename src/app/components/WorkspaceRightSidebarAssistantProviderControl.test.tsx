import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceRightSidebarAssistantProviderControl } from './WorkspaceRightSidebarAssistantProviderControl';

it('offers only ready new-conversation providers and preserves the configured model label', () => {
  const onSelect = vi.fn(async () => undefined);
  renderWithLocalization(
    <WorkspaceRightSidebarAssistantProviderControl
      byokConfigured
      byokModel="local-model"
      codexReady={false}
      onSelect={onSelect}
      provider="openai-compatible"
      threadBound={false}
    />
  );

  const select = screen.getByRole('combobox', { name: 'New conversation provider' });
  expect(screen.getByRole('option', { name: 'Codex' })).toBeDisabled();
  expect(screen.getByRole('option', { name: 'Your model · local-model' })).toBeEnabled();
  fireEvent.change(select, { target: { value: 'openai-compatible' } });
  expect(onSelect).toHaveBeenCalledWith('openai-compatible');
});

it('renders a provider-bound history label instead of a switcher', () => {
  renderWithLocalization(
    <WorkspaceRightSidebarAssistantProviderControl
      byokConfigured={false}
      byokModel="remembered-model"
      codexReady
      onSelect={vi.fn(async () => undefined)}
      provider="openai-compatible"
      threadBound
    />
  );

  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.getByText('Your model · remembered-model')).toBeVisible();
});
