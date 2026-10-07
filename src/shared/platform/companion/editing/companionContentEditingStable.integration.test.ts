// @vitest-environment node
import { isDeepStrictEqual } from 'node:util';

import { afterEach, expect, it, vi } from 'vitest';

import type { CapacitorCompanionDatabaseOwner } from '../runtime/capacitorCompanionDatabaseOwner.js';

import { readCompanionContentSource, releaseCompanionContentBase, saveCompanionContentEdit } from './companionContentEditing.js';
import { editBaseline, editableNode, editingDatabaseState, editTime, stableEditingHost } from './companionContentEditingStable.testSupport.js';

const state = vi.hoisted(() => ({ owner: null as CapacitorCompanionDatabaseOwner | null, platform: 'ios' }));
vi.mock('@capacitor/core', () => ({ Capacitor: {
  getPlatform: () => state.platform, isNativePlatform: () => true
}, registerPlugin: vi.fn(() => ({})) }));
vi.mock('../runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => state.owner
}));

let host: Awaited<ReturnType<typeof stableEditingHost>> | undefined;
afterEach(async () => { await host?.close(); host = undefined; state.owner = null; });

async function fixture(platform: 'android' | 'ios', child?: Parameters<typeof editableNode>[0], content = editBaseline) {
  state.platform = platform;
  host = await stableEditingHost(platform);
  state.owner = host.owner;
  await host.seed(editableNode({ content }), 'base');
  if (child) await host.seed(editableNode(child), 'child-base');
  await host.migrate();
  expect(host.sqlite.prepare("SELECT 1 FROM sqlite_master WHERE name = 'content_blob_data'").get()).toBeUndefined();
  return host;
}

function edit(content: string, versionId = 'local', baseVersionId = 'base', holdId?: string) {
  return { nodeId: 'topic', content, versionId, baseVersionId,
    ...(holdId === undefined ? {} : { holdId }), updatedAt: editTime };
}

it.each(['android', 'ios'] as const)('%s persists two stable edits and advances then releases the editor hold', async (platform) => {
  const host = await fixture(platform);
  expect(await readCompanionContentSource('topic', 'editor-session', 'chunked'))
    .toEqual({ content: editBaseline, versionId: 'base' });
  const content = '\ufeff中😀\0'.repeat(80_000);
  const first = await saveCompanionContentEdit(edit(content, 'first', 'base', 'editor-session'), 'chunked');
  expect(first).toEqual({ content, currentVersionId: 'first', submittedVersionId: 'first' });
  expect(host.sqlite.prepare('SELECT version_id FROM node_version_local_holds WHERE hold_id = ?').pluck().get('editor-session')).toBe('first');
  const second = await saveCompanionContentEdit(edit('', 'second', 'first', 'editor-session'), 'chunked');
  expect(second).toEqual({ content: '', currentVersionId: 'second', submittedVersionId: 'second' });
  expect(host.sqlite.prepare('SELECT version_id FROM node_version_local_holds WHERE hold_id = ?').pluck().get('editor-session')).toBe('second');
  expect(host.sqlite.prepare("SELECT body_text, json_extract(snapshot_json, '$.content') AS content FROM node_sync_versions WHERE version_id = 'second'").get())
    .toEqual({ body_text: null, content: null });
  await releaseCompanionContentBase('topic', 'editor-session', 'chunked');
  expect(host.sqlite.prepare('SELECT 1 FROM node_version_local_holds WHERE hold_id = ?').get('editor-session')).toBeUndefined();
  await host.reopen();
  expect(await readCompanionContentSource('topic', undefined, 'chunked')).toEqual({ content: '', versionId: 'second' });
  // Candidate migration is unregistered: current owner repair recreates an empty legacy table on reopen.
  expect(host.sqlite.prepare('SELECT count(*) FROM content_blob_data').pluck().get()).toBe(0);
  expect(host.sqlite.prepare("SELECT 1 FROM sqlite_master WHERE name = 'settings'").get()).toBeUndefined();
});

it.each(['android', 'ios'] as const)('%s retries an uncertain acknowledgement without new versions or body chunks', async (platform) => {
  const host = await fixture(platform);
  await readCompanionContentSource('topic', 'editor-session', 'chunked');
  // An uncertain acknowledgement leaves the draft base held until the caller accepts the result.
  const request = edit('Saved\ufeff中😀\0', 'saved', 'base');
  const first = await saveCompanionContentEdit(request, 'chunked');
  expect(host.sqlite.prepare('SELECT version_id FROM node_version_local_holds WHERE hold_id = ?')
    .pluck().get('editor-session')).toBe('base');
  const before = editingDatabaseState(host.sqlite);
  expect(await saveCompanionContentEdit(request, 'chunked')).toEqual(first);
  expect(isDeepStrictEqual(editingDatabaseState(host.sqlite), before)).toBe(true);
  expect(host.sqlite.prepare("SELECT count(*) FROM node_sync_versions WHERE object_id = 'topic'").pluck().get()).toBe(2);
  await expect(saveCompanionContentEdit({ ...request, content: 'Different input' }, 'chunked'))
    .rejects.toThrow('content_edit_version_mismatch');
  expect(isDeepStrictEqual(editingDatabaseState(host.sqlite), before)).toBe(true);
});

it.each(['android', 'ios'] as const)('%s remaps child text anchors and rolls back every persisted edit fact when its version is missing', async (platform) => {
  const host = await fixture(platform, { id: 'child', kind: 'item', parentNodeId: 'topic', content: 'Note',
    anchorLink: { id: 'anchor', kind: 'highlight', locator: { from: 7, to: 12, originalText: 'Bread' } } });
  await saveCompanionContentEdit(edit('Apples tea\nBread\nMilk\n'), 'chunked');
  const child = host.sqlite.prepare("SELECT anchor_link, current_version_id FROM nodes WHERE id = 'child'").get() as {
    anchor_link: string; current_version_id: string;
  };
  expect(JSON.parse(child.anchor_link).locator).toMatchObject({ from: 11, to: 16, originalText: 'Bread' });
  expect(child.current_version_id).not.toBe('child-base');
  host.sqlite.prepare("UPDATE nodes SET current_version_id = NULL WHERE id = 'child'").run();
  const source = await readCompanionContentSource('topic', 'editor-session', 'chunked');
  const before = editingDatabaseState(host.sqlite);
  await expect(saveCompanionContentEdit(edit('Prefix\n' + source.content, 'fail', source.versionId, 'editor-session'), 'chunked'))
    .rejects.toThrow('synced child base');
  expect(isDeepStrictEqual(editingDatabaseState(host.sqlite), before)).toBe(true);
  expect(await readCompanionContentSource('topic', undefined, 'chunked')).toEqual(source);
});

it.each(['android', 'ios'] as const)('%s preserves image excerpt regions while remapping the parent image locator', async (platform) => {
  const image = '![Cover](asset://hash-1.png)';
  const imageRegions = [{ attachmentId: 'hash-1', regions: [{ height: 0.2, id: 'region-1', width: 0.3, x: 0.1, y: 0.4 }] }];
  const host = await fixture(platform, { id: 'image-child', parentNodeId: 'topic', content: 'Image excerpt', imageRegions,
    anchorLink: { id: 'excerpt', kind: 'image-excerpt', locator: { from: 0, to: image.length, originalText: image } } }, image);
  await saveCompanionContentEdit(edit('Lead\n' + image, 'image-edit'), 'chunked');
  const row = host.sqlite.prepare("SELECT anchor_link, image_regions FROM nodes WHERE id = 'image-child'").get() as {
    anchor_link: string; image_regions: string;
  };
  expect(JSON.parse(row.anchor_link).locator.from).toBe(5);
  expect(JSON.parse(row.image_regions)).toEqual(imageRegions);
});
