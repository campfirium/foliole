import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { LocalizationProvider } from '../../shared/localization/LocalizationProvider';

import { ReadwiseSourceModeSection } from './ReadwiseSourceModeSection';
import { createReadwiseApiModeTestSettings } from './ReadwiseSourceModeSection.testSupport';

const runtime = vi.hoisted(() => ({ load: vi.fn() }));
const cutover = vi.hoisted(() => ({ preview: vi.fn(), run: vi.fn() }));
const confirmation = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock('../../shared/platform/import/readwiseApiConnectionRuntimeRepository', () => ({
  connectReadwiseApiFromClipboardInRuntime: vi.fn(),
  disconnectReadwiseApiInRuntime: vi.fn(),
  loadReadwiseApiConnectionFromRuntime: runtime.load
}));
vi.mock('../../shared/platform/import/readwiseSourceCutoverRuntimeRepository', () => ({
  previewReadwiseSourceCutoverInRuntime: cutover.preview,
  runReadwiseSourceCutoverInRuntime: cutover.run
}));
vi.mock('../../shared/platform/readwiseReaderImportRuntimeRepository', () => ({
  loadReadwiseApiScheduleStatusInRuntime: vi.fn().mockResolvedValue(null)
}));
vi.mock('../../shared/ui', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../shared/ui')>(),
  requestAppConfirmation: confirmation.request
}));

beforeEach(() => {
  runtime.load.mockResolvedValue({ has_credential: true, state: 'connected', verified_at: 'now' });
  cutover.preview.mockResolvedValue({
    completed_count: 0, error_reason: null, phase: null, status: 'ready', topic_count: 12, total_count: null
  });
  cutover.run.mockResolvedValue({ error_reason: null, migrated_count: 12, status: 'completed', unmatched_count: 0 });
  confirmation.request.mockResolvedValue(true);
});

it('saves reviewed draft rules before the confirmed API migration starts', async () => {
  const onChange = vi.fn();
  const onChangePolicy = vi.fn();
  const onCommitApiPolicy = vi.fn().mockResolvedValue(undefined);
  const onCommitMode = vi.fn();
  const view = (mode: 'relay' | 'api') => (
    <LocalizationProvider>
      <ReadwiseSourceModeSection
        apiSettings={createReadwiseApiModeTestSettings()}
        committedMode="relay"
        mode={mode}
        onChange={onChange}
        onChangePolicy={onChangePolicy}
        onCommitApiPolicy={onCommitApiPolicy}
        onCommitMode={onCommitMode}
      />
    </LocalizationProvider>
  );
  const { rerender } = render(view('relay'));
  fireEvent.click(screen.getByRole('radio', { name: 'API mode' }));
  await waitFor(() => expect(onChange).toHaveBeenCalledWith('api'));
  rerender(view('api'));

  expect(await screen.findByText('Connected')).toBeInTheDocument();
  expect(screen.getByText('Not enabled yet · Obsidian relay import is still active')).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole('combobox', {
    name: 'PDFs without highlights destination'
  }), { key: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitem', { name: "Don't import" }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Reader document import tag' }), {
    target: { value: 'readwise' }
  });
  expect(onChangePolicy).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Enable API mode…' }));

  await waitFor(() => expect(confirmation.request).toHaveBeenLastCalledWith(expect.objectContaining({
    confirmLabel: 'Enable and sync',
    description: expect.arrayContaining([
      '12 Topics were imported through the current Obsidian relay folders on this device.',
      'Foliole will preserve your existing Topics while connecting them to the API where identity is exact. Back up important data first. This version cannot switch back after enabling API mode.',
      'API mode is still experimental.'
    ])
  })));
  await waitFor(() => expect(cutover.run).toHaveBeenCalledTimes(1));
  expect(onCommitApiPolicy).toHaveBeenCalledWith(expect.objectContaining({
    importTag: 'readwise',
    pdfWithoutHighlights: 'off'
  }));
  const commitOrder = onCommitApiPolicy.mock.invocationCallOrder[0];
  const migrationOrder = cutover.run.mock.invocationCallOrder[0];
  if (commitOrder === undefined || migrationOrder === undefined) throw new Error('Expected ordered calls');
  expect(commitOrder).toBeLessThan(migrationOrder);
  await waitFor(() => expect(onCommitMode).toHaveBeenCalledWith('api'), { timeout: 1500 });
});
