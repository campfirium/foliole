import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const CLASSIFICATION_ARRAY_NAMES = [
  'RUNTIME_MIRRORED_APP_SETTING_NAMES',
  'RENDERER_PREFERENCE_APP_SETTING_NAMES',
  'DESKTOP_RUNTIME_APP_SETTING_NAMES',
  'CROSS_HOST_SYNC_APP_SETTING_NAMES',
  'UI_SESSION_ONLY_APP_SETTING_NAMES'
];

function resolveRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function loadSourceFile(filePath) {
  const sourceText = fs.readFileSync(filePath, 'utf8');
  return ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function unwrapExpression(expression) {
  if (ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression)) {
    return unwrapExpression(expression.expression);
  }
  return expression;
}

function findVariableInitializer(sourceFile, name) {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name) {
        return declaration.initializer ? unwrapExpression(declaration.initializer) : null;
      }
    }
  }
  return null;
}

function collectObjectPropertyNames(sourceFile, objectName) {
  const initializer = findVariableInitializer(sourceFile, objectName);
  if (!initializer || !ts.isObjectLiteralExpression(initializer)) {
    throw new Error(`Cannot find object literal ${objectName}`);
  }
  return initializer.properties
    .map((property) => {
      if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) return null;
      return property.name.text;
    })
    .filter(Boolean);
}

function collectStringArray(sourceFile, arrayName) {
  const initializer = findVariableInitializer(sourceFile, arrayName);
  if (!initializer || !ts.isArrayLiteralExpression(initializer)) {
    throw new Error(`Cannot find string array ${arrayName}`);
  }
  return initializer.elements.map((element) => {
    if (!ts.isStringLiteral(element)) {
      throw new Error(`${arrayName} contains a non-string item`);
    }
    return element.text;
  });
}

function diff(left, right) {
  const rightSet = new Set(right);
  return left.filter((item) => !rightSet.has(item));
}

function collectDuplicates(items) {
  const seen = new Set();
  const duplicates = new Set();
  for (const item of items) {
    if (seen.has(item)) duplicates.add(item);
    seen.add(item);
  }
  return Array.from(duplicates);
}

export function inspectSettingsClassification({ repoRoot = resolveRepoRoot() } = {}) {
  const appSettingsPath = path.join(repoRoot, 'src/shared/config/appSettings.ts');
  const classificationPath = path.join(repoRoot, 'src/shared/config/appSettingsClassification.ts');
  const appSettingsSource = loadSourceFile(appSettingsPath);
  const classificationSource = loadSourceFile(classificationPath);
  const appSettingNames = collectObjectPropertyNames(appSettingsSource, 'APP_SETTINGS_STORAGE_KEYS');
  const classifiedNames = CLASSIFICATION_ARRAY_NAMES.flatMap((arrayName) =>
    collectStringArray(classificationSource, arrayName)
  );
  const unclassified = diff(appSettingNames, classifiedNames);
  const unknown = diff(classifiedNames, appSettingNames);
  const duplicates = collectDuplicates(classifiedNames);
  const uiSessionOnlyNames = collectStringArray(classificationSource, 'UI_SESSION_ONLY_APP_SETTING_NAMES');
  const violations = [
    ...unclassified.map((name) => ({ kind: 'unclassified', name })),
    ...unknown.map((name) => ({ kind: 'unknown-classification', name })),
    ...duplicates.map((name) => ({ kind: 'duplicate-classification', name })),
    ...uiSessionOnlyNames.map((name) => ({ kind: 'ui-session-only-storage-key', name }))
  ];
  return {
    ok: violations.length === 0,
    scannedFiles: [path.relative(repoRoot, appSettingsPath), path.relative(repoRoot, classificationPath)],
    violations
  };
}

function printResult(result, { stderr = process.stderr, stdout = process.stdout } = {}) {
  const scanned = result.scannedFiles.join(',');
  if (result.ok) {
    stdout.write(`[check-settings-classification] status: OK scanned=${scanned} violations=0\n`);
    return;
  }
  stderr.write(
    `[check-settings-classification] status: VIOLATION scanned=${scanned} violations=${result.violations.length}\n`
  );
  for (const violation of result.violations) {
    stderr.write(`[check-settings-classification] ${violation.kind}=${violation.name}\n`);
  }
}

export function runCli({
  repoRoot = process.env.FOLIOLE_SETTINGS_CLASSIFICATION_ROOT?.trim() || resolveRepoRoot(),
  stderr = process.stderr,
  stdout = process.stdout
} = {}) {
  const result = inspectSettingsClassification({ repoRoot });
  printResult(result, { stderr, stdout });
  return {
    exitCode: result.ok ? 0 : 1,
    result
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli().exitCode;
}
