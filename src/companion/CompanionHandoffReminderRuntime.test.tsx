import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

const runtimeHooks = vi.hoisted(() => ({
  scheduler: vi.fn(),
  settings: vi.fn(() => ({
    settings: { fixedTime: '20:00', shortDelay: '5' as const },
    updateSettings: vi.fn()
  }))
}));

vi.mock('./useCompanionHandoffReminderScheduler', () => ({
  useCompanionHandoffReminderScheduler: runtimeHooks.scheduler
}));
vi.mock('./useCompanionHandoffReminderSettings', () => ({
  useCompanionHandoffReminderSettings: runtimeHooks.settings
}));

it('keeps reminder scheduling mounted outside the settings surface', async () => {
  const workspaceSync = {
    state: { last_synced_at: '2026-07-21T01:00:00.000Z' }
  } as ReturnType<typeof useCompanionWorkspaceSync>;
  const { CompanionHandoffReminderRuntime } = await import('./CompanionHandoffReminderRuntime');

  render(
    <CompanionHandoffReminderRuntime workspaceSync={workspaceSync}>
      <div>Reading surface</div>
    </CompanionHandoffReminderRuntime>
  );

  expect(screen.getByText('Reading surface')).toBeInTheDocument();
  expect(runtimeHooks.settings).toHaveBeenCalledWith('2026-07-21T01:00:00.000Z');
  expect(runtimeHooks.scheduler).toHaveBeenCalledWith({
    settings: { fixedTime: '20:00', shortDelay: '5' },
    workspaceSync
  });
});
