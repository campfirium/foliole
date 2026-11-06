import { act } from '@testing-library/react';
import { expect, it } from 'vitest';

import { hasContentEditingSession } from '../../lib/core/sync/contentEditingSession.js';

import { createEditorHandoffFixture, observeReceiptWaiting, transport } from './editorHandoff.test-support.js';

export function registerEditorReadingModeExitTests() {
  it.each(['readonly', 'immersive'])('saves the buffered tail before entering %s reading mode', async mode => {
    let reading = false;
    const app = await createEditorHandoffFixture(true, true, undefined, () => ({
      isEditorReadOnly: mode === 'readonly' && reading,
      isImmersiveMode: mode === 'immersive', isImmersiveEditing: !reading
    }));
    await act(async () => { app.input('Editing'); await app.drain(); await app.remote(); });
    act(() => {
      app.input('Editing tail', false);
      reading = true;
      app.view.rerender();
    });
    expect(hasContentEditingSession(app.port, 'topic')).toBe(true);
    await act(async () => { app.view.result.current.handleEditorChange('Editing tail'); await app.drain(); });
    expect(await app.bodies()).toContain('Editing tail');
    expect(hasContentEditingSession(app.port, 'topic')).toBe(false);
    expect((await app.current()).parent_version_ids).toHaveLength(2);
    act(() => { reading = false; app.view.rerender(); app.view.result.current.onEditorFocus(); });
    await act(async () => { app.input('Resumed editing'); await app.drain(); });
    expect(hasContentEditingSession(app.port, 'topic')).toBe(true);
    expect((await app.current()).body_text).toBe('Resumed editing');
    await act(async () => { app.view.result.current.onExitEditorFocus(); await app.drain(); });
    expect(hasContentEditingSession(app.port, 'topic')).toBe(false);
  });
  registerReadingModeReentryTest();
}

function registerReadingModeReentryTest() {
  it('keeps resumed editing active when a reading-mode exit is still waiting for its save receipt', async () => {
    let reading = false;
    const app = await createEditorHandoffFixture(true, true, undefined, () => ({
      isImmersiveMode: true, isImmersiveEditing: !reading
    }));
    await act(async () => { app.input('Editing'); await app.drain(); await app.remote(); });
    let release!: () => void;
    transport.receiptGate = new Promise(resolve => { release = resolve; });
    const reached = new Promise<void>(resolve => observeReceiptWaiting(resolve));
    let saving!: Promise<boolean>;
    act(() => { app.input('Old exit tail'); saving = app.drain(); });
    await act(async () => { await reached; reading = true; app.view.rerender(); });
    act(() => { reading = false; app.view.rerender(); app.view.result.current.onEditorFocus(); });
    act(() => { app.input('Resumed before receipt'); });
    await act(async () => { release(); await saving; expect(await app.drain()).toBe(true); });
    expect(hasContentEditingSession(app.port, 'topic')).toBe(true);
    expect((await app.current()).body_text).toBe('Resumed before receipt');
    expect(app.view.result.current.editorContent).toBe('Resumed before receipt');
    expect((await app.current()).parent_version_ids).toHaveLength(1);
    await act(async () => { reading = true; app.view.rerender(); await app.drain(); });
    expect(hasContentEditingSession(app.port, 'topic')).toBe(false);
    expect((await app.current()).parent_version_ids).toHaveLength(2);
    expect(await app.bodies()).toContain('Resumed before receipt');
  });
}
