// @vitest-environment node
import { expect, it } from 'vitest';

import { writeNodeBody } from '../../lib/core/database/nodeBodyMutation.js';
import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';
import { loadWorkspaceListSnapshot } from '../../lib/core/database/workspaceListSnapshot.js';
import { deriveNodeTitleFromContent } from '../../lib/core/nodes/deriveNodeTitle.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { textDevice } from './topicTextState.testSupport.js';

it('keeps a short automatic-title topic opening through creation, editing and list hydration', () => {
  const host = textDevice();
  const driver = createBetterSqlite3Driver(host.sqlite);
  const now = '2026-10-30T00:00:00.000Z';
  try {
    bindParentOrderWriter(driver, { deviceAnchor: 'opening-test', libraryPath: host.sqlite.name });
    driver.execute('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)', ['host_name', '"Opening"', now]);
    const content = 'A quick note.';
    upsertNodeSnapshot(driver, { nodeId: 'article', kind: 'topic', parentNodeId: 'special-inbox',
      content, title: deriveNodeTitleFromContent(content), isTitleManual: false, hideTitleHeading: false,
      createdAt: now, updatedAt: now, reveal: null, anchorLink: null, position: null });
    expect(driver.queryOne('SELECT opening_text FROM nodes WHERE id = ?', ['article']))
      .toEqual({ opening_text: content });
    const created = loadWorkspaceListSnapshot(driver)!.nodesById.article!;
    expect(created.content).toBe('');
    expect(created.openingText).toBe(content);
    const updated = 'A revised note.';
    writeNodeBody({ driver, nodeId: 'article', content: updated,
      title: deriveNodeTitleFromContent(updated), updatedAt: now });
    driver.execute('UPDATE nodes SET title = ? WHERE id = ?', [updated, 'article']);
    expect(loadWorkspaceListSnapshot(driver)!.nodesById.article!.openingText).toBe(updated);
  } finally { host.sqlite.close(); }
});
