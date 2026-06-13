import fs from 'node:fs';
import path from 'node:path';

const MODULE_REFERENCE_STATEMENT_PATTERN =
  /\b(?:import(?:\s+type)?|export(?:\s+type)?)([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
const MODULE_EXTENSION_PATTERN = /\.[cm]?[jt]sx?$/;

const PATH_SUBDOMAINS = [
  ['src/shared/platform/runtime/', 'runtime-core'],
  ['src/shared/platform/desktop/', 'desktop-runtime-repository'],
  ['src/shared/platform/companion/', 'companion-runtime-plugin'],
  ['src/shared/platform/import/', 'import-runtime'],
  ['src/shared/platform/external/', 'external-runtime'],
  ['src/shared/platform/diagnostics/', 'diagnostics']
];

const EXPLICIT_FILE_SUBDOMAINS = new Map([
  ['src/shared/platform/actionHelpCards.ts', 'desktop-runtime-repository'],
  ['src/shared/platform/appVersion.ts', 'runtime-core'],
  ['src/shared/platform/appLifecycle.ts', 'companion-runtime-plugin'],
  ['src/shared/platform/companionAttachmentResourceSyncPluginTypes.ts', 'companion-sync-writer'],
  ['src/shared/platform/companionContentBlobSyncPluginTypes.ts', 'companion-sync-writer'],
  ['src/shared/platform/companionSyncActivityEvents.ts', 'companion-runtime-plugin'],
  ['src/shared/platform/companionSyncConvergence.testHelpers.ts', 'companion-sync-diagnostics'],
  ['src/shared/platform/companionSyncConvergenceFormatting.ts', 'companion-sync-diagnostics'],
  ['src/shared/platform/companionSyncConvergenceStatus.ts', 'companion-sync-diagnostics'],
  ['src/shared/platform/companionSyncInstrumentationProbe.ts', 'companion-sync-pack-apply'],
  ['src/shared/platform/companionSyncObjects.ts', 'companion-runtime-plugin'],
  ['src/shared/platform/companionSyncTimeoutOwnership.ts', 'companion-sync-transfer'],
  ['src/shared/platform/companionUuid.ts', 'companion-runtime-plugin'],
  ['src/shared/platform/companionWorkspaceSync.testSupport.ts', 'companion-runtime-plugin'],
  ['src/shared/platform/databaseMaintenanceStatusRuntimeRepository.ts', 'desktop-runtime-repository'],
  ['src/shared/platform/libraryPathSettingsCache.ts', 'desktop-runtime-repository'],
  ['src/shared/platform/localFileRuntimeRepository.ts', 'desktop-runtime-repository'],
  ['src/shared/platform/loginItemSettings.ts', 'desktop-runtime-repository'],
  ['src/shared/platform/readwiseOriginalFileWidgetEvents.ts', 'import-runtime'],
  ['src/shared/platform/releaseLinks.ts', 'runtime-core'],
  ['src/shared/platform/remoteImageSourceRecovery.ts', 'external-runtime'],
  ['src/shared/platform/reviewEditorEscape.ts', 'runtime-core'],
  ['src/shared/platform/runtimeConfig.ts', 'runtime-core'],
  ['src/shared/platform/searchEnhancementSettings.ts', 'desktop-runtime-repository'],
  ['src/shared/platform/searchIndexRebuildStatus.ts', 'desktop-runtime-repository'],
  ['src/shared/platform/updateCheck.ts', 'runtime-core'],
  ['src/shared/platform/updateCheckModel.ts', 'runtime-core'],
  ['src/shared/platform/webLookupActionResolution.ts', 'external-runtime'],
  ['src/shared/platform/webLookupEntries.ts', 'external-runtime'],
  ['src/shared/platform/webLookupEntryDefaults.ts', 'external-runtime'],
  ['src/shared/platform/webLookupTemplateResolution.ts', 'external-runtime'],
  ['src/shared/platform/workspaceRuntimeMutationResults.ts', 'runtime-core'],
  ['src/shared/platform/workspaceRuntimeTypes.ts', 'runtime-core']
]);

const FILE_SUBDOMAIN_RULES = [
  ['compatibility-facade', /(?:^bridge(?:Payloads)?|Bridge(?:Payloads)?|BridgePayloads)\.tsx?$/],
  ['runtime-core', /^(?:electronApi|runtime|runtimeInvoke|runtimeLogging|runtimeAvailability|runtimeDebugAvailability|runtimeBootTelemetry|runtimeEnvironmentPayloads|runtimeAppPaths|runtimeExternalNavigation|runtimeShellEvents|runtimeSystemFonts|appLifecycle|appSettingsState|appSettingsSync|storage|keyboard|pathService|capacitorSqliteDbPort)\.tsx?$/],
  ['companion-sync-diagnostics', /^companionSync(?:Diagnostics|Convergence)\.tsx?$/],
  ['companion-sync-transfer', /^companionDesktopSync|^companionDesktopAttachmentResources\.tsx?$/],
  ['companion-sync-pack-apply', /^companionSync(?:PackApply|PackNodes|PackTransfer)\.tsx?$/],
  ['companion-sync-writer', /^companion(?:ContentBlobSync|AttachmentResourceSync)\.tsx?$|^companionSync(?:WriterQueue|StateWriters|ReviewLogApply)\.tsx?$/],
  ['companion-sync-reader', /^companionSync(?:Cursors|WebCursors|NodeVersions|StateObjects|StateObjectIdentity|PushProtocol|EventSemantics)\.tsx?$/],
  ['companion-runtime-plugin', /^companion(?:AppData|Bootstrap|Browse|Readable|External|Handoff|Pairing|PrimaryDevice|Workspace)\w*\.tsx?$/],
  ['import-runtime', /^(?:import|keepImport|pdfImports|readwiseBooks|readwiseReaderSetup|readwiseReaderImport|readwiseImportCleanup|removedSources|nodeBacklinks|nodeSource)\w*\.tsx?$/],
  ['external-runtime', /^(?:external|linkPanel|articleMirror|readwiseTopic|remoteImageLocalization)\w*\.tsx?$/],
  ['diagnostics', /^(?:diagnosticBundle|desktopDebugProbe|performance|rendererErrorDiagnostics|workspaceSyncDebug)\w*\.tsx?$/],
  ['desktop-runtime-repository', /^(?:appRuntimeCommandRepository|attachment|commandMenu|databaseBackup|desktopCompanionPairing|devReimportSelectedTopic|folderSelection|libraryPaths|native|readingPositionTrace|reviewScheduler|settings|useDesktopCompanionPairingRequests|windowControls|workspace)\w*\.tsx?$/]
];

const ALLOWED_SUBDOMAIN_IMPORTS = {
  'compatibility-facade': '*',
  'runtime-core': ['runtime-core', 'diagnostics'],
  'desktop-runtime-repository': [
    'runtime-core',
    'desktop-runtime-repository',
    'companion-runtime-plugin',
    'import-runtime',
    'diagnostics'
  ],
  'companion-runtime-plugin': [
    'runtime-core',
    'companion-runtime-plugin',
    'external-runtime',
    'companion-sync-reader',
    'companion-sync-writer',
    'companion-sync-pack-apply',
    'companion-sync-transfer',
    'companion-sync-diagnostics'
  ],
  'companion-sync-reader': ['runtime-core', 'companion-runtime-plugin', 'companion-sync-reader', 'companion-sync-writer'],
  'companion-sync-writer': ['runtime-core', 'companion-runtime-plugin', 'companion-sync-reader', 'companion-sync-writer'],
  'companion-sync-pack-apply': [
    'runtime-core',
    'companion-runtime-plugin',
    'companion-sync-reader',
    'companion-sync-writer',
    'companion-sync-pack-apply',
    'companion-sync-transfer'
  ],
  'companion-sync-transfer': [
    'runtime-core',
    'desktop-runtime-repository',
    'companion-runtime-plugin',
    'companion-sync-reader',
    'companion-sync-writer',
    'companion-sync-transfer',
    'companion-sync-diagnostics'
  ],
  'companion-sync-diagnostics': [
    'runtime-core',
    'companion-runtime-plugin',
    'companion-sync-reader',
    'companion-sync-transfer',
    'companion-sync-diagnostics'
  ],
  'import-runtime': ['runtime-core', 'desktop-runtime-repository', 'external-runtime', 'import-runtime'],
  'external-runtime': ['runtime-core', 'desktop-runtime-repository', 'companion-runtime-plugin', 'external-runtime'],
  diagnostics: ['runtime-core', 'diagnostics']
};

export function resolvePlatformSubdomain(relativeFile) {
  const normalized = relativeFile.replace(/\\/g, '/');
  const pathRule = PATH_SUBDOMAINS.find(([prefix]) => normalized.startsWith(prefix));
  if (pathRule) return pathRule[1];
  const explicitSubdomain = EXPLICIT_FILE_SUBDOMAINS.get(normalized);
  if (explicitSubdomain) return explicitSubdomain;
  const basename = path.basename(normalized);
  return FILE_SUBDOMAIN_RULES.find(([, pattern]) => pattern.test(basename))?.[0] ?? null;
}

function resolveRelativePlatformImport(sourceFile, source, platformFiles) {
  if (!source.startsWith('.')) return null;
  const sourceDir = path.posix.dirname(sourceFile);
  const withoutExtension = path.posix.normalize(path.posix.join(sourceDir, source)).replace(MODULE_EXTENSION_PATTERN, '');
  const candidates = [`${withoutExtension}.ts`, `${withoutExtension}.tsx`, `${withoutExtension}.js`, `${withoutExtension}.jsx`];
  return candidates.find((candidate) => platformFiles.has(candidate)) ?? null;
}

function canImportSubdomain(sourceSubdomain, targetSubdomain) {
  if (sourceSubdomain === targetSubdomain) return true;
  const allowed = ALLOWED_SUBDOMAIN_IMPORTS[sourceSubdomain] ?? [];
  return allowed === '*' || allowed.includes(targetSubdomain);
}

export function inspectPlatformSubdomainBoundary({ repoRoot, platformFiles, toLineNumber }) {
  const platformFileSet = new Set(platformFiles);
  const violations = [];
  for (const relativeFile of platformFiles) {
    const sourceSubdomain = resolvePlatformSubdomain(relativeFile);
    if (!sourceSubdomain) {
      violations.push({ file: relativeFile, line: 1, kind: 'platform-subdomain-unclassified' });
      continue;
    }
    const contents = fs.readFileSync(path.join(repoRoot, relativeFile), 'utf8');
    for (const match of contents.matchAll(MODULE_REFERENCE_STATEMENT_PATTERN)) {
      const targetFile = resolveRelativePlatformImport(relativeFile, match[2] ?? '', platformFileSet);
      if (!targetFile) continue;
      const targetSubdomain = resolvePlatformSubdomain(targetFile);
      if (!targetSubdomain) continue;
      if (!canImportSubdomain(sourceSubdomain, targetSubdomain)) {
        violations.push({
          file: relativeFile,
          line: toLineNumber(contents, match.index ?? 0),
          kind: 'platform-subdomain-import'
        });
      }
    }
  }
  return violations;
}
