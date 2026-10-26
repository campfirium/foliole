// @vitest-environment node
import { expect, it } from 'vitest';

import { processClaimedInvalidationRows } from '../../lib/core/database/searchIndexInvalidations.js';
import { refreshWorkspacePdfPageMap } from '../../lib/core/database/workspacePdfPageMap.js';
import { rebuildWorkspaceSearchIndexes, syncPdfSearchIndexForNodeIds, syncWorkspaceSearchIndexForNodeIds } from '../../lib/core/database/workspaceSearchIndex.js';
import { deleteWorkspaceSearchIndexForExistingSubtreeRootIds, deleteWorkspaceSearchIndexForSubtreeRootIds,
  syncWorkspaceSearchPathForSubtreeRootIds } from '../../lib/core/database/workspaceSearchSubtreeIndex.js';

import { pageMapLibrary } from './workspacePdfPageMap.testSupport.js';

it.each([100, 1000, 10000])('does no unrelated PDF map writes for a non-PDF leaf with %i unrelated pages', (size) => {
  const host = pageMapLibrary();
  try {
    host.insertNode('leaf');
    host.seedUnrelated(size);
    const before = host.map();
    host.sqlite.exec(`CREATE TABLE search.map_write_count (changes INTEGER);
      INSERT INTO search.map_write_count VALUES (0);
      CREATE TRIGGER search.count_map_insert AFTER INSERT ON pdf_page_map
        BEGIN UPDATE map_write_count SET changes=changes+1; END;
      CREATE TRIGGER search.count_map_delete AFTER DELETE ON pdf_page_map
        BEGIN UPDATE map_write_count SET changes=changes+1; END;
      CREATE TRIGGER search.count_map_update AFTER UPDATE ON pdf_page_map
        BEGIN UPDATE map_write_count SET changes=changes+1; END;`);
    const changes = () => host.driver.queryOne<{ changes: number }>('SELECT changes FROM search.map_write_count')!.changes;
    refreshWorkspacePdfPageMap(host.driver);
    expect(changes()).toBe(size * 2);
    host.driver.execute('UPDATE search.map_write_count SET changes=0');
    syncPdfSearchIndexForNodeIds(host.driver, ['leaf']);
    expect(host.map()).toEqual(before);
    const directChanges = changes();
    host.driver.execute('UPDATE search.map_write_count SET changes=0');
    processClaimedInvalidationRows(host.driver, [{ id: 1, invalidation_type: 'node_workspace', target_id: 'leaf' }]);
    expect(host.map()).toEqual(before);
    expect(host.map()).toEqual(host.expectedMap());
    expect(host.driver.queryAll('SELECT node_id,content FROM search.node_search'))
      .toEqual([{ node_id: 'leaf', content: 'body' }]);
    expect({ directChanges, batchChanges: changes() }).toEqual({ directChanges: 0, batchChanges: 0 });
  } finally { host.sqlite.close(); }
});

function seedOwners(host: ReturnType<typeof pageMapLibrary>) {
  const attachment = 'a'.repeat(64);
  host.insertNode('root');
  host.insertNode('first', 'root');
  host.insertNode('second');
  host.attach('first', attachment);
  host.attach('second', attachment);
  host.driver.execute("INSERT INTO pdf_index_state(attachment_id,status) VALUES (?,'ready')", [attachment]);
  host.driver.execute('INSERT INTO pdf_page_text(attachment_id,page,text) VALUES (?,1,?), (?,2,?)',
    [attachment, 'alpha bri', attachment, 'dge omega']);
  rebuildWorkspaceSearchIndexes(host.driver);
  expect(host.map()).toEqual(host.expectedMap());
  return attachment;
}

it('keeps exact FTS rowids through shared attachment replacement, owner removal and last-owner removal', () => {
  const host = pageMapLibrary();
  try {
    const attachment = seedOwners(host);
    host.driver.execute('DELETE FROM pdf_page_text WHERE page=2');
    host.driver.execute("UPDATE pdf_page_text SET text='replacement'");
    processClaimedInvalidationRows(host.driver, [{ id: 1, invalidation_type: 'attachment_pdf', target_id: attachment }]);
    expect(host.map()).toEqual(host.expectedMap());
    expect(host.map().map(({ node_id, page }) => [node_id, page]).sort())
      .toEqual([['first', 1], ['second', 1]]);
    expect(host.driver.queryAll('SELECT text FROM search.pdf_search')).toEqual([{ text: 'replacement' }, { text: 'replacement' }]);
    host.driver.execute("UPDATE nodes SET resource_references='[]' WHERE id='first'");
    processClaimedInvalidationRows(host.driver, [{ id: 2, invalidation_type: 'node_workspace', target_id: 'first' }]);
    expect(host.map()).toEqual(host.expectedMap());
    expect(host.map().map(({ node_id }) => node_id)).toEqual(['second']);
    host.driver.execute("UPDATE nodes SET resource_references='[]' WHERE id='second'");
    processClaimedInvalidationRows(host.driver, [{ id: 3, invalidation_type: 'attachment_pdf', target_id: attachment }]);
    expect(host.map()).toEqual([]);
    expect(host.expectedMap()).toEqual([]);
  } finally { host.sqlite.close(); }
});

it('preserves unrelated holders through subtree deletion, restore, path changes and missing-root cleanup', () => {
  const host = pageMapLibrary();
  try {
    seedOwners(host);
    const unrelated = host.map().filter(({ node_id }) => node_id === 'second');
    deleteWorkspaceSearchIndexForExistingSubtreeRootIds(host.driver, ['root']);
    expect(host.map()).toEqual(unrelated);
    expect(host.map()).toEqual(host.expectedMap());
    syncWorkspaceSearchIndexForNodeIds(host.driver, ['root']);
    expect(host.map()).toEqual(host.expectedMap());
    host.driver.execute("UPDATE nodes SET title='Moved',deleted_at='now' WHERE id='root'");
    const beforePath = host.map();
    syncWorkspaceSearchPathForSubtreeRootIds(host.driver, ['root']);
    expect(host.map()).toEqual(beforePath);
    expect(host.driver.queryAll("SELECT path,is_trashed FROM search.pdf_search WHERE node_id='first'"))
      .toEqual([{ path: 'Moved', is_trashed: 1 }, { path: 'Moved', is_trashed: 1 }]);
    deleteWorkspaceSearchIndexForSubtreeRootIds(host.driver, ['root']);
    expect(host.map()).toEqual(unrelated);
    host.driver.execute("UPDATE nodes SET deleted_at=NULL WHERE id='root'");
    processClaimedInvalidationRows(host.driver, [{ id: 1, invalidation_type: 'node_subtree_restored', target_id: 'root' }]);
    expect(host.map()).toEqual(host.expectedMap());
    expect(host.map()).toHaveLength(4);
    host.driver.execute("DELETE FROM nodes WHERE id='first'");
    deleteWorkspaceSearchIndexForSubtreeRootIds(host.driver, ['first']);
    expect(host.map()).toEqual(unrelated);
    expect(host.map()).toEqual(host.expectedMap());
    rebuildWorkspaceSearchIndexes(host.driver);
    expect(host.map()).toEqual(host.expectedMap());
  } finally { host.sqlite.close(); }
});

it('replaces a PDF mount in a mixed node and attachment batch without mixing holder page mappings', () => {
  const host = pageMapLibrary();
  try {
    const original = seedOwners(host);
    const replacement = 'b'.repeat(64);
    host.driver.execute("UPDATE nodes SET resource_references='[]' WHERE id='first'");
    host.attach('first', replacement);
    host.driver.execute("INSERT INTO pdf_index_state(attachment_id,status) VALUES (?,'ready')", [replacement]);
    host.driver.execute('INSERT INTO pdf_page_text(attachment_id,page,text) VALUES (?,7,?)', [replacement, 'new document']);
    processClaimedInvalidationRows(host.driver, [
      { id: 1, invalidation_type: 'attachment_pdf', target_id: original },
      { id: 2, invalidation_type: 'node_pdf', target_id: 'first' }
    ]);
    expect(host.map()).toEqual(host.expectedMap());
    expect(host.driver.queryAll('SELECT node_id,attachment_id,page FROM search.pdf_page_map ORDER BY node_id,page'))
      .toEqual([
        { node_id: 'first', attachment_id: replacement, page: 7 },
        { node_id: 'second', attachment_id: original, page: 1 },
        { node_id: 'second', attachment_id: original, page: 2 }
      ]);
  } finally { host.sqlite.close(); }
});
