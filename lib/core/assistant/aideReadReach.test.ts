import { describe, expect, it } from 'vitest';

import { buildAideReachContext, isAideMaterialReachable, type AideMaterialPlacement, type AideReadScopes } from './aideReadReach.js';
import { AIDE_READ_SCOPE_KEYS } from './aideToolPermissionSettings.js';

const NONE = Object.fromEntries(AIDE_READ_SCOPE_KEYS.map((key) => [key, false])) as AideReadScopes;
const only = (...keys: Array<keyof AideReadScopes>) => ({ ...NONE, ...Object.fromEntries(keys.map((key) => [key, true])) });

function placed(chainIds: string[], extra: Partial<AideMaterialPlacement> = {}): AideMaterialPlacement {
  const rootId = chainIds.at(-1)!;
  return {
    area: 'home', baseTopicId: null, chainIds, id: chainIds[0]!, rootId, rootIsFolder: chainIds.length > 1, trashed: false, ...extra
  };
}

// Folder A holds the current material (an excerpt of book), folder B holds an unrelated book.
const current = placed(['excerpt', 'book', 'folder-a'], { baseTopicId: 'book' });
const context = buildAideReachContext([current], [
  { id: 'index-1', kind: 'index', memberIds: ['excerpt', 'loose'] },
  { id: 'index-2', kind: 'index', memberIds: ['far'] },
  { id: 'dive-1', kind: 'dive', memberIds: ['folder-a', 'notes'] },
  { id: 'dive-2', kind: 'dive', memberIds: ['far'] }
]);

describe('Aide read reach', () => {
  it('reads the current material only while Current material is on', () => {
    expect(isAideMaterialReachable(current, context, only('current'))).toBe(true);
    expect(isAideMaterialReachable(current, context, NONE)).toBe(false);
  });

  it('opens the whole Base Topic, the top folder, or all of Home', () => {
    const sibling = placed(['sibling', 'book', 'folder-a']);
    const neighbour = placed(['neighbour', 'folder-a']);
    const far = placed(['far', 'folder-b']);
    expect(isAideMaterialReachable(sibling, context, only('baseTopic'))).toBe(true);
    expect(isAideMaterialReachable(neighbour, context, only('baseTopic'))).toBe(false);
    expect(isAideMaterialReachable(neighbour, context, only('folder'))).toBe(true);
    expect(isAideMaterialReachable(far, context, only('folder'))).toBe(false);
    expect(isAideMaterialReachable(far, context, only('home'))).toBe(true);
  });

  it('opens the indexes and Dives that hold a current material, with what they list', () => {
    expect(isAideMaterialReachable(placed(['loose']), context, only('virtual'))).toBe(true);
    expect(isAideMaterialReachable(placed(['index-1', 'virtual-root'], { area: 'virtual' }), context, only('virtual'))).toBe(true);
    expect(isAideMaterialReachable(placed(['index-2', 'virtual-root'], { area: 'virtual' }), context, only('virtual'))).toBe(false);
    expect(isAideMaterialReachable(placed(['notes']), context, only('dives'))).toBe(true);
    expect(isAideMaterialReachable(placed(['deep', 'folder-a']), context, only('dives'))).toBe(true);
    expect(isAideMaterialReachable(placed(['dive-2'], { area: 'dive' }), context, only('dives'))).toBe(false);
    expect(isAideMaterialReachable(placed(['far', 'folder-b']), context, only('dives'))).toBe(false);
  });

  it('reads anything in the trash through Trash alone', () => {
    const gone = placed(['gone', 'folder-a'], { trashed: true });
    expect(isAideMaterialReachable(gone, context, only('folder', 'home'))).toBe(false);
    expect(isAideMaterialReachable(gone, context, only('trash'))).toBe(true);
  });
});
