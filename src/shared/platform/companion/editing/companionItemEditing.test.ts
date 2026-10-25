// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { readCompanionContentSource, saveCompanionContentEdit } from './companionContentEditing';
import { editableNode, stableEditingHost } from './companionContentEditingStable.testSupport';

const state = vi.hoisted(() => ({ platform: 'android', owner: null as Awaited<ReturnType<typeof stableEditingHost>>['owner'] | null }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => state.platform, isNativePlatform: () => true }, registerPlugin: vi.fn(() => ({})) }));
vi.mock('../runtime/iosCompanionDatabaseBootstrap', () => ({ getIosCompanionDatabaseOwner: () => state.owner }));
const hosts: Awaited<ReturnType<typeof stableEditingHost>>[] = [];
afterEach(async () => { for (const host of hosts.splice(0)) await host.close(); state.owner = null; });

it.each(['android', 'ios'] as const)('%s persists both item fields, answer-only edits and clearing across reopen', async platform => {
  state.platform = platform;
  const host = await stableEditingHost(platform); hosts.push(host); state.owner = host.owner;
  await host.seed(editableNode({ kind: 'item', content: 'Question', reveal: 'Answer' }), 'base');
  const source = await readCompanionContentSource('topic', 'editor');
  const first = { nodeId: 'topic', content: 'Edited question', reveal: 'Edited answer',
    baseVersionId: source.versionId, versionId: 'first', updatedAt: '2026-10-25T01:00:00.000Z', holdId: 'editor' };
  await saveCompanionContentEdit(first);
  expect(host.sqlite.prepare("SELECT content, reveal FROM nodes WHERE id = 'topic'").get())
    .toEqual({ content: 'Edited question', reveal: 'Edited answer' });
  await expect(saveCompanionContentEdit({ ...first, reveal: 'Different retry' })).rejects.toThrow('content_edit_version_mismatch');
  const next = await readCompanionContentSource('topic');
  await saveCompanionContentEdit({ ...first, baseVersionId: next.versionId, versionId: 'second', reveal: 'Answer only',
    updatedAt: '2026-10-25T02:00:00.000Z' });
  await host.reopen();
  expect(host.sqlite.prepare("SELECT content, reveal FROM nodes WHERE id = 'topic'").get())
    .toEqual({ content: 'Edited question', reveal: 'Answer only' });
  const last = await readCompanionContentSource('topic');
  await saveCompanionContentEdit({ ...first, baseVersionId: last.versionId, versionId: 'clear', reveal: '',
    updatedAt: '2026-10-25T03:00:00.000Z' });
  expect(host.sqlite.prepare("SELECT content, reveal FROM nodes WHERE id = 'topic'").get())
    .toEqual({ content: 'Edited question', reveal: '' });
});

it('merges a concurrent question edit with the locally edited answer', async () => {
  state.platform = 'android';
  const host = await stableEditingHost('android'); hosts.push(host); state.owner = host.owner;
  await host.seed(editableNode({ kind: 'item', content: 'Question', reveal: 'Answer' }), 'base');
  await readCompanionContentSource('topic', 'editor');
  await host.seed(editableNode({ kind: 'item', content: 'Remote question', reveal: 'Answer', currentVersionId: 'base' }), 'remote');
  await saveCompanionContentEdit({ nodeId: 'topic', content: 'Question', baseContent: 'Question', reveal: 'Local answer',
    baseVersionId: 'base', versionId: 'local', updatedAt: '2026-10-25T04:00:00.000Z', holdId: 'editor' });
  await host.reopen();
  expect(host.sqlite.prepare("SELECT content, reveal FROM nodes WHERE id = 'topic'").get())
    .toEqual({ content: 'Remote question', reveal: 'Local answer' });
});

it('keeps shared question images while the answer still uses them and removes them after both fields stop using them', async () => {
  state.platform = 'android';
  const host = await stableEditingHost('android'); hosts.push(host); state.owner = host.owner;
  await host.seed(editableNode({ kind: 'item', content: 'Question', reveal: null }), 'base');
  const image = { storage_key: `${'a'.repeat(64)}.png`, original_name: 'Answer.png', role: 'image' as const };
  const text = `![Image](asset://${image.storage_key})`;
  const edit = { nodeId: 'topic', content: text, reveal: text, baseContent: 'Question', baseVersionId: 'base',
    versionId: 'image', updatedAt: '2026-10-25T04:00:00.000Z', newImageReferences: [image] };
  await saveCompanionContentEdit(edit);
  const source = await readCompanionContentSource('topic');
  await saveCompanionContentEdit({ ...edit, content: 'Question', baseContent: source.content,
    baseVersionId: source.versionId, versionId: 'question-only', newImageReferences: [] });
  expect((await readCompanionContentSource('topic')).imageReferences).toEqual([image]);
  const next = await readCompanionContentSource('topic');
  await saveCompanionContentEdit({ ...edit, content: 'Question', reveal: '', baseContent: next.content,
    baseVersionId: next.versionId, versionId: 'remove-image', newImageReferences: [] });
  expect((await readCompanionContentSource('topic')).imageReferences).toEqual([]);
});
