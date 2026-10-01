import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { promisify } from 'node:util';

import { summarizeStartup } from '../../../scripts/desktop/fixed-performance-summary.mjs';

import type { DesktopSession } from './fixtures';
import { expect } from './fixtures';

export const fixedBody = (index: number) => `Benchmark article ${index}\n${'Stable markdown **text** and [link](https://example.invalid).\n'.repeat(70)}`;

export async function seed(session: DesktopSession, size: number) {
  const databases = await session.electronApp.evaluate(async () => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    return connection.runWithDatabaseConnectionOwner(() => connection.openDatabaseConnection().sqlite.pragma('database_list'));
  }) as Array<{ name: string; file: string }>;
  const root = session.target.runtimeStateRoot;
  const input = path.join(root, 'fixture.json');
  await writeFile(input, JSON.stringify(Array.from({ length: size }, (_, index) => ({
    id: `benchmark-${index}`, title: `Sentinel${index}`, content: fixedBody(index)
  }))));
  await session.close();
  await promisify(execFile)(process.execPath, ['scripts/electron-sqlite-runner.mjs',
    'scripts/desktop/fixed-performance-fixture.cjs', root,
    databases.find((db) => db.name === 'main')!.file,
    databases.find((db) => db.name === 'search')!.file, input]);
}

export async function timed(operation: () => Promise<unknown>) {
  const started = performance.now();
  await operation();
  return performance.now() - started;
}

export async function resources(session: DesktopSession) {
  const cdp = await session.firstWindow.context().newCDPSession(session.firstWindow);
  try {
    await cdp.send('Performance.enable');
    return { capturedAt: Date.now(), dom: await cdp.send('Memory.getDOMCounters'),
      renderer: await cdp.send('Performance.getMetrics'),
      processes: await session.electronApp.evaluate(({ app }) => app.getAppMetrics()),
      database: await session.electronApp.evaluate(async () => {
        const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
        const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
        return connection.runWithDatabaseConnectionOwner(() => {
          const { sqlite } = connection.openDatabaseConnection();
          return { changedRows: sqlite.prepare('SELECT total_changes() AS count').get().count,
            pageCount: sqlite.pragma('page_count', { simple: true }),
            pageSize: sqlite.pragma('page_size', { simple: true }) };
        });
      }) };
  } finally {
    await cdp.detach();
  }
}

export async function startup(session: DesktopSession) {
  const raw = await readFile(path.join(session.target.runtimeStateRoot,
    'logs/windows/native-boot-events.ndjson'), 'utf8');
  const events = raw.trim().split('\n').map((line) => JSON.parse(line));
  const pid = session.electronApp.process().pid!;
  const processes = await session.electronApp.evaluate(({ app }) => app.getAppMetrics());
  return { pid, events, processes, timings: summarizeStartup(events, processes, pid) };
}

export async function search(session: DesktopSession, index: number) {
  const ids = await session.firstWindow.evaluate(async (value) => {
    const result = await window.electronAPI!.invoke('search_workspace', { query: `Sentinel${value}` });
    return result?.results.map((node) => node.id) ?? [];
  }, index);
  expect(ids).toContain(`benchmark-${index}`);
}

export async function navigate(session: DesktopSession, index: number) {
  await session.firstWindow.evaluate((id) => window.__folioleWorkspaceDebug!.openNode(id), `benchmark-${index}`);
  await expect.poll(() => session.firstWindow.evaluate(() =>
    window.__folioleDebug?.getEditorContent?.('prompt-editor'))).toBe(fixedBody(index));
}

export async function save(session: DesktopSession, index: number, sample: number) {
  const content = `${fixedBody(index)}\nSaved sample ${sample}`;
  const page = session.firstWindow;
  await page.locator('.prompt-editor-host .cm-content').click();
  expect(await page.evaluate(() => {
    const current = window.__folioleDebug?.getEditorContent?.('prompt-editor');
    return window.__folioleDebug?.setEditorSelection?.('prompt-editor', 0, current?.length ?? 0);
  })).toBe(true);
  await page.keyboard.insertText(content);
  await expect.poll(() => page.evaluate(() => window.__folioleDebug?.getEditorContent?.('prompt-editor'))).toBe(content);
  expect(await page.evaluate(() => window.__folioleFlushPendingEditorDraftBeforeClose?.())).toBe(true);
  await expect.poll(() => page.evaluate(async (id) =>
    (await window.electronAPI!.invoke('load_node_document', { nodeId: id }))?.content,
  `benchmark-${index}`)).toBe(content);
  return content;
}
