/* global console */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const LINTABLE = /\.(?:js|jsx|ts|tsx|cjs|mjs)$/u;
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

function runGit(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.split('\n') : [];
}

function collectChangedFiles() {
  if (process.env.LINT_CHANGED_FILES) return process.env.LINT_CHANGED_FILES.split('\n');
  return [
    ...runGit(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '--', '.']),
    ...runGit(['diff', '--name-only', '--diff-filter=ACMR', '--', '.']),
    ...runGit(['ls-files', '--others', '--exclude-standard', '--', '.']),
  ];
}

function parseArgs(args) {
  if (args[0] !== '--scope') return { files: args, scope: '' };
  if (!args[1]) throw new Error('--scope requires a value');
  return { files: args.slice(2), scope: args[1] };
}

async function loadScopeMatcher() {
  const modulePath = process.env.PATH_DOMAINS_SCRIPT ?? path.join(SCRIPT_DIR, 'lib/path-domains.mjs');
  return (await import(pathToFileURL(modulePath).href)).pathMatchesLintScope;
}

export async function resolveLintTargets(args) {
  const { files, scope } = parseArgs(args);
  if (scope && !['desktop', 'android', 'shared'].includes(scope)) throw new Error(`unknown scope: ${scope}`);
  const matcher = scope ? await loadScopeMatcher() : null;
  const source = files.length > 0 ? files : collectChangedFiles();
  const targets = source.filter(Boolean).filter((file) => LINTABLE.test(file) && !file.startsWith('node_modules/'));
  return { scope, targets: [...new Set(targets)].filter((file) => !matcher || matcher(scope, file)) };
}

export async function runLintChanged(args = process.argv.slice(2)) {
  const { scope, targets } = await resolveLintTargets(args);
  if (targets.length === 0) {
    const suffix = scope ? ` for scope: ${scope}` : '';
    console.log(`[lint-changed] no lintable changed files detected${suffix}`);
    return 0;
  }
  const eslint = path.resolve('node_modules/eslint/bin/eslint.js');
  const result = spawnSync(process.execPath, [eslint, '--cache', '--cache-location', '.tmp/eslint-cache/changed/', ...targets], { stdio: 'inherit' });
  return result.status ?? 1;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  runLintChanged().then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(`[lint-changed] ${error.message}`);
    process.exitCode = 1;
  });
}
