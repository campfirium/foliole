// @vitest-environment node
/* global process */

import fs from 'node:fs';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import {
  closeMacosA5Run, createMacosA5ExecutionContext, openMacosA5Run,
  withMacosA5BuildRoot
} from './macos-a5-execution-context.mjs';

const roots = [];

function temporaryRepo() {
  const parent = path.join(process.cwd(), '.tmp/artifacts');
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'macos-a5-context-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { force: true, recursive: true });
});

it('separates source, build, evidence, backup, controller, and library ownership', () => {
  const repoRoot = temporaryRepo();
  fs.mkdirSync(path.join(repoRoot, '.tmp'));
  const context = createMacosA5ExecutionContext({
    action: 'deploy', repoRoot, runId: '11111111-1111-1111-1111-111111111111'
  });
  const canonicalRepoRoot = fs.realpathSync(repoRoot);

  expect(context.sourceRepoRoot).toBe(canonicalRepoRoot);
  expect(context.buildRoot).toBe(canonicalRepoRoot);
  expect(context.artifactsRoot).toBe(path.join(
    fs.realpathSync(path.join(repoRoot, '.tmp')), 'artifacts'
  ));
  expect(context.deviceBackupRoot).toBe(
    path.join(canonicalRepoRoot, '.lab/internal/android-device-backups')
  );
  expect(context.controllerStateRoot).toBe(
    path.join(canonicalRepoRoot, '.lab/internal/macos-a5-controller')
  );
  expect(context.desktopDevLibrary).toBe(
    path.join(canonicalRepoRoot, '.lab/internal/macos-a5-controller/desktop-library')
  );
});

it('resolves a symlinked artifact root without changing another ownership domain', () => {
  const repoRoot = temporaryRepo();
  const externalRoot = temporaryRepo();
  fs.symlinkSync(externalRoot, path.join(repoRoot, '.tmp'));
  const context = createMacosA5ExecutionContext({
    action: 'deploy', repoRoot, runId: '22222222-2222-2222-2222-222222222222'
  });
  const canonicalRepoRoot = fs.realpathSync(repoRoot);

  expect(context.artifactsRoot).toBe(path.join(fs.realpathSync(externalRoot), 'artifacts'));
  expect(context.controllerStateRoot.startsWith(canonicalRepoRoot)).toBe(true);
});

it('carries a frozen revision without changing stable state ownership', () => {
  const repoRoot = temporaryRepo();
  const context = createMacosA5ExecutionContext({
    acceptedRevision: 'a'.repeat(40), acceptedTree: 'b'.repeat(40), action: 'build',
    formalSourceClass: 'frozen-build', repoRoot,
    runId: '55555555-5555-5555-5555-555555555555'
  });
  expect(context).toMatchObject({ acceptedRevision: 'a'.repeat(40),
    acceptedTree: 'b'.repeat(40), buildRoot: fs.realpathSync(repoRoot),
    formalSourceClass: 'frozen-build' });
});

it('carries the exact archive identity with the materialized source root', () => {
  const context = createMacosA5ExecutionContext({
    acceptedRevision: 'a'.repeat(40), acceptedTree: 'b'.repeat(40), action: 'build',
    formalSourceClass: 'frozen-build', repoRoot: temporaryRepo(),
    runId: '99999999-9999-9999-9999-999999999999'
  });
  expect(withMacosA5BuildRoot(context, '/capsule/source', '/capsule', 'c'.repeat(64)))
    .toMatchObject({ buildRoot: '/capsule/source', sourceArchiveDigest: 'c'.repeat(64) });
});

it('cleans only an exactly owned empty run root', () => {
  const repoRoot = temporaryRepo();
  const context = createMacosA5ExecutionContext({
    action: 'status', repoRoot, runId: '33333333-3333-3333-3333-333333333333'
  });
  openMacosA5Run(context);
  const unrelated = path.join(context.controllerStateRoot, 'unrelated.txt');
  fs.writeFileSync(unrelated, 'keep');

  closeMacosA5Run(context);

  expect(fs.existsSync(context.runRoot)).toBe(false);
  expect(fs.readFileSync(unrelated, 'utf8')).toBe('keep');
});

it('refuses cleanup when another file appears inside the owned run root', () => {
  const context = createMacosA5ExecutionContext({
    action: 'deploy', repoRoot: temporaryRepo(),
    runId: '44444444-4444-4444-4444-444444444444'
  });
  openMacosA5Run(context);
  fs.writeFileSync(path.join(context.runRoot, 'unexpected.txt'), 'keep');

  expect(() => closeMacosA5Run(context)).toThrow(/non-empty/u);
  expect(fs.existsSync(path.join(context.runRoot, 'owner.json'))).toBe(true);
});
