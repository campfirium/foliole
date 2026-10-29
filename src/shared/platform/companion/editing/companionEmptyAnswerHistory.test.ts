// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { readCompanionContentSource, saveCompanionContentEdit, saveCompanionContentEditWithDb } from './companionContentEditing';
import { editableNode, stableEditingHost } from './companionContentEditingStable.testSupport';
import { applyCompanionEditHistory } from './companionEditHistoryReplay';

const state = vi.hoisted(() => ({ platform: 'android', owner: null as Awaited<ReturnType<typeof stableEditingHost>>['owner'] | null }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => state.platform, isNativePlatform: () => true }, registerPlugin: vi.fn(() => ({})) }));
vi.mock('../runtime/iosCompanionDatabaseBootstrap', () => ({ getIosCompanionDatabaseOwner: () => state.owner }));
const hosts: Awaited<ReturnType<typeof stableEditingHost>>[] = [];
afterEach(async () => { for (const host of hosts.splice(0)) await host.close(); state.owner = null; });
type Host = Awaited<ReturnType<typeof stableEditingHost>>;

async function save(reveal: string | null, versionId: string, content = 'Question') {
  const source = await readCompanionContentSource('topic');
  return saveCompanionContentEdit({ nodeId: 'topic', baseVersionId: source.versionId,
    versionId, content, reveal, updatedAt: '2026-10-29T05:00:00.000Z' });
}

async function expectFact(host: Host, reveal: string | null, content = 'Question') {
  expect(await readCompanionContentSource('topic')).toMatchObject({ reveal, content });
  expect(host.sqlite.prepare("SELECT content, reveal FROM nodes WHERE id = 'topic'").get()).toEqual({ content, reveal });
  const fact = host.sqlite.prepare(`SELECT snapshot_json FROM node_sync_versions
    WHERE version_id = (SELECT current_version_id FROM nodes WHERE id = 'topic')`).get() as { snapshot_json: string };
  expect(JSON.parse(fact.snapshot_json).reveal).toBe(reveal);
}

it.each(['android', 'ios'] as const)('%s preserves empty answer transitions through undo, redo and reopen', async platform => {
  state.platform = platform;
  const host = await stableEditingHost(platform); hosts.push(host); state.owner = host.owner;
  await host.seed(editableNode({ kind: 'item', content: 'Question', reveal: null }), 'base');
  const answers = [null, '', 'Answer', '', null] as const;
  for (const [index, answer] of answers.entries()) {
    if (!index) continue;
    await save(answer, `answer-${index}`);
    await expectFact(host, answer);
    expect(await applyCompanionEditHistory('topic', 'undo')).toBeTruthy();
    await expectFact(host, answers[index - 1]!);
    expect(await applyCompanionEditHistory('topic', 'redo')).toBeTruthy();
    await expectFact(host, answer);
  }
  // Presence-only events must remain distinct from surrounding text edits.
  for (const answer of [...answers].reverse().slice(1)) {
    expect(await applyCompanionEditHistory('topic', 'undo')).toBeTruthy();
    await expectFact(host, answer);
  }
  expect(await applyCompanionEditHistory('topic', 'undo')).toBe(false);
  for (const answer of answers.slice(1)) {
    expect(await applyCompanionEditHistory('topic', 'redo')).toBeTruthy();
    await expectFact(host, answer);
  }
  expect(await applyCompanionEditHistory('topic', 'redo')).toBe(false);
  await host.reopen();
  await expectFact(host, null);
  await save('', 'empty-after-reopen');
  await host.reopen();
  await expectFact(host, '');
  await save('Persisted answer', 'text-after-reopen');
  await host.reopen();
  await expectFact(host, 'Persisted answer');
});

it.each(['android', 'ios'] as const)('%s branches after empty-answer undo without losing body history or recording no-op saves', async platform => {
  state.platform = platform;
  const host = await stableEditingHost(platform); hosts.push(host); state.owner = host.owner;
  await host.seed(editableNode({ kind: 'item', content: 'Question', reveal: null }), 'base');
  await save(null, 'body', 'Edited question');
  await save('', 'empty', 'Edited question');
  await save('', 'unchanged', 'Edited question');
  expect(await applyCompanionEditHistory('topic', 'undo')).toBeTruthy();
  await expectFact(host, null, 'Edited question');
  await save('Branch answer', 'branch', 'Edited question');
  expect(await applyCompanionEditHistory('topic', 'redo')).toBe(false);
  expect(await applyCompanionEditHistory('topic', 'undo')).toBeTruthy();
  await expectFact(host, null, 'Edited question');
  expect(await applyCompanionEditHistory('topic', 'undo')).toBeTruthy();
  await expectFact(host, null);
  expect(await applyCompanionEditHistory('topic', 'redo')).toBeTruthy();
  await expectFact(host, null, 'Edited question');
  expect(await applyCompanionEditHistory('topic', 'redo')).toBeTruthy();
  await expectFact(host, 'Branch answer', 'Edited question');
  await host.reopen();
  await expectFact(host, 'Branch answer', 'Edited question');
});

it.each(['android', 'ios'] as const)('%s rolls back answer existence and history together when the save transaction fails', async platform => {
  state.platform = platform;
  const host = await stableEditingHost(platform); hosts.push(host); state.owner = host.owner;
  await host.seed(editableNode({ kind: 'item', content: 'Question', reveal: null }), 'base');
  const source = await readCompanionContentSource('topic');
  await expect(host.owner.runWriter(db => db.transaction(async tx => {
    await saveCompanionContentEditWithDb(tx, { nodeId: 'topic', content: 'Question', reveal: '',
      baseVersionId: source.versionId, versionId: 'failed', updatedAt: '2026-10-29T05:00:00.000Z' });
    throw new Error('later save step failed');
  }))).rejects.toThrow('later save step failed');
  await expectFact(host, null);
  expect(await applyCompanionEditHistory('topic', 'undo')).toBe(false);
  expect(host.sqlite.prepare("SELECT version_id FROM node_sync_versions WHERE version_id = 'failed'").get()).toBeUndefined();
  await save('', 'retry');
  expect(await applyCompanionEditHistory('topic', 'undo')).toBeTruthy();
  await expectFact(host, null);
  expect(await applyCompanionEditHistory('topic', 'redo')).toBeTruthy();
  await expectFact(host, '');
});
