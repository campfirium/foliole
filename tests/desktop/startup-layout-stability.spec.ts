import fs from 'node:fs';
import path from 'node:path';

import { _electron as electron, expect, test } from '@playwright/test';

import { writePrebuiltRendererHtmlForSettings } from '../../electron-dist/electron/runtimeRendererHtml.js';
import {
  createDesktopLaunchOptions,
  resolveDesktopAppRoot,
  resolveDesktopLaunchTarget
} from '../../scripts/windows/playwright-desktop-harness.mjs';
import { createDesktopIsolationContext } from '../../scripts/windows/playwright-desktop-isolation.mjs';

const FRAME_COUNT = 40;
const FRAME_INTERVAL_MS = 80;

function prepareRuntimeRendererHtml(userDataPath: string) {
  const appRoot = resolveDesktopAppRoot();
  const runtimeDir = path.join(appRoot, 'electron-dist', 'electron');
  const targetPath = path.join(userDataPath, 'runtime-renderer-index.html');
  const settings = {
    'foliole-base-color': 'light',
    'foliole-workspace-dual-list-width': '190',
    'foliole-workspace-list-width': '484',
    'foliole-workspace-right-sidebar-width': '274'
  };
  fs.mkdirSync(userDataPath, { recursive: true });
  if (!writePrebuiltRendererHtmlForSettings(runtimeDir, settings, null, userDataPath)) {
    throw new Error('failed to write packaged runtime renderer html');
  }
  return { runtimeDir, settings, targetPath };
}

async function sampleStartupLayout(page: Awaited<ReturnType<typeof electron.launch>> extends infer App
  ? App extends { firstWindow: (...args: unknown[]) => Promise<infer Page> } ? Page : never
  : never, index: number) {
  return page.evaluate((frameIndex) => {
    const readVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const readWidth = (selector: string) => {
      const element = document.querySelector(selector);
      return element ? Math.round(element.getBoundingClientRect().width) : null;
    };
    const bootSkeleton = document.getElementById('boot-skeleton');
    return {
      bodyTextSample: document.body.innerText.slice(0, 80),
      bootSkeletonDisplay: bootSkeleton ? getComputedStyle(bootSkeleton).display : null,
      frameIndex,
      readyState: document.readyState,
      rootChildCount: document.getElementById('root')?.childElementCount ?? null,
      vars: {
        startupFolder: readVar('--startup-folder-column-width'),
        startupList: readVar('--startup-list-width'),
        workspaceFolder: readVar('--workspace-folder-column-width'),
        workspaceList: readVar('--workspace-list-current-width'),
        workspaceListWidth: readVar('--workspace-list-width'),
        workspaceSidebar: readVar('--workspace-right-sidebar-current-width')
      },
      widths: {
        startupFolder: readWidth('.startup-shell__folder'),
        startupTopic: readWidth('.startup-shell__topic'),
        workspaceFolder: readWidth('.workspace-region-main-folder'),
        workspaceTopic: readWidth('.workspace-region-main-topic')
      }
    };
  }, index);
}

test('startup layout variables stay stable from static shell through React takeover', async (fixtures, testInfo) => {
  void fixtures;
  const appRoot = resolveDesktopAppRoot();
  const target = resolveDesktopLaunchTarget(appRoot);
  const isolation = createDesktopIsolationContext();
  const runtimeHtml = prepareRuntimeRendererHtml(isolation.userDataPath);
  const launchOptions = createDesktopLaunchOptions(target, 120_000, process.env, isolation);
  const electronApp = await electron.launch(launchOptions);
  const frames: Array<Awaited<ReturnType<typeof sampleStartupLayout>>> = [];
  try {
    const page = await electronApp.firstWindow({ timeout: 30_000 });
    for (let index = 0; index < FRAME_COUNT; index += 1) {
      frames.push(await sampleStartupLayout(page, index));
      await page.waitForTimeout(FRAME_INTERVAL_MS);
    }
  } finally {
    await electronApp.close().catch(() => undefined);
    isolation.cleanup();
  }

  const visibleStartupFolderWidths = frames
    .filter((frame) => frame.bootSkeletonDisplay !== 'none')
    .map((frame) => frame.widths.startupFolder)
    .filter((width): width is number => typeof width === 'number' && width > 0);
  const uniqueVisibleStartupFolderWidths = Array.from(new Set(visibleStartupFolderWidths));
  const finalWorkspaceFolderVar = [...frames]
    .reverse()
    .find((frame) => frame.rootChildCount && frame.rootChildCount > 0)?.vars.workspaceFolder;

  const sawReactTakeover = frames.some((frame) => frame.rootChildCount && frame.rootChildCount > 0);

  console.log(
    '[startup-layout-stability]',
    JSON.stringify({ finalWorkspaceFolderVar, frames, runtimeHtml, sawReactTakeover, uniqueVisibleStartupFolderWidths }, null, 2)
  );
  await testInfo.attach('startup-layout-stability', {
    body: JSON.stringify(
      { finalWorkspaceFolderVar, frames, runtimeHtml, sawReactTakeover, uniqueVisibleStartupFolderWidths },
      null,
      2
    ),
    contentType: 'application/json'
  });

  expect(sawReactTakeover, 'test must cover React takeover, not only the static skeleton').toBe(true);
  expect(uniqueVisibleStartupFolderWidths, 'visible startup folder column width should not jump').toHaveLength(1);
  expect(`${uniqueVisibleStartupFolderWidths[0]}px`, 'startup shell should use the same folder width as React').toBe(
    finalWorkspaceFolderVar
  );
});
