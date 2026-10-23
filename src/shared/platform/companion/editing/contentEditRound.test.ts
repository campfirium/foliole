// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { loadCurrentSyncNodeRecord } from '../../../../../lib/core/sync/syncNodeGraph';

import { readCompanionContentSource, releaseCompanionContentBase, retainCompanionContentBase, saveCompanionContentEdit } from './companionContentEditing';
import { editableNode, editBaseline, stableEditingHost } from './companionContentEditingStable.testSupport';
import { ContentDraftSession } from './contentDraftSession';
import { ContentEditRound } from './contentEditRound';

const state = vi.hoisted(() => ({ platform: 'android', owner: null as Awaited<ReturnType<typeof stableEditingHost>>['owner'] | null }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => state.platform, isNativePlatform: () => true }, registerPlugin: vi.fn(() => ({})) }));
vi.mock('../runtime/iosCompanionDatabaseBootstrap', () => ({ getIosCompanionDatabaseOwner: () => state.owner }));
const hosts: Awaited<ReturnType<typeof stableEditingHost>>[] = [];
afterEach(async () => { for (const host of hosts.splice(0)) await host.close(); state.owner = null; });
const image = { storage_key: `${'b'.repeat(64)}.png`, original_name: 'Entry image.png', role: 'image' as const };
type Edit = Parameters<typeof saveCompanionContentEdit>[0];
const hooks = { beforeSave: null as ((edit: Edit) => Promise<void>) | null };
afterEach(() => { hooks.beforeSave = null; });
const save = Object.assign(async (_nodeId: string, _content: string, edit?: Edit) => {
  await hooks.beforeSave?.(edit!);
  return saveCompanionContentEdit(edit!);
}, { readSource: readCompanionContentSource, retainHold: retainCompanionContentBase, releaseHold: releaseCompanionContentBase });

async function openRound(platform: 'android' | 'ios') {
  state.platform = platform;
  const host = await stableEditingHost(platform); hosts.push(host); state.owner = host.owner;
  await host.seed(editableNode(), 'base');
  const draft = new ContentDraftSession('topic', { content: editBaseline, versionId: 'base' }, save);
  await draft.start();
  const current = () => host.owner.read(db => loadCurrentSyncNodeRecord(db, 'topic'));
  const bodies = async () => { const saved = await current(); return [saved!.body_text, ...(saved!.alternative_bodies ?? []).map(body => body.text)]; };
  const type = async (content: string, references: typeof image[] = []) => { draft.change(content, references); await draft.flush(); };
  return { host, draft, round: new ContentEditRound(draft), current, bodies, type };
}

it.each(['android', 'ios'] as const)('%s cancel restores autosaved input as a new persisted version', async (platform) => {
  const { host, draft, round, type } = await openRound(platform);
  round.begin();
  await type('Apples tea\nBread\nMilk\n');
  await type('Apples tea\nBread jam\nMilk\n');
  expect(round.hasChanges()).toBe(true);
  await expect(round.revert()).resolves.toBe('reverted');
  expect(draft.value).toBe(editBaseline);
  await host.reopen();
  const saved = await host.owner.read(db => loadCurrentSyncNodeRecord(db, 'topic'));
  expect(saved?.body_text).toBe(editBaseline);
  expect(host.sqlite.prepare("SELECT count(*) FROM node_sync_versions WHERE object_id = 'topic'").pluck().get()).toBe(4);
});

it('writes nothing when the round made no changes', async () => {
  const { host, round } = await openRound('android');
  round.begin();
  expect(round.hasChanges()).toBe(false);
  await expect(round.revert()).resolves.toBe('unchanged');
  expect(host.sqlite.prepare("SELECT count(*) FROM node_sync_versions WHERE object_id = 'topic'").pluck().get()).toBe(1);
});

it('refuses to restore once changes from another device were merged into the round', async () => {
  const { host, round, bodies, type } = await openRound('android');
  round.begin();
  await host.seed(editableNode({ content: 'Apples\nBread\nMilk coffee\n', currentVersionId: 'base' }), 'remote');
  await type('Apples tea\nBread\nMilk\n');
  await expect(round.revert()).resolves.toBe('blocked');
  expect(await bodies()).toEqual(expect.arrayContaining(['Apples\nBread\nMilk coffee\n', 'Apples tea\nBread\nMilk\n']));
  expect(await bodies()).not.toContain(editBaseline);
});

it('refuses to restore once a synced change was refreshed into the round', async () => {
  const { host, draft, round, current, bodies, type } = await openRound('android');
  round.begin();
  await type('Apples tea\nBread\nMilk\n');
  const own = (await current())!.version_id!;
  await host.seed(editableNode({ content: 'Apples tea\nBread\nMilk coffee\n', currentVersionId: own }), 'remote');
  await draft.refresh();
  await expect(round.revert()).resolves.toBe('blocked');
  expect(await bodies()).toEqual(['Apples tea\nBread\nMilk coffee\n']);
});

it('keeps a change synced while restoring alongside the restored content', async () => {
  const { host, round, bodies, type } = await openRound('android');
  round.begin();
  await type('Apples tea\nBread\nMilk\n');
  hooks.beforeSave = async (edit) => {
    hooks.beforeSave = null;
    await host.seed(editableNode({ content: 'Apples tea\nBread\nMilk coffee\n', currentVersionId: edit.baseVersionId }), 'remote');
  };
  await expect(round.revert()).resolves.toBe('reverted');
  expect(await bodies()).toEqual(expect.arrayContaining([editBaseline, 'Apples tea\nBread\nMilk coffee\n']));
});

it('restores the image resource of an image removed during the round', async () => {
  const { round, current, type } = await openRound('android');
  const withImage = `${editBaseline}![entry](asset://${image.storage_key})`;
  await type(withImage, [image]);
  round.begin();
  await type(editBaseline);
  expect(JSON.parse((await current())!.snapshot.resource_references ?? '[]')).toEqual([]);
  await expect(round.revert()).resolves.toBe('reverted');
  const saved = await current();
  expect(saved?.body_text).toBe(withImage);
  expect(JSON.parse(saved!.snapshot.resource_references!)).toEqual([image]);
});
