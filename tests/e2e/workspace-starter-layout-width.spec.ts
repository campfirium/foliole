import { expect, test, type Page } from '@playwright/test';

const STARTER_TIMESTAMP = '2026-04-21T00:00:00.000Z';
const STARTER_WELCOME_NODE_ID = 'starter-welcome';
const STARTER_WELCOME_CONTENT = '# Welcome to Foliole';

function createWorkspaceNode(overrides: Record<string, unknown>) {
  return {
    anchorLink: null,
    createdAt: STARTER_TIMESTAMP,
    content: '',
    hasContent: false,
    hasReveal: false,
    imageRegions: null,
    isTitleManual: true,
    kind: 'folder',
    parentNodeId: null,
    reading: null,
    reveal: null,
    review: null,
    updatedAt: STARTER_TIMESTAMP,
    ...overrides
  };
}

const STARTER_WORKSPACE_LIST_SNAPSHOT = {
  activeNodeId: STARTER_WELCOME_NODE_ID,
  nodeOrder: ['special-inbox', 'starter-root-folder', 'special-virtual-root', 'starter-virtual-example', STARTER_WELCOME_NODE_ID],
  nodesById: {
    'special-inbox': createWorkspaceNode({
      id: 'special-inbox',
      specialKind: 'inbox',
      title: 'Inbox'
    }),
    'starter-root-folder': createWorkspaceNode({
      id: 'starter-root-folder',
      title: 'Untitled Folder'
    }),
    'special-virtual-root': createWorkspaceNode({
      id: 'special-virtual-root',
      specialKind: 'virtual-root',
      title: 'Virtual'
    }),
    'starter-virtual-example': createWorkspaceNode({
      id: 'starter-virtual-example',
      parentNodeId: 'special-virtual-root',
      specialKind: 'virtual',
      title: 'Example'
    }),
    [STARTER_WELCOME_NODE_ID]: createWorkspaceNode({
      content: STARTER_WELCOME_CONTENT,
      hasContent: true,
      id: STARTER_WELCOME_NODE_ID,
      kind: 'topic',
      parentNodeId: 'special-inbox',
      title: 'Welcome to Foliole'
    })
  },
  trashedNodeIds: []
};

const STARTER_WELCOME_DOCUMENT = {
  content: STARTER_WELCOME_CONTENT,
  hideTitleHeading: false,
  kind: 'topic',
  nodeId: STARTER_WELCOME_NODE_ID,
  reveal: null
};

async function installStarterWorkspaceRuntime(page: Page) {
  await page.addInitScript(
    ({ welcomeDocument, welcomeNodeId, workspaceListSnapshot }) => {
      const readingProgress = {
        activeNodeId: welcomeNodeId,
        nodeViewStateById: {}
      };

      localStorage.clear();
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
              return payload?.nodeId === welcomeNodeId ? welcomeDocument : null;
            case 'load_reading_progress':
              return readingProgress;
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
    },
    {
      welcomeDocument: STARTER_WELCOME_DOCUMENT,
      welcomeNodeId: STARTER_WELCOME_NODE_ID,
      workspaceListSnapshot: STARTER_WORKSPACE_LIST_SNAPSHOT
    }
  );
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
