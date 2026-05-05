import { expect, test, type Page } from '@playwright/test';

const STARTER_TIMESTAMP = '2026-04-21T00:00:00.000Z';

async function installStarterWorkspaceRuntime(page: Page) {
  await page.addInitScript(() => {
    localStorage.clear();

    const workspaceListSnapshot = {
      activeNodeId: 'starter-welcome',
      nodeOrder: [
        'special-inbox',
        'starter-root-folder',
        'special-virtual-root',
        'starter-virtual-example',
        'starter-welcome'
      ],
      nodesById: {
        'special-inbox': {
          anchorLink: null,
          createdAt: '2026-04-21T00:00:00.000Z',
          content: '',
          hasContent: false,
          hasReveal: false,
          id: 'special-inbox',
          imageRegions: null,
          isTitleManual: true,
          kind: 'folder',
          parentNodeId: null,
          reading: null,
          reveal: null,
          review: null,
          specialKind: 'inbox',
          title: 'Inbox',
          updatedAt: '2026-04-21T00:00:00.000Z'
        },
        'starter-root-folder': {
          anchorLink: null,
          createdAt: '2026-04-21T00:00:00.000Z',
          content: '',
          hasContent: false,
          hasReveal: false,
          id: 'starter-root-folder',
          imageRegions: null,
          isTitleManual: true,
          kind: 'folder',
          parentNodeId: null,
          reading: null,
          reveal: null,
          review: null,
          title: 'Untitled Folder',
          updatedAt: '2026-04-21T00:00:00.000Z'
        },
        'special-virtual-root': {
          anchorLink: null,
          createdAt: '2026-04-21T00:00:00.000Z',
          content: '',
          hasContent: false,
          hasReveal: false,
          id: 'special-virtual-root',
          imageRegions: null,
          isTitleManual: true,
          kind: 'folder',
          parentNodeId: null,
          reading: null,
          reveal: null,
          review: null,
          specialKind: 'virtual-root',
          title: 'Virtual',
          updatedAt: '2026-04-21T00:00:00.000Z'
        },
        'starter-virtual-example': {
          anchorLink: null,
          createdAt: '2026-04-21T00:00:00.000Z',
          content: '',
          hasContent: false,
          hasReveal: false,
          id: 'starter-virtual-example',
          imageRegions: null,
          isTitleManual: true,
          kind: 'folder',
          parentNodeId: 'special-virtual-root',
          reading: null,
          reveal: null,
          review: null,
          specialKind: 'virtual',
          title: 'Example',
          updatedAt: '2026-04-21T00:00:00.000Z'
        },
        'starter-welcome': {
          anchorLink: null,
          createdAt: '2026-04-21T00:00:00.000Z',
          content: '# Welcome to Foliole',
          hasContent: true,
          hasReveal: false,
          id: 'starter-welcome',
          imageRegions: null,
          isTitleManual: true,
          kind: 'topic',
          parentNodeId: 'special-inbox',
          reading: null,
          reveal: null,
          review: null,
          title: 'Welcome to Foliole',
          updatedAt: '2026-04-21T00:00:00.000Z'
        }
      },
      trashedNodeIds: []
    };

    const welcomeDocument = {
      content: '# Welcome to Foliole',
      hideTitleHeading: false,
      kind: 'topic',
      nodeId: 'starter-welcome',
      reveal: null
    };

    window.electronAPI = {
      invoke: async (command: string, payload?: { nodeId?: string }) => {
        switch (command) {
          case 'window_is_maximized':
            return false;
          case 'load_app_settings_state':
            return {};
          case 'save_app_settings_state':
            return null;
          case 'load_workspace_list_snapshot':
            return workspaceListSnapshot;
          case 'load_node_document':
            return payload?.nodeId === 'starter-welcome' ? welcomeDocument : null;
          case 'load_reading_progress':
            return {
              activeNodeId: 'starter-welcome',
              nodeViewStateById: {}
            };
          case 'boot_report':
            return null;
          default:
            return null;
        }
      },
      onManagedInboxUpdated: () => () => undefined,
      onNativeMenuCommand: () => () => undefined,
      onWindowResized: () => () => undefined
    };
  });
}

test('starter workspace uses 450px left region with 200px folder column', async ({ page }) => {
  await installStarterWorkspaceRuntime(page);
  await page.goto('/');

  await expect(page.locator('[aria-label="Foliole workspace"]')).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Node list panel' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Current folder contents' })).toBeVisible();

  const metrics = await page.evaluate(() => {
    const folderPanel = document.querySelector('[aria-label="Node list panel"]');
    const topicPanel = document.querySelector('[aria-label="Current folder contents"]');
    const separator = document.querySelector('[aria-label="Resize folder list"]');
    const workspace = document.querySelector('[aria-label="Foliole workspace"]');

    if (!folderPanel || !topicPanel || !separator || !workspace) {
      return null;
    }

    const folderRect = folderPanel.getBoundingClientRect();
    const topicRect = topicPanel.getBoundingClientRect();
    const separatorRect = separator.getBoundingClientRect();

    return {
      folderPanelWidth: Math.round(folderRect.width),
      leftRegionWidth: Math.round(topicRect.right - folderRect.left),
      listWidthValue: getComputedStyle(workspace).getPropertyValue('--workspace-list-current-width').trim(),
      separatorWidth: Math.round(separatorRect.width),
      topicPanelWidth: Math.round(topicRect.width)
    };
  });

  expect(metrics).not.toBeNull();
  expect(metrics?.listWidthValue).toBe('450px');
  expect(metrics?.folderPanelWidth).toBe(200);
  expect(metrics?.separatorWidth).toBe(1);
  expect(metrics?.topicPanelWidth).toBe(249);
  expect(metrics?.leftRegionWidth).toBe(450);
});
