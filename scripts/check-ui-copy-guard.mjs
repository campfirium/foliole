import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const DEFAULT_SCAN_ROOTS = ['src/app', 'src/companion', 'src/features', 'src/shared/ui'];
const UI_ATTRIBUTE_NAMES = new Set([
  'aria-label',
  'alt',
  'description',
  'emptyDescription',
  'emptyTitle',
  'label',
  'placeholder',
  'title'
]);
const UI_PROPERTY_NAMES = new Set([
  'description',
  'emptyDescription',
  'emptyTitle',
  'label',
  'message',
  'placeholder',
  'subtitle',
  'title'
]);
const BANNED_UI_TERMS = /\b(?:child|children|node|nodes)\b/i;
const CJK_TEXT = /[\p{Script=Han}]/u;
const TERMINOLOGY_DOC_PATH = '.lab/specs/_product/terminology-and-copy.md';

function resolveRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function shouldSkipFile(filePath) {
  return (
    !filePath.endsWith('.tsx') ||
    /\.(test|spec)\.tsx$/.test(filePath) ||
    /testSupport\.tsx$/i.test(filePath) ||
    filePath.includes(`${path.sep}__fixtures__${path.sep}`)
  );
}

function collectTsxFiles(rootPath) {
  const files = [];
  if (!fs.existsSync(rootPath)) {
    return files;
  }

  for (const entry of fs.readdirSync(rootPath, { withFileTypes: true })) {
    const entryPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTsxFiles(entryPath));
      continue;
    }
    if (!shouldSkipFile(entryPath)) {
      files.push(entryPath);
    }
  }

  return files;
}

function isUiStringLiteral(node) {
  const parent = node.parent;
  if (!parent) {
    return false;
  }
  if (ts.isJsxAttribute(parent) && UI_ATTRIBUTE_NAMES.has(parent.name.text)) {
    return true;
  }
  if (
    ts.isPropertyAssignment(parent) &&
    ts.isIdentifier(parent.name) &&
    UI_PROPERTY_NAMES.has(parent.name.text)
  ) {
    return true;
  }
  if (ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression)) {
    const methodName = parent.expression.name.text;
    return methodName === 'alert' || methodName === 'confirm';
  }
  return false;
}

function trimUiText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function createViolation(sourceFile, node, kind, text) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return {
    file: sourceFile.fileName,
    line: position.line + 1,
    kind,
    text: trimUiText(text)
  };
}

function inspectUiText(sourceFile, node, text, violations) {
  const normalizedText = trimUiText(text);
  if (!normalizedText) {
    return;
  }
  if (BANNED_UI_TERMS.test(normalizedText)) {
    violations.push(createViolation(sourceFile, node, 'terminology', normalizedText));
  }
  if (CJK_TEXT.test(normalizedText)) {
    violations.push(createViolation(sourceFile, node, 'non-english-copy', normalizedText));
  }
}

function inspectSourceFile(filePath) {
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations = [];

  function visit(node) {
    if (ts.isJsxText(node)) {
      inspectUiText(sourceFile, node, node.getText(sourceFile), violations);
    }
    if (ts.isStringLiteral(node) && isUiStringLiteral(node)) {
      inspectUiText(sourceFile, node, node.text, violations);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

export function inspectUiCopy({
  repoRoot = resolveRepoRoot(),
  scanRoots = DEFAULT_SCAN_ROOTS
} = {}) {
  const rootPaths = scanRoots.map((scanRoot) => path.join(repoRoot, scanRoot));
  const scannedFiles = rootPaths.flatMap(collectTsxFiles).sort();
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
    stdout.write(`[check-ui-copy-guard] status: OK scanned=${result.scannedFiles.length} warnings=0\n`);
    return;
  }

  stderr.write(
    `[check-ui-copy-guard] status: WARNING scanned=${result.scannedFiles.length} warnings=${result.violations.length}\n`
  );
  stderr.write(`[check-ui-copy-guard] next step:\n`);
  stderr.write(`[check-ui-copy-guard] 1. Read ${TERMINOLOGY_DOC_PATH}.\n`);
  stderr.write(
    `[check-ui-copy-guard] 2. Decide whether each warning is user-facing copy, debug/dev text, or legacy wording.\n`
  );
  stderr.write(
    `[check-ui-copy-guard] 3. Rewrite user-facing copy with approved terms; do not mechanically replace matched words.\n`
  );
  stderr.write(`[check-ui-copy-guard] 4. Use npm run copy:guard:strict only for terminology cleanup tasks.\n`);
  for (const violation of result.violations) {
    stderr.write(
      `[check-ui-copy-guard] ${violation.file}:${violation.line} ${violation.kind} "${violation.text}"\n`
    );
  }
}

export function runCli({
  repoRoot = process.env.FOLIOLE_UI_COPY_GUARD_ROOT?.trim() || resolveRepoRoot(),
  strict = process.argv.includes('--strict'),
  stderr = process.stderr,
  stdout = process.stdout
} = {}) {
  const result = inspectUiCopy({ repoRoot });
  printResult(result, { stderr, stdout });
  return {
    exitCode: strict && !result.ok ? 1 : 0,
    result
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli().exitCode;
}
