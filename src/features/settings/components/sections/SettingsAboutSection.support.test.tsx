import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../shared/platform/diagnosticBundle', () => ({
  copyDiagnosticReport: vi.fn()
}));

vi.mock('../../../../shared/platform/updateCheck', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../shared/platform/updateCheck')>();
  return {
    ...actual,
    checkForFolioleUpdates: vi.fn(async () => ({
      latestRelease: null,
      state: actual.readUpdateCheckState(),
      status: 'current'
    }))
  };
});

import type { NativeInvoke } from '../../../../../lib/platform/nativeContract';
import { APP_COMMAND_IDS } from '../../../../shared/commands/ids';
import { APP_LANGUAGE_STORAGE_KEY } from '../../../../shared/localization/appLanguage';
import { renderWithLocalization } from '../../../../shared/localization/testLocalization';
import { checkForFolioleUpdates } from '../../../../shared/platform/updateCheck';

import { SettingsAboutSection } from './SettingsAboutSection';

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, 'en');
  window.electronAPI = {
    invoke: vi.fn(async () => null) as unknown as NativeInvoke,
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onSearchIndexRebuildStatus: () => () => undefined,
    onWindowResized: () => () => undefined
  };
});

it('runs support commands from About settings', async () => {
  const onRunSupportCommand = vi.fn();
  renderWithLocalization(<SettingsAboutSection onRunSupportCommand={onRunSupportCommand} />);

  fireEvent.click(await screen.findByRole('button', { name: 'Check for Updates' }));
  fireEvent.click(screen.getByRole('button', { name: 'Issues' }));
  fireEvent.click(screen.getByRole('button', { name: 'YouTube' }));
  fireEvent.click(screen.getByRole('button', { name: 'Send Feedback' }));
  const emailButton = screen.getByRole('button', { name: 'Email' });
  expect(emailButton).toHaveAttribute('title', 'hello@foliole.app');
  fireEvent.click(emailButton);
  fireEvent.focus(emailButton);

  expect(screen.getByText('Checking')).toBeInTheDocument();
  expect(screen.getByText('Checking for updates...')).toBeInTheDocument();
  const emailTooltip = await screen.findByRole('tooltip');
  expect(emailTooltip).toHaveTextContent('hello@foliole.app');
  expect(emailTooltip.parentElement?.className).toContain('[z-index:var(--z-dropdown)]');
  expect(checkForFolioleUpdates).toHaveBeenCalledWith({ force: true });
  expect(onRunSupportCommand).toHaveBeenNthCalledWith(1, APP_COMMAND_IDS.openGitHubIssues);
  expect(onRunSupportCommand).toHaveBeenNthCalledWith(2, APP_COMMAND_IDS.openYouTubePlaylist);
  expect(onRunSupportCommand).toHaveBeenNthCalledWith(3, APP_COMMAND_IDS.sendFeedback);
  expect(onRunSupportCommand).toHaveBeenNthCalledWith(4, APP_COMMAND_IDS.openSupportEmail);
});
