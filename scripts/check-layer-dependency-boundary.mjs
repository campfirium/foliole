import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCAN_DIRS = ['src/app', 'src/features', 'src/store'];
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);
const TEST_FILE_PATTERN = /(?:^|\.)(?:test|spec)\.[cm]?[jt]sx?$/;
const BANNED_IMPORT_PATTERN =
  /\b(?:import(?:\s+type)?[\s\S]*?\s+from\s+|import\s*\(|require\s*\()\s*['"](?:better-sqlite3|child_process(?:\/[^'"]+)?|electron(?:\/[^'"]+)?|fs(?:\/[^'"]+)?|node:child_process(?:\/[^'"]+)?|node:fs(?:\/[^'"]+)?|node:path(?:\/[^'"]+)?|path(?:\/[^'"]+)?)['"]/;
const BANNED_HOST_ACCESS_PATTERN = /\b(?:window|globalThis)\.(?:electron|electronAPI)\b/;
const RUNTIME_COMMAND_BOUNDARY_DIRS = ['src/store/', 'src/features/review/', 'src/features/settings/'];
const RUNTIME_COMMAND_BOUNDARY_FILES = new Set([
  'src/app/hooks/appRestartPersistence.ts',
  'src/app/hooks/useAppRuntime.ts',
  'src/app/hooks/usePreparedNodeSelectionActions.ts',
  'src/app/hooks/useReadingProgressSyncPersistence.ts',
  'src/app/hooks/useWorkspaceActiveNodeDocument.ts',
  'src/app/hooks/useWorkspaceNavigationPrefetch.ts'
]);
const IMPORT_STATEMENT_PATTERN = /\bimport(?:\s+type)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
const RUNTIME_COMMAND_IMPORT_SOURCE_PATTERN = /(?:^|\/)lib\/platform\/(?:nativeCommands|nativeContract)$/;
const RUNTIME_INVOKE_IMPORT_SOURCE_PATTERN = /(?:^|\/)shared\/platform\/(?:bridge|runtimeInvoke)$/;

function resolveRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function isSourceFile(filePath) {
  return SOURCE_EXTENSIONS.has(path.extname(filePath)) && !TEST_FILE_PATTERN.test(path.basename(filePath));
}

function collectSourceFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(entryPath));
    } else if (entry.isFile() && isSourceFile(entryPath)) {
      files.push(entryPath);
    }
  }
  return files;
}

function toLineNumber(contents, index) {
  return contents.slice(0, index).split(/\r?\n/).length;
}

function isRuntimeCommandBoundaryImport(imports, source) {
  const normalizedSource = source.replace(/\\/g, '/').replace(/^(?:\.\.\/)+/, '');
  if (RUNTIME_COMMAND_IMPORT_SOURCE_PATTERN.test(normalizedSource)) {
    return true;
  }
  return RUNTIME_INVOKE_IMPORT_SOURCE_PATTERN.test(normalizedSource) && /\bgetRuntimeInvoke\b/.test(imports);
}

function inspectFile(filePath, repoRoot) {
  const relativeFile = path.relative(repoRoot, filePath);
  const contents = fs.readFileSync(filePath, 'utf8');
  const lines = contents.split(/\r?\n/);
  const violations = [];
  const checksRuntimeCommandBoundary =
    RUNTIME_COMMAND_BOUNDARY_FILES.has(relativeFile) ||
    RUNTIME_COMMAND_BOUNDARY_DIRS.some((dir) => relativeFile.startsWith(dir));
  lines.forEach((line, index) => {
    if (BANNED_IMPORT_PATTERN.test(line)) {
      violations.push({ file: relativeFile, line: index + 1, kind: 'bottom-layer-import' });
    }
    if (BANNED_HOST_ACCESS_PATTERN.test(line)) {
      violations.push({ file: relativeFile, line: index + 1, kind: 'host-object-access' });
    }
  });
  if (checksRuntimeCommandBoundary) {
    for (const match of contents.matchAll(IMPORT_STATEMENT_PATTERN)) {
      if (isRuntimeCommandBoundaryImport(match[1] ?? '', match[2] ?? '')) {
        violations.push({ file: relativeFile, line: toLineNumber(contents, match.index ?? 0), kind: 'runtime-command-import' });
      }
    }
  }
  return violations;
}

export function inspectLayerDependencyBoundary({ repoRoot = resolveRepoRoot() } = {}) {
  const scannedFiles = SCAN_DIRS.flatMap((dir) => collectSourceFiles(path.join(repoRoot, dir)));
  const violations = scannedFiles.flatMap((filePath) => inspectFile(filePath, repoRoot));
  return {
    ok: violations.length === 0,
    scannedCount: scannedFiles.length,
    violations
  };
}

function printResult(result, { stdout = process.stdout, stderr = process.stderr } = {}) {
  if (result.ok) {
    stdout.write(`[check-layer-dependency-boundary] status: OK scanned=${result.scannedCount} violations=0\n`);
    return;
  }
  stderr.write(
    `[check-layer-dependency-boundary] status: VIOLATION scanned=${result.scannedCount} violations=${result.violations.length}\n`
  );
  for (const violation of result.violations) {
    stderr.write(`[check-layer-dependency-boundary] ${violation.file}:${violation.line} ${violation.kind}\n`);
  }
}

export function runCli({
  repoRoot = process.env.FOLIOLE_LAYER_BOUNDARY_ROOT?.trim() || resolveRepoRoot(),
  stdout = process.stdout,
  stderr = process.stderr
} = {}) {
  const result = inspectLayerDependencyBoundary({ repoRoot });
  printResult(result, { stdout, stderr });
  return {
    exitCode: result.ok ? 0 : 1,
    result
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli().exitCode;
}
