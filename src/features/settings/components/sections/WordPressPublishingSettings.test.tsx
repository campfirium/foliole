import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../../shared/localization/testLocalization';

import { WordPressPublishingSettings } from './WordPressPublishingSettings';

const openExternalUrl = vi.hoisted(() => vi.fn());
const repository = vi.hoisted(() => ({
  connectWordPressPublishSettingsToRuntime: vi.fn(),
  disconnectWordPressPublishSettingsFromRuntime: vi.fn(),
  loadWordPressPublishSettingsFromRuntime: vi.fn()
}));

vi.mock('../../../../shared/platform/runtimeExternalNavigation', () => ({ openExternalUrl }));
vi.mock('../../../../shared/platform/wordpressPublishRepository', () => repository);

beforeEach(() => {
  openExternalUrl.mockReset();
  repository.loadWordPressPublishSettingsFromRuntime.mockReset();
  repository.connectWordPressPublishSettingsToRuntime.mockReset();
  repository.disconnectWordPressPublishSettingsFromRuntime.mockReset();
  repository.loadWordPressPublishSettingsFromRuntime.mockResolvedValue({
    adapter: null, has_credentials: false, site_url: '', updated_at: null
  });
  repository.connectWordPressPublishSettingsToRuntime.mockResolvedValue({
    adapter: 'wordpress_com_xmlrpc', has_credentials: true,
    site_url: 'https://free-site.wordpress.com', updated_at: '2026-07-21T00:00:00.000Z'
  });
  repository.disconnectWordPressPublishSettingsFromRuntime.mockResolvedValue({
    adapter: null, has_credentials: false, site_url: '', updated_at: null
  });
});

it('shows the guide for the entered site and keeps connected fields locked until disconnecting', async () => {
  renderWithLocalization(<WordPressPublishingSettings expanded onExpandedChange={vi.fn()} />);
  const siteAddress = await screen.findByLabelText('WordPress site address');
  await waitFor(() => expect(siteAddress).toBeEnabled());
  expect(screen.getByText('Enter your WordPress address first.')).toBeInTheDocument();

  fireEvent.change(siteAddress, { target: { value: 'https://example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create an Application Password in this site’s WordPress user profile ↗' }));
  expect(openExternalUrl).toHaveBeenLastCalledWith('https://developer.wordpress.org/advanced-administration/security/application-passwords/');

  fireEvent.change(siteAddress, { target: { value: 'https://free-site.wordpress.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create an Application Password in WordPress.com ↗' }));
  expect(openExternalUrl).toHaveBeenLastCalledWith('https://wordpress.com/support/security/two-step-authentication/application-specific-passwords/');
  expect(screen.queryByText(/may grant access to other sites/u)).toBeNull();
  fireEvent.change(screen.getByLabelText('WordPress username'), { target: { value: 'writer' } });
  fireEvent.change(screen.getByLabelText('WordPress Application Password'), { target: { value: 'app-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

  expect(await screen.findByText('Connection successful.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Connect' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Disconnect' })).toBeVisible();
  expect(siteAddress).toBeDisabled();
  expect(screen.getByLabelText('WordPress username')).toHaveValue('');
  expect(screen.getByLabelText('WordPress Application Password')).toHaveValue('');

  fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
  await waitFor(() => expect(repository.disconnectWordPressPublishSettingsFromRuntime).toHaveBeenCalledOnce());
  expect(siteAddress).toBeEnabled();
  expect(siteAddress).toHaveValue('');
});

it('restores saved credentials as a connected, locked form', async () => {
  repository.loadWordPressPublishSettingsFromRuntime.mockResolvedValue({
    adapter: 'wordpress_core_rest', has_credentials: true,
    site_url: 'https://example.com', updated_at: '2026-07-21T00:00:00.000Z'
  });
  renderWithLocalization(<WordPressPublishingSettings expanded onExpandedChange={vi.fn()} />);

  expect(await screen.findByText('Connection successful.')).toBeInTheDocument();
  expect(screen.getByLabelText('WordPress site address')).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Connect' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Disconnect' })).toBeVisible();
});
