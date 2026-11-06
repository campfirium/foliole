import { act } from '@testing-library/react';
import { expect, it } from 'vitest';

import { hasContentEditingSession } from '../../lib/core/sync/contentEditingSession.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { openDatabaseConnection } from './connection.js';
import type { editorFixture } from './editorCreationContinuity.integration.test.js';

export function registerCreationSessionExitTests(fixture: typeof editorFixture, confirmation: () => () => void, failSave: () => void) {
  it.each(['plain', 'code'])('finishes the %s draft after leaving before creation confirmation', async kind => {
    const app = fixture();
    const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite);
    let creating!: Promise<string | null>;
    act(() => { creating = app.actions.createRootNode(''); });
    const nodeId = app.store.getState().activeNodeId!;
    const content = kind === 'code' ? '```js\nconst value = 1;\n```\n尾部' : 'New topic tail 中😀';
    await act(async () => {
      app.view.result.current.handleEditorInput({ nodeId, contentLength: content.length });
      app.view.result.current.handleEditorChange(content);
    });
    expect(hasContentEditingSession(port, nodeId)).toBe(true);
    let exiting!: Promise<void>;
    await act(async () => {
      exiting = app.view.result.current.onEditorFocusLeave();
      await Promise.resolve();
    });
    await act(async () => { confirmation()(); await creating; await exiting; });
    expect(hasContentEditingSession(port, nodeId)).toBe(false);
    expect(openDatabaseConnection().sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get(nodeId)).toBe(content);
  });
  it.each(['refocus', 'failure'])('keeps creation exit retryable after %s', async mode => {
    const app = fixture();
    const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite);
    let creating!: Promise<string | null>;
    act(() => { creating = app.actions.createRootNode(''); });
    const nodeId = app.store.getState().activeNodeId!;
    await act(async () => {
      app.view.result.current.handleEditorInput({ nodeId, contentLength: 5 });
      app.view.result.current.handleEditorChange('First');
    });
    let exiting!: Promise<void>;
    await act(async () => { exiting = app.view.result.current.onEditorFocusLeave(); });
    if (mode === 'refocus') act(() => app.view.result.current.onEditorFocus());
    else failSave();
    await act(async () => { confirmation()(); await creating; await exiting; });
    expect(hasContentEditingSession(port, nodeId)).toBe(true);
    await act(async () => {
      app.view.result.current.handleEditorInput({ nodeId, contentLength: 15 });
      app.view.result.current.handleEditorChange('First continued');
      await app.view.result.current.onEditorFocusLeave();
    });
    expect(hasContentEditingSession(port, nodeId)).toBe(false);
    expect(openDatabaseConnection().sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get(nodeId)).toBe('First continued');
  });
}
