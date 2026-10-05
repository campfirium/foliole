import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const TS_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];

export const REACHABILITY_MANIFEST = Object.freeze({
  electron: {
    kind: 'typescript',
    roots: ['electron/sync/desktopSyncCoordinator.ts', 'electron/sync/companionLanRequestHandler.ts'],
    scopes: ['electron/sync', 'electron/database', 'lib/core/sync'],
    legacy: {
      source_view: ['electron/sync/desktopSyncIdentityProbe.ts', 'electron/database/syncIdentitySourceView.ts'],
      sqlite_pack: ['electron/sync/desktopSyncIdentityPack.ts', 'electron/sync/desktopSyncIdentityPush.ts',
        'electron/database/syncIdentityPackBuilder.ts'],
      identity_page_push: ['electron/sync/desktopSyncIdentityRound.ts',
        'electron/sync/companionLanIdentityGet.ts', 'electron/sync/companionLanIdentityPackPost.ts',
        'electron/sync/companionLanIdentityPushPost.ts'],
      fixed_partition: ['electron/sync/desktopSyncIdentityFactProbe.ts',
        'lib/core/sync/syncIdentityNodeFactIndex.ts']
    },
    framed: [
      { root: 'electron/sync/desktopSyncCoordinator.ts', file: 'electron/sync/desktopFramedSyncHttp.ts' },
      { root: 'electron/sync/companionLanRequestHandler.ts', file: 'electron/sync/companionLanFramedSyncPost.ts' }
    ]
  },
  companion: {
    kind: 'typescript', roots: ['src/shared/platform/companionDesktopSyncObjects.ts'],
    scopes: ['src/shared/platform/companion', 'lib/core/sync'],
    legacy: {
      source_view: ['src/shared/platform/companion/sync/syncGroupIdentitySourceRead.ts'],
      sqlite_pack: ['src/shared/platform/companion/sync/syncGroupIdentityPackPrepare.ts',
        'src/shared/platform/companion/sync/pack-apply/companionSyncIdentityDownload.ts'],
      identity_page_push: ['src/shared/platform/companion/sync/syncGroupIdentityRound.ts',
        'src/shared/platform/companion/sync/syncGroupIdentityExchange.ts'],
      fixed_partition: ['lib/core/sync/syncIdentityNodeFactIndex.ts']
    },
    framed: [{ root: 'src/shared/platform/companionDesktopSyncObjects.ts',
      file: 'src/shared/platform/companion/sync/framed/companionFramedSyncInventoryRound.ts' }]
  },
  android: {
    kind: 'symbols', extension: '.java', scopes: ['android/app/src/main/java/com/foliole/android',
      'android/app/src/test/java/com/foliole/android', 'android/app/src/androidTest/java/com/foliole/android'],
    roots: ['android/app/src/main/java/com/foliole/android/FolioleCompanionSyncGroupServer.java',
      'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncPlugin.java'],
    legacy: {
      source_view: ['android/app/src/main/java/com/foliole/android/FolioleCompanionSyncIdentityClientView.java'],
      sqlite_pack: ['android/app/src/main/java/com/foliole/android/FolioleCompanionSyncIdentityPackBuilder.java',
        'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncPackRoutes.java'],
      identity_page_push: ['android/app/src/main/java/com/foliole/android/FolioleCompanionSyncIdentityRoutes.java',
        'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncIdentityPushRoute.java']
    },
    framed: [{ root: 'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncGroupServer.java',
      file: 'android/app/src/main/java/com/foliole/android/framed/FramedSyncCodec.java' }]
  },
  ios: {
    kind: 'symbols', extension: '.swift', scopes: ['ios/App/App', 'ios/App/FramedSyncRuntimePackage/Sources',
      'ios/App/SyncPackValidatorTests'],
    roots: ['ios/App/App/FolioleCompanionSyncGroupRequestRoutes.swift',
      'ios/App/App/FolioleCompanionSyncPlugin.swift'],
    legacy: {
      source_view: ['ios/App/App/FolioleCompanionSyncIdentityClientView.swift'],
      sqlite_pack: ['ios/App/App/FolioleCompanionSyncIdentityPackBuilder.swift',
        'ios/App/App/FolioleCompanionSyncPackTransfer.swift'],
      identity_page_push: ['ios/App/App/FolioleCompanionSyncIdentityRoutes.swift',
        'ios/App/App/FolioleCompanionSyncIdentityPushRoute.swift']
    },
    framed: [{ root: 'ios/App/App/FolioleCompanionSyncGroupRequestRoutes.swift',
      file: 'ios/App/FramedSyncRuntimePackage/Sources/FolioleFramedSyncRuntime/FolioleFramedSyncCodec.swift' }]
  }
});

export function classifyReference(file) {
  if (/\.fixture\.|\.testSupport\.|\/fixtures\//u.test(file)) return 'fixture';
  if (/\.(?:test|spec)\.|\/(?:test|tests|androidTest|SyncPackValidatorTests)\//u.test(file)) return 'test';
  return 'production';
}

function filesUnder(root, relative, extension) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const next = path.join(relative, entry.name);
    return entry.isDirectory() ? filesUnder(root, next, extension) : next.endsWith(extension) ? [next] : [];
  });
}

function resolveImport(root, importer, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = path.normalize(path.join(path.dirname(importer), specifier)).replace(/\.js$/u, '');
  const candidates = [base, ...TS_EXTENSIONS.map((ext) => `${base}${ext}`),
    ...TS_EXTENSIONS.map((ext) => path.join(base, `index${ext}`))];
  return candidates.find((candidate) => fs.existsSync(path.join(root, candidate))) ?? null;
}

function typescriptImports(root, file) {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(root, file), 'utf8'),
    ts.ScriptTarget.Latest, true);
  const imports = [];
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) imports.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return imports.map((item) => resolveImport(root, file, item)).filter(Boolean);
}

function sourceIdentifiers(text) {
  const withoutComments = text.replace(/\/\*[\s\S]*?\*\//gu, ' ').replace(/\/\/.*$/gmu, ' ');
  const withoutStrings = withoutComments.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/gu, ' ');
  return new Set(withoutStrings.match(/[A-Za-z_][A-Za-z0-9_]*/gu) ?? []);
}

function buildGraph(root, config) {
  const extension = config.kind === 'typescript' ? '.ts' : config.extension;
  const files = [...new Set([...config.roots,
    ...config.scopes.flatMap((scope) => filesUnder(root, scope, extension))])];
  const graph = new Map(files.map((file) => [file, []]));
  if (config.kind === 'typescript') {
    for (const file of files) graph.set(file, typescriptImports(root, file));
  } else {
    const symbols = new Map(files.map((file) => [path.basename(file, extension), file]));
    for (const file of files) {
      const identifiers = sourceIdentifiers(fs.readFileSync(path.join(root, file), 'utf8'));
      graph.set(file, [...identifiers].map((item) => symbols.get(item)).filter(Boolean));
    }
  }
  return graph;
}

function shortestPath(graph, roots, target) {
  const queue = roots.map((root) => [root]);
  const seen = new Set(roots);
  while (queue.length) {
    const current = queue.shift();
    const file = current.at(-1);
    if (file === target) return current;
    for (const next of graph.get(file) ?? []) if (!seen.has(next)) {
      seen.add(next); queue.push([...current, next]);
    }
  }
  return null;
}

function auditPlatform(root, name, config) {
  const graph = buildGraph(root, config);
  const framedFiles = config.framed.map((entry) => entry.file);
  const targets = [...Object.values(config.legacy).flat(), ...framedFiles];
  for (const file of config.roots) {
    if (!fs.existsSync(path.join(root, file))) throw new Error(`reachability_manifest_path_missing:${file}`);
  }
  const legacy = Object.fromEntries(Object.entries(config.legacy).map(([category, files]) => [category,
    files.map((file) => ({ file, path: shortestPath(graph, config.roots, file) })).filter((item) => item.path)]));
  const framed = config.framed.map(({ root: framedRoot, file }) => ({ file, root: framedRoot,
    path: shortestPath(graph, [framedRoot], file) }));
  const references = [];
  for (const [from, edges] of graph) for (const to of edges) if (targets.includes(to)) {
    references.push({ from, kind: classifyReference(from), to });
  }
  return { name, roots: config.roots, legacy, framed, references };
}

export function auditFramedProductionReachability(root = process.cwd(), manifest = REACHABILITY_MANIFEST) {
  const platforms = Object.entries(manifest).map(([name, config]) => auditPlatform(root, name, config));
  const legacyProductionPaths = platforms.flatMap((platform) => Object.entries(platform.legacy)
    .flatMap(([category, entries]) => entries.map((entry) => ({ platform: platform.name, category, ...entry }))));
  const missingFramedPaths = platforms.flatMap((platform) => platform.framed.filter((entry) => !entry.path)
    .map((entry) => ({ platform: platform.name, file: entry.file })));
  const cutoverReady = legacyProductionPaths.length === 0 && missingFramedPaths.length === 0;
  return { status: cutoverReady ? 'cutover_ready' : 'pending_cutover', cutoverReady,
    legacyProductionPaths, missingFramedPaths, platforms };
}

export function assertFramedProductionCutover(audit) {
  if (audit.cutoverReady) return audit;
  throw new Error(`framed_production_cutover_incomplete:legacy=${audit.legacyProductionPaths.length}:missing_framed=${audit.missingFramedPaths.length}`);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const audit = auditFramedProductionReachability();
  process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
  if (process.argv.includes('--require-cutover')) assertFramedProductionCutover(audit);
}
