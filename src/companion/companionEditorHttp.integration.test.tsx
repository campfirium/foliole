// @vitest-environment jsdom
import '../test/companionJoinedMobile.testSupport';

import { webcrypto } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { act, renderHook } from '@testing-library/react';
import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { slowNetworkRelay } from '../../electron/sync/slowNetworkDiagnostic.testSupport';
import { waitForAttachmentWorkYield } from '../../lib/core/sync/attachmentWorkBudget';
import { createMemberSyncCadence } from '../../lib/core/sync/memberSyncCadence';
import { CodeMirrorEditorAdapter } from '../features/editor/adapters/CodeMirrorEditorAdapter';
import type { CompanionContentSaveHandler } from '../shared/platform/companion/editing/companionContentEditContract';
import { readCompanionContentSource, releaseCompanionContentBase, retainCompanionContentBase,
  saveCompanionContentEdit } from '../shared/platform/companion/editing/companionContentEditing';
import { closeCompanionDesktopSession } from '../shared/platform/companion/network/companionDesktopSession';
import { subscribeCompanionHighValueMutation } from '../shared/platform/companion/sync/mutation/companionSyncMutationRevision';
import { seedEditorHttpAttachment } from '../test/companionEditorHttp.testSupport';
import { approveJoiningMobile, createJoiningMobile, syncJoinedMobile } from '../test/companionJoinedMobile.testSupport';

import { CompanionDraftProvider } from './CompanionDraftProvider';
import { useCompanionTopicEditAutosave } from './useCompanionTopicEditAutosave';

vi.mock('@capacitor/core', async original => {
  const actual = await original<typeof import('@capacitor/core')>();
  return { ...actual, Capacitor: { ...actual.Capacitor, isNativePlatform: () => true, getPlatform: () => 'android' } };
});

let host: Awaited<ReturnType<typeof createJoiningMobile>> | undefined;
afterEach(async () => {
  await closeCompanionDesktopSession(); await host?.close(); host = undefined; vi.unstubAllGlobals();
});

const save: CompanionContentSaveHandler = Object.assign(async (nodeId: string, content: string,
  edit?: Parameters<typeof saveCompanionContentEdit>[0]) => {
  if (!edit || edit.nodeId !== nodeId || edit.content !== content) throw new Error('Expected editor input identity');
  return saveCompanionContentEdit(edit);
}, { readSource: readCompanionContentSource, retainHold: retainCompanionContentBase, releaseHold: releaseCompanionContentBase });

it('delivers complete real editor input through automatic cadence and paced HTTP to independent SQLite', async () => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('Uint8Array', Object.getPrototypeOf(Buffer.prototype).constructor);
  host = await createJoiningMobile();
  const instance = host;
  await instance.provider.send('seed', { id: 'editor-http', content: 'Original body' });
  await approveJoiningMobile(instance);
  let responseStarted = () => {};
  const relay = await slowNetworkRelay(instance.peer.origin, { mbps: 5, rttMs: 80 }, () => responseStarted());
  const peer = { ...instance, get peer() { return { ...instance.peer, origin: relay.url }; } };
  await syncJoinedMobile(peer);
  const source = await readCompanionContentSource('editor-http');
  const reader = new Database(instance.peer.database, { readonly: true });
  const events: unknown[] = [];
  const runs: Promise<unknown>[] = [];
  const cadence = createMemberSyncCadence({ run: () => {
    const run = syncJoinedMobile(peer).then(value => { events.push(value); return value; });
    runs.push(run); return run;
  }, holdPendingMutation: waitForAttachmentWorkYield });
  cadence.updateFreshness({ eligible: true, input: 'edit' });
  const unsubscribe = subscribeCompanionHighValueMutation(() => { void cadence.requestMutation('edit'); });
  const hook = renderHook(() => useCompanionTopicEditAutosave({ canEdit: true, initialContent: source.content,
    initialVersionId: source.versionId, nodeId: 'editor-http', onSaveContent: save }), { wrapper: CompanionDraftProvider });
  const element = document.createElement('div'); document.body.append(element);
  const editor = new CodeMirrorEditorAdapter(element, { initialContent: source.content,
    onChange: (content, meta) => { events.push({ change: content, ready: hook.result.current.ready }); hook.result.current.handleChange(content, meta); },
    onDocumentInput: () => { events.push('input'); hook.result.current.markBufferedInput(); } });
  editor.setNodeId('editor-http');
  const samples: { elapsedMs: number; bytes: number }[] = [];
  try {
    await vi.waitFor(() => expect(hook.result.current.ready).toBe(true));
    await measureOrdinaryInputs(editor, reader, samples);
    await Promise.all(runs);
    samples.push(await measureAttachmentInput({ instance, peer, editor, reader, cadence, runs,
      onResponse: listener => { responseStarted = listener; } }));
    expect(reader.prepare('SELECT COUNT(*) AS count FROM node_sync_version_parents WHERE version_id IN (SELECT version_id FROM node_sync_versions WHERE object_id=?)')
      .get('editor-http')).toEqual({ count: 4 });
  } finally {
    await mkdir('.tmp/artifacts/t357-single-wait', { recursive: true });
    await writeFile('.tmp/artifacts/t357-single-wait/editor-http.json', JSON.stringify({ samples, events, error: hook.result.current.error, source: instance.sqlite.prepare('SELECT content FROM nodes WHERE id=?').get('editor-http'), transport: relay.metrics }, null, 2));
    unsubscribe(); cadence.stop(); editor.destroy(); hook.unmount(); element.remove(); reader.close();
    await closeCompanionDesktopSession(); await relay.close();
  }
}, 60_000);

async function measureOrdinaryInputs(editor: CodeMirrorEditorAdapter, reader: Database.Database,
  samples: { elapsedMs: number; bytes: number }[]) {
    for (const marker of ['First 中文 😀\n', 'Second input\n', 'Third input\n']) {
      const started = performance.now();
      act(() => editor.replaceRange(0, 0, marker));
      const expected = editor.getContent();
      await act(async () => {
        await vi.waitFor(() => expect(reader.prepare('SELECT content FROM nodes WHERE id=?').get('editor-http'))
          .toEqual({ content: expected }), { timeout: 5000, interval: 10 });
      });
      samples.push({ elapsedMs: performance.now() - started, bytes: Buffer.byteLength(expected) });
    }
 }

async function measureAttachmentInput(input: {
  instance: Awaited<ReturnType<typeof createJoiningMobile>>;
  peer: Awaited<ReturnType<typeof createJoiningMobile>>;
  editor: CodeMirrorEditorAdapter;
  reader: Database.Database;
  cadence: ReturnType<typeof createMemberSyncCadence<string>>;
  runs: Promise<unknown>[];
  onResponse: (listener: () => void) => void;
}) {
  const attachment = await seedEditorHttpAttachment(input.instance);
  let started = 0;
  let expected = '';
  input.onResponse(() => {
    if (started) return;
    started = performance.now();
    act(() => input.editor.replaceRange(0, 0, 'During attachment\n'));
    expected = input.editor.getContent();
  });
  try {
    void input.cadence.requestImmediate('attachment');
    await act(async () => {
      await vi.waitFor(() => expect(started).toBeGreaterThan(0), { timeout: 5000, interval: 10 });
      await vi.waitFor(() => expect(input.reader.prepare('SELECT content FROM nodes WHERE id=?').get('editor-http'))
        .toEqual({ content: expected }), { timeout: 5000, interval: 10 });
    });
    const sample = { elapsedMs: performance.now() - started, bytes: Buffer.byteLength(expected), phase: 'attachment-in-flight' };
    await Promise.all(input.runs);
    for (let round = 0; round < 4; round++) await syncJoinedMobile(input.peer);
    expect(await readFile(path.join(attachment.target, attachment.key))).toEqual(attachment.bytes);
    return sample;
  } finally { input.onResponse(() => {}); attachment.close(); }
}
