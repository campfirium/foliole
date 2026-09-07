import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { LocalizationProvider } from '../../shared/localization/LocalizationProvider';

import { ReadwiseSourceModeSection } from './ReadwiseSourceModeSection';

const runtime = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  load: vi.fn()
}));
const identityRuntime = vi.hoisted(() => ({
  confirm: vi.fn(),
  preview: vi.fn()
}));

vi.mock('../../shared/platform/import/readwiseApiConnectionRuntimeRepository', () => ({
  connectReadwiseApiFromClipboardInRuntime: runtime.connect,
  disconnectReadwiseApiInRuntime: runtime.disconnect,
  loadReadwiseApiConnectionFromRuntime: runtime.load
}));
vi.mock('../../shared/platform/import/readwiseIdentityRuntimeRepository', () => ({
  confirmReadwiseIdentityBindingsInRuntime: identityRuntime.confirm,
  previewReadwiseIdentityBindingsInRuntime: identityRuntime.preview
}));

beforeEach(() => {
  runtime.connect.mockReset();
  runtime.disconnect.mockReset();
  runtime.load.mockReset();
  runtime.load.mockResolvedValue({ has_credential: false, state: 'disconnected', verified_at: null });
  runtime.connect.mockResolvedValue({
    connection: { has_credential: true, state: 'connected', verified_at: '2026-09-07T00:00:00.000Z' },
    status: 'connected'
  });
  identityRuntime.preview.mockReset();
  identityRuntime.confirm.mockReset();
  identityRuntime.preview.mockResolvedValue({
    annotation_count: 2,
    candidate_count: 1,
    conflict_count: 1,
    preview_id: 'preview-1',
    status: 'ready',
    unmatched_count: 3
  });
  identityRuntime.confirm.mockResolvedValue({ annotation_count: 2, bound_count: 1, status: 'bound' });
});

it('switches sources explicitly and connects without passing a token through the renderer', async () => {
  const onChange = vi.fn();
  render(
    <LocalizationProvider>
      <ReadwiseSourceModeSection mode="api" onChange={onChange} />
    </LocalizationProvider>
  );

  expect(await screen.findByText('Not connected')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Connect from clipboard' }));
  await waitFor(() => expect(screen.getByText('Connected')).toBeInTheDocument());
  expect(runtime.connect).toHaveBeenCalledWith();

  fireEvent.change(screen.getByRole('combobox', { name: 'Readwise source mode' }), {
    target: { value: 'folder' }
  });
  expect(onChange).toHaveBeenCalledWith('folder');
});

it('shows retryable and secure-storage failures without exposing credential data', async () => {
  runtime.connect.mockResolvedValue({
    connection: { has_credential: false, state: 'disconnected', verified_at: null },
    retry_after_seconds: 9,
    status: 'rate_limited'
  });
  const { rerender } = render(
    <LocalizationProvider>
      <ReadwiseSourceModeSection mode="api" onChange={() => undefined} />
    </LocalizationProvider>
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Connect from clipboard' }));
  expect(await screen.findByText('Readwise limited connection checks. Try again in 9 seconds.')).toBeInTheDocument();

  runtime.load.mockResolvedValue({
    has_credential: true, state: 'secure_storage_unavailable', verified_at: null
  });
  rerender(<LocalizationProvider><ReadwiseSourceModeSection mode="folder" onChange={() => undefined} /></LocalizationProvider>);
  rerender(<LocalizationProvider><ReadwiseSourceModeSection mode="api" onChange={() => undefined} /></LocalizationProvider>);
  expect(await screen.findByText('Secure storage unavailable')).toBeInTheDocument();
});

it('keeps remote identity binding read-only until the preview is confirmed', async () => {
  render(
    <LocalizationProvider>
      <ReadwiseSourceModeSection mode="api" onChange={() => undefined} />
    </LocalizationProvider>
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Check existing Topics' }));
  expect(await screen.findByText('1 Topics can be reused; 3 could not be verified and 1 have conflicts.'))
    .toBeInTheDocument();
  expect(identityRuntime.confirm).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Reuse Topics' }));
  expect(await screen.findByText('1 existing Topics will be reused for this Readwise source.')).toBeInTheDocument();
  expect(identityRuntime.confirm).toHaveBeenCalledWith('preview-1');
});
