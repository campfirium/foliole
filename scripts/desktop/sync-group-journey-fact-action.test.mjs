import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { createDesktopSyncGroupJourneyFact } from './sync-group-journey-fact-action.mjs';

it('creates a unique journey fact only through the registered desktop product commands', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't121-desktop-fact-'));
  const invoke = vi.fn(async (command, args) => command === 'load_workspace_list_snapshot'
    ? { nodeOrder: ['special-inbox'] } : { createdNodeIds: [args.nodeId] });
  const result = await createDesktopSyncGroupJourneyFact({ device: 'A', evidenceRoot: root,
    now: () => new Date('2026-08-10T00:00:00.000Z'), session: { invoke } });
  expect(invoke.mock.calls.map(([command]) => command)).toEqual([
    'load_workspace_list_snapshot', 'create_topic'
  ]);
  expect(result.factId).toBe('multi-device-sync-a-20260810000000000');
  expect(JSON.parse(fs.readFileSync(result.receiptPath, 'utf8'))).toMatchObject({
    device: 'A', factId: result.factId, resultStatus: 'success'
  });
});

it('can attach a deterministic resource through the registered desktop product command', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-device-fact-resource-'));
  const invoke = vi.fn(async (command, args) => {
    if (command === 'load_workspace_list_snapshot') return { nodeOrder: ['special-inbox'] };
    if (command === 'create_topic') return { createdNodeIds: [args.nodeId] };
    return { attachment_id: 'attachment-1', status: 'imported' };
  });
  const result = await createDesktopSyncGroupJourneyFact({ device: 'A', evidenceRoot: root,
    now: () => new Date('2026-08-10T00:00:00.000Z'), session: { invoke }, withAttachment: true });
  expect(invoke.mock.calls.map(([command]) => command)).toEqual([
    'load_workspace_list_snapshot', 'create_topic', 'import_clipboard_image_attachment'
  ]);
  expect(Buffer.from(invoke.mock.calls[2][1].bytesBase64, 'base64').subarray(0, 8))
    .toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(result.attachmentId).toBe('attachment-1');
});

it('uses distinct attachment resources for A and C continuity facts', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-device-fact-resources-'));
  const invoke = vi.fn(async (command, args) => {
    if (command === 'load_workspace_list_snapshot') return { nodeOrder: ['special-inbox'] };
    if (command === 'create_topic') return { createdNodeIds: [args.nodeId] };
    return { attachment_id: `attachment-${invoke.mock.calls.length}`, status: 'imported' };
  });
  for (const device of ['A', 'C']) {
    await createDesktopSyncGroupJourneyFact({ device, evidenceRoot: root,
      now: () => new Date('2026-08-10T00:00:00.000Z'), session: { invoke }, withAttachment: true });
  }
  const resources = invoke.mock.calls.filter(([command]) =>
    command === 'import_clipboard_image_attachment').map(([, args]) => args.bytesBase64);
  expect(new Set(resources).size).toBe(2);
});
