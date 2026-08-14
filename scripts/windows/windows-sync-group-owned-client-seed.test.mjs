// @vitest-environment node

import { rm } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

import {
  assertOwnedClientSeedFacts, assertOwnedClientUnboundFacts, seedOwnedWindowsClient
} from './windows-sync-group-owned-client-seed.mjs';

/* global process */

const baselineFacts = { activeMemberCount: 0, attachmentCount: 2, contentBlobCount: 8,
  integrity: 'ok', journeyFacts: {}, localGroupId: null, localMemberState: null,
  localTimelineId: null, missingAttachmentCount: 0, missingContentBlobCount: 0,
  userNodeCount: 8 };

function seededFacts(factId) {
  return { activeMemberCount: 0, attachmentCount: 3,
    attachmentIds: ['onboarding-a', 'onboarding-b', 'hash-c'],
    availableAttachmentIds: ['onboarding-a', 'onboarding-b', 'hash-c'],
    contentBlobCount: 10, facts: { [factId]: true },
    integrity: 'ok', localGroupId: null, localMemberState: null, localTimelineId: null,
    missingAttachmentCount: 0, missingContentBlobCount: 0, userNodeCount: 9 };
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
    const result = await seedOwnedWindowsClient({ baselineFacts, evidenceRoot,
      inspect: async ([factId]) => { events.push('inspected'); return seededFacts(factId); },
      invoke, openSession: async () => ({ app, page: {} }) });
    expect(result.material).toMatchObject({ attachmentId: 'hash-c' });
    expect(events).toEqual(['load_workspace_list_snapshot', 'create_topic',
      'import_clipboard_image_attachment', 'closed', 'inspected']);
  } finally {
    await rm(evidenceRoot, { force: true, recursive: true });
  }
});

it('rejects a seed receipt when the exact hash attachment is not available', () => {
  expect(() => assertOwnedClientSeedFacts({
    ...seededFacts('fact-c'), availableAttachmentIds: []
  }, { attachmentId: 'hash-c', factId: 'fact-c' }, baselineFacts))
    .toThrow('pre-join material is incomplete');
});

it('accepts onboarding material in an unbound baseline but rejects stale journey facts', () => {
  expect(() => assertOwnedClientUnboundFacts(baselineFacts)).not.toThrow();
  expect(() => assertOwnedClientUnboundFacts({
    ...baselineFacts, journeyFacts: { 'multi-device-sync-c-old': 'C' }
  })).toThrow('did not start unbound');
});
