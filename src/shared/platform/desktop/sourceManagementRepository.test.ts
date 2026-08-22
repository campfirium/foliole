import { beforeEach, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import type { ElectronAPI } from '../electronApi';

import { confirmSourceManagement, previewSourceManagement } from './sourceManagementRepository';

beforeEach(() => {
  delete window.electronAPI;
});

it('uses bounded native commands for Source management preview and confirmation', async () => {
  const preview = {
    action: 'replace_host', checked_at: '2026-08-22T00:00:00.000Z', current_host_name: 'This Mac',
    source_count: 2, sources: [], topic_count: 3
  };
  const result = {
    action: 'replace_host', changed_source_count: 2,
    completed_at: '2026-08-22T00:01:00.000Z', topic_count: 3
  };
  const invoke = vi.fn(async (command: string) => (
    command === NATIVE_COMMANDS.previewSourceManagement ? preview : result
  ));
  window.electronAPI = { invoke } as unknown as ElectronAPI;
  const input = { action: 'replace_host' as const, hostName: 'Old Mac', sourceType: 'external' as const };

  await expect(previewSourceManagement(input)).resolves.toBe(preview);
  await expect(confirmSourceManagement(input)).resolves.toBe(result);
  const payload = { action: 'replace_host', host_name: 'Old Mac', source_type: 'external' };
  expect(invoke).toHaveBeenNthCalledWith(1, NATIVE_COMMANDS.previewSourceManagement, payload);
  expect(invoke).toHaveBeenNthCalledWith(2, NATIVE_COMMANDS.confirmSourceManagement, payload);
});
