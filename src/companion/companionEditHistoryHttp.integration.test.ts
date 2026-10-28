import '../test/companionJoinedMobile.testSupport';
import { webcrypto } from 'node:crypto';

import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { readCompanionContentSource, saveCompanionContentEdit } from '../shared/platform/companion/editing/companionContentEditing';
import { applyCompanionEditHistory } from '../shared/platform/companion/editing/companionEditHistoryReplay';
import { loadCompanionEditHistory } from '../shared/platform/companion/editing/companionEditHistoryRepository';
import { closeCompanionDesktopSession } from '../shared/platform/companion/network/companionDesktopSession';
import { approveJoiningMobile, createJoiningMobile, syncJoinedMobile } from '../test/companionJoinedMobile.testSupport';

vi.mock('@capacitor/core', async original => {
  const actual = await original<typeof import('@capacitor/core')>();
  return { ...actual, Capacitor: { ...actual.Capacitor, isNativePlatform: () => true, getPlatform: () => 'android' } };
});

let host: Awaited<ReturnType<typeof createJoiningMobile>> | undefined;
afterEach(async () => { await closeCompanionDesktopSession(); await host?.close(); host = undefined; vi.unstubAllGlobals(); });

it('syncs same-session undo and redo to an independent peer and clears only local undo on restart', async () => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('Uint8Array', Object.getPrototypeOf(Buffer.prototype).constructor);
  host = await createJoiningMobile();
  await host.provider.send('seed', { id: 'undo-http', content: 'Original body' });
  await approveJoiningMobile(host);
  await syncJoinedMobile(host);
  const source = await readCompanionContentSource('undo-http');
  const input = { nodeId: 'undo-http', content: 'Edited on phone', baseContent: source.content,
    baseVersionId: source.versionId, versionId: crypto.randomUUID(), updatedAt: new Date().toISOString() };
  await saveCompanionContentEdit(input);
  const history = await loadCompanionEditHistory();
  await saveCompanionContentEdit(input);
  expect(await loadCompanionEditHistory()).toEqual(history);
  const peer = new Database(host.peer.database, { readonly: true });
  const read = (db: Database.Database) => db.prepare("SELECT content FROM nodes WHERE id='undo-http'").get();
  try {
    await syncJoinedMobile(host);
    expect(read(peer)).toEqual({ content: input.content });
    await applyCompanionEditHistory('undo-http', 'undo');
    await syncJoinedMobile(host);
    expect(read(host.sqlite)).toEqual({ content: source.content });
    expect(read(peer)).toEqual({ content: source.content });
    await applyCompanionEditHistory('undo-http', 'redo');
    await syncJoinedMobile(host);
    expect(read(host.sqlite)).toEqual({ content: input.content });
    expect(read(peer)).toEqual({ content: input.content });
    host.reopen();
    expect((await loadCompanionEditHistory()).sessionsByNodeId).toEqual({});
    expect(await applyCompanionEditHistory('undo-http', 'undo')).toBe(false);
    await syncJoinedMobile(host);
    expect(read(host.sqlite)).toEqual({ content: input.content });
    expect(read(peer)).toEqual({ content: input.content });
  } finally { peer.close(); }
});
