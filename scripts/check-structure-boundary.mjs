import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ALLOWED_SRC_DIRECTORIES = new Set(['app', 'companion', 'demo', 'features', 'shared', 'store', 'surfaces', 'test']);
const BLOCKED_FALLBACK_DIRECTORIES = new Set(['common', 'lib', 'utils']);

function resolveRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function toViolation(name) {
  const relativePath = `src/${name}`;
  const kind = BLOCKED_FALLBACK_DIRECTORIES.has(name) ? 'fallback-directory' : 'unauthorized-src-directory';
  return {
    kind,
    path: relativePath,
    message: `${relativePath} is not an allowed top-level src directory; place new surfaces under src/surfaces/<surface>`
  };
}

export function inspectStructureBoundary({ repoRoot = resolveRepoRoot() } = {}) {
  const srcRoot = path.join(repoRoot, 'src');
  const entries = fs.readdirSync(srcRoot, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const violations = directories.filter((name) => !ALLOWED_SRC_DIRECTORIES.has(name)).map(toViolation);

  return {
    ok: violations.length === 0,
    allowedDirectories: Array.from(ALLOWED_SRC_DIRECTORIES).sort().map((name) => `src/${name}`),
    scannedDirectories: directories.map((name) => `src/${name}`),
    violations
  };
}

function printResult(result, { stderr = process.stderr, stdout = process.stdout } = {}) {
  if (result.ok) {
    stdout.write(`[check-structure-boundary] status: OK scanned=${result.scannedDirectories.join(',')} violations=0\n`);
    return;
  }

  stderr.write(`[check-structure-boundary] status: VIOLATION violations=${result.violations.length}\n`);
  for (const violation of result.violations) {
    stderr.write(`[check-structure-boundary] ${violation.kind}=${violation.path} reason="${violation.message}"\n`);
  }
}

export function runCli({
  repoRoot = process.env.FOLIOLE_STRUCTURE_BOUNDARY_ROOT?.trim() || resolveRepoRoot(),
  stderr = process.stderr,
  stdout = process.stdout
} = {}) {
  const result = inspectStructureBoundary({ repoRoot });
  printResult(result, { stderr, stdout });
  return {
    exitCode: result.ok ? 0 : 1,
    result
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli().exitCode;
}
