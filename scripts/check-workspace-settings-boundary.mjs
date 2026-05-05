import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const BANNED_PROP_PATTERNS = [
  /hotkey/i,
  /mouseGesture/i,
  /^baseColorMode$/,
  /^accentColorPreset$/,
  /Font(?:Preset|Size)?$/,
  /^custom(?:Ui|Interface|Monospace)Font$/,
  /^markdownSyntaxVisibility$/,
  /^editorDisplayMode$/
];

const BANNED_SETTINGS_IMPORT_PATTERNS = [
  /\/appearance/i,
  /\/hotkey/i,
  /mouseGesture/i
];

function resolveRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function loadSourceFile(filePath) {
  const sourceText = fs.readFileSync(filePath, 'utf8');
  return ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function matchesBannedPattern(name) {
  return BANNED_PROP_PATTERNS.some((pattern) => pattern.test(name));
}

function matchesBannedSettingsImport(importText) {
  return BANNED_SETTINGS_IMPORT_PATTERNS.some((pattern) => pattern.test(importText));
}

function collectWorkspaceLayoutViolations(sourceFile) {
  const violations = [];

  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      matchesBannedSettingsImport(statement.moduleSpecifier.text)
    ) {
      violations.push({
        kind: 'import',
        name: statement.moduleSpecifier.text,
        line: sourceFile.getLineAndCharacterOfPosition(statement.moduleSpecifier.getStart(sourceFile)).line + 1
      });
    }

    if (!ts.isInterfaceDeclaration(statement) || statement.name.text !== 'WorkspaceLayoutProps') {
      continue;
    }

    for (const member of statement.members) {
      if (!ts.isPropertySignature(member) || !member.name || !ts.isIdentifier(member.name)) {
        continue;
      }
      if (!matchesBannedPattern(member.name.text)) {
        continue;
      }
      violations.push({
        kind: 'prop',
        name: member.name.text,
        line: sourceFile.getLineAndCharacterOfPosition(member.name.getStart(sourceFile)).line + 1
      });
    }
  }

  return violations;
}

function collectWorkspaceSettingsOverlayViolations(sourceFile) {
  const violations = [];

  function visit(node) {
    if (
      ts.isJsxSelfClosingElement(node) &&
      ts.isIdentifier(node.tagName) &&
      node.tagName.text === 'SettingsPanel'
    ) {
      for (const attribute of node.attributes.properties) {
        if (!ts.isJsxAttribute(attribute) || !attribute.name) {
          continue;
        }
        const attributeName = attribute.name.text;
        if (!matchesBannedPattern(attributeName)) {
          continue;
        }
        violations.push({
          kind: 'settings-panel-prop',
          name: attributeName,
          line: sourceFile.getLineAndCharacterOfPosition(attribute.name.getStart(sourceFile)).line + 1
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

export function inspectWorkspaceSettingsBoundary({ repoRoot = resolveRepoRoot() } = {}) {
  const workspaceLayoutPath = path.join(repoRoot, 'src/app/components/WorkspaceLayout.tsx');
  const workspaceSettingsOverlayPath = path.join(repoRoot, 'src/app/components/WorkspaceSettingsOverlay.tsx');
  const layoutSource = loadSourceFile(workspaceLayoutPath);
  const overlaySource = loadSourceFile(workspaceSettingsOverlayPath);

  const violations = [
    ...collectWorkspaceLayoutViolations(layoutSource).map((violation) => ({
      ...violation,
      file: path.relative(repoRoot, workspaceLayoutPath)
    })),
    ...collectWorkspaceSettingsOverlayViolations(overlaySource).map((violation) => ({
      ...violation,
      file: path.relative(repoRoot, workspaceSettingsOverlayPath)
    }))
  ];

  return {
    ok: violations.length === 0,
    repoRoot,
    scannedFiles: [
      path.relative(repoRoot, workspaceLayoutPath),
      path.relative(repoRoot, workspaceSettingsOverlayPath)
    ],
    violations
  };
}

function printResult(result, { stderr = process.stderr, stdout = process.stdout } = {}) {
  if (result.ok) {
    stdout.write(
      `[check-workspace-settings-boundary] status: OK scanned=${result.scannedFiles.join(',')} violations=0\n`
    );
    return;
  }

  stderr.write(
    `[check-workspace-settings-boundary] status: VIOLATION scanned=${result.scannedFiles.join(',')} violations=${result.violations.length}\n`
  );
  for (const violation of result.violations) {
    stderr.write(
      `[check-workspace-settings-boundary] ${violation.file}:${violation.line} ${violation.kind}=${violation.name}\n`
    );
  }
}

export function runCli({
  repoRoot = process.env.FOLIOLE_WORKSPACE_SETTINGS_BOUNDARY_ROOT?.trim() || resolveRepoRoot(),
  stderr = process.stderr,
  stdout = process.stdout
} = {}) {
  const result = inspectWorkspaceSettingsBoundary({ repoRoot });
  printResult(result, { stderr, stdout });
  return {
    exitCode: result.ok ? 0 : 1,
    result
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli().exitCode;
}
