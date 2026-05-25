import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOTS = ['src'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const IGNORED_DIRS = new Set(['node_modules', '.tmp', 'dist', 'electron-dist']);

function listSourceFiles(root: string): string[] {
  const entries = readdirSync(root);
  return entries.flatMap((entry) => {
    const absolutePath = path.join(root, entry);
    const stats = statSync(absolutePath);
    if (stats.isDirectory()) {
      return IGNORED_DIRS.has(entry) ? [] : listSourceFiles(absolutePath);
    }
    return SOURCE_EXTENSIONS.has(path.extname(entry)) && !entry.endsWith('.d.ts') ? [absolutePath] : [];
  });
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isNonNullExpression(expression)) {
    return unwrapExpression(expression.expression);
  }
  return expression;
}

function isUseShallowWrapped(expression: ts.Expression) {
  const unwrapped = unwrapExpression(expression);
  return ts.isCallExpression(unwrapped) && ts.isIdentifier(unwrapped.expression) && unwrapped.expression.text === 'useShallow';
}

function selectorReturnExpression(selector: ts.Expression): ts.Expression | null {
  const unwrappedSelector = unwrapExpression(selector);
  if (!ts.isArrowFunction(unwrappedSelector) && !ts.isFunctionExpression(unwrappedSelector)) return null;
  if (!ts.isBlock(unwrappedSelector.body)) return unwrapExpression(unwrappedSelector.body);
  const returnStatement = unwrappedSelector.body.statements.find(ts.isReturnStatement);
  return returnStatement?.expression ? unwrapExpression(returnStatement.expression) : null;
}

function returnsDerivedSnapshot(expression: ts.Expression): boolean {
  const unwrapped = unwrapExpression(expression);
  if (ts.isObjectLiteralExpression(unwrapped) || ts.isArrayLiteralExpression(unwrapped)) return true;
  if (ts.isNewExpression(unwrapped) && ts.isIdentifier(unwrapped.expression)) {
    return unwrapped.expression.text === 'Map' || unwrapped.expression.text === 'Set';
  }
  if (ts.isCallExpression(unwrapped)) {
    const callTarget = unwrapExpression(unwrapped.expression);
    if (ts.isIdentifier(callTarget)) {
      return /^select.*View$/.test(callTarget.text);
    }
    if (ts.isPropertyAccessExpression(callTarget)) {
      return callTarget.name.text === 'map' || callTarget.name.text === 'filter';
    }
  }
  return false;
}

function describePosition(sourceFile: ts.SourceFile, node: ts.Node) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return `${sourceFile.fileName}:${position.line + 1}:${position.character + 1}`;
}

function findUnstableWorkspaceStoreSelectors(sourceFile: ts.SourceFile) {
  const findings: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'useWorkspaceStore' &&
      node.arguments.length > 0
    ) {
      const selector = node.arguments[0];
      if (!selector) return;
      const selected = selectorReturnExpression(selector);
      if (selected && !isUseShallowWrapped(selector) && returnsDerivedSnapshot(selected)) {
        findings.push(describePosition(sourceFile, node));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return findings;
}

describe('workspace store selector stability', () => {
  it('keeps derived snapshots out of raw useWorkspaceStore selectors', () => {
    const files = SOURCE_ROOTS.flatMap((root) => listSourceFiles(root));
    const findings = files.flatMap((file) => {
      const sourceText = readFileSync(file, 'utf8');
      if (!sourceText.includes('useWorkspaceStore')) return [];
      const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
      const sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, kind);
      return findUnstableWorkspaceStoreSelectors(sourceFile);
    });

    expect(findings).toEqual([]);
  });
});
