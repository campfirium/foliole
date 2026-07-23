import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../../shared/localization/testLocalization';

import { WordPressPublishingSettings } from './WordPressPublishingSettings';

const openExternalUrl = vi.hoisted(() => vi.fn());
const repository = vi.hoisted(() => ({
  connectWordPressPublishSettingsToRuntime: vi.fn(),
  disconnectWordPressPublishSettingsFromRuntime: vi.fn(),
  loadWordPressPublishSettingsFromRuntime: vi.fn(),
  saveWordPressPublishDraftToRuntime: vi.fn()
}));

vi.mock('../../../../shared/platform/runtimeExternalNavigation', () => ({ openExternalUrl }));
vi.mock('../../../../shared/platform/wordpressPublishRepository', () => repository);

beforeEach(() => {
  openExternalUrl.mockReset();
  repository.loadWordPressPublishSettingsFromRuntime.mockReset();
  repository.connectWordPressPublishSettingsToRuntime.mockReset();
  repository.disconnectWordPressPublishSettingsFromRuntime.mockReset();
  repository.saveWordPressPublishDraftToRuntime.mockReset();
  repository.loadWordPressPublishSettingsFromRuntime.mockResolvedValue({
    adapter: null, credentials_valid: false, has_credentials: false,
    site_url: '', updated_at: null, username: ''
  });
  repository.saveWordPressPublishDraftToRuntime.mockImplementation(async (input: {
    application_password: string; site_url: string; username: string;
  }) => ({
    adapter: input.site_url.includes('wordpress.com') ? 'wordpress_com_xmlrpc' : 'core_rest',
    credentials_valid: false, has_credentials: Boolean(input.application_password),
    site_url: input.site_url.startsWith('http') ? input.site_url : `https://${input.site_url}`,
    updated_at: '2026-07-23T00:00:00.000Z', username: input.username
  }));
  repository.connectWordPressPublishSettingsToRuntime.mockResolvedValue({
    adapter: 'wordpress_com_xmlrpc', credentials_valid: true, has_credentials: true,
    site_url: 'https://free-site.wordpress.com', updated_at: '2026-07-21T00:00:00.000Z', username: 'writer'
  });
  repository.disconnectWordPressPublishSettingsFromRuntime.mockResolvedValue({
    adapter: null, credentials_valid: false, has_credentials: false,
    site_url: '', updated_at: null, username: ''
  });
});

it('shows the guide for the entered site and keeps connected fields locked until disconnecting', async () => {
  renderWithLocalization(<WordPressPublishingSettings expanded onExpandedChange={vi.fn()} />);
  const siteAddress = await screen.findByLabelText('WordPress site address');
  await waitFor(() => expect(siteAddress).toBeEnabled());
  expect(screen.getByText('WordPress connection')).toBeVisible();
  expect(screen.getByText('Not connected')).toBeVisible();
  expect(screen.getByText('Enter your WordPress address first.')).toBeInTheDocument();

  fireEvent.change(siteAddress, { target: { value: 'https://example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create an Application Password in this site’s WordPress user profile ↗' }));
  expect(openExternalUrl).toHaveBeenLastCalledWith('https://developer.wordpress.org/advanced-administration/security/application-passwords/');

  fireEvent.change(siteAddress, { target: { value: 'https://free-site.wordpress.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create an Application Password in WordPress.com ↗' }));
  expect(openExternalUrl).toHaveBeenLastCalledWith('https://wordpress.com/support/security/two-step-authentication/application-specific-passwords/');
  expect(screen.queryByText(/may grant access to other sites/u)).toBeNull();
  fireEvent.change(screen.getByLabelText('WordPress username'), { target: { value: 'writer' } });
  fireEvent.change(screen.getByLabelText('WordPress Application Password'), { target: { value: 'abcd efgh ijkl mnop' } });
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

  expect(await screen.findByText('Connected')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Connect' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Disconnect' })).toBeVisible();
  expect(siteAddress).toBeDisabled();
  expect(screen.getByLabelText('WordPress username')).toHaveValue('writer');
  expect(screen.getByLabelText('WordPress Application Password')).toHaveValue('');

  fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
  await waitFor(() => expect(repository.disconnectWordPressPublishSettingsFromRuntime).toHaveBeenCalledOnce());
  expect(siteAddress).toBeEnabled();
  expect(siteAddress).toHaveValue('');
});

it('restores saved credentials as a connected, locked form', async () => {
  repository.loadWordPressPublishSettingsFromRuntime.mockResolvedValue({
    adapter: 'core_rest', credentials_valid: true, has_credentials: true,
    site_url: 'https://example.com', updated_at: '2026-07-21T00:00:00.000Z', username: 'writer'
  });
  renderWithLocalization(<WordPressPublishingSettings expanded onExpandedChange={vi.fn()} />);

  expect(await screen.findByText('Connected')).toBeInTheDocument();
  expect(screen.getByLabelText('WordPress site address')).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Connect' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Disconnect' })).toBeVisible();
});

it('shows the original connection failure and keeps the form editable', async () => {
  repository.connectWordPressPublishSettingsToRuntime.mockRejectedValueOnce(
    new Error("Error invoking remote method 'foliole:invoke': Error: WordPress Application Password authentication failed (401)")
  );
  renderWithLocalization(<WordPressPublishingSettings expanded onExpandedChange={vi.fn()} />);

  const siteAddress = await screen.findByLabelText('WordPress site address');
  await waitFor(() => expect(siteAddress).toBeEnabled());
  fireEvent.change(siteAddress, { target: { value: 'https://example.com' } });
  fireEvent.change(screen.getByLabelText('WordPress username'), { target: { value: 'writer' } });
  fireEvent.change(screen.getByLabelText('WordPress Application Password'), { target: { value: 'abcd efgh ijkl mnop qrst uvwx' } });
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

  expect(await screen.findByText('WordPress Application Password authentication failed (401)')).toBeVisible();
  expect(screen.getByText('Check the site address, username, and Application Password, then try again.')).toBeVisible();
  expect(screen.queryByText('Connected')).toBeNull();
  expect(siteAddress).toBeEnabled();
  expect(siteAddress).toHaveValue('https://example.com');
  expect(screen.getByLabelText('WordPress username')).toHaveValue('writer');
  expect(screen.getByLabelText('WordPress Application Password')).toHaveAttribute('placeholder', '****************');
});

it('restores an unverified draft after remounting without returning the password', async () => {
  const rendered = renderWithLocalization(<WordPressPublishingSettings expanded onExpandedChange={vi.fn()} />);
  const siteAddress = await screen.findByLabelText('WordPress site address');
  await waitFor(() => expect(siteAddress).toBeEnabled());
  fireEvent.change(siteAddress, { target: { value: 'folioleapp.wordpress.com' } });
  fireEvent.change(screen.getByLabelText('WordPress username'), { target: { value: 'folioleapp' } });
  const password = screen.getByLabelText('WordPress Application Password');
  fireEvent.change(password, { target: { value: 'abcd efgh ijkl mnop' } });
  fireEvent.blur(password);
  await waitFor(() => expect(repository.saveWordPressPublishDraftToRuntime).toHaveBeenLastCalledWith({
    application_password: 'abcdefghijklmnop',
    site_url: 'folioleapp.wordpress.com',
    username: 'folioleapp'
  }));
  expect(password).toHaveValue('abcd efgh ijkl mnop');
  expect(screen.getByRole('button', { name: 'Connect' })).toBeEnabled();
  rendered.unmount();
  repository.loadWordPressPublishSettingsFromRuntime.mockResolvedValue({
    adapter: 'wordpress_com_xmlrpc', credentials_valid: false, has_credentials: true,
    site_url: 'https://folioleapp.wordpress.com', updated_at: '2026-07-23T00:00:00.000Z', username: 'folioleapp'
  });

  renderWithLocalization(<WordPressPublishingSettings expanded onExpandedChange={vi.fn()} />);

  expect(await screen.findByLabelText('WordPress site address')).toHaveValue('https://folioleapp.wordpress.com');
  expect(screen.getByLabelText('WordPress username')).toHaveValue('folioleapp');
  expect(screen.getByLabelText('WordPress Application Password')).toHaveValue('');
  expect(screen.getByLabelText('WordPress Application Password')).toHaveAttribute('placeholder', '****************');
  expect(screen.getByText('Not connected')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Connect' })).toBeEnabled();
});

it('does not report success when the runtime returns no stored credentials', async () => {
  repository.connectWordPressPublishSettingsToRuntime.mockResolvedValueOnce({
    adapter: 'core_rest', credentials_valid: false, has_credentials: false,
    site_url: 'https://example.com', updated_at: '2026-07-22T00:00:00.000Z', username: 'writer'
  });
  renderWithLocalization(<WordPressPublishingSettings expanded onExpandedChange={vi.fn()} />);

  const siteAddress = await screen.findByLabelText('WordPress site address');
  await waitFor(() => expect(siteAddress).toBeEnabled());
  fireEvent.change(siteAddress, { target: { value: 'https://example.com' } });
  fireEvent.change(screen.getByLabelText('WordPress username'), { target: { value: 'writer' } });
  fireEvent.change(screen.getByLabelText('WordPress Application Password'), { target: { value: 'abcd efgh ijkl mnop qrst uvwx' } });
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

  expect(await screen.findByText('WordPress credentials were unavailable after connecting.')).toBeVisible();
  expect(screen.queryByText('Connected')).toBeNull();
  expect(siteAddress).toBeEnabled();
});

it('validates the address and provider-specific Application Password length', async () => {
  renderWithLocalization(<WordPressPublishingSettings expanded onExpandedChange={vi.fn()} />);
  const siteAddress = await screen.findByLabelText('WordPress site address');
  await waitFor(() => expect(siteAddress).toBeEnabled());

  fireEvent.change(siteAddress, { target: { value: 'folioleapp.wordpress.com' } });
  fireEvent.change(screen.getByLabelText('WordPress username'), { target: { value: 'writer' } });
  fireEvent.change(screen.getByLabelText('WordPress Application Password'), { target: { value: 'abcd efgh' } });
  expect(screen.getByText(/complete 16-character WordPress\.com/u)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled();
  fireEvent.keyDown(screen.getByLabelText('WordPress Application Password'), { key: 'Enter' });
  expect(repository.connectWordPressPublishSettingsToRuntime).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText('WordPress Application Password'), { target: { value: 'abcd efgh ijkl mnop' } });
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  await waitFor(() => expect(repository.connectWordPressPublishSettingsToRuntime).toHaveBeenCalledWith({
    application_password: 'abcdefghijklmnop',
    site_url: 'https://folioleapp.wordpress.com',
    username: 'writer'
  }));
});
