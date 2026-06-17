/* global process */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_SCAN_ROOTS = ['package.json', 'scripts'];
const SOURCE_EXTENSIONS = new Set(['.cmd', '.cjs', '.js', '.json', '.mjs', '.ps1', '.sh', '.ts']);
const CONSOLE_PROCESS_PATTERN = /\b(?:cmd|powershell|pwsh|npm|node)(?:\.exe|\.cmd)?\b/iu;
const START_PROCESS_PATTERN = /\bStart-Process\b/iu;
const ALLOWED_START_PROCESS_WINDOW_PATTERN = /(?:-WindowStyle\s+(?:Hidden|Minimized)|-NoNewWindow)\b/iu;
const CMD_KEEP_OPEN_PATTERN = /(?:cmd(?:\.exe)?["']?\s+[^#\r\n]*\/k\b|["']\/K["']|["']\/k["'])/iu;
const WINDOWS_HIDE_PATTERN = /\bwindowsHide\s*:\s*true\b/u;
const SPAWN_CONSOLE_PATTERN = /\b(?:spawn|exec|execFile)\s*\(\s*['"](?:cmd|powershell|pwsh|npm|node)(?:\.exe|\.cmd)?['"]/isu;
const runtimeProcess = globalThis.process ?? { argv: [], env: {}, stderr: null, stdout: null };

function resolveRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function isSourceFile(filePath) {
  return SOURCE_EXTENSIONS.has(path.extname(filePath));
}

function shouldSkipFile(filePath) {
  const normalized = filePath.replaceAll(path.sep, '/');
  return (
    normalized.includes('/node_modules/') ||
    normalized.includes('/electron-dist/') ||
    normalized.includes('/dist/') ||
    normalized.endsWith('/scripts/check-windows-console-policy.mjs') ||
    /\.(test|spec)\.(?:cjs|js|mjs|ts|tsx)$/u.test(normalized)
  );
}

function collectFiles(targetPath) {
  if (!fs.existsSync(targetPath) || shouldSkipFile(targetPath)) {
    return [];
  }
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) {
    return isSourceFile(targetPath) ? [targetPath] : [];
  }
  return fs.readdirSync(targetPath, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(targetPath, entry.name);
    return entry.isDirectory() ? collectFiles(entryPath) : collectFiles(entryPath);
  });
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split(/\r?\n/u).length;
}

function findStartProcessBlocks(source) {
  const lines = source.split(/\r?\n/u);
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!START_PROCESS_PATTERN.test(lines[index])) {
      continue;
    }
    const blockLines = [lines[index]];
    for (let cursor = index + 1; cursor < Math.min(lines.length, index + 12); cursor += 1) {
      const previous = lines[cursor - 1].trimEnd();
      if (!previous.endsWith('`') && !/^\s+-/u.test(lines[cursor])) {
        break;
      }
      blockLines.push(lines[cursor]);
    }
    blocks.push({ line: index + 1, text: blockLines.join('\n') });
  }
  return blocks;
}

function inspectFile(filePath, repoRoot) {
  const source = fs.readFileSync(filePath, 'utf8');
  const relativePath = path.relative(repoRoot, filePath).replaceAll(path.sep, '/');
  const violations = [];

  for (const match of source.matchAll(new RegExp(CMD_KEEP_OPEN_PATTERN, 'giu'))) {
    violations.push({
      file: relativePath,
      line: lineNumberAt(source, match.index ?? 0),
      reason: 'cmd /K keeps a visible terminal open; use a controlled hidden runner with logs instead.'
    });
  }

  for (const block of findStartProcessBlocks(source)) {
    if (CONSOLE_PROCESS_PATTERN.test(block.text) && !ALLOWED_START_PROCESS_WINDOW_PATTERN.test(block.text)) {
      violations.push({
        file: relativePath,
        line: block.line,
        reason: 'Start-Process launches a console process without Hidden, Minimized, or NoNewWindow.'
      });
    }
  }

  for (const match of source.matchAll(new RegExp(SPAWN_CONSOLE_PATTERN, 'giu'))) {
    const tail = source.slice(match.index ?? 0, (match.index ?? 0) + 600);
    if (!WINDOWS_HIDE_PATTERN.test(tail)) {
      violations.push({
        file: relativePath,
        line: lineNumberAt(source, match.index ?? 0),
        reason: 'Node child_process launches a Windows console command without windowsHide: true.'
      });
    }
  }

  return violations;
}

export function inspectWindowsConsolePolicy({
  repoRoot = resolveRepoRoot(),
  scanRoots = DEFAULT_SCAN_ROOTS
} = {}) {
  const files = scanRoots
    .flatMap((scanRoot) => collectFiles(path.join(repoRoot, scanRoot)))
    .sort();
  const violations = files.flatMap((filePath) => inspectFile(filePath, repoRoot));
  return {
    ok: violations.length === 0,
    scannedFiles: files.map((filePath) => path.relative(repoRoot, filePath).replaceAll(path.sep, '/')),
    violations
  };
}

function printResult(result, { stderr = runtimeProcess.stderr, stdout = runtimeProcess.stdout } = {}) {
  if (result.ok) {
    stdout.write(`[check-windows-console-policy] status: OK scanned=${result.scannedFiles.length} violations=0\n`);
    return;
  }
  stderr.write(
    `[check-windows-console-policy] status: FAILED scanned=${result.scannedFiles.length} violations=${result.violations.length}\n`
  );
  for (const violation of result.violations) {
    stderr.write(`[check-windows-console-policy] ${violation.file}:${violation.line} ${violation.reason}\n`);
  }
}

export function runCli({
  repoRoot = runtimeProcess.env.FOLIOLE_WINDOWS_CONSOLE_POLICY_ROOT?.trim() || resolveRepoRoot(),
  stderr = runtimeProcess.stderr,
  stdout = runtimeProcess.stdout
} = {}) {
  const result = inspectWindowsConsolePolicy({ repoRoot });
  printResult(result, { stderr, stdout });
  return {
    exitCode: result.ok ? 0 : 1,
    result
  };
}

if (runtimeProcess.argv[1] && path.resolve(runtimeProcess.argv[1]) === fileURLToPath(import.meta.url)) {
  runtimeProcess.exitCode = runCli().exitCode;
}
