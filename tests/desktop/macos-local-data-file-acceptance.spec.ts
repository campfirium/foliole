import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { expect, test, type TestInfo } from '@playwright/test';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import {
  createLocalDataFileFixtures,
  createSqliteBackup,
  hashFile,
  hashLocalDataFileSources,
  importSelectedFile,
  isPathInsideRoot,
  listLocalFiles,
  listSqliteBackups,
  loadLibraryPaths,
  loadNodeDocument,
  loadNodeSourceDetails,
  loadReadingProgress,
  loadWorkspaceSnapshot,
  openPdfNode,
  updateLibraryHome
} from './harness/localDataFileAcceptance';
import { expectWorkspaceShell } from './harness/settings';

const PDF_PAGE_INPUT_NAME = /PDF page|PDF 页码/;
const ACCEPTANCE_ROOT = path.resolve('.tmp/artifacts/desktop-acceptance');

type DesktopSession = Awaited<ReturnType<typeof launchDesktopSession>>;
type JourneyFixtures = Awaited<ReturnType<typeof createLocalDataFileFixtures>>;
type SourceHashes = Awaited<ReturnType<typeof hashLocalDataFileSources>>;
type JourneyResult = { markdownNodeId: string; pdfNodeId: string; savedEditableHash: string };

async function selectPersistedLibrary(
  env: NodeJS.ProcessEnv,
  stateRoot: string,
  selectedLibrary: string,
  evidence: Record<string, unknown>
) {
  const session = await launchDesktopSession({ env });
  try {
    await expectWorkspaceShell(session.firstWindow);
    const initialPaths = await loadLibraryPaths(session.firstWindow);
    expect(isPathInsideRoot(initialPaths!.library_home, stateRoot)).toBe(true);
    await expect(updateLibraryHome(session.firstWindow, selectedLibrary)).resolves.toMatchObject({
      library_home: selectedLibrary
    });
    const currentLibraryPath = path.join(
      session.launchOptions.env.FOLIOLE_USER_DATA_PATH!,
      'config/current-library.json'
    );
    const currentLibrary = JSON.parse(await fs.readFile(currentLibraryPath, 'utf8'));
    expect(currentLibrary.library_home).toBe(selectedLibrary);
    evidence.currentLibrary = currentLibrary;
  } finally {
    await session.close();
  }
}

async function editExternalMarkdown(
  session: DesktopSession,
  fixtures: JourneyFixtures,
  sourceHashes: SourceHashes
) {
  const editor = session.firstWindow.locator('.markdown-editor-host .cm-content').first();
  await expect(editor).toContainText('Original external content', { timeout: 10_000 });
  await editor.click();
  await session.firstWindow.keyboard.insertText('Explicitly saved ');
  expect(await hashFile(fixtures.editableMarkdownPath)).toBe(sourceHashes.editable);
  await session.firstWindow.keyboard.press('Control+S');
  await expect.poll(() => fs.readFile(fixtures.editableMarkdownPath, 'utf8')).toContain('Explicitly saved');
  const savedEditableHash = await hashFile(fixtures.editableMarkdownPath);
  expect(savedEditableHash).not.toBe(sourceHashes.editable);
  return savedEditableHash;
}

async function importJourneyFiles(session: DesktopSession, fixtures: JourneyFixtures) {
  const markdownImport = await importSelectedFile(
    session.electronApp,
    session.firstWindow,
    fixtures.importedMarkdownPath
  );
  const pdfImport = await importSelectedFile(
    session.electronApp,
    session.firstWindow,
    fixtures.importedPdfPath
  );
  const failedImport = await importSelectedFile(
    session.electronApp,
    session.firstWindow,
    fixtures.failedMarkdownPath
  );
  expect(markdownImport).toMatchObject({ result_status: 'imported', source_kind: 'markdown' });
  expect(pdfImport).toMatchObject({ result_status: 'imported', source_kind: 'pdf' });
  expect(failedImport).toMatchObject({ node_id: null, result_status: 'failed' });
  if (typeof markdownImport?.node_id !== 'string' || typeof pdfImport?.node_id !== 'string') {
    throw new Error('local data acceptance imports did not create both content nodes');
  }
  const snapshot = await loadWorkspaceSnapshot(session.firstWindow);
  expect(snapshot!.nodesById[failedImport?.node_id ?? '']).toBeUndefined();
  return { failedImport, markdownImport, pdfImport };
}

async function persistPdfReadingPage(session: DesktopSession, pdfNodeId: string) {
  await openPdfNode(session.firstWindow, pdfNodeId);
  const pageInput = session.firstWindow.getByRole('textbox', { name: PDF_PAGE_INPUT_NAME });
  await pageInput.fill('2');
  await pageInput.press('Enter');
  await expect(pageInput).toHaveValue('2');
  await expect.poll(() => session.firstWindow.evaluate((nodeId) =>
    globalThis.window?.__folioleWorkspaceDebug?.getNodeViewState?.(nodeId) ?? null, pdfNodeId)
  ).toMatchObject({ selection: { from: 2 } });
  await expect.poll(async () =>
    (await loadReadingProgress(session.firstWindow))?.nodeViewStateById[pdfNodeId]?.selectionFrom
  ).toBe(2);
}

async function backupAndMoveExternalFile(
  session: DesktopSession,
  fixtures: JourneyFixtures,
  selectedLibrary: string,
  savedEditableHash: string
) {
  const backup = await createSqliteBackup(session.firstWindow);
  const backups = await listSqliteBackups(session.firstWindow);
  expect(isPathInsideRoot(backup!.destinationPath, selectedLibrary)).toBe(true);
  expect(backups!.every((entry) => isPathInsideRoot(entry.filePath, selectedLibrary))).toBe(true);
  await fs.rename(fixtures.editableMarkdownPath, fixtures.movedMarkdownPath);
  const localFilesAfterMove = await listLocalFiles(session.firstWindow);
  expect(localFilesAfterMove!.some((entry) => entry.absolutePath === fixtures.editableMarkdownPath)).toBe(false);
  expect(await fs.stat(fixtures.editableMarkdownPath).catch(() => null)).toBeNull();
  expect(await hashFile(fixtures.movedMarkdownPath)).toBe(savedEditableHash);
  return { backup, backups, localFilesAfterMove };
}

async function populateSelectedLibrary(
  env: NodeJS.ProcessEnv,
  fixtures: JourneyFixtures,
  selectedLibrary: string,
  sourceHashes: SourceHashes,
  evidence: Record<string, unknown>
): Promise<JourneyResult> {
  const session = await launchDesktopSession({
    env,
    extraArgs: [fixtures.editableMarkdownPath],
    isolationOptions: { persistedLibraryHome: selectedLibrary }
  });
  try {
    await expectWorkspaceShell(session.firstWindow);
    expect(session.launchOptions.env).not.toHaveProperty('FOLIOLE_LIBRARY_HOME');
    expect(await loadLibraryPaths(session.firstWindow)).toMatchObject({ library_home: selectedLibrary });
    const savedEditableHash = await editExternalMarkdown(session, fixtures, sourceHashes);
    const imports = await importJourneyFiles(session, fixtures);
    await persistPdfReadingPage(session, imports.pdfImport.node_id!);
    const fileSafety = await backupAndMoveExternalFile(session, fixtures, selectedLibrary, savedEditableHash);
    evidence.beforeRelaunch = { ...fileSafety, ...imports };
    return {
      markdownNodeId: imports.markdownImport.node_id!,
      pdfNodeId: imports.pdfImport.node_id!,
      savedEditableHash
    };
  } finally {
    await session.close();
  }
}

async function writeAcceptanceArtifacts(
  session: DesktopSession,
  evidence: Record<string, unknown>,
  testInfo: TestInfo
) {
  await fs.mkdir(ACCEPTANCE_ROOT, { recursive: true });
  const screenshotPath = path.join(ACCEPTANCE_ROOT, 'macos-local-data-file-acceptance.png');
  const evidencePath = path.join(ACCEPTANCE_ROOT, 'macos-local-data-file-acceptance.json');
  await session.firstWindow.screenshot({ path: screenshotPath });
  await fs.writeFile(evidencePath, JSON.stringify(evidence, null, 2), 'utf8');
  await testInfo.attach('macos-local-data-file-acceptance', { contentType: 'application/json', path: evidencePath });
  await testInfo.attach('macos-local-data-file-screenshot', { contentType: 'image/png', path: screenshotPath });
}

async function verifyPersistedJourney(
  env: NodeJS.ProcessEnv,
  fixtures: JourneyFixtures,
  selectedLibrary: string,
  sourceHashes: SourceHashes,
  result: JourneyResult,
  evidence: Record<string, unknown>,
  testInfo: TestInfo
) {
  const session = await launchDesktopSession({ env, isolationOptions: { persistedLibraryHome: selectedLibrary } });
  try {
    await expectWorkspaceShell(session.firstWindow);
    expect(session.launchOptions.env).not.toHaveProperty('FOLIOLE_LIBRARY_HOME');
    expect(await loadLibraryPaths(session.firstWindow)).toMatchObject({ library_home: selectedLibrary });
    expect((await loadNodeDocument(session.firstWindow, result.markdownNodeId))!.content)
      .toContain('Persisted Markdown marker');
    const pdfSource = await loadNodeSourceDetails(session.firstWindow, result.pdfNodeId);
    const readingProgress = await loadReadingProgress(session.firstWindow);
    expect(readingProgress?.nodeViewStateById[result.pdfNodeId]?.selectionFrom).toBe(2);
    expect(pdfSource!.import_source).toMatchObject({ source_kind: 'pdf', source_name: 'imported-source.pdf' });
    await openPdfNode(session.firstWindow, result.pdfNodeId);
    await expect(session.firstWindow.getByRole('textbox', { name: PDF_PAGE_INPUT_NAME })).toHaveValue('2');
    const localFilesAfterRelaunch = await listLocalFiles(session.firstWindow);
    expect(localFilesAfterRelaunch!.some((entry) => entry.absolutePath === fixtures.editableMarkdownPath)).toBe(false);
    expect(await hashFile(fixtures.importedMarkdownPath)).toBe(sourceHashes.markdown);
    expect(await hashFile(fixtures.importedPdfPath)).toBe(sourceHashes.pdf);
    expect(await hashFile(fixtures.movedMarkdownPath)).toBe(result.savedEditableHash);
    evidence.afterRelaunch = { localFilesAfterRelaunch, pdfSource, readingProgress };
    await writeAcceptanceArtifacts(session, evidence, testInfo);
  } finally {
    await session.close();
  }
}

test('macOS local data and file journey stays isolated across relaunches', async ({ browserName }, testInfo) => {
  test.setTimeout(240_000);
  const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-macos-local-data-'));
  const selectedLibrary = path.join(stateRoot, 'selected-library');
  const env = { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot };
  const fixtures = await createLocalDataFileFixtures(stateRoot);
  const sourceHashes = await hashLocalDataFileSources(fixtures);
  const evidence: Record<string, unknown> = { browserName, selectedLibrary, sourceHashes, stateRoot };
  try {
    await selectPersistedLibrary(env, stateRoot, selectedLibrary, evidence);
    const result = await populateSelectedLibrary(env, fixtures, selectedLibrary, sourceHashes, evidence);
    await verifyPersistedJourney(env, fixtures, selectedLibrary, sourceHashes, result, evidence, testInfo);
  } finally {
    await fs.rm(stateRoot, { force: true, recursive: true });
  }
});
