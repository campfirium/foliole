// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { createCompanionRequestFixture } from '../test/companionRequestSync.testSupport';

import { persistCompanionCapturedText } from './companionCaptureTextActions';

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'ios', isNativePlatform: () => true },
  registerPlugin: vi.fn(() => ({}))
}));

it('persists an iOS quick capture and synchronizes its whole body through requests after restart', { meta: { calibratedMs: 20000 } }, async () => {
  const host = await createCompanionRequestFixture();
  const desktop = new Database(host.fixture.rightSnapshot.databasePath);
  try {
    const result = await persistCompanionCapturedText({
      deviceId: 'ios-device', snapshot: createSnapshot(), text: '  iPhone note\nsecond line  '
    });
    expect(result.snapshot.nodesById[result.nodeId]).toMatchObject({
      content: 'iPhone note\nsecond line', parentNodeId: INBOX_NODE_ID, title: 'iPhone note'
    });
    await host.sync();
    await host.sync();
    await host.restart();
    const query = 'SELECT title, content, opening_text, parent_id, current_version_id FROM nodes WHERE id = ?';
    const expected = { title: 'iPhone note', content: 'iPhone note\nsecond line',
      opening_text: 'second line', parent_id: INBOX_NODE_ID, current_version_id: expect.any(String) };
    expect(host.sqlite.prepare(query).get(result.nodeId)).toEqual(expected);
    expect(desktop.prepare(query).get(result.nodeId)).toEqual(host.sqlite.prepare(query).get(result.nodeId));
    expect(desktop.prepare('SELECT COUNT(*) AS count FROM node_sync_versions WHERE object_id = ?').get(result.nodeId))
      .toEqual({ count: 1 });
  } finally { desktop.close(); await host.close(); }
});

function createSnapshot(): WorkspaceSnapshot {
  const timestamp = '2026-07-21T00:00:00.000Z';
  return {
    activeNodeId: INBOX_NODE_ID,
    nodeOrder: [INBOX_NODE_ID],
    nodesById: {
      [INBOX_NODE_ID]: {
        anchorLink: null,
        content: '',
        createdAt: timestamp,
        hideTitleHeading: false,
        id: INBOX_NODE_ID,
        isTitleManual: false,
        kind: 'folder',
        openingText: null,
        parentNodeId: null,
        reading: null,
        reveal: null,
        review: null,
        title: 'Inbox',
        updatedAt: timestamp
      }
    },
    trashedNodeIds: [],
    untitledSequenceByParent: {}
  };
}
