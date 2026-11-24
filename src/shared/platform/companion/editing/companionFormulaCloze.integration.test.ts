// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false, convertFileSrc: (url: string) => url },
    registerPlugin: () => createCompanionNativeSyncStub() };
});

import { toWorkspaceNativeNodeVersion } from '../../../../../lib/core/database/workspaceNodeSyncVersion';
import { applySyncNodesWithDbPort } from '../../../../../lib/core/sync/syncNodeApplyExecutor';
import {
  buildFormulaOccurrenceKey,
  deriveFormulaClozeRegionsFromChildren,
  getFormulaClozeLocator
} from '../../../../features/formula-cloze/model/formulaCloze';
import { loadCompanionWorkspaceSyncState } from '../../companionWorkspaceSync';
import { getCompanionReadingScope } from '../reading/companionReadingScope';
import { createSearchLibrary, reopenSearchLibrary } from '../runtime/companionSearchSnapshot.testSupport';
import { loadCompanionWorkspaceNode } from '../runtime/companionWorkspaceNodeStore';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

import { editableNode } from './companionContentEditingStable.testSupport';
import { createCompanionFormulaCloze, type CompanionFormulaClozeRequest } from './companionFormulaCloze';

const formula = '$$E = mc^2$$';
const content = `Energy\n\n${formula}\n\nEnd`;
const from = content.indexOf(formula);
const to = from + formula.length;
const selection = (text: string, x: number) => ({ algorithm: 'katex-dom-leaf-v1' as const,
  fallbackRect: { x, y: 0.1, width: 0.2, height: 0.8 }, leaves: [{ path: [0, 1, 2], structureFingerprint: 'mord mathnormal', textFingerprint: text }] });
let library: Awaited<ReturnType<typeof createSearchLibrary>> | null = null;
afterEach(async () => { await library?.close(); library = null; });

async function prepare(kind: 'topic' | 'item' = 'topic') {
  library = await createSearchLibrary(0);
  const version = await toWorkspaceNativeNodeVersion(editableNode({ content, kind }), 'source', 'parent-version');
  await getIosCompanionDatabaseOwner().runWriter(db => applySyncNodesWithDbPort(db, [version], { enqueueSearchInvalidations: false }), { kind: 'business' });
  return { parentNodeId: 'topic', expectedContent: content, expectedVersionId: 'parent-version', display: 'block', formulaRange: { from, to },
    formulaSource: formula, occurrenceKey: buildFormulaOccurrenceKey({ display: 'block', from, to, tex: 'E = mc^2' }), scope: getCompanionReadingScope(),
    regions: [{ nodeId: 'item-m', anchorId: 'formula-m', selection: selection('m', 0.5) }, { nodeId: 'item-c', anchorId: 'formula-c', selection: selection('c', 0.7) }]
  } satisfies CompanionFormulaClozeRequest;
}

it('creates one reviewable formula cloze Item per region that desktop can present, retries without duplicates, and keeps them after reopening', async () => {
  const request = await prepare();
  expect(await createCompanionFormulaCloze(request)).toEqual(['item-m', 'item-c']);
  const saved = await loadCompanionWorkspaceNode('item-m');
  expect(saved).toMatchObject({ kind: 'item', parentNodeId: 'topic', title: 'm', content: formula, reveal: formula });
  expect(getFormulaClozeLocator(saved?.anchorLink)).toEqual({ kind: 'formula-region', display: 'block', formulaSource: formula,
    occurrenceKey: request.occurrenceKey, fallbackRect: request.regions[0]!.selection.fallbackRect, selection: request.regions[0]!.selection });
  expect((await loadCompanionWorkspaceNode('topic'))?.content).toBe(content);
  const snapshot = (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
  expect(snapshot.nodesById['item-c']?.review).toBeTruthy();
  expect(deriveFormulaClozeRegionsFromChildren({ nodeId: 'topic', nodesById: snapshot.nodesById, trashedNodeIds: [] }).map(region => region.id).sort())
    .toEqual(['formula-c', 'formula-m']);
  // The parent version moved on with the committed write; a retry of the same request still resolves to the same Items.
  expect(await createCompanionFormulaCloze(request)).toEqual(['item-m', 'item-c']);
  expect(library!.database.prepare("SELECT count(*) FROM node_sync_versions WHERE object_id IN ('item-m','item-c')").pluck().get()).toBe(2);
  await reopenSearchLibrary(library!.root, '2026-11-25T00:00:00Z');
  expect(await loadCompanionWorkspaceNode('item-m')).toEqual(saved);
});

it('rejects a changed source, an Item source, a mismatched formula and a changed library without writing', async () => {
  const request = await prepare();
  await expect(createCompanionFormulaCloze({ ...request, expectedVersionId: 'stale' })).rejects.toThrow('formula_cloze_source_changed');
  await expect(createCompanionFormulaCloze({ ...request, expectedContent: `${content}!` })).rejects.toThrow('formula_cloze_source_changed');
  await expect(createCompanionFormulaCloze({ ...request, formulaSource: '$$x$$' })).rejects.toThrow('formula_cloze_invalid_source');
  await expect(createCompanionFormulaCloze({ ...request, regions: [] })).rejects.toThrow('formula_cloze_invalid_source');
  await expect(createCompanionFormulaCloze({ ...request, scope: Symbol('old') as unknown as typeof request.scope })).rejects.toThrow('formula_cloze_library_changed');
  expect(await loadCompanionWorkspaceNode('item-m')).toBeNull();
  await library!.close();
  const itemRequest = await prepare('item');
  await expect(createCompanionFormulaCloze(itemRequest)).rejects.toThrow('formula_cloze_source_changed');
  expect(await loadCompanionWorkspaceNode('item-m')).toBeNull();
});
