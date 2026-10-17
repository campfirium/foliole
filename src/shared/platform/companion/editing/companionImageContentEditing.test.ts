// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { loadCurrentSyncNodeRecord } from '../../../../../lib/core/sync/syncNodeGraph';

import { readCompanionContentSource, saveCompanionContentEdit } from './companionContentEditing';
import { editableNode, stableEditingHost } from './companionContentEditingStable.testSupport';
import { ContentDraftSession } from './contentDraftSession';

const state = vi.hoisted(() => ({ platform: 'android', owner: null as Awaited<ReturnType<typeof stableEditingHost>>['owner'] | null }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => state.platform, isNativePlatform: () => true }, registerPlugin: vi.fn(() => ({})) }));
vi.mock('../runtime/iosCompanionDatabaseBootstrap', () => ({ getIosCompanionDatabaseOwner: () => state.owner }));
const hosts: Awaited<ReturnType<typeof stableEditingHost>>[] = [];
afterEach(async () => { for (const host of hosts.splice(0)) await host.close(); state.owner = null; });
const image = { storage_key: `${'a'.repeat(64)}.png`, original_name: 'Mobile original.png', role: 'image' as const };

it.each(['android', 'ios'] as const)('%s retains image descriptions through draft failure, serialization, save and database reopen', async platform => {
  state.platform = platform;
  const host = await stableEditingHost(platform); hosts.push(host); state.owner = host.owner;
  await host.seed(editableNode(), 'base');
  const source = await readCompanionContentSource('topic');
  let fail = true;
  const inputs: string[] = [];
  const save = Object.assign(async (_nodeId: string, _content: string, edit?: Parameters<typeof saveCompanionContentEdit>[0]) => {
    if (!edit) throw new Error('missing_edit');
    inputs.push(JSON.stringify(edit));
    if (fail) throw new Error('injected_save_failure');
    return saveCompanionContentEdit(JSON.parse(inputs.at(-1)!));
  }, { readSource: readCompanionContentSource });
  const draft = new ContentDraftSession('topic', source, save, 60000);
  const content = `![mobile](asset://${image.storage_key})`;
  draft.change(content, [image]);
  await expect(draft.flush()).rejects.toThrow('injected_save_failure');
  fail = false;
  await draft.flush();
  expect(inputs[1]).toBe(inputs[0]);
  await host.reopen();
  const saved = await host.owner.read(db => loadCurrentSyncNodeRecord(db, 'topic'));
  expect(saved?.body_text).toBe(content);
  expect(JSON.parse(saved!.snapshot.resource_references!)).toEqual([image]);
  expect(saved?.snapshot).not.toHaveProperty('local_edit_image_input_hash');
  await saveCompanionContentEdit(JSON.parse(inputs.at(-1)!));
  await expect(saveCompanionContentEdit({ ...JSON.parse(inputs.at(-1)!), newImageReferences: [] }))
    .rejects.toThrow('content_edit_version_mismatch');
  expect(host.sqlite.prepare("SELECT count(*) FROM node_sync_versions WHERE object_id = 'topic'").pluck().get()).toBe(2);
});

it('keeps a mismatched retry dirty with the original pending input until a valid acknowledgement arrives', async () => {
  state.platform = 'android';
  const host = await stableEditingHost('android'); hosts.push(host); state.owner = host.owner;
  await host.seed(editableNode(), 'base');
  const inputs: string[] = [];
  const save = Object.assign(async (_nodeId: string, _content: string, edit?: Parameters<typeof saveCompanionContentEdit>[0]) => {
    if (!edit) throw new Error('missing_edit');
    inputs.push(JSON.stringify(edit));
    const ack = await saveCompanionContentEdit(inputs.length === 2 ? { ...edit, newImageReferences: [] } : edit);
    if (inputs.length === 1) throw new Error('lost_acknowledgement');
    return ack;
  }, { readSource: readCompanionContentSource });
  const draft = new ContentDraftSession('topic', await readCompanionContentSource('topic'), save, 60000);
  const content = `![mobile](asset://${image.storage_key})`;
  draft.change(content, [image]);
  await expect(draft.flush()).rejects.toThrow('lost_acknowledgement');
  await expect(draft.flush()).rejects.toThrow('content_edit_version_mismatch');
  expect(draft.error).toBe('content_edit_version_mismatch');
  expect(draft.dirty).toBe(true);
  expect(draft.value).toBe(content);
  expect(inputs[1]).toBe(inputs[0]);
  await draft.flush();
  expect(inputs[2]).toBe(inputs[0]);
  expect(draft.dirty).toBe(false);
  expect(draft.error).toBeNull();
  expect(host.sqlite.prepare("SELECT count(*) FROM node_sync_versions WHERE object_id = 'topic'").pluck().get()).toBe(2);
});
