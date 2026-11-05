import { expect, it } from 'vitest';

import { createCompanionSettingsPreview } from '../../scripts/vite/companionSettingsPreview';

it('keeps overview and detail on the same backup and attachment presentation through local actions', async () => {
  const preview = createCompanionSettingsPreview();
  let changes = 0;
  const stop = preview.subscribe(() => { changes++; });
  expect(preview.snapshot().backup.pendingItems).toBe(3);
  await preview.setAutomaticBackup(false);
  expect(preview.snapshot().automaticBackup).toBe(false);
  expect(preview.snapshot().backup.pendingItems).toBe(3);
  await preview.backUp(false);
  expect(preview.snapshot().backup.pendingItems).toBe(0);
  const before = preview.snapshot().attachments.usedBytes;
  await preview.maintainAttachments({ action: 'clean' });
  expect(preview.snapshot().attachments.trashBytes).toBeGreaterThan(0);
  expect(preview.snapshot().attachments.usedBytes).toBe(before);
  await preview.maintainAttachments({ action: 'restore', storageKeys: ['preview-attachment'] });
  expect(preview.snapshot().attachments.trashBytes).toBe(0);
  await preview.maintainAttachments({ action: 'configure', settings: { automatic: false, observationThreshold: 45 } });
  expect(preview.snapshot().attachments.observationThreshold).toBe(45);
  await preview.maintainAttachments({ action: 'clean' });
  await preview.maintainAttachments({ action: 'empty-trash' });
  expect(preview.snapshot().attachments.usedBytes).toBeLessThan(before);
  expect(changes).toBeGreaterThan(5);
  stop();
});
