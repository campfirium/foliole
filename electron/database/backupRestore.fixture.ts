import { expect } from 'vitest';

import { runReviewProjectionFixture } from '../sync/reviewProjection.fixture.js';

import { createApplicationDatabaseBackup, restoreApplicationDatabaseBackup } from './backupRestore.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { deleteNodesPermanently, softDeleteNodes, upsertNodeSnapshot } from './nodeMutations.js';
import { persistNodeResourceReference } from './nodeResources.js';
import { loadJsonSetting, saveJsonSetting } from './settingsStore.js';
import { loadWorkspaceSnapshot } from './workspaceSnapshot.js';

export async function assertResourceRestoreAfterColdOpen() {
  const references = [
    { storage_key: `${'a'.repeat(64)}.pdf`, role: 'reference' as const, original_name: 'Original.pdf' },
    { storage_key: `${'b'.repeat(64)}.png`, role: 'image' as const, original_name: 'Image.png' }
  ];
  seedNode('resource-parent', '# Parent');
  seedNode('resource-owner', `![Image](asset://${'b'.repeat(64)}.png)`, 1);
  openDatabaseConnection().sqlite.prepare('UPDATE nodes SET parent_id = ? WHERE id = ?')
    .run('resource-parent', 'resource-owner');
  for (const reference of references) persistNodeResourceReference('resource-owner', reference);
  saveJsonSetting('resource_restore_preference', { enabled: true });
  saveJsonSetting('system_entry_display_names', { inbox: 'Saved Inbox' });
  const before = loadWorkspaceSnapshot({ includeBody: true });
  const backup = await createApplicationDatabaseBackup();
  openDatabaseConnection().sqlite.prepare("UPDATE nodes SET resource_references = '[]', parent_id = NULL WHERE id = ?")
    .run('resource-owner');
  seedNode('resource-owner', '# After backup', 1);
  saveJsonSetting('resource_restore_preference', { enabled: false });
  saveJsonSetting('system_entry_display_names', { inbox: 'Changed Inbox' });
  await restoreApplicationDatabaseBackup({ sourcePath: backup.destinationPath });
  for (let reopen = 0; reopen < 2; reopen++) {
    expect(loadWorkspaceSnapshot({ includeBody: true })).toEqual(before);
    expect(loadWorkspaceSnapshot({ includeBody: true })?.nodesById['resource-owner']?.resourceReferences).toEqual(references);
    // Unknown keys are host settings: preserve this device while restoring user-space settings.
    expect(loadJsonSetting('resource_restore_preference')).toEqual({ enabled: false });
    expect(loadJsonSetting('system_entry_display_names')).toEqual({ inbox: 'Saved Inbox' });
    expect(openDatabaseConnection().sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(openDatabaseConnection().sqlite.pragma('foreign_key_check')).toEqual([]);
    closeDatabaseConnection();
    initializeDatabase();
  }
}

export function seedBackupBaseline() {
  seedNode('node-root', '# root', 0);
  seedNode('node-qa', 'Prompt [...]', 1, 'Answer');
  seedNode('node-trash', '# trash', 2);

  softDeleteNodes({ nodeIds: ['node-trash'], deletedAt: '2026-03-14T10:01:00.000Z' });
  runReviewProjectionFixture({ nodeId: 'node-qa', mode: 'grade', opId: 'backup-baseline',
    grade: 3, at: '2026-03-14T10:02:00.000Z' });
}

export function mutateWorkspaceAfterBackup() {
  seedNode('node-root', '# mutated after backup', 0);
  seedNode('node-later', '# later node', 3);
  deleteNodesPermanently({
    nodeIds: ['node-qa', 'node-trash'],
    nodeOrder: ['node-root', 'node-later']
  });
}

export function applyFollowupReviewGrade() {
  runReviewProjectionFixture({ nodeId: 'node-qa', mode: 'grade', opId: 'backup-followup',
    grade: 1, at: '2026-03-17T10:02:00.000Z' });
}

export function seedNode(nodeId: string, content: string, position = 0, reveal: string | null = null) {
  upsertNodeSnapshot({
    nodeId,
    parentNodeId: null,
    kind: reveal === null ? 'topic' : 'item',
    title: nodeId,
    isTitleManual: true,
    content,
    reveal,
    anchorLink: null,
    position,
    createdAt: '2026-03-14T10:00:00.000Z',
    updatedAt: '2026-03-14T10:00:00.000Z'
  });
}
