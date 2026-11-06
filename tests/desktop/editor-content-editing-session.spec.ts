import { mkdirSync, writeFileSync } from 'node:fs';

import { facts, openEditingSession } from './editorContentEditing.test-support';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('continues saving focused input across reception and settles on actual window blur', async ({ desktopWindow: page, desktopSession: session }) => {
  const { editor, window, base } = await openEditingSession(session, page);
  await editor.click();
  await session.electronApp.evaluate(({ app }) => app.focus({ steal: true }));
  await window.evaluate(window => { window.focus(); window.webContents.focus(); });
  await expect.poll(() => window.evaluate(window => window.isFocused())).toBe(true);
  await page.evaluate(() => window.__folioleDebug?.setEditorSelection?.('prompt-editor', 0, 0));
  await page.keyboard.insertText('Local 1 ');
  await expect.poll(() => facts(session)).toMatchObject({ content: 'Local 1 Base' });
  expect(await window.evaluate(window => window.isFocused())).toBe(true);
  expect((await facts(session)).editing).toBe(true);
  await facts(session, true, base.versionId);
  await expect(editor).toHaveText('Local 1 Base');
  await expect(editor).toBeFocused();
  await expect.poll(() => facts(session)).toMatchObject({ content: 'Local 1 Base', alternatives: [] });
  await page.evaluate(() => window.__folioleDebug?.setEditorSelection?.('prompt-editor', 0, 0));
  await page.keyboard.insertText('Local 2 ');
  await expect.poll(() => facts(session)).toMatchObject({ content: 'Local 2 Local 1 Base' });
  expect((await facts(session)).parents).toHaveLength(1);
  await window.evaluate(window => new Promise<void>(resolve => {
    const blurFocusedWindow = () => {
      if (!window.isFocused()) return;
      window.removeListener('focus', blurFocusedWindow);
      window.blur();
      window.setAlwaysOnTop(false);
      resolve();
    };
    window.show();
    window.setAlwaysOnTop(true);
    window.webContents.focus();
    window.on('focus', blurFocusedWindow);
    window.focus();
    blurFocusedWindow();
  }));
  await expect.poll(() => window.evaluate(window => window.isFocused())).toBe(false);
  await expect.poll(async () => (await facts(session)).parents).toHaveLength(2);
  const final = await facts(session);
  expect(new Set([final.content, ...final.alternatives])).toEqual(new Set(['Remote branch', 'Local 2 Local 1 Base']));
  await window.evaluate(window => { window.show(); window.focus(); window.webContents.focus(); });
  await expect(editor).toHaveText(final.content);
  mkdirSync('.tmp/artifacts/T727', { recursive: true });
  await page.screenshot({ path: '.tmp/artifacts/T727/editing-session-window-exit.png' });
  await page.reload();
  await expectWorkspaceShell(page);
  expect(await facts(session)).toEqual(final);
});

for (const exitKey of ['Escape', 'Tab', 'Shift+Tab']) {
  test(`saves the final input and settles on ${exitKey} while the native window remains focused`, async ({ desktopWindow: page, desktopSession: session }) => {
    const { editor, window, base } = await openEditingSession(session, page);
    await editor.click();
    await session.electronApp.evaluate(({ app }) => app.focus({ steal: true }));
    await window.evaluate(window => { window.focus(); window.webContents.focus(); });
    await expect.poll(() => window.evaluate(window => window.isFocused())).toBe(true);
    await page.evaluate(() => window.__folioleDebug?.setEditorSelection?.('prompt-editor', 0, 0));
    await page.keyboard.insertText('Local ');
    await expect.poll(() => facts(session)).toMatchObject({ content: 'Local Base' });
    expect(await window.evaluate(window => window.isFocused())).toBe(true);
    expect((await facts(session)).editing).toBe(true);
    await facts(session, true, base.versionId);
    await expect(editor).toHaveText('Local Base');
    expect((await facts(session)).parents).toHaveLength(1);
    await page.evaluate(() => window.__folioleDebug?.setEditorSelection?.('prompt-editor', 0, 0));
    await page.keyboard.insertText('Tail ');
    await page.keyboard.press(exitKey);
    await expect(editor).not.toBeFocused();
    expect(await window.evaluate(window => window.isFocused())).toBe(true);
    await expect.poll(async () => (await facts(session)).parents).toHaveLength(2);
    const final = await facts(session);
    expect(new Set([final.content, ...final.alternatives])).toEqual(new Set(['Remote branch', 'Tail Local Base']));
    mkdirSync('.tmp/artifacts/T727', { recursive: true });
    await page.screenshot({ path: `.tmp/artifacts/T727/editing-session-${exitKey.toLowerCase().replace('+', '-')}-exit.png` });
    await page.reload();
    await expectWorkspaceShell(page);
    expect(await facts(session)).toEqual(final);
  });
}

for (const repair of [false, true]) {
  test(`settles actual pointer focus loss after the toolbar action (repair: ${repair})`, async ({ desktopWindow: page, desktopSession: session }) => {
    const { editor, window, base } = await openEditingSession(session, page, repair);
    await editor.click();
    await session.electronApp.evaluate(({ app }) => app.focus({ steal: true }));
    await window.evaluate(window => { window.focus(); window.webContents.focus(); });
    const local = repair ? '| A | B |\n\n| 1 | 2 |' : 'Pointer local';
    await page.evaluate(() => window.__folioleDebug?.setEditorSelection?.('prompt-editor', 0, 4));
    await page.keyboard.insertText(local);
    await expect.poll(() => facts(session)).toMatchObject({ content: local, editing: true });
    expect(await window.evaluate(window => window.isFocused())).toBe(true);
    await facts(session, true, base.versionId);
    expect((await facts(session)).parents).toHaveLength(1);
    await page.evaluate(position => window.__folioleDebug?.setEditorSelection?.('prompt-editor', position, position), local.length);
    await page.keyboard.insertText('\nTail');
    await page.evaluate(length => {
      window.__folioleDebug?.setEditorSelection?.('prompt-editor', 0, length);
      const order: string[] = [];
      Object.assign(window, { pointerExitOrder: order });
      for (const name of ['pointerdown', 'focusout', 'click']) document.addEventListener(name, event => {
        if (name !== 'focusout' || (event.target instanceof Element && event.target.closest('.prompt-editor-host'))) order.push(name);
      }, true);
    }, local.length);
    const action = repair ? page.getByRole('button', { name: 'Repair table', exact: true })
      : page.getByRole('button', { name: /^(Settings|设置)$/ }).first();
    await action.click();
    await expect(editor).not.toBeFocused();
    expect(await window.evaluate(window => window.isFocused())).toBe(true);
    await expect.poll(async () => (await facts(session)).parents).toHaveLength(2);
    const final = await facts(session);
    const expected = repair ? '| A | B |\n| --- | --- |\n| 1 | 2 |\nTail' : 'Pointer local\nTail';
    expect(new Set([final.content, ...final.alternatives])).toEqual(new Set(['Remote branch', expected]));
    expect(final.editing).toBe(false);
    const order = await page.evaluate(() => (window as unknown as { pointerExitOrder: string[] }).pointerExitOrder);
    expect(order.indexOf('pointerdown')).toBeLessThan(order.indexOf('focusout'));
    expect(order.indexOf('focusout')).toBeLessThan(order.indexOf('click'));
    mkdirSync('.tmp/artifacts/T727', { recursive: true });
    writeFileSync(`.tmp/artifacts/T727/pointer-order-${repair}.json`, JSON.stringify(order));
    await page.screenshot({ path: `.tmp/artifacts/T727/editing-session-pointer-${repair}.png` });
    await page.reload();
    await expectWorkspaceShell(page);
    expect(await facts(session)).toEqual(final);
  });
}

test('saves Chromium composition tail input before Escape settlement and reload', async ({ desktopWindow: page, desktopSession: session }) => {
  const { editor, base } = await openEditingSession(session, page, false, { focusNative: false });
  await editor.focus();
  await page.evaluate(() => window.__folioleDebug?.setEditorSelection?.('prompt-editor', 0, 0));
  await page.keyboard.insertText('Local ');
  await expect.poll(() => facts(session)).toMatchObject({ content: 'Local Base', editing: true });
  await facts(session, true, base.versionId);
  await page.evaluate(() => {
    const events: Array<{ type: string; trusted: boolean; data: string }> = [];
    const scriptEvents: string[] = [];
    const dispatch = EventTarget.prototype.dispatchEvent;
    EventTarget.prototype.dispatchEvent = function (event) {
      if (event.type.startsWith('composition')) scriptEvents.push(event.type);
      return dispatch.call(this, event);
    };
    Object.assign(window, { chromiumImeEvidence: events, chromiumImeScriptEvents: scriptEvents,
      restoreImeDispatch: () => { EventTarget.prototype.dispatchEvent = dispatch; } });
    for (const type of ['compositionstart', 'compositionupdate', 'compositionend']) document.addEventListener(type, event => {
      events.push({ type: event.type, trusted: event.isTrusted, data: (event as CompositionEvent).data });
    }, true);
  });
  const input = await page.context().newCDPSession(page);
  await input.send('Input.imeSetComposition', { text: '中', selectionStart: 1, selectionEnd: 1 });
  await expect(editor).toContainText('中');
  expect((await facts(session)).editing).toBe(true);
  await input.send('Input.imeSetComposition', { text: '中文', selectionStart: 2, selectionEnd: 2 });
  await input.send('Input.insertText', { text: '中文' });
  await page.keyboard.press('Escape');
  await expect(editor).not.toBeFocused();
  await expect.poll(async () => (await facts(session)).parents).toHaveLength(2);
  const events = await page.evaluate(() => (window as unknown as { chromiumImeEvidence: Array<{type: string; trusted: boolean; data: string}> }).chromiumImeEvidence);
  mkdirSync('.tmp/artifacts/T727', { recursive: true });
  writeFileSync('.tmp/artifacts/T727/chromium-ime-attempt.json', JSON.stringify({ events, final: await facts(session) }));
  expect(events.some(event => event.type === 'compositionstart' && event.trusted)).toBe(true);
  // Chromium queues compositionend through DispatchScopedEvent, which leaves isTrusted false.
  // Verify engine provenance through trusted start and absence of JavaScript event dispatch instead.
  expect(events.findLast(event => event.type === 'compositionend')?.data).toBe('中文');
  const scriptEvents = await page.evaluate(() => {
    const evidence = window as unknown as { chromiumImeScriptEvents: string[]; restoreImeDispatch(): void };
    evidence.restoreImeDispatch();
    return evidence.chromiumImeScriptEvents;
  });
  expect(scriptEvents).toEqual([]);
  const final = await facts(session);
  expect(new Set([final.content, ...final.alternatives])).toEqual(new Set(['Remote branch', 'Local 中文Base']));
  expect(final.editing).toBe(false);
  mkdirSync('.tmp/artifacts/T727', { recursive: true });
  writeFileSync('.tmp/artifacts/T727/chromium-ime-evidence.json', JSON.stringify({ events, scriptEvents, final }));
  await page.screenshot({ path: '.tmp/artifacts/T727/chromium-ime-escape.png' });
  await page.reload();
  await expectWorkspaceShell(page);
  expect(await facts(session)).toEqual(final);
});
