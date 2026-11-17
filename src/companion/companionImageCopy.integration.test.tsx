// @vitest-environment jsdom
import '../test/companionJoinedMobile.testSupport';

import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../electron/database/betterSqliteDbPort';
import { loadArticleAttachmentNeeds } from '../../lib/core/sync/articleAttachmentNeeds';
import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';
import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import { readCompanionContentSource, saveCompanionContentEdit } from '../shared/platform/companion/editing/companionContentEditing';
import { ContentDraftSession } from '../shared/platform/companion/editing/contentDraftSession';
import { closeCompanionDesktopSession } from '../shared/platform/companion/network/companionDesktopSession';
import { seedEditorHttpAttachment } from '../test/companionEditorHttp.testSupport';
import { approveJoiningMobile, createJoiningMobile, syncJoinedMobile } from '../test/companionJoinedMobile.testSupport';

import { CompanionArticleDocument } from './CompanionArticleDocument';

const clipboard = vi.hoisted(() => ({ writeClipboardText: vi.fn() }));
vi.mock('../shared/platform/companion/runtime/textClipboard', () => clipboard);
vi.mock('../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: () => null }));
vi.mock('@capacitor/core', async original => {
  const actual = await original<typeof import('@capacitor/core')>();
  return { ...actual, Capacitor: { ...actual.Capacitor, isNativePlatform: () => true, getPlatform: () => 'android' } };
});

let host: Awaited<ReturnType<typeof createJoiningMobile>> | undefined;
let attachment: Awaited<ReturnType<typeof seedEditorHttpAttachment>> | undefined;
Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
afterEach(async () => {
  cleanup();
  attachment?.close(); attachment = undefined;
  await closeCompanionDesktopSession();
  await host?.close(); host = undefined;
  vi.unstubAllGlobals();
});

it('copies with the actual image menu, pastes and saves without image registration, then syncs independent SQLite and reopens', async () => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('Uint8Array', Object.getPrototypeOf(Buffer.prototype).constructor);
  host = await createJoiningMobile();
  attachment = await seedEditorHttpAttachment(host);
  await host.provider.send('seed', { id: 'copy-target', content: 'Target body\n\n' });
  await approveJoiningMobile(host);
  await syncJoinedMobile(host);
  const source = await readCompanionContentSource('attachment-holder');
  const initial = await readCompanionContentSource('copy-target');
  const save = Object.assign(async (_nodeId: string, _content: string, edit?: Parameters<typeof saveCompanionContentEdit>[0]) => {
    if (!edit) throw new Error('missing_edit');
    return saveCompanionContentEdit(edit);
  }, { readSource: readCompanionContentSource });
  const draft = new ContentDraftSession('copy-target', initial, save, 60000);
  let targetEditor: EditorAdapter | null = null;
  const view = renderWithLocalization(<MouseGestureSettingsProvider>
    <CompanionArticleDocument nodeId="attachment-holder" content={source.content} onChange={() => {}} />
    <CompanionArticleDocument nodeId="copy-target" content={initial.content}
      onEditorReady={value => { targetEditor = value; }}
      onChange={(content, meta) => draft.change(content, meta?.newImageReferences)} />
  </MouseGestureSettingsProvider>);
  await waitFor(() => expect(view.container.querySelector('.cm-md-image-widget')).not.toBeNull());
  clipboard.writeClipboardText.mockResolvedValue(undefined);
  fireEvent.contextMenu(view.container.querySelector('.cm-md-image-widget')!);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Copy image' }));
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  const markdown = clipboard.writeClipboardText.mock.calls.at(-1)![0] as string;
  expect(markdown).toBe(`![Image](asset://${attachment.key})`);
  act(() => targetEditor!.setSelection({ from: initial.content.length, to: initial.content.length }));
  fireEvent.paste(view.container.querySelectorAll('.cm-content')[1]!, { clipboardData: {
    getData: (type: string) => type === 'text/plain' ? markdown : '', items: []
  } });
  await act(async () => { targetEditor!.flushContentChanges?.(); await draft.flush(); });
  expect((await readCompanionContentSource('attachment-holder')).content).toBe(source.content);
  expect((await readCompanionContentSource('copy-target')).content).toBe(initial.content + markdown);
  expect((await readCompanionContentSource('copy-target')).imageReferences).toEqual([]);
  await syncJoinedMobile(host);
  const peer = new Database(host.peer.database, { readonly: true });
  try {
    expect(peer.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get('copy-target')).toBe(initial.content + markdown);
    const needs = await loadArticleAttachmentNeeds(createBetterSqliteDbPort(peer), ['copy-target']);
    expect(needs.needs.map(need => need.storageKey)).toEqual([attachment.key]);
    expect(await readFile(path.join(attachment.target, attachment.key))).toEqual(attachment.bytes);
    expect(await readFile(path.resolve(host.peer.database, '../../Assets', attachment.key))).toEqual(attachment.bytes);
  } finally { peer.close(); }
  view.unmount();
  host.reopen();
  expect((await readCompanionContentSource('copy-target')).content).toBe(initial.content + markdown);
  expect((await loadArticleAttachmentNeeds(host.db, ['copy-target'])).needs.map(need => need.storageKey)).toEqual([attachment.key]);
}, 60000);
