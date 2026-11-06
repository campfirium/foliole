import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('keeps focus and accepts continued typing through a background version refresh', async ({ desktopApp, desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await desktopWindow.getByRole('button', { name: /^(Create topic|创建主题)$/ }).click();
  const editor = desktopWindow.locator('.prompt-editor-host .cm-content');
  await expect(editor).toBeEditable();
  await editor.click();
  await desktopWindow.keyboard.insertText('Original');
  const payload = await desktopWindow.evaluate(async () => {
    const nodeId = window.__folioleWorkspaceDebug!.getActiveNodeId!()!;
    const snapshot = await window.electronAPI!.invoke('load_workspace_list_snapshot', {});
    return { ...snapshot.nodesById[nodeId]!, nodeId, content: 'Remote baseline', updatedAt: new Date().toISOString() };
  });
  await expect.poll(() => desktopWindow.evaluate(async nodeId =>
    (await window.electronAPI!.invoke('load_node_document', { nodeId }))?.content, payload.nodeId)).toBe('Original');
  await desktopWindow.evaluate(() => {
    const events: unknown[] = [];
    Object.assign(window, { refreshFocusEvents: events });
    const editor = document.querySelector('.prompt-editor-host .cm-content')!;
    editor.addEventListener('focusout', () => events.push({ type: 'focusout' }));
    new MutationObserver(records => events.push(...records.map(record => ({
      type: 'attribute', oldValue: record.oldValue, value: editor.getAttribute('contenteditable')
    })))).observe(editor, { attributes: true, attributeOldValue: true, attributeFilter: ['contenteditable'] });
  });
  // Use the normal native mutation route from outside the renderer, so its
  // workspace notification refreshes this window without moving keyboard focus.
  await desktopApp.evaluate(async (_electron, input) => {
    const path = process.getBuiltinModule('path')!;
    const require = process.getBuiltinModule('module')!.createRequire(path.join(input.cwd, 'package.json'));
    const { handleNodeMutationCommand } = require(path.join(input.cwd, 'dist/electron/ipc/storageNodeMutationCommands.js'));
    const { runDesktopDatabaseWrite } = require(path.join(input.cwd, 'dist/electron/database/desktopDatabaseWriteQueue.js'));
    await runDesktopDatabaseWrite('foreground', () => handleNodeMutationCommand('update_node_content',
      { ...input.payload, updatedAt: new Date().toISOString() }, null));
  }, { cwd: process.cwd(), payload });
  await expect.poll(() => desktopWindow.evaluate(() => window.__folioleDebug?.getEditorContent?.('prompt-editor')))
    .toBe('Remote baseline');
  await expect(editor).toBeFocused();
  await desktopWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End');
  await desktopWindow.keyboard.insertText('\nContinued');
  await expect.poll(() => desktopWindow.evaluate(async nodeId =>
    (await window.electronAPI!.invoke('load_node_document', { nodeId }))?.content, payload.nodeId))
    .toBe('Remote baseline\nContinued');
  await expect(editor).toBeFocused();
  const events = await desktopWindow.evaluate(() => Reflect.get(window, 'refreshFocusEvents')) as Array<{
    type: string; oldValue?: string; value?: string;
  }>;
  await testInfo.attach('refresh-focus-events', { body: JSON.stringify(events), contentType: 'application/json' });
  expect(events.filter(event => event.type === 'focusout' || event.oldValue === 'false' || event.value === 'false')).toEqual([]);
});

test('continues typing after repeated idle saves without clicking the editor again', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await desktopWindow.getByRole('button', { name: /^(Create topic|创建主题)$/ }).click();
  const editor = desktopWindow.locator('.prompt-editor-host .cm-content');
  await expect(editor).toBeEditable();
  await editor.click();
  await desktopWindow.evaluate(() => {
    const events: unknown[] = [];
    Object.assign(window, { idleFocusEvents: events });
    for (const type of ['focusin', 'focusout']) document.addEventListener(type, event => {
      const target = event.target as HTMLElement;
      events.push({ type, at: performance.now(), target: target.outerHTML.slice(0, 300) });
    }, true);
    const content = document.querySelector('.prompt-editor-host .cm-content')!;
    new MutationObserver(records => events.push(...records.map(record => ({
      type: 'attribute', at: performance.now(), attribute: record.attributeName,
      oldValue: record.oldValue, value: content.getAttribute(record.attributeName!)
    })))).observe(content, { attributes: true, attributeOldValue: true, attributeFilter: ['contenteditable'] });
  });
  try {
    let expected = '';
    for (const text of ['First paragraph', '\n\n```js\nconst value = 1;', '\nvalue + 2;\n```']) {
      expected += text;
      await desktopWindow.keyboard.insertText(text);
      await desktopWindow.waitForTimeout(2500);
      await expect(editor).toBeFocused();
      expect(await desktopWindow.evaluate(() => window.__folioleDebug?.getEditorContent?.('prompt-editor'))).toBe(expected);
      await expect.poll(() => desktopWindow.evaluate(async () => {
        const nodeId = window.__folioleWorkspaceDebug?.getActiveNodeId?.();
        if (!nodeId) return null;
        const document = await window.electronAPI?.invoke('load_node_document', { nodeId });
        return document?.content;
      })).toBe(expected);
    }
    const events = await desktopWindow.evaluate(() => Reflect.get(window, 'idleFocusEvents'));
    expect(events.filter((event: { type: string; oldValue?: string; value?: string }) =>
      event.type === 'attribute' && (event.oldValue === 'false' || event.value === 'false'))).toEqual([]);
  } finally {
    await testInfo.attach('idle-focus-events', {
      body: JSON.stringify(await desktopWindow.evaluate(() => Reflect.get(window, 'idleFocusEvents')), null, 2),
      contentType: 'application/json'
    });
  }
});
