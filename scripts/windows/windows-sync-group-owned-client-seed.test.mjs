// @vitest-environment node

import { rm } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

import {
  assertOwnedClientSeedFacts, seedOwnedWindowsClient
} from './windows-sync-group-owned-client-seed.mjs';

/* global process */

function seededFacts(factId) {
  return { activeMemberCount: 0, attachmentCount: 1, attachmentIds: ['hash-c'],
    cachedAttachmentIds: ['hash-c'], contentBlobCount: 1, facts: { [factId]: true },
    integrity: 'ok', localGroupId: null, localMemberState: null, localTimelineId: null,
    missingAttachmentCount: 0, missingContentBlobCount: 0, userNodeCount: 1 };
}

it('creates C material through product commands before inspecting the pre-join database', async () => {
  const evidenceRoot = path.join(process.cwd(), '.tmp', `windows-c-seed-${Date.now()}`);
  const events = [];
  const app = { close: async () => { events.push('closed'); },
    process: () => ({ exitCode: null, pid: 41, signalCode: null }) };
  const invoke = async (_page, command, args) => {
    events.push(command);
    if (command === 'load_workspace_list_snapshot') return { nodeOrder: ['special-inbox'] };
    if (command === 'create_topic') return { createdNodeIds: [args.nodeId] };
    if (command === 'import_clipboard_image_attachment') {
      return { attachment_id: 'hash-c', status: 'imported' };
    }
    throw new Error(`unexpected command: ${command}`);
  };
  try {
    const result = await seedOwnedWindowsClient({ evidenceRoot,
      inspect: async ([factId]) => { events.push('inspected'); return seededFacts(factId); },
      invoke, openSession: async () => ({ app, page: {} }) });
    expect(result.material).toMatchObject({ attachmentId: 'hash-c' });
    expect(events).toEqual(['load_workspace_list_snapshot', 'create_topic',
      'import_clipboard_image_attachment', 'closed', 'inspected']);
  } finally {
    await rm(evidenceRoot, { force: true, recursive: true });
  }
});

it('rejects a seed receipt when the exact hash attachment is not cached', () => {
  expect(() => assertOwnedClientSeedFacts({
    ...seededFacts('fact-c'), cachedAttachmentIds: []
  }, { attachmentId: 'hash-c', factId: 'fact-c' })).toThrow('pre-join material is incomplete');
});
