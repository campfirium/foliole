import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const DEFAULT_SCAN_ROOTS = ['src/app', 'src/companion', 'src/features', 'src/shared'];
const BANNED_DIALOG_METHODS = new Set(['alert', 'confirm', 'prompt']);

function resolveRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function shouldSkipFile(filePath) {
  return (
    !/\.(ts|tsx|js|jsx)$/.test(filePath) ||
    /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(filePath) ||
    filePath.includes(`${path.sep}__fixtures__${path.sep}`)
  );
}

function collectSourceFiles(rootPath) {
  const files = [];
  if (!fs.existsSync(rootPath)) {
    return files;
  }
  for (const entry of fs.readdirSync(rootPath, { withFileTypes: true })) {
    const entryPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(entryPath));
      continue;
    }
    if (!shouldSkipFile(entryPath)) {
      files.push(entryPath);
    }
  }
  return files;
}

function getNativeDialogCallName(node) {
  if (!ts.isCallExpression(node)) {
    return null;
  }
  const expression = node.expression;
  if (ts.isIdentifier(expression) && BANNED_DIALOG_METHODS.has(expression.text)) {
    return expression.text;
  }
  if (!ts.isPropertyAccessExpression(expression) || !BANNED_DIALOG_METHODS.has(expression.name.text)) {
    return null;
  }
  const owner = expression.expression;
  if (ts.isIdentifier(owner) && (owner.text === 'window' || owner.text === 'globalThis')) {
    return expression.name.text;
  }
  return null;
}

function inspectSourceFile(filePath) {
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const violations = [];
  function visit(node) {
    const method = getNativeDialogCallName(node);
    if (method) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      violations.push({
        file: sourceFile.fileName,
        line: position.line + 1,
        method
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return violations;
}

export function inspectNativeDialogs({
  repoRoot = resolveRepoRoot(),
  scanRoots = DEFAULT_SCAN_ROOTS
} = {}) {
  const scannedFiles = scanRoots.flatMap((scanRoot) => collectSourceFiles(path.join(repoRoot, scanRoot))).sort();
  const violations = scannedFiles.flatMap(inspectSourceFile).map((violation) => ({
    ...violation,
    file: path.relative(repoRoot, violation.file)
  }));
  return {
    ok: violations.length === 0,
    repoRoot,
    scannedFiles: scannedFiles.map((filePath) => path.relative(repoRoot, filePath)),
    violations
  };
}

function printResult(result, { stderr = process.stderr, stdout = process.stdout } = {}) {
  if (result.ok) {
    stdout.write(`[check-native-dialog-guard] status: OK scanned=${result.scannedFiles.length} violations=0\n`);
    return;
  }
  stderr.write(
    `[check-native-dialog-guard] status: FAILED scanned=${result.scannedFiles.length} violations=${result.violations.length}\n`
  );
  stderr.write('[check-native-dialog-guard] use AppConfirmationProvider request APIs instead of browser native dialogs.\n');
  for (const violation of result.violations) {
    stderr.write(`[check-native-dialog-guard] ${violation.file}:${violation.line} native ${violation.method}()\n`);
  }
}

export function runCli({
  repoRoot = process.env.FOLIOLE_NATIVE_DIALOG_GUARD_ROOT?.trim() || resolveRepoRoot(),
  stderr = process.stderr,
  stdout = process.stdout
} = {}) {
  const result = inspectNativeDialogs({ repoRoot });
  printResult(result, { stderr, stdout });
  return {
    exitCode: result.ok ? 0 : 1,
    result
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli().exitCode;
}
