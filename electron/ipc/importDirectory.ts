import { dialog, type BrowserWindow } from 'electron';

import type { NativeDirectoryImportArgs, NativeDirectoryImportResult } from '../../lib/platform/nativeContract.js';
import { runDirectoryImportBatch } from '../import/directoryImportBatch.js';
import { resolveManagedImportTargetParentNodeId } from '../import/importFolderTargets.js';
import { loadImportManagerSettings } from '../import/importManagerSettings.js';
import { withDirectoryImportNodeMutationPatch } from '../import/importNodeMutationPatch.js';
import { logDirectoryImportCompleted, logDirectoryImportFailed } from '../import/importRunLogger.js';
import { notifyManagedInboxUpdated } from '../import/managedInboxEvents.js';
import { assertMirrorSeparatedFromImportPath, assertNoUnsafePathOverlap } from '../libraryPathSafety.js';
import { loadManagedPathCandidates } from '../managedPathSafety.js';
import {
  persistSecurityScopedBookmark,
  shouldRequestSecurityScopedBookmarks
} from '../securityScopedBookmarks.js';

import {
  assertAuthorizedImportDirectoryPath,
  authorizeSelectedImportDirectoryPath
} from './importPathAuthorization.js';
import {
  MANAGED_INBOX_SUPPORTED_KINDS,
  discoverDirectoryImportSources,
  resolveImportHighlightPolicy,
  resolveImportNodeTitleStrategy
} from './importSourcePipeline.js';
import { loadLibraryPathSettings } from './libraryPaths.js';
import {
  ensureManagedInboxRoot,
  resolveDirectoryImportConsumePolicy,
  resolveDirectoryImportSourceAdapter,
  resolveManagedInboxPaths
} from './managedInboxFolder.js';
import { resolveAppPaths } from './paths.js';

function resolveLatestImportId(result: NativeDirectoryImportResult) {
  const latestEntry = result.entries[result.entries.length - 1];
  return typeof latestEntry?.import_id === 'string' ? latestEntry.import_id : null;
}

async function resolveManagedInboxRootPath() {
  const libraryPaths = await loadLibraryPathSettings();
  const managedPaths = resolveManagedInboxPaths(resolveAppPaths().app_data_dir, libraryPaths.inbox);
  assertMirrorSeparatedFromImportPath({
    importPath: managedPaths.rootPath,
    label: 'Inbox',
    mirrorPath: libraryPaths.mirror
  });
  await ensureManagedInboxRoot(managedPaths.rootPath);
  return managedPaths.rootPath;
}

async function selectImportDirectoryPath(window?: BrowserWindow | null, args?: NativeDirectoryImportArgs) {
  const sourceAdapter = resolveDirectoryImportSourceAdapter(args?.source_adapter);
  if (sourceAdapter === 'foliole_managed_inbox_folder') {
    if (typeof args?.directory_path === 'string' && args.directory_path.trim().length > 0) {
      throw new Error('managed inbox folder path is runtime-owned');
    }
    return resolveManagedInboxRootPath();
  }

  if (typeof args?.directory_path === 'string' && args.directory_path.trim().length > 0) {
    return assertAuthorizedImportDirectoryPath(args.directory_path);
  }

  const selection = window
    ? await dialog.showOpenDialog(window, {
        properties: ['openDirectory'],
        securityScopedBookmarks: shouldRequestSecurityScopedBookmarks()
      })
    : await dialog.showOpenDialog({
        properties: ['openDirectory'],
        securityScopedBookmarks: shouldRequestSecurityScopedBookmarks()
      });

  if (selection.canceled || selection.filePaths.length === 0) {
    return null;
  }
  const selectedPath = selection.filePaths[0] ?? null;
  if (selectedPath) {
    persistSecurityScopedBookmark(selectedPath, selection.bookmarks?.[0]);
    await authorizeSelectedImportDirectoryPath(selectedPath);
  }
  return selectedPath;
}

function assertSafeDirectoryImportRoot(rootPath: string, sourceAdapter: ReturnType<typeof resolveDirectoryImportSourceAdapter>) {
  const protectedCandidates = sourceAdapter === 'foliole_managed_inbox_folder'
    ? loadManagedPathCandidates({ includeReadwise: false }).filter((candidate) => candidate.label !== 'Inbox')
    : loadManagedPathCandidates();
  assertNoUnsafePathOverlap([
    ...protectedCandidates,
    { label: sourceAdapter === 'foliole_managed_inbox_folder' ? 'Inbox' : 'Imported folder', path: rootPath }
  ]);
}

export async function runDirectoryImport(
  window?: BrowserWindow | null,
  args?: NativeDirectoryImportArgs
): Promise<NativeDirectoryImportResult | null> {
  const sourceAdapter = resolveDirectoryImportSourceAdapter(args?.source_adapter);
  try {
    const consumePolicy = resolveDirectoryImportConsumePolicy(sourceAdapter, args?.consume_policy);
    const rootPath = await selectImportDirectoryPath(window, args);
    if (!rootPath) {
      return null;
    }
    assertSafeDirectoryImportRoot(rootPath, sourceAdapter);

    const highlightPolicy = resolveImportHighlightPolicy(args);
    const titleStrategy = args?.title_strategy ? resolveImportNodeTitleStrategy(args) : loadImportManagerSettings().titleStrategy;
    const libraryPaths = await loadLibraryPathSettings();
    if (sourceAdapter === 'foliole_managed_inbox_folder') {
      assertMirrorSeparatedFromImportPath({
        importPath: rootPath,
        label: 'Inbox',
        mirrorPath: libraryPaths.mirror
      });
    }
    const sources = await discoverDirectoryImportSources(
      rootPath,
      sourceAdapter === 'foliole_managed_inbox_folder'
        ? { excludedPaths: [libraryPaths.mirror], includeLocalImages: true, supportedKinds: MANAGED_INBOX_SUPPORTED_KINDS }
        : { excludedPaths: [libraryPaths.mirror] }
    );
    const result = withDirectoryImportNodeMutationPatch(await runDirectoryImportBatch({
      consumePolicy,
      highlightPolicy,
      rootPath,
      sourceAdapter,
      sources,
      titleStrategy
    }));
    const latestImportId = resolveLatestImportId(result);
    if (latestImportId) {
      notifyManagedInboxUpdated(latestImportId, result.node_mutation_patch);
    }
    await logDirectoryImportCompleted(result);
    return result;
  } catch (error) {
    await logDirectoryImportFailed(sourceAdapter, error);
    throw error;
  }
}

export async function runManagedInboxImport(
  rootPath: string,
  options: { importRootPath?: string } = {}
) {
  try {
    const libraryPaths = await loadLibraryPathSettings();
    const importedAt = new Date().toISOString();
    const isImportRoot = options.importRootPath === rootPath;
    assertSafeDirectoryImportRoot(rootPath, 'foliole_managed_inbox_folder');
    assertMirrorSeparatedFromImportPath({
      importPath: rootPath,
      label: isImportRoot ? 'Import' : 'Inbox',
      mirrorPath: libraryPaths.mirror
    });
    const titleStrategy = loadImportManagerSettings().titleStrategy;
    const result = withDirectoryImportNodeMutationPatch(await runDirectoryImportBatch({
      consumePolicy: 'clear',
      highlightPolicy: 'reference_only',
      ...(isImportRoot
        ? {
            importRootPath: rootPath,
            resolveTargetParentNodeId: (source) => resolveManagedImportTargetParentNodeId({
              filePath: source.filePath,
              importedAt,
              importRootPath: rootPath
            })
          }
        : {}),
      rootPath,
      sourceAdapter: 'foliole_managed_inbox_folder',
      sources: await discoverDirectoryImportSources(rootPath, {
        excludedPaths: isImportRoot ? [libraryPaths.mirror, libraryPaths.inbox] : [libraryPaths.mirror],
        includeLocalImages: true,
        ...(isImportRoot ? { sourceNameMode: 'basename' } : {}),
        supportedKinds: MANAGED_INBOX_SUPPORTED_KINDS
      }),
      titleStrategy
    }));
    await logDirectoryImportCompleted(result);
    return result;
  } catch (error) {
    await logDirectoryImportFailed('foliole_managed_inbox_folder', error);
    throw error;
  }
}
