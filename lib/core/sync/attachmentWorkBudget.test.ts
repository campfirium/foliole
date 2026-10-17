import { expect, it } from 'vitest';

import { attachmentWorkBudget, holdSyncDataRound, waitForAttachmentWorkOpportunity, waitForAttachmentWorkYield } from './attachmentWorkBudget.js';

it('keeps selected resource work waiting until queued and active data have both finished', async () => {
  const releaseQueued = waitForAttachmentWorkYield();
  const releaseActive = holdSyncDataRound();
  const controller = new AbortController();
  let started = false;
  const pending = waitForAttachmentWorkOpportunity(controller.signal).then(() => { started = true; });
  releaseQueued();
  await Promise.resolve();
  expect(started).toBe(false);
  expect(attachmentWorkBudget()()).toBe(false);
  releaseActive();
  await pending;
  expect(started).toBe(true);
});

it('interrupts an existing resource budget when data starts without restricting the data round own attachment budget', () => {
  const resourceBudget = attachmentWorkBudget();
  const release = holdSyncDataRound();
  try {
    expect(resourceBudget()).toBe(true);
    expect(attachmentWorkBudget()()).toBe(false);
  } finally { release(); }
});

it('cancels resource waiting on background without starting another transfer', async () => {
  const release = holdSyncDataRound();
  const controller = new AbortController();
  const pending = waitForAttachmentWorkOpportunity(controller.signal);
  controller.abort(new Error('background'));
  try { await expect(pending).rejects.toThrow('background'); }
  finally { release(); }
});
