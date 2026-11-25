import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

const COMMAND_IDS_FILE = 'src/shared/commands/ids.ts';
const SETTINGS_CATALOG_FILE = 'src/features/settings/model/settingsSearchRowCatalog.ts';
const EXCLUDED_SOURCE = /^src\/(?:companion|demo|test|shared\/ui)\/|\.(?:test|spec|testSupport|testUtils)\./u;
const MENU_ITEM_TAGS = new Set([
  'NodeContextMenuItem',
  'AppDropdownMenuItem',
  'AppDropdownMenuCheckItem',
  'AppSelectionDropdownMenuItem'
]);

export function listSourceFiles(root: string, directory: string): string[] {
  return readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = `${directory}/${entry.name}`;
    return entry.isDirectory() ? listSourceFiles(root, relative) : [relative];
  });
}

function parse(fileName: string, source: string) {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
}

function walk(node: ts.Node, visit: (child: ts.Node) => void) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

function translationKeys(node: ts.Node) {
  const keys: string[] = [];
  walk(node, (child) => {
    if (!ts.isCallExpression(child) || !ts.isIdentifier(child.expression) || child.expression.text !== 't') return;
    const [first] = child.arguments;
    if (first && ts.isStringLiteralLike(first)) keys.push(first.text);
  });
  return keys;
}

function jsxElement(node: ts.Node) {
  if (ts.isJsxElement(node)) return { opening: node.openingElement, children: [...node.children] };
  if (ts.isJsxSelfClosingElement(node)) return { opening: node, children: [] as ts.JsxChild[] };
  return null;
}

/** Wrapper definitions that only forward `children` are not menu items of their own. */
function isPassthrough(children: ts.JsxChild[]) {
  return children.some(
    (child) => ts.isJsxExpression(child) && child.expression?.getText().endsWith('children') === true
  );
}

export function scanUiSource(fileName: string, source: string): string[] {
  const ids: string[] = [];
  walk(parse(fileName, source), (node) => {
    const element = jsxElement(node);
    if (!element) return;
    const tag = element.opening.tagName.getText();
    if (MENU_ITEM_TAGS.has(tag)) {
      const keys = translationKeys(node);
      if (keys.length > 0) ids.push(...keys.map((key) => `menu:${key}`));
      else if (!isPassthrough(element.children)) ids.push(`menu:${fileName}#${tag}`);
    }
    if (tag === 'SettingsRow') {
      const title = element.opening.attributes.properties.find(
        (property) => ts.isJsxAttribute(property) && property.name.getText() === 'title'
      );
      const keys = title ? translationKeys(title) : [];
      if (keys[0]) ids.push(`setting:${keys[0]}`);
      else ids.push(`setting:${fileName}#SettingsRow`);
    }
  });
  return ids;
}

export function scanCommandIds(source: string): string[] {
  const ids: string[] = [];
  walk(parse(COMMAND_IDS_FILE, source), (node) => {
    if (!ts.isVariableDeclaration(node) || node.name.getText() !== 'APP_COMMAND_IDS') return;
    let value = node.initializer;
    while (value && ts.isAsExpression(value)) value = value.expression;
    if (!value || !ts.isObjectLiteralExpression(value)) return;
    for (const property of value.properties) {
      if (property.name) ids.push(`command:${property.name.getText()}`);
    }
  });
  return ids;
}

export function scanSettingsCatalog(source: string): string[] {
  const parsed = parse(SETTINGS_CATALOG_FILE, source);
  const constants = new Map<string, string>();
  walk(parsed, (node) => {
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isStringLiteralLike(node.initializer)) {
      constants.set(node.name.getText(), node.initializer.text);
    }
  });
  const ids: string[] = [];
  walk(parsed, (node) => {
    if (!ts.isCallExpression(node) || node.expression.getText() !== 'row') return;
    const id = node.arguments[1];
    if (!id) return;
    // An imported row id constant keeps its constant name as the identifier.
    const value = ts.isStringLiteralLike(id) ? id.text : (constants.get(id.getText()) ?? id.getText());
    ids.push(`setting:${value}`);
  });
  return ids;
}

export function scanDesktopEntries(root: string): string[] {
  const read = (file: string) => readFileSync(path.join(root, file), 'utf8');
  const uiIds = listSourceFiles(root, 'src')
    .filter((file) => file.endsWith('.tsx') && !EXCLUDED_SOURCE.test(file))
    .flatMap((file) => scanUiSource(file, read(file)));
  return [...new Set([
    ...scanCommandIds(read(COMMAND_IDS_FILE)),
    ...uiIds,
    ...scanSettingsCatalog(read(SETTINGS_CATALOG_FILE))
  ])].sort();
}

/** Menu primitives must stay behind `src/shared/ui`, otherwise new items would bypass the scan. */
export function findDirectMenuPrimitiveImports(root: string): string[] {
  return listSourceFiles(root, 'src').filter(
    (file) => /\.tsx?$/u.test(file)
      && !file.startsWith('src/shared/ui/')
      && !/\.test\./u.test(file)
      && /from '@radix-ui\/react-(?:dropdown-menu|context-menu|menubar)'/u.test(readFileSync(path.join(root, file), 'utf8'))
  );
}
