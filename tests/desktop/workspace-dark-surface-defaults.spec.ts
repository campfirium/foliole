import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const DARK_DEFAULT_SURFACES = {
  document: '#161918',
  folder: '#1a1f1e',
  rail: '#171b1a',
  sidebar: '#1a1f1e',
  topic: '#1c2221'
} as const;

const SCREENSHOT_PATH = '.tmp/artifacts/desktop-acceptance/workspace-dark-surface-defaults.png';

async function resetToDefaultDarkWorkspaceSurfaces(desktopWindow: import('@playwright/test').Page) {
  await desktopWindow.evaluate(() => {
    window.localStorage.setItem('foliole-base-color', 'dark');
    window.localStorage.removeItem('foliole-workspace-surface-palette-dark');
    window.localStorage.removeItem('foliole-workspace-surface-assignments-dark');
  });
  await desktopWindow.reload();
}

async function collectWorkspaceSurfaceMetrics(desktopWindow: import('@playwright/test').Page) {
  return desktopWindow.evaluate(() => {
    const rootStyle = getComputedStyle(document.documentElement);
    const readVar = (name: string) => rootStyle.getPropertyValue(name).trim();
    const readBg = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      return element ? getComputedStyle(element).backgroundColor : null;
    };
    return {
      backgrounds: {
        document: readBg('.workspace-region-main-document'),
        folder: readBg('.workspace-region-main-folder'),
        rail: readBg('.workspace-region-main-rail'),
        sidebar: readBg('.workspace-region-main-sidebar'),
        topic: readBg('.workspace-region-main-topic')
      },
      baseColor: document.documentElement.dataset.resolvedBaseColor ?? null,
      rootTokens: {
        appShell: readVar('--color-app-shell'),
        legacyBackground: readVar('--color-background')
      },
      dividerWeights: {
        strong: readVar('--workspace-divider-strong-surface-weight'),
        subtle: readVar('--workspace-divider-subtle-surface-weight')
      },
      surfaces: {
        document: readVar('--workspace-region-main-document-bg'),
        folder: readVar('--workspace-region-main-folder-bg'),
        rail: readVar('--workspace-region-main-rail-bg'),
        sidebar: readVar('--workspace-region-main-sidebar-bg'),
        topic: readVar('--workspace-region-main-topic-bg')
      }
    };
  });
}

test('default dark workspace surfaces use the neutral dark surface ladder', async ({ desktopWindow }, testInfo) => {
  await resetToDefaultDarkWorkspaceSurfaces(desktopWindow);
  await expectWorkspaceShell(desktopWindow);

  const metrics = await collectWorkspaceSurfaceMetrics(desktopWindow);
  await testInfo.attach('workspace-dark-surface-defaults', {
    body: JSON.stringify(metrics, null, 2),
    contentType: 'application/json'
  });
  await desktopWindow.screenshot({ path: SCREENSHOT_PATH });
  await testInfo.attach('workspace-dark-surface-defaults-screenshot', {
    path: SCREENSHOT_PATH
  });

  expect(metrics.baseColor).toBe('dark');
  expect(metrics.rootTokens).toEqual({ appShell: '17 20 19', legacyBackground: '' });
  expect(metrics.surfaces).toEqual(DARK_DEFAULT_SURFACES);
  expect(metrics.dividerWeights).toEqual({ strong: '88%', subtle: '93%' });
  expect(metrics.backgrounds).toMatchObject({
    document: 'rgb(22, 25, 24)',
    folder: 'rgb(26, 31, 30)',
    rail: 'rgb(23, 27, 26)',
    sidebar: 'rgb(26, 31, 30)',
    topic: 'rgb(28, 34, 33)'
  });
});
