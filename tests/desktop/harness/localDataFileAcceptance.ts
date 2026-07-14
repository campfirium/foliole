import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ElectronApplication, Page } from '@playwright/test';

const PDF_FIXTURE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/pdf-user-journey.pdf'
);

export interface LocalDataFileFixtures {
  editableMarkdownPath: string;
  failedMarkdownPath: string;
  fixtureRoot: string;
  importedMarkdownPath: string;
  importedPdfPath: string;
  movedMarkdownPath: string;
}

export async function createLocalDataFileFixtures(stateRoot: string): Promise<LocalDataFileFixtures> {
  const fixtureRoot = path.join(stateRoot, 'fixtures');
  const editableMarkdownPath = path.join(fixtureRoot, 'editable-external.md');
  const failedMarkdownPath = path.join(fixtureRoot, 'failed-directory.md');
  const importedMarkdownPath = path.join(fixtureRoot, 'imported-source.md');
  const importedPdfPath = path.join(fixtureRoot, 'imported-source.pdf');
  const movedMarkdownPath = path.join(fixtureRoot, 'editable-external-moved.md');
  await fs.mkdir(fixtureRoot, { recursive: true });
  await fs.mkdir(failedMarkdownPath);
  await fs.writeFile(
    editableMarkdownPath,
    '# Editable external file\nOriginal external content\n',
    'utf8'
  );
  await fs.writeFile(
    importedMarkdownPath,
    '# Imported source\nPersisted Markdown marker for macOS local data acceptance.\n',
    'utf8'
  );
  await fs.copyFile(PDF_FIXTURE_PATH, importedPdfPath);
  return {
    editableMarkdownPath,
    failedMarkdownPath,
    fixtureRoot,
    importedMarkdownPath,
    importedPdfPath,
    movedMarkdownPath
  };
}

export async function hashFile(filePath: string) {
  return createHash('sha256').update(await fs.readFile(filePath)).digest('hex');
}

export async function hashLocalDataFileSources(fixtures: LocalDataFileFixtures) {
  return {
    editable: await hashFile(fixtures.editableMarkdownPath),
    markdown: await hashFile(fixtures.importedMarkdownPath),
    pdf: await hashFile(fixtures.importedPdfPath)
  };
}

export function isPathInsideRoot(candidatePath: string, rootPath: string) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function installImportSelection(desktopApp: ElectronApplication, filePath: string) {
  await desktopApp.evaluate(({ dialog }, selectedPath) => {
    const target = globalThis as typeof globalThis & {
      __folioleLocalDataOriginalShowOpenDialog?: typeof dialog.showOpenDialog;
    };
    target.__folioleLocalDataOriginalShowOpenDialog ??= dialog.showOpenDialog;
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] });
  }, filePath);
}

async function restoreImportSelection(desktopApp: ElectronApplication) {
  await desktopApp.evaluate(({ dialog }) => {
    const target = globalThis as typeof globalThis & {
      __folioleLocalDataOriginalShowOpenDialog?: typeof dialog.showOpenDialog;
    };
    if (target.__folioleLocalDataOriginalShowOpenDialog) {
      dialog.showOpenDialog = target.__folioleLocalDataOriginalShowOpenDialog;
      delete target.__folioleLocalDataOriginalShowOpenDialog;
    }
  });
}

export async function importSelectedFile(
  desktopApp: ElectronApplication,
  desktopWindow: Page,
  filePath: string
) {
  await installImportSelection(desktopApp, filePath);
  try {
    return await desktopWindow.evaluate(async () =>
      globalThis.window?.electronAPI?.invoke('run_text_file_import', {}));
  } finally {
    await restoreImportSelection(desktopApp);
  }
}

export function loadLibraryPaths(desktopWindow: Page) {
  return desktopWindow.evaluate(async () =>
    globalThis.window?.electronAPI?.invoke('load_library_path_settings', {}));
}

export function updateLibraryHome(desktopWindow: Page, libraryHome: string) {
  return desktopWindow.evaluate(async (pathValue) =>
    globalThis.window?.electronAPI?.invoke('update_library_path_setting', {
      location: 'library_home',
      path: pathValue
    }), libraryHome);
}

export function loadWorkspaceSnapshot(desktopWindow: Page) {
  return desktopWindow.evaluate(async () =>
    globalThis.window?.electronAPI?.invoke('load_workspace_snapshot', {}));
}

export function loadReadingProgress(desktopWindow: Page) {
  return desktopWindow.evaluate(async () =>
    globalThis.window?.electronAPI?.invoke('load_reading_progress', {}));
}

export function loadNodeDocument(desktopWindow: Page, nodeId: string) {
  return desktopWindow.evaluate(async (targetNodeId) =>
    globalThis.window?.electronAPI?.invoke('load_node_document', { nodeId: targetNodeId }), nodeId);
}

export function loadNodeSourceDetails(desktopWindow: Page, nodeId: string) {
  return desktopWindow.evaluate(async (targetNodeId) =>
    globalThis.window?.electronAPI?.invoke('load_node_source_details', { node_id: targetNodeId }), nodeId);
}

export function listLocalFiles(desktopWindow: Page) {
  return desktopWindow.evaluate(async () =>
    globalThis.window?.electronAPI?.invoke('list_local_files', {}));
}

export function createSqliteBackup(desktopWindow: Page) {
  return desktopWindow.evaluate(async () =>
    globalThis.window?.electronAPI?.invoke('backup_sqlite_database', {}));
}

export function listSqliteBackups(desktopWindow: Page) {
  return desktopWindow.evaluate(async () =>
    globalThis.window?.electronAPI?.invoke('list_sqlite_backups', {}));
}

export async function openPdfNode(desktopWindow: Page, nodeId: string) {
  const activeNodeId = await desktopWindow.evaluate(() =>
    globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null);
  if (activeNodeId !== nodeId) {
    await desktopWindow.locator('[role="treeitem"][data-node-id="special-inbox"]').click();
    await desktopWindow.locator(`[role="treeitem"][data-node-id="${nodeId}"]`).click();
  }
  await desktopWindow.waitForFunction((targetNodeId) =>
    globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() === targetNodeId, nodeId);
}
