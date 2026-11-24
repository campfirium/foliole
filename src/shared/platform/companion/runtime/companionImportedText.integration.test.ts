// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { INBOX_NODE_ID } from '../../../../../lib/core/database/specialNodeIds';
import type { WorkspaceNodeSnapshot } from '../../../../../lib/core/database/workspaceSnapshotHelpers';
import type { PreparedBookNode } from '../../../../../lib/core/import/epub/epubPreparedBook';
import { createPreparedDesktopTextImport } from '../../../../../lib/core/import/fingerprint';

import { persistCompanionImportedTextWithDb } from './companionImportedText';
import { openCompanionImportTestDatabase } from './companionImportSqlite.testSupport';
import { settleCompanionNodeVersionCollections } from './companionNodeHistory';

let library: Awaited<ReturnType<typeof openCompanionImportTestDatabase>>;
vi.mock('./iosCompanionDatabaseBootstrap', () => ({ getIosCompanionDatabaseOwner: () => library.owner }));

const work = vi.hoisted(() => ({ parentReads: 0 }));
vi.mock('../../../../../lib/core/database/workspaceNodeSyncVersion', async importOriginal => {
  const original = await importOriginal<typeof import('../../../../../lib/core/database/workspaceNodeSyncVersion')>();
  return {
    ...original,
    toWorkspaceNativeNodeVersion(node: WorkspaceNodeSnapshot, hostName: string) {
      const parentId = node.parentNodeId;
      Object.defineProperty(node, 'parentNodeId', {
        enumerable: true,
        get() {
          work.parentReads++;
          return parentId;
        }
      });
      return original.toWorkspaceNativeNodeVersion(node, hostName);
    }
  };
});

function chapter(key: string, title: string, parentKey: string | null) {
  return {
    content: `Reading material for ${title}`, degradedReason: null, embeddedImages: [], hideTitleHeading: true,
    key, parentKey, resourceReferences: [], title
  } satisfies PreparedBookNode & { resourceReferences: [] };
}

it('persists nested EPUB sibling order with work proportional to the number of chapters', async () => {
  library = await openCompanionImportTestDatabase();
  const prepared = createPreparedDesktopTextImport({
    content: 'A nested EPUB', fileName: 'nested.epub', filePath: 'nested.epub', kind: 'epub',
    importedAt: '2026-01-01T00:00:00.000Z', sourceTrackingMode: 'untracked'
  });
  const groups = Array.from({ length: 24 }, (_, index) => {
    const key = `group-${index}`;
    return [
      chapter(key, `Group ${index}`, null),
      chapter(`${key}-z`, 'Z first', key),
      chapter(`${key}-inner`, 'Inner second', key),
      chapter(`${key}-child`, 'Nested child', `${key}-inner`)
    ];
  });
  const chapters = groups.flat();
  try {
    work.parentReads = 0;
    const root = await library.db.transaction(db => persistCompanionImportedTextWithDb(db, prepared, INBOX_NODE_ID, [], chapters));
    const rows = await library.db.query<{ parent_id: string; child_ids_json: string }>('SELECT parent_id, child_ids_json FROM parent_order_sources');
    const nodes = await library.db.query<{ id: string; title: string }>('SELECT id, title FROM nodes');
    const titles = new Map(nodes.map(node => [node.id, node.title]));
    const ordered = new Map(rows.map(row => [row.parent_id, JSON.parse(row.child_ids_json) as string[]]));
    const rootChildren = ordered.get(root.id)!;
    expect(rootChildren.map(id => titles.get(id))).toEqual(groups.map(([group]) => group!.title));
    for (const parentId of rootChildren) {
      const children = ordered.get(parentId)!;
      expect(children.map(id => titles.get(id))).toEqual(['Z first', 'Inner second']);
      expect(ordered.get(children[1]!)?.map(id => titles.get(id))).toEqual(['Nested child']);
    }
    expect(work.parentReads).toBeLessThan(chapters.length * 8);
  } finally {
    await settleCompanionNodeVersionCollections();
    library.close();
  }
});
