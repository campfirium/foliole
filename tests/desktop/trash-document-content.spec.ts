import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const trashNodeId = 'playwright-trash-document-topic';
const activeNodeId = 'playwright-active-document-topic';
const trashFolderId = 'playwright-trash-document-folder';
const trashFolderChildId = 'playwright-trash-document-folder-child';

async function seedTrashDocumentWorkspace(desktopWindow: import('@playwright/test').Page) {
  await desktopWindow.evaluate(async ({ activeNodeId, trashNodeId }) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    await api?.seedNodes?.([
      {
        content: 'Active document body',
        id: activeNodeId,
        kind: 'topic',
        title: 'Playwright Active Document'
      },
      {
        content: 'Trash document body visible after opening',
        id: trashNodeId,
        kind: 'topic',
        title: 'Playwright Trash Document'
      }
    ]);
    await api?.deleteNode?.(trashNodeId);
    await api?.openNode?.(activeNodeId);
  }, { activeNodeId, trashNodeId });
}

test('opening a trash node shows its document content', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await seedTrashDocumentWorkspace(desktopWindow);

  await desktopWindow.getByRole('button', { name: 'Open trash view' }).click();
  await desktopWindow.getByRole('button', { name: 'Open Playwright Trash Document' }).click();

  await expect(desktopWindow.locator('.prompt-editor-host')).toContainText(
    'Trash document body visible after opening'
  );
});

async function seedDeletedFolderWorkspace(desktopWindow: import('@playwright/test').Page) {
  await desktopWindow.evaluate(async ({ activeNodeId, trashFolderChildId, trashFolderId }) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    await api?.seedNodes?.([
      {
        content: 'Active document body',
        id: activeNodeId,
        kind: 'topic',
        title: 'Playwright Active Document'
      },
      {
        content: '',
        id: trashFolderId,
        kind: 'folder',
        title: 'Playwright Trash Folder'
      },
      {
        content: 'Trash folder child body visible after opening',
        id: trashFolderChildId,
        kind: 'topic',
        parentNodeId: trashFolderId,
        title: 'Playwright Trash Folder Child'
      }
    ]);
    await api?.deleteNode?.(trashFolderId);
    await api?.openNode?.(activeNodeId);
  }, { activeNodeId, trashFolderChildId, trashFolderId });
}

test('opening a child inside a deleted folder shows its document content', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await seedDeletedFolderWorkspace(desktopWindow);

  await desktopWindow.getByRole('button', { name: 'Open trash view' }).click();
  await desktopWindow.getByRole('button', { name: 'Open Playwright Trash Folder' }).click();
  await desktopWindow.getByRole('button', { name: 'Open Playwright Trash Folder Child' }).click();

  await expect(desktopWindow.locator('.prompt-editor-host')).toContainText(
    'Trash folder child body visible after opening'
  );
});
